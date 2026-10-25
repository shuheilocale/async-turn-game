import * as THREE from "three";
import { softDot } from "./arena.ts";

/**
 * 当たったときの光・火花（汗）・床の光の輪と、ダメージの数字（DOM で重ねる）。
 * 光と火花は使い回し（毎回作らない）
 */

const FLASH_LIFE = 0.24;
const SPARKS = 48;

interface Flash {
  sprite: THREE.Sprite;
  ring: THREE.Sprite;
  life: number;
  size: number;
}

/** 技を出す手足の軌跡（残像）。カメラに向いた細い帯で、先ほど太く、後ろほど薄く消える */
const TRAIL = 14;
const WHITE = new THREE.Color("#ffffff");
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly pts: THREE.Vector3[] = [];
  private readonly spare: THREE.Vector3[] = [];
  private readonly pos = new Float32Array(TRAIL * 2 * 3);
  private readonly col = new Float32Array(TRAIL * 2 * 4);
  private readonly geo = new THREE.BufferGeometry();
  private readonly color = new THREE.Color();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly view = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    const index: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      this.geo,
      // 体に隠れないよう、手前に重ねて描く（薄い色なので体の上でもうるさくない）
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
  }

  /** 手足の今の位置を足す（技を出していないときは null で、だんだん短くする） */
  push(at: THREE.Vector3 | null, color: string, width: number) {
    if (at && this.pts.length && this.pts[0]!.distanceToSquared(at) < 0.004 * 0.004) {
      // ほとんど動いていない（当たった瞬間の止め）ときは、点を足さずにそのまま見せる
    } else if (at) {
      // 点は使い回す（コマごとに作らない）
      const v = this.pts.length >= TRAIL ? this.pts.pop()! : (this.spare.pop() ?? new THREE.Vector3());
      this.pts.unshift(v.copy(at));
      this.color.set(color).lerp(WHITE, 0.35);
    } else if (this.pts.length) this.spare.push(this.pts.pop()!);
    const n = this.pts.length;
    this.mesh.visible = n >= 3;
    if (!this.mesh.visible) return;
    this.camera.getWorldPosition(this.view);
    for (let i = 0; i < TRAIL; i++) {
      const j = Math.min(i, n - 1);
      const p = this.pts[j]!;
      // 帯の向き（前後の点を結ぶ向き）
      const dir = this.a.subVectors(this.pts[Math.max(0, j - 1)]!, this.pts[Math.min(n - 1, j + 1)]!);
      const side = this.b.subVectors(this.view, p).cross(dir).normalize();
      const k = i < n ? 1 - i / (n - 1) : 0;
      const w = width * (0.25 + 0.75 * k) * (i < n ? 1 : 0);
      this.pos.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6);
      const alpha = 0.42 * k * Math.sqrt(k);
      this.col.set([this.color.r, this.color.g, this.color.b, alpha, this.color.r, this.color.g, this.color.b, alpha], i * 8);
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class Effects {
  readonly group = new THREE.Group();
  private readonly flashes: Flash[] = [];
  private readonly flashTex = softDot("rgba(255,255,255,1)", "rgba(255,255,255,0)", 128);
  private readonly ringTex: THREE.Texture;
  private readonly sparkGeo = new THREE.BufferGeometry();
  private readonly sparkPos = new Float32Array(SPARKS * 3);
  private readonly sparkVel = new Float32Array(SPARKS * 3);
  private readonly sparkLife = new Float32Array(SPARKS);
  private readonly sparkMat: THREE.PointsMaterial;
  private next = 0;
  private readonly floorRing: THREE.Mesh;
  private floorLife = 0;
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly overlay: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {
    // 光の輪（はじける衝撃）
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 30, 64, 64, 62);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    this.ringTex = new THREE.CanvasTexture(c);
    this.ringTex.colorSpace = THREE.SRGBColorSpace;

    for (let i = 0; i < 3; i++) {
      const mk = (map: THREE.Texture) =>
        new THREE.Sprite(
          new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, fog: false }),
        );
      const sprite = mk(this.flashTex);
      const ring = mk(this.ringTex);
      sprite.visible = ring.visible = false;
      sprite.renderOrder = ring.renderOrder = 10;
      this.group.add(sprite, ring);
      this.flashes.push({ sprite, ring, life: 0, size: 0.4 });
    }

    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkMat = new THREE.PointsMaterial({
      size: 0.035,
      map: this.flashTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      color: "#fff1d0",
    });
    const sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    sparks.frustumCulled = false;
    sparks.renderOrder = 11;
    this.group.add(sparks);
    this.sparkLife.fill(0);
    for (let i = 0; i < SPARKS; i++) this.sparkPos[i * 3 + 1] = -100;

    // 床に広がる光の輪（キャラ作りで見た目が変わったとき）
    this.floorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.floorRing.rotation.x = -Math.PI / 2;
    this.floorRing.position.y = 0.006;
    this.floorRing.visible = false;
    this.group.add(this.floorRing);
  }

  /** 当たった場所に光をはじけさせる。strong は 0〜1.5 くらい */
  flash(at: THREE.Vector3, color: string, ring: string, strong: number) {
    const f = this.flashes[this.next]!;
    this.next = (this.next + 1) % this.flashes.length;
    f.life = FLASH_LIFE;
    f.size = 0.28 + 0.22 * strong;
    for (const s of [f.sprite, f.ring]) {
      s.position.copy(at);
      s.visible = true;
    }
    (f.sprite.material as THREE.SpriteMaterial).color.set(color);
    (f.ring.material as THREE.SpriteMaterial).color.set(ring);
  }

  /** 火花（汗のしずく）を飛ばす */
  burst(at: THREE.Vector3, dir: THREE.Vector3, count: number, color: string) {
    this.sparkMat.color.set(color);
    let made = 0;
    for (let i = 0; i < SPARKS && made < count; i++) {
      if (this.sparkLife[i]! > 0) continue;
      made++;
      this.sparkLife[i] = 0.35 + Math.random() * 0.3;
      this.sparkPos.set([at.x, at.y, at.z], i * 3);
      const sp = 1.2 + Math.random() * 1.8;
      this.sparkVel.set(
        [dir.x * sp + (Math.random() - 0.5) * 1.6, dir.y * sp + Math.random() * 1.4, dir.z * sp + (Math.random() - 0.5) * 1.6],
        i * 3,
      );
    }
  }

  /** 足もとに光の輪を広げる */
  ripple(at: THREE.Vector3, color: string) {
    this.floorLife = 0.7;
    this.floorRing.position.x = at.x;
    this.floorRing.position.z = at.z;
    this.floorRing.visible = true;
    (this.floorRing.material as THREE.MeshBasicMaterial).color.set(color);
  }

  /** ダメージの数字を、ワールドの位置 at の上に出す */
  number(at: THREE.Vector3, text: string, seat: 0 | 1, big: boolean) {
    const p = this.v.copy(at).project(this.camera);
    if (p.z > 1) return;
    const el = document.createElement("div");
    el.className = `fs-num seat${seat}${big ? " big" : ""}`;
    el.textContent = text;
    // 画面からはみ出さないように、上と左右の端に寄せる
    el.style.left = `${Math.min(88, Math.max(12, ((p.x + 1) / 2) * 100))}%`;
    el.style.top = `${Math.max(16, ((1 - p.y) / 2) * 100)}%`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  /** 回復した量（緑の「+n」）を、ワールドの位置 at の上に出す */
  heal(at: THREE.Vector3, amount: number) {
    const el = this.place(at, "fs-num heal");
    if (el) el.textContent = `+${amount}`;
  }

  /**
   * 強化・弱体の印（文字なし）。パラメータの種類は色と形（攻撃は丸・防御は盾・すばやさは木の葉・スタミナは角丸の四角）、
   * 上向き・下向きの矢印で強化・弱体を見せる。n は同じ人に重なるときのずらし
   */
  buff(at: THREE.Vector3, stat: string, dir: 1 | -1, n: number) {
    const el = this.place(at, `fs-buff ${stat} ${dir > 0 ? "up" : "down"}`);
    if (el) el.style.marginLeft = `${(n % 4) * 26 - 13}px`;
  }

  private place(at: THREE.Vector3, className: string) {
    const p = this.v.copy(at).project(this.camera);
    if (p.z > 1) return null;
    const el = document.createElement("div");
    el.className = className;
    el.style.left = `${Math.min(88, Math.max(12, ((p.x + 1) / 2) * 100))}%`;
    el.style.top = `${Math.max(16, ((1 - p.y) / 2) * 100)}%`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 1500);
    return el;
  }

  /** 画面の真ん中に大きな文字（KO）を出す */
  banner(text: string) {
    const el = document.createElement("div");
    el.className = "fs-banner";
    el.textContent = text;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  update(dt: number) {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const u = 1 - Math.max(0, f.life) / FLASH_LIFE;
      const core = f.size * (0.6 + 0.6 * Math.sqrt(u));
      f.sprite.scale.setScalar(core);
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - u) ** 1.5;
      f.ring.scale.setScalar(f.size * (0.35 + 1.5 * u));
      (f.ring.material as THREE.SpriteMaterial).opacity = (1 - u) * 0.85;
      if (f.life <= 0) f.sprite.visible = f.ring.visible = false;
    }
    let any = false;
    for (let i = 0; i < SPARKS; i++) {
      const life = this.sparkLife[i]!;
      if (life <= 0) continue;
      any = true;
      const nl = life - dt;
      this.sparkLife[i] = nl;
      const j = i * 3;
      this.sparkVel[j + 1] = this.sparkVel[j + 1]! - 6.5 * dt;
      for (let k = 0; k < 3; k++) this.sparkPos[j + k] = this.sparkPos[j + k]! + this.sparkVel[j + k]! * dt;
      if (nl <= 0) this.sparkPos[j + 1] = -100;
    }
    if (any) this.sparkGeo.attributes.position!.needsUpdate = true;
    if (this.floorLife > 0) {
      this.floorLife -= dt;
      const u = 1 - Math.max(0, this.floorLife) / 0.7;
      this.floorRing.scale.setScalar(0.25 + 0.9 * Math.sqrt(u));
      (this.floorRing.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u) ** 1.4;
      if (this.floorLife <= 0) this.floorRing.visible = false;
    }
  }

  dispose() {
    this.flashTex.dispose();
    this.ringTex.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    for (const f of this.flashes) {
      f.sprite.material.dispose();
      f.ring.material.dispose();
    }
    this.floorRing.geometry.dispose();
    (this.floorRing.material as THREE.Material).dispose();
    this.overlay.replaceChildren();
  }
}
