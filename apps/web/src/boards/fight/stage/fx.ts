import * as THREE from "three";
import type { ShotKind } from "./track.ts";
import type { StageStrike } from "./types.ts";

/**
 * 新しい技の効果：飛ぶもの（トランプ・ロケットパンチ・光の玉）と、小さな粒（ハート・音符・きらめき・煙・湯気・回復の光）、
 * ゲーマーの光の枠、ロボットの再起動の光の線、体を包む光。
 * どれも舞台を作るときに数を決めて作っておき、使い回す（見えていないものは描かない）
 */

/** 粒の形 */
export type Speck = "heart" | "note" | "star" | "smoke" | "orb" | "pixel";

const SPECKS = 56;
const CARDS = 4;

/** 白い形を描いたテクスチャ（色は材質の色でつける） */
function shapeTexture(kind: Speck) {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  switch (kind) {
    case "heart": {
      g.beginPath();
      g.moveTo(32, 54);
      g.bezierCurveTo(6, 36, 6, 12, 22, 12);
      g.bezierCurveTo(28, 12, 32, 18, 32, 22);
      g.bezierCurveTo(32, 18, 36, 12, 42, 12);
      g.bezierCurveTo(58, 12, 58, 36, 32, 54);
      g.fill();
      break;
    }
    case "note": {
      // 八分音符（たま・ぼう・はた）
      g.beginPath();
      g.ellipse(24, 46, 10, 7.5, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(31, 12, 5, 34);
      g.beginPath();
      g.moveTo(36, 12);
      g.quadraticCurveTo(52, 20, 48, 34);
      g.quadraticCurveTo(46, 24, 36, 22);
      g.fill();
      break;
    }
    case "star": {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.7)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 6 : 32;
        g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case "smoke": {
      // もくもくした煙（ふちのやわらかい、いくつかの丸）
      for (const [x, y, r] of [
        [32, 34, 20],
        [20, 28, 13],
        [44, 26, 14],
        [30, 20, 12],
      ] as const) {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(0.6, "rgba(255,255,255,0.6)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
      }
      break;
    }
    case "orb": {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      break;
    }
    case "pixel": {
      g.fillRect(14, 14, 36, 36);
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** トランプの表（白地に、その人の色のふちとひし形） */
function cardTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf6";
  g.beginPath();
  g.roundRect(2, 2, 60, 92, 8);
  g.fill();
  g.strokeStyle = "#c9c4b8";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "#d8344a";
  g.beginPath();
  g.moveTo(32, 26);
  g.lineTo(46, 48);
  g.lineTo(32, 70);
  g.lineTo(18, 48);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 画面のような光の枠（四隅の印と、横線） */
function frameTexture() {
  const W = 256;
  const H = 160;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#fff";
  g.shadowColor = "#fff";
  g.shadowBlur = 10;
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(14, 14, W - 28, H - 28, 14);
  g.stroke();
  g.lineWidth = 9;
  for (const [x, y, dx, dy] of [
    [10, 10, 1, 1],
    [W - 10, 10, -1, 1],
    [10, H - 10, 1, -1],
    [W - 10, H - 10, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(x, y + dy * 30);
    g.lineTo(x, y);
    g.lineTo(x + dx * 30, y);
    g.stroke();
  }
  g.shadowBlur = 0;
  g.globalAlpha = 0.28;
  g.fillStyle = "#fff";
  for (let y = 26; y < H - 26; y += 8) g.fillRect(26, y, W - 52, 2);
  g.globalAlpha = 0.85;
  // 体力のゲージのような 2 本の棒
  g.fillRect(36, 34, 90, 9);
  g.fillRect(W - 126, 34, 90, 9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface SpeckState {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vel: THREE.Vector3;
  grow: number;
  size: number;
  spin: number;
  gravity: number;
  /** 揺れながら進む（音符） */
  sway: number;
  alpha: number;
}

interface Shot {
  kind: ShotKind;
  result: StageStrike["result"];
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 経過時間（攻防の時計で進む）と、届くまでの時間 */
  age: number;
  flight: number;
  /** 戻る先（ロケットパンチの腕） */
  home: (() => THREE.Vector3) | null;
  back: number;
  done: boolean;
  /** 届いたあとの落ち方（トランプ） */
  fall: THREE.Vector3[];
}

export class StageFx {
  readonly group = new THREE.Group();
  private readonly tex: Record<Speck, THREE.Texture>;
  private readonly specks: SpeckState[] = [];
  private next = 0;
  private readonly cardTex = cardTexture();
  private readonly cardGeo = new THREE.PlaneGeometry(0.1, 0.145);
  private readonly cards: THREE.Mesh[] = [];
  private readonly orb: THREE.Sprite;
  private readonly orbCore: THREE.Sprite;
  private readonly rocket: THREE.Group;
  private readonly flame: THREE.Sprite;
  private readonly frame: THREE.Mesh;
  private readonly frameTex = frameTexture();
  private readonly rings: THREE.Mesh[] = [];
  private readonly aura: THREE.Sprite;
  private shot: Shot | null = null;
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly dirV = new THREE.Vector3();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly camera: THREE.Camera) {
    this.tex = { heart: shapeTexture("heart"), note: shapeTexture("note"), star: shapeTexture("star"), smoke: shapeTexture("smoke"), orb: shapeTexture("orb"), pixel: shapeTexture("pixel") };
    for (let i = 0; i < SPECKS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.star, transparent: true, depthWrite: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 12;
      this.group.add(sprite);
      this.specks.push({ sprite, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0, size: 0.1, spin: 0, gravity: 0, sway: 0, alpha: 1 });
    }
    const cardMat = new THREE.MeshBasicMaterial({ map: this.cardTex, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.disposables.push(cardMat, this.cardGeo);
    for (let i = 0; i < CARDS; i++) {
      const m = new THREE.Mesh(this.cardGeo, cardMat);
      m.visible = false;
      this.group.add(m);
      this.cards.push(m);
    }
    const glow = (map: THREE.Texture) => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    // 光の玉：その人の色の玉（明るい舞台でも見えるよう、ふつうに重ねる）と、白く光る芯
    this.orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.orb, transparent: true, depthWrite: false, fog: false }));
    this.orbCore = glow(this.tex.orb);
    this.orb.visible = this.orbCore.visible = false;
    this.orb.renderOrder = this.orbCore.renderOrder = 12;
    this.group.add(this.orb, this.orbCore);
    // ロケットパンチ：金属のこぶしと、後ろの炎
    this.rocket = new THREE.Group();
    const fistGeo = new THREE.BoxGeometry(0.13, 0.12, 0.14);
    const fistMat = new THREE.MeshStandardMaterial({ color: "#b9c0cb", roughness: 0.3, metalness: 0.75 });
    const cuffGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.05, 12).rotateX(Math.PI / 2);
    const cuffMat = new THREE.MeshStandardMaterial({ color: "#1f2228", roughness: 0.45 });
    this.disposables.push(fistGeo, fistMat, cuffGeo, cuffMat);
    const fist = new THREE.Mesh(fistGeo, fistMat);
    const cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.z = -0.08;
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.orb, transparent: true, depthWrite: false, fog: false }));
    this.flame.position.z = -0.16;
    this.flame.material.color.set("#ff9a2e");
    this.rocket.add(fist, cuff, this.flame);
    this.rocket.visible = false;
    this.group.add(this.rocket);
    // 光の枠
    this.frame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.29),
      new THREE.MeshBasicMaterial({ map: this.frameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    this.frame.visible = false;
    this.frame.renderOrder = 12;
    this.group.add(this.frame);
    // 再生の光の線（体のまわりを上へ走る輪）
    const ringGeo = new THREE.TorusGeometry(0.32, 0.006, 4, 40).rotateX(Math.PI / 2);
    this.disposables.push(ringGeo);
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      r.visible = false;
      r.renderOrder = 12;
      this.group.add(r);
      this.rings.push(r);
    }
    // 体を包むやわらかい光（回復）
    this.aura = glow(this.tex.orb);
    // 床や体に切られないよう、いつも手前に重ねる（やわらかい光なので体の上でもうるさくない）
    this.aura.material.depthTest = false;
    this.aura.visible = false;
    this.aura.renderOrder = 7;
    this.group.add(this.aura);
  }

  /** 粒を 1 つ出す */
  spawn(kind: Speck, at: THREE.Vector3, vel: THREE.Vector3, o: { color: string; size: number; life: number; grow?: number; spin?: number; gravity?: number; sway?: number; alpha?: number; additive?: boolean }) {
    const s = this.specks[this.next]!;
    this.next = (this.next + 1) % SPECKS;
    const m = s.sprite.material;
    if (m.map !== this.tex[kind]) {
      m.map = this.tex[kind];
      m.needsUpdate = true;
    }
    const add = o.additive ?? (kind === "star" || kind === "orb");
    if ((m.blending === THREE.AdditiveBlending) !== add) {
      m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    m.color.set(o.color);
    m.rotation = (Math.random() - 0.5) * 0.6;
    s.sprite.position.copy(at);
    s.sprite.visible = true;
    s.vel.copy(vel);
    s.life = s.max = o.life;
    s.size = o.size;
    s.grow = o.grow ?? 0;
    s.spin = o.spin ?? 0;
    s.gravity = o.gravity ?? 0;
    s.sway = o.sway ?? 0;
    s.alpha = o.alpha ?? 1;
    s.sprite.scale.setScalar(o.size);
  }

  /** 飛ぶものを放つ。flight 秒（攻防の時計）で to に届く */
  launch(kind: ShotKind, from: THREE.Vector3, to: THREE.Vector3, flight: number, result: StageStrike["result"], color: string, home: (() => THREE.Vector3) | null, back: number) {
    this.clearShot();
    this.shot = { kind, result, from: from.clone(), to: to.clone(), age: 0, flight: Math.max(0.05, flight), home, back, done: false, fall: [] };
    if (kind === "orb") {
      this.orb.material.color.set(color);
      this.orbCore.material.color.set("#ffffff");
    }
  }

  private clearShot() {
    this.shot = null;
    this.cards.forEach((c) => (c.visible = false));
    this.orb.visible = this.orbCore.visible = false;
    this.rocket.visible = false;
  }

  /** 光の枠を、at（胸の前）に出す。k は 0〜1 の明るさ */
  showFrame(at: THREE.Vector3, k: number, color: string) {
    this.frame.visible = k > 0.01;
    if (!this.frame.visible) return;
    this.frame.position.copy(at);
    this.frame.quaternion.copy(this.camera.quaternion);
    const m = this.frame.material as THREE.MeshBasicMaterial;
    m.color.set(color);
    m.opacity = k * (0.75 + 0.25 * Math.sin(performance.now() / 40));
    this.frame.scale.set(0.6 + 0.4 * Math.min(1, k * 1.5), 0.3 + 0.7 * Math.min(1, k * 1.5), 1);
  }

  /** 体のまわりを上へ走る光の輪（y は高さ、k は明るさ） */
  showRings(center: THREE.Vector3, ys: [number, number], k: number, color: string) {
    this.rings.forEach((r, i) => {
      r.visible = k > 0.01;
      if (!r.visible) return;
      r.position.set(center.x, ys[i]!, center.z);
      const m = r.material as THREE.MeshBasicMaterial;
      m.color.set(color);
      m.opacity = k;
    });
  }

  /** 体を包むやわらかい光 */
  showAura(at: THREE.Vector3, k: number, color: string) {
    this.aura.visible = k > 0.01;
    if (!this.aura.visible) return;
    this.aura.position.copy(at);
    this.aura.material.color.set(color);
    this.aura.material.opacity = 0.55 * k;
    // 立っているときは縦長に、寝ているときは丸く包む
    this.aura.scale.set(1.0, Math.min(1.7, Math.max(1.0, at.y * 1.5)), 1);
  }

  /** realDt はいつもの時間、exDt は攻防の時計（当たった瞬間に止まる）で進んだ時間 */
  update(realDt: number, exDt: number) {
    for (const s of this.specks) {
      if (s.life <= 0) continue;
      s.life -= realDt;
      if (s.life <= 0) {
        s.sprite.visible = false;
        continue;
      }
      const u = 1 - s.life / s.max;
      s.vel.y -= s.gravity * realDt;
      s.sprite.position.addScaledVector(s.vel, realDt);
      if (s.sway) s.sprite.position.y += Math.cos(u * 14) * s.sway * realDt;
      s.sprite.scale.setScalar(s.size * (1 + s.grow * u) * Math.min(1, u * 8));
      s.sprite.material.rotation += s.spin * realDt;
      s.sprite.material.opacity = s.alpha * Math.min(1, (1 - u) * 2.5);
    }
    this.stepShot(exDt);
  }

  private stepShot(dt: number) {
    const s = this.shot;
    if (!s) return;
    s.age += dt;
    const u = s.age / s.flight;
    const passes = s.result === "dodged" || s.result === "whiff";
    const stop = s.result === "blocked" ? 0.86 : 1;
    const dir = this.dirV.subVectors(s.to, s.from);
    if (s.kind === "rocket") {
      this.rocket.visible = true;
      const out = passes ? 1.25 : stop;
      let pos: THREE.Vector3;
      if (u <= out) pos = this.v.copy(s.from).addScaledVector(dir, u);
      else {
        // 戻ってくる
        const tip = this.v.copy(s.from).addScaledVector(dir, out);
        const home = s.home ? s.home() : s.from;
        const k = Math.min(1, (s.age - s.flight * out) / Math.max(0.05, s.back));
        pos = tip.lerp(home, k * k * (3 - 2 * k));
        if (k >= 1) {
          this.clearShot();
          return;
        }
      }
      this.rocket.position.copy(pos);
      this.rocket.lookAt(this.v3.copy(pos).add(dir));
      this.flame.visible = u <= out;
      this.flame.scale.setScalar(0.14 + 0.06 * Math.random());
      if (u <= out && Math.random() < 0.7) this.spawn("smoke", this.v3.copy(pos).addScaledVector(dir, -0.2 / Math.max(0.01, dir.length())), this.v2.set(0, 0.2, 0), { color: "#d9dce3", size: 0.08, life: 0.4, grow: 1.5, alpha: 0.7 });
      return;
    }
    if (s.kind === "orb") {
      const end = passes ? 1.7 : stop;
      if (u > end + 0.15) {
        this.clearShot();
        return;
      }
      const k = Math.min(u, end);
      this.orb.position.copy(s.from).addScaledVector(dir, k);
      this.orbCore.position.copy(this.orb.position);
      const fade = u > end ? 1 - (u - end) / 0.15 : 1;
      const grow = Math.min(1, u * 4 + 0.3);
      this.orb.visible = this.orbCore.visible = true;
      this.orb.scale.setScalar(0.42 * grow * fade * (1 + 0.1 * Math.sin(s.age * 60)));
      this.orbCore.scale.setScalar(0.2 * grow * fade);
      this.orb.material.opacity = 0.85 * fade;
      this.orbCore.material.opacity = fade;
      // 通ったあとに、光の粒を残す
      if (u < end && Math.random() < 0.8)
        this.spawn("star", this.orb.position, this.v2.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3), { color: this.orb.material.color.getStyle(), size: 0.07, life: 0.35, additive: false });
      return;
    }
    // トランプ：少しずつずらして扇のように飛ばし、くるくる回す
    for (let i = 0; i < CARDS; i++) {
      const c = this.cards[i]!;
      const ui = u - i * 0.12;
      if (ui <= 0) {
        c.visible = false;
        continue;
      }
      c.visible = true;
      const spread = (i - (CARDS - 1) / 2) * 0.07;
      const end = passes ? 1.8 : stop;
      if (ui <= end) {
        c.position.copy(s.from).addScaledVector(dir, ui);
        c.position.y += spread * Math.sin(Math.PI * Math.min(1, ui)) + 0.05 * Math.sin(Math.PI * Math.min(1, ui));
        c.position.x += spread * 0.5 * ui;
        c.rotation.set(Math.PI / 2 - 0.3, 0, s.age * 30 + i);
        s.fall[i] = (s.fall[i] ?? new THREE.Vector3()).set((Math.random() - 0.5) * 0.6, s.result === "blocked" ? 0.8 : 0.3, s.result === "blocked" ? -0.9 : -0.2);
      } else {
        // 届いた（防がれた）あとは、ひらひら落ちる
        const v = s.fall[i]!;
        v.y -= 3.2 * dt;
        c.position.addScaledVector(v, dt);
        c.rotation.x += dt * 6;
        c.rotation.z += dt * 4;
        if (c.position.y < 0.03 || ui > end + 2.2) c.visible = false;
      }
    }
    if (u > 4) this.clearShot();
  }

  dispose() {
    for (const t of Object.values(this.tex)) t.dispose();
    this.cardTex.dispose();
    this.frameTex.dispose();
    for (const s of this.specks) s.sprite.material.dispose();
    this.orb.material.dispose();
    this.orbCore.material.dispose();
    this.flame.material.dispose();
    this.aura.material.dispose();
    this.frame.geometry.dispose();
    (this.frame.material as THREE.Material).dispose();
    this.rings.forEach((r) => (r.material as THREE.Material).dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
