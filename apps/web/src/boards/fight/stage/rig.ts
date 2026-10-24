import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BodyDims } from "./body.ts";
import { solveTwoBone, type V3 } from "./math.ts";
import { outfitOf, type Outfit } from "./outfit.ts";
import { P, type Pose } from "./pose.ts";
import type { StyleId } from "./types.ts";

/**
 * 人型のキャラクター。骨（Group）を組み、体と服の形（カプセル・球・箱・回転体）を骨に付ける。
 * 形は大きさ 1 の決まった形を使い回し、体格（BodyDims）に合わせて位置と大きさだけを変える。
 * 手足は 2 本の骨の IK で、手首・足首の目標へ届かせる
 */

// ---- 使い回す形（舞台ごとに 1 回だけ作る） ----

const v2 = (r: number, y: number) => new THREE.Vector2(Math.max(0, r), y);

/** 回転体。profile は [y, 半径] を下から上へ。正面（+Z）がテクスチャの横の真ん中に来るよう、裏から回し始める */
function lathe(profile: [number, number][], segments = 18) {
  return new THREE.LatheGeometry(
    profile.map(([y, r]) => v2(r, y)),
    segments,
    Math.PI,
  );
}

/** 下へ行くほど flare 倍に広がる筒（袖・ズボン）。上の端が 0、下の端が -1 */
const tube = (flare: number) =>
  lathe(
    [
      [-1, flare],
      [-0.5, (1 + flare) / 2],
      [0, 1],
    ],
    20,
  );

/** 相撲のさがり（前に垂れる紐）。何本かの細い筒を 1 つにまとめる */
function sagari() {
  const parts: THREE.BufferGeometry[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / (n - 1)) * 1.1;
    const g = new THREE.CylinderGeometry(0.006, 0.0045, 1, 5, 1);
    g.translate(Math.sin(a) * 1, -0.5, Math.cos(a) * 1);
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

export function createKit() {
  const tubes = new Map<number, THREE.BufferGeometry>();
  const kit = {
    sphere: new THREE.SphereGeometry(1, 26, 18),
    sphereLo: new THREE.SphereGeometry(1, 14, 10),
    hair: new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    box: new RoundedBoxGeometry(1, 1, 1, 3, 0.32),
    boxSoft: new RoundedBoxGeometry(1, 1, 1, 3, 0.45),
    band: new THREE.CylinderGeometry(1, 1, 1, 30, 1, true),
    cap: new THREE.CylinderGeometry(1, 1, 1, 24, 1, false),
    ring: new THREE.TorusGeometry(1, 0.26, 8, 24).rotateX(Math.PI / 2),
    sagari: sagari(),
    upperArm: lathe([
      [-1, 0.8],
      [-0.86, 0.86],
      [-0.6, 1.0],
      [-0.38, 1.06],
      [-0.15, 1.02],
      [0, 0.94],
    ]),
    forearm: lathe([
      [-1, 0.72],
      [-0.75, 0.78],
      [-0.45, 0.95],
      [-0.2, 1.06],
      [0, 1.0],
    ]),
    thigh: lathe([
      [-1, 0.64],
      [-0.86, 0.72],
      [-0.6, 0.88],
      [-0.35, 0.98],
      [-0.1, 1.0],
      [0.05, 0.92],
    ]),
    shin: lathe([
      [-1, 0.54],
      [-0.85, 0.6],
      [-0.6, 0.82],
      [-0.34, 1.0],
      [-0.15, 1.0],
      [0, 0.9],
    ]),
    chest: lathe(
      [
        [0, 0.78],
        [0.18, 0.86],
        [0.42, 0.96],
        [0.66, 1.0],
        [0.82, 0.95],
        [0.92, 0.8],
        [0.98, 0.52],
        [1.0, 0.28],
        [1.005, 0],
      ],
      28,
    ),
    abdomen: lathe(
      [
        [0, 1.02],
        [0.3, 0.98],
        [0.55, 0.98],
        [0.8, 1.06],
        [1, 1.12],
      ],
      26,
    ),
    pelvis: lathe(
      [
        [-1, 0],
        [-0.96, 0.45],
        [-0.8, 0.82],
        [-0.45, 0.98],
        [0, 1.0],
        [0.45, 0.97],
        [0.85, 0.91],
        [1, 0.87],
      ],
      26,
    ),
    neck: lathe([
      [0, 1.1],
      [0.5, 1.0],
      [1, 0.97],
    ]),
    /** 下へ flare 倍に広がる筒。広がりごとに 1 つ作って使い回す */
    tube(flare: number) {
      const key = Math.round(flare * 100);
      let g = tubes.get(key);
      if (!g) tubes.set(key, (g = tube(key / 100)));
      return g;
    },
    dispose() {
      for (const v of Object.values(kit)) if (v instanceof THREE.BufferGeometry) v.dispose();
      tubes.forEach((g) => g.dispose());
    },
  };
  return kit;
}
export type Kit = ReturnType<typeof createKit>;

// ---- 色と材質 ----

export interface RigColors {
  /** その人の色（青 / オレンジ） */
  seat: string;
  skin: string;
}

/** 道着の布の色 */
const CLOTH = { white: "#e4e1d9", ivory: "#e2d8c3", charcoal: "#252a35" } as const;

/** 布の目（細かいでこぼこ）。道着や服に軽くかける */
function weaveTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = 128 + 50 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2) + (Math.random() - 0.5) * 40;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(18, 10);
  return t;
}

/**
 * 胸の服のテクスチャ。道着は重なった襟、テコンドーの道着は V 字の襟、シングレットは肩ひもの形に切り抜く。
 * 横の真ん中（u = 0.5）が正面、上の端（v = 1）が首
 */
function topTexture(kind: Outfit["top"], cloth: string, seat: string) {
  const W = 256;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const g = c.getContext("2d")!;
  const X = (u: number) => u * W;
  const Y = (v: number) => (1 - v) * W;
  const poly = (pts: [number, number][], fill: string) => {
    g.beginPath();
    pts.forEach(([u, v], i) => (i === 0 ? g.moveTo(X(u), Y(v)) : g.lineTo(X(u), Y(v))));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const shade = (hex: string, k: number) => {
    const col = new THREE.Color(hex);
    col.multiplyScalar(k);
    return `#${col.getHexString()}`;
  };
  if (kind === "singlet") {
    g.clearRect(0, 0, W, W);
    // 胴の下半分と、前後の胸当て・肩ひも
    poly(
      [
        [0, 0],
        [1, 0],
        [1, 0.5],
        [0.83, 0.62],
        [0.85, 1.01],
        [0.77, 1.01],
        [0.7, 0.62],
        [0.64, 0.6],
        [0.63, 1.01],
        [0.57, 1.01],
        [0.54, 0.64],
        [0.46, 0.64],
        [0.43, 1.01],
        [0.37, 1.01],
        [0.36, 0.6],
        [0.3, 0.62],
        [0.23, 1.01],
        [0.15, 1.01],
        [0.17, 0.62],
        [0, 0.5],
      ],
      seat,
    );
    // わきの濃い帯
    for (const u of [0.25, 0.75]) poly([[u - 0.035, 0], [u + 0.035, 0], [u + 0.03, 0.5], [u - 0.03, 0.5]], shade(seat, 0.55));
  } else {
    g.fillStyle = cloth;
    g.fillRect(0, 0, W, W);
    if (kind === "gi") {
      // 右前の襟の下に、左前の襟を重ねる。濃い布では襟を明るく、白い布では少し暗くする
      const dark = new THREE.Color(cloth).getHSL({ h: 0, s: 0, l: 0 }).l < 0.4;
      const lap = dark ? shade(cloth, 1.45) : shade(cloth, 0.86);
      const edge = dark ? shade(cloth, 0.6) : shade(cloth, 0.62);
      poly([[0.42, 1.01], [0.5, 1.01], [0.61, 0.32], [0.54, 0.27]], lap);
      g.globalAlpha = 0.55;
      poly([[0.49, 1.01], [0.51, 1.01], [0.37, 0.16], [0.35, 0.19]], edge);
      g.globalAlpha = 1;
      poly([[0.5, 1.01], [0.59, 1.01], [0.45, 0.16], [0.37, 0.19]], lap);
      // 襟の縫い目
      g.strokeStyle = edge;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(X(0.555), Y(1.0));
      g.lineTo(X(0.415), Y(0.18));
      g.stroke();
    } else if (kind === "dobok") {
      // V 字の襟（その人の色）
      const v = seat;
      poly([[0.43, 1.01], [0.47, 1.01], [0.5, 0.6], [0.5, 0.52]], v);
      poly([[0.53, 1.01], [0.57, 1.01], [0.5, 0.52], [0.5, 0.6]], v);
      poly([[0.47, 1.01], [0.53, 1.01], [0.5, 0.62]], shade(cloth, 0.97));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

class RigMats {
  readonly skin = new THREE.MeshStandardMaterial({ roughness: 0.52, metalness: 0 });
  readonly hair = new THREE.MeshStandardMaterial({ color: "#1b1816", roughness: 0.78 });
  readonly eye = new THREE.MeshStandardMaterial({ color: "#14100e", roughness: 0.35 });
  readonly seat = new THREE.MeshStandardMaterial({ roughness: 0.62 });
  /** グローブ（つやのある革） */
  readonly gloss = new THREE.MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.28 });
  /** その人の色を暗くしたもの（まわし・縁取り） */
  readonly deep = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  readonly cloth = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  /** 胸の服（襟・肩ひものテクスチャ付き） */
  readonly top = new THREE.MeshStandardMaterial({ roughness: 0.9, alphaTest: 0.5 });
  readonly trim = new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.55 });
  readonly dark = new THREE.MeshStandardMaterial({ color: "#1f2228", roughness: 0.45 });
  /** まだ決まっていない人のシルエット */
  readonly sil = new THREE.MeshStandardMaterial({ color: "#2a3040", roughness: 0.55, metalness: 0.15 });
  private readonly weave = weaveTexture();
  private topKey = "";
  /** 輪郭に差す、その人の色の光（リムライト）。すべての材質で同じ値を使う */
  readonly rim = { value: new THREE.Color(0, 0, 0) };

  constructor() {
    for (const m of [this.cloth, this.top, this.seat, this.deep]) {
      m.bumpMap = this.weave;
      m.bumpScale = 0.18;
    }
    for (const m of this.all()) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = this.rim;
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 rimColor;")
          .replace(
            "#include <opaque_fragment>",
            "outgoingLight += rimColor * pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), 3.0 );\n#include <opaque_fragment>",
          );
      };
      m.customProgramCacheKey = () => "fs-rim";
    }
  }

  all(): THREE.MeshStandardMaterial[] {
    return [this.skin, this.hair, this.eye, this.seat, this.gloss, this.deep, this.cloth, this.top, this.trim, this.dark, this.sil];
  }

  paint(outfit: Outfit, colors: RigColors) {
    this.skin.color.set(colors.skin);
    this.seat.color.set(colors.seat);
    this.gloss.color.set(colors.seat);
    this.deep.color.set(colors.seat).lerp(new THREE.Color("#15171c"), 0.52);
    const cloth = outfit.cloth === "seat" ? colors.seat : CLOTH[outfit.cloth];
    this.cloth.color.set(cloth);
    const key = `${outfit.top}|${cloth}|${colors.seat}`;
    if (key !== this.topKey && outfit.top !== "none") {
      this.topKey = key;
      this.top.map?.dispose();
      this.top.map = topTexture(outfit.top, cloth, colors.seat);
      this.top.transparent = false;
      this.top.needsUpdate = true;
    }
  }

  dispose() {
    this.all().forEach((m) => m.dispose());
    this.top.map?.dispose();
    this.weave.dispose();
  }
}

type MatKey = "skin" | "hair" | "eye" | "seat" | "gloss" | "deep" | "cloth" | "top" | "trim" | "dark";

// ---- 骨と部品 ----

interface Piece {
  mesh: THREE.Mesh;
  mat: MatKey;
  /** 体格に合わせて、位置・大きさ・向きを決める */
  fit(d: BodyDims, m: THREE.Mesh): void;
  /** 体の部品の名前（服で隠れるものを消すのに使う）。服の部品は null */
  part: string | null;
}

const L = 0;
const R = 1;
const SIDES = [L, R] as const;
const sgn = (i: 0 | 1) => (i === 0 ? 1 : -1);

const set = (m: THREE.Object3D, p: V3, s: V3, r?: V3) => {
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
};

/** 服で覆われる長さ（脚の付け根から） */
const legCover = (o: Outfit, d: BodyDims) => o.legLen * (d.thigh + d.shin);

/** 服で隠れる体の部品 */
function hiddenParts(o: Outfit, d: BodyDims, sil: boolean): Set<string> {
  const h = new Set<string>();
  if (sil) return h;
  if (o.top === "gi" || o.top === "dobok") ["ribs", "pec", "lat", "back", "abdomen", "upperArm", "bicep", "trap", "clav", "delt", "belly"].forEach((p) => h.add(p));
  if (o.top === "singlet") ["abdomen", "belly"].forEach((p) => h.add(p));
  h.add("pelvis");
  const cover = legCover(o, d);
  if (cover >= d.thigh * 0.98) h.add("thigh");
  if (cover >= d.thigh + d.shin * 0.97) ["shin", "calf"].forEach((p) => h.add(p));
  if (o.hands === "gloves") ["fist", "thumb"].forEach((p) => h.add(p));
  if (o.feet !== "bare") h.add("foot");
  if (o.bottom === "mawashi") h.delete("pelvis");
  return h;
}

export class FighterRig {
  readonly root = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly chest = new THREE.Group();
  /** 胸の形（息でふくらませる） */
  private readonly ribs = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly shoulder = [new THREE.Group(), new THREE.Group()] as const;
  private readonly upperArm = [new THREE.Group(), new THREE.Group()] as const;
  private readonly forearm = [new THREE.Group(), new THREE.Group()] as const;
  private readonly hand = [new THREE.Group(), new THREE.Group()] as const;
  private readonly thigh = [new THREE.Group(), new THREE.Group()] as const;
  private readonly shin = [new THREE.Group(), new THREE.Group()] as const;
  private readonly foot = [new THREE.Group(), new THREE.Group()] as const;

  private readonly mats = new RigMats();
  private readonly body: Piece[] = [];
  /** バックボーンごとの服の部品（はじめて着るときに作る） */
  private readonly outfits = new Map<string, Piece[]>();
  private worn: Piece[] = [];
  private outfit: Outfit = outfitOf(null);
  private dims: BodyDims | null = null;
  private silhouette = true;
  private hidden = new Set<string>();

  constructor(private readonly kit: Kit) {
    for (const b of this.allBones()) b.rotation.order = "YXZ";
    this.root.add(this.pelvis);
    this.pelvis.add(this.spine);
    this.spine.add(this.chest);
    this.chest.add(this.ribs, this.neck);
    this.neck.add(this.head);
    for (const i of SIDES) {
      this.chest.add(this.shoulder[i]);
      this.shoulder[i].add(this.upperArm[i]);
      this.upperArm[i].add(this.forearm[i]);
      this.forearm[i].add(this.hand[i]);
      this.pelvis.add(this.thigh[i]);
      this.thigh[i].add(this.shin[i]);
      this.shin[i].add(this.foot[i]);
    }
    this.buildBody();
  }

  private allBones(): THREE.Object3D[] {
    return [this.pelvis, this.spine, this.chest, this.neck, this.head, ...this.shoulder, ...this.upperArm, ...this.forearm, ...this.hand, ...this.thigh, ...this.shin, ...this.foot];
  }

  private add(list: Piece[], bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: MatKey, part: string | null, fit: Piece["fit"], shadow = true) {
    const mesh = new THREE.Mesh(geo, this.mats[mat]);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    bone.add(mesh);
    list.push({ mesh, mat, fit, part });
  }

  /** 裸の体（どのバックボーンでも同じ） */
  private buildBody() {
    const k = this.kit;
    const B = this.body;
    const a = (bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: MatKey, part: string, fit: Piece["fit"], shadow = true) =>
      this.add(B, bone, geo, mat, part, fit, shadow);

    a(this.pelvis, k.pelvis, "skin", "pelvis", (d, m) => set(m, [0, 0.02, -0.012], [d.hipW, 0.1, d.hipD]));
    a(this.spine, k.abdomen, "skin", "abdomen", (d, m) => set(m, [0, -0.035, 0], [d.waistW, d.abdomen + 0.06, d.waistD]));
    a(this.spine, k.sphere, "skin", "belly", (d, m) => {
      const b = Math.max(0.001, d.belly);
      set(m, [0, d.abdomen * 0.32, d.waistD * 0.3], [d.waistW * 0.92 * b, d.abdomen * 0.78 * b, d.waistD * 0.88 * b]);
      m.visible = d.belly > 0.04 && !this.hidden.has("belly");
    });
    // 胸：あばら・胸の筋肉・背中の広がり
    a(this.ribs, k.chest, "skin", "ribs", (d, m) => set(m, [0, -0.03, -0.005], [d.chestW, d.chestH + 0.03, d.chestD]));
    for (const i of SIDES) {
      const s = sgn(i);
      a(this.ribs, k.sphere, "skin", "pec", (d, m) =>
        set(m, [s * d.chestW * 0.42, d.chestH * 0.64, d.chestD * 0.74], [d.chestW * 0.52, d.chestH * 0.16, d.chestD * 0.3 * Math.sqrt(d.pec)], [0.45, s * 0.3, s * 0.12]),
      );
      a(this.ribs, k.sphere, "skin", "lat", (d, m) =>
        set(m, [s * d.chestW * 0.74, d.chestH * 0.47, -d.chestD * 0.12], [d.chestW * 0.3 * d.lat, d.chestH * 0.38, d.chestD * 0.62], [0, 0, s * 0.12]),
      );
      // 首から肩への盛り上がり
      a(this.chest, k.sphere, "skin", "trap", (d, m) =>
        set(m, [s * d.shoulderHalf * 0.45, d.chestH * 0.97, -d.chestD * 0.15], [d.shoulderHalf * 0.52, 0.045 * d.trap, 0.066 * (0.75 + 0.25 * d.trap)], [0, 0, -s * 0.38]),
      );
      a(this.chest, k.sphere, "skin", "clav", (d, m) => set(m, [s * d.shoulderHalf * 0.76, d.shoulderY + 0.012, 0.004], [0.052, 0.034, 0.056]));
    }
    a(this.ribs, k.sphere, "skin", "back", (d, m) => set(m, [0, d.chestH * 0.72, -d.chestD * 0.42], [d.chestW * 0.72, d.chestH * 0.3, d.chestD * 0.48]));
    // 首と頭（顔の向きが分かるように、あご・鼻・眉・耳・髪を付ける）
    a(this.neck, k.neck, "skin", "neck", (d, m) => set(m, [0, -0.035, -0.004], [d.neckR, d.neck + 0.055, d.neckR * 0.96]));
    a(this.head, k.sphere, "skin", "head", (d, m) => set(m, [0, d.headR * 0.82, -d.headR * 0.02], [d.headR * 0.86, d.headR, d.headR * 0.98]));
    a(this.head, k.sphere, "skin", "head", (d, m) => set(m, [0, d.headR * 0.32, d.headR * 0.13], [d.headR * 0.64, d.headR * 0.46, d.headR * 0.7]));
    a(this.head, k.sphereLo, "skin", "head", (d, m) => set(m, [0, d.headR * 0.63, d.headR * 0.92], [0.0115, 0.021, 0.017], [-0.3, 0, 0]), false);
    // 眉（少し内側を下げて、引きしまった顔つきに）
    for (const i of SIDES) {
      const s = sgn(i);
      a(this.head, k.sphereLo, "hair", "head", (d, m) => set(m, [s * d.headR * 0.31, d.headR * 0.97, d.headR * 0.84], [d.headR * 0.27, d.headR * 0.065, d.headR * 0.12], [0.1, s * 0.3, s * 0.2]), false);
    }
    for (const i of SIDES) {
      const s = sgn(i);
      a(this.head, k.sphereLo, "eye", "head", (d, m) => set(m, [s * d.headR * 0.32, d.headR * 0.81, d.headR * 0.84], [0.0118, 0.0062, 0.006]), false);
      a(this.head, k.sphereLo, "skin", "head", (d, m) => set(m, [s * d.headR * 0.85, d.headR * 0.72, -d.headR * 0.05], [0.013, 0.026, 0.019]), false);
    }
    a(this.head, k.hair, "hair", "hair", (d, m) => {
      const buzz = this.outfit.hair !== "short" ? 0.97 : 1;
      set(m, [0, d.headR * 0.82, -d.headR * 0.02], [d.headR * 0.91 * buzz, d.headR * 1.055 * buzz, d.headR * 1.03 * buzz], [-0.5, 0, 0]);
    });
    a(this.head, k.sphere, "hair", "topknot", (d, m) => {
      set(m, [0, d.headR * 1.83, -d.headR * 0.12], [0.022, 0.018, 0.058], [0.25, 0, 0]);
      m.visible = this.outfit.hair === "topknot" && !this.silhouette;
    });

    // 腕（肩の筋肉・上腕・力こぶ・ひじ・前腕・こぶし）
    for (const i of SIDES) {
      const s = sgn(i);
      // 肩の筋肉は腕と一緒に回る（腕を上げても肩が丸く見える）
      a(this.upperArm[i], k.sphere, "skin", "delt", (d, m) => set(m, [0, -0.035, 0], [d.deltR, d.deltR * 1.55, d.deltR * 1.02]));
      a(this.shoulder[i], k.sphere, "skin", "clav", (d, m) => set(m, [-s * 0.012, 0.004, -0.004], [d.deltR * 0.95, d.deltR * 0.8, d.deltR * 0.95]));
      a(this.upperArm[i], k.upperArm, "skin", "upperArm", (d, m) => set(m, [0, 0, 0], [d.upperArmR, d.upperArm, d.upperArmR * 0.95]));
      a(this.upperArm[i], k.sphere, "skin", "bicep", (d, m) => set(m, [0, -d.upperArm * 0.42, d.upperArmR * 0.3], [d.upperArmR * 0.78, d.upperArm * 0.26, d.upperArmR * 0.72]), false);
      a(this.upperArm[i], k.sphere, "skin", "elbow", (d, m) => set(m, [0, -d.upperArm, -0.003], [d.forearmR * 0.86, d.forearmR * 0.86, d.forearmR * 0.9]));
      a(this.forearm[i], k.forearm, "skin", "forearm", (d, m) => set(m, [0, 0, 0], [d.forearmR, d.forearm, d.forearmR * 0.88]));
      a(this.hand[i], k.box, "skin", "fist", (d, m) => set(m, [0, -d.fistR * 1.02, d.fistR * 0.14], [d.fistR * 1.95, d.fistR * 2.05, d.fistR * 1.68]));
      a(this.hand[i], k.sphereLo, "skin", "thumb", (d, m) => set(m, [s * d.fistR * 0.8, -d.fistR * 0.7, d.fistR * 0.66], [0.0145, 0.028, 0.0165], [0, 0, s * 0.5]), false);
    }
    // 脚（太もも・ひざ・すね・ふくらはぎ・くるぶし・足）
    for (const i of SIDES) {
      a(this.thigh[i], k.thigh, "skin", "thigh", (d, m) => set(m, [0, 0, 0], [d.thighR, d.thigh, d.thighR * 1.05]));
      a(this.thigh[i], k.sphere, "skin", "knee", (d, m) => set(m, [0, -d.thigh, -0.004], [d.kneeR, d.kneeR, d.kneeR]));
      a(this.shin[i], k.shin, "skin", "shin", (d, m) => set(m, [0, 0, 0.003], [d.calfR, d.shin, d.calfR * 1.05]));
      a(this.shin[i], k.sphere, "skin", "calf", (d, m) => set(m, [0, -d.shin * 0.28, d.calfR * 0.3], [d.calfR * 0.84, d.shin * 0.22, d.calfR * 0.8]), false);
      a(this.shin[i], k.sphere, "skin", "ankle", (d, m) => set(m, [0, -d.shin, 0], [d.ankleR * 1.15, d.ankleR * 1.1, d.ankleR * 1.2]));
      a(this.foot[i], k.box, "skin", "foot", (d, m) => set(m, [0, -d.ankleH * 0.5 + 0.004, (d.footLen - 0.06) / 2], [0.088, d.ankleH + 0.012, d.footLen + 0.06], [0.05, 0, 0]));
    }
  }

  /** バックボーンの服を作る */
  private buildOutfit(o: Outfit): Piece[] {
    const k = this.kit;
    const W: Piece[] = [];
    const a = (bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: MatKey, fit: Piece["fit"], shadow = true) => this.add(W, bone, geo, mat, null, fit, shadow);
    const bottomMat: MatKey = o.bottom === "pants" ? "cloth" : o.bottom === "mawashi" ? "deep" : "seat";

    // 上着（道着・テコンドーの道着）
    if (o.top === "gi" || o.top === "dobok") {
      const thick = o.cloth === "ivory" ? 1.06 : 1;
      a(this.ribs, k.chest, "top", (d, m) => set(m, [0, -0.04, -0.004], [d.chestW * 1.1 * thick + 0.012, d.chestH + 0.05, d.chestD * 1.14 * thick + 0.014]));
      a(this.spine, k.abdomen, "cloth", (d, m) => set(m, [0, -0.04, 0], [d.waistW * 1.16 * thick + 0.012, d.abdomen + 0.07, d.waistD * 1.2 * thick + 0.014]));
      // 帯の下に出る上着のすそ
      a(this.pelvis, k.tube(1.06), "cloth", (d, m) => set(m, [0, d.pelvisUp * 0.75, 0], [d.hipW * 1.24 + 0.045, 0.14, d.hipD * 1.24 + 0.04]));
      for (const i of SIDES) {
        const s = sgn(i);
        a(this.chest, k.sphere, "cloth", (d, m) => set(m, [s * d.shoulderHalf * 0.5, d.chestH * 0.93, -d.chestD * 0.1], [d.shoulderHalf * 0.5, 0.04 * (0.7 + 0.3 * d.trap), 0.075], [0, 0, -s * 0.38]));
        a(this.upperArm[i], k.sphere, "cloth", (d, m) => set(m, [0, -0.035, 0], [d.deltR * 1.18 + 0.01, d.deltR * 1.6 + 0.012, d.deltR * 1.18 + 0.01]));
        a(this.shoulder[i], k.sphere, "cloth", (d, m) => set(m, [-s * 0.012, 0.006, -0.004], [d.deltR * 1.1 + 0.008, d.deltR * 0.95 + 0.008, d.deltR * 1.1 + 0.008]));
        a(this.upperArm[i], k.tube(1.12), "cloth", (d, m) => set(m, [0, 0.01, 0], [d.upperArmR * 1.45 + 0.01, d.upperArm + 0.02, d.upperArmR * 1.4 + 0.01]));
        a(this.upperArm[i], k.sphere, "cloth", (d, m) => set(m, [0, -d.upperArm, 0], [d.upperArmR * 1.42 + 0.01, d.forearmR * 1.5, d.upperArmR * 1.4 + 0.01]));
        a(this.forearm[i], k.tube(1.25), "cloth", (d, m) => set(m, [0, 0, 0], [d.forearmR * 1.55 + 0.01, d.forearm * o.sleeve, d.forearmR * 1.45 + 0.01]));
      }
    }
    // シングレット（胸は肩ひもの形に切り抜いたテクスチャ）
    if (o.top === "singlet") {
      a(this.ribs, k.chest, "top", (d, m) => set(m, [0, -0.032, -0.004], [d.chestW * 1.03 + 0.004, d.chestH + 0.034, d.chestD * 1.04 + 0.005]));
      a(this.spine, k.abdomen, "seat", (d, m) => set(m, [0, -0.035, 0], [d.waistW * 1.04 + 0.004, d.abdomen + 0.06, d.waistD * 1.05 + 0.004]));
    }

    // 下：パンツ・ズボン・まわし
    if (o.bottom === "mawashi") {
      // まわし：腰に何重にも巻いた太い帯と、前に垂れるさがり
      a(this.pelvis, k.pelvis, "deep", (d, m) => set(m, [0, 0.01, -0.012], [d.hipW * 1.07 + 0.01, 0.11, d.hipD * 1.1 + 0.01]));
      a(this.pelvis, k.cap, "deep", (d, m) => set(m, [0, 0.07, -0.006], [d.hipW * 1.06 + 0.02, 0.15, d.hipD * 1.12 + 0.024]));
      a(this.pelvis, k.band, "trim", (d, m) => set(m, [0, 0.142, -0.006], [d.hipW * 1.06 + 0.021, 0.008, d.hipD * 1.12 + 0.025]), false);
      a(this.pelvis, k.box, "deep", (d, m) => set(m, [0, -0.045, d.hipD * 0.98], [0.11, 0.15, 0.035], [-0.15, 0, 0]));
      a(this.pelvis, k.box, "deep", (d, m) => set(m, [0, 0.08, -d.hipD * 1.12 - 0.04], [0.1, 0.1, 0.06]));
      a(this.pelvis, k.sagari, "deep", (d, m) => set(m, [0, 0.0, 0], [d.hipW * 0.8, 0.2, d.hipD * 1.12 + 0.035]), false);
    } else {
      const shell = o.bottom === "singlet" ? 1.03 : 1.09;
      a(this.pelvis, k.pelvis, bottomMat, (d, m) => set(m, [0, 0.025, -0.012], [d.hipW * shell + 0.01, 0.112, d.hipD * (shell + 0.03) + 0.01]));
      // 腰のゴム（トランクスは白く、ムエタイは太く）。パンツの上の端より少し外に巻く
      const band = o.bottom === "trunks" ? { h: 0.06, mat: "trim" as MatKey } : o.bottom === "thai" ? { h: 0.075, mat: "trim" as MatKey } : o.bottom === "mma" ? { h: 0.045, mat: "deep" as MatKey } : null;
      if (band)
        a(this.pelvis, k.band, band.mat, (d, m) =>
          set(m, [0, 0.112 - band.h / 2, -0.012], [(d.hipW * shell + 0.01) * 0.93 + 0.01, band.h, (d.hipD * (shell + 0.03) + 0.01) * 0.93 + 0.01]),
        );
      for (const i of SIDES) {
        const loose = o.bottom === "pants" ? 1.2 : o.bottom === "singlet" ? 1.04 : 1.13;
        // 太ももの部分
        a(this.thigh[i], k.tube(o.bottom === "pants" ? 1.0 : o.flare), bottomMat, (d, m) => {
          const len = Math.min(legCover(o, d), d.thigh + 0.02);
          set(m, [0, o.bottom === "pants" ? 0.04 : 0.0, 0], [d.thighR * loose + 0.008, len + (o.bottom === "pants" ? 0.04 : 0), d.thighR * loose * 1.05 + 0.008]);
        });
        if (o.bottom === "pants") {
          a(this.thigh[i], k.sphere, "cloth", (d, m) => set(m, [0, -d.thigh, 0], [d.kneeR * 1.6, d.kneeR * 1.5, d.kneeR * 1.65]));
          a(this.shin[i], k.tube(o.flare), "cloth", (d, m) => {
            const len = Math.max(0.01, legCover(o, d) - d.thigh);
            set(m, [0, 0.01, 0], [d.calfR * 1.4 + 0.012, len + 0.01, d.calfR * 1.45 + 0.012]);
          });
        } else if (o.bottom !== "singlet") {
          // すその縁取り
          const hem: MatKey = o.bottom === "mma" ? "deep" : "trim";
          a(this.thigh[i], k.band, hem, (d, m) => {
            const len = Math.min(legCover(o, d), d.thigh);
            const r = (d.thighR * loose + 0.008) * (1 + (o.flare - 1) * 0.97);
            set(m, [0, -len + 0.012, 0], [r + 0.002, 0.024, r * 1.05 + 0.002]);
          }, false);
        }
      }
    }

    // 帯・紐
    if (o.belt !== "none") {
      const thin = o.belt === "cord";
      const h = thin ? 0.018 : 0.045;
      a(this.pelvis, k.cap, "seat", (d, m) => set(m, [0, d.pelvisUp * 0.62, 0], [d.waistW * 1.22 + 0.02, h, d.waistD * 1.27 + 0.022]));
      a(this.pelvis, k.box, "seat", (d, m) => set(m, [thin ? 0.09 : 0, d.pelvisUp * 0.62, d.waistD * 1.27 + 0.026], [thin ? 0.03 : 0.055, thin ? 0.03 : 0.045, 0.028]));
      for (const s of [1, -1]) {
        a(this.pelvis, k.box, "seat", (d, m) =>
          set(m, [(thin ? 0.09 : 0) + s * 0.022, d.pelvisUp * 0.62 - (thin ? 0.1 : 0.085), d.waistD * 1.27 + 0.03], [thin ? 0.012 : 0.04, thin ? 0.18 : 0.15, 0.01], [-0.08, 0, s * 0.14]),
        );
      }
    }

    // 手：グローブ・オープンフィンガーグローブ
    for (const i of SIDES) {
      const s = sgn(i);
      if (o.hands === "gloves") {
        a(this.hand[i], k.sphere, "gloss", (d, m) => {
          const g = 1 + 0.05 * d.power;
          set(m, [0, -0.07 * g, 0.012], [0.059 * g, 0.083 * g, 0.066 * g]);
        });
        a(this.hand[i], k.sphere, "gloss", (_, m) => set(m, [s * 0.05, -0.048, 0.045], [0.021, 0.043, 0.025], [0.3, 0, s * 0.25]), false);
        a(this.hand[i], k.cap, "gloss", (_, m) => set(m, [0, 0.03, 0.002], [0.047, 0.085, 0.049]));
        a(this.hand[i], k.band, "trim", (_, m) => set(m, [0, 0.062, 0.002], [0.0485, 0.014, 0.0505]), false);
      } else if (o.hands === "mma") {
        a(this.hand[i], k.boxSoft, "dark", (d, m) => set(m, [0, -d.fistR * 1.0, d.fistR * 0.1], [d.fistR * 2.15, d.fistR * 2.0, d.fistR * 1.9]));
        a(this.hand[i], k.band, "seat", (d, m) => set(m, [0, 0.008, 0], [d.wristR * 1.3, 0.05, d.wristR * 1.25]));
      }
    }
    // 足：ボクシングシューズ・レスリングシューズ
    if (o.feet !== "bare") {
      const high = o.feet === "boots" ? 0.36 : 0.22;
      for (const i of SIDES) {
        a(this.shin[i], k.tube(0.92), "dark", (d, m) => set(m, [0, -d.shin * (1 - high), 0], [d.calfR * 0.98 + 0.008, d.shin * high + 0.01, d.calfR * 1.05 + 0.008]));
        a(this.shin[i], k.band, o.feet === "boots" ? "trim" : "seat", (d, m) => set(m, [0, -d.shin * (1 - high) - 0.012, 0], [d.calfR * 1.0 + 0.01, 0.022, d.calfR * 1.07 + 0.01]), false);
        a(this.foot[i], k.box, "dark", (d, m) => set(m, [0, -d.ankleH * 0.5 + 0.006, (d.footLen - 0.06) / 2], [0.094, d.ankleH + 0.016, d.footLen + 0.06], [0.05, 0, 0]));
        a(this.foot[i], k.box, "trim", (d, m) => set(m, [0, -d.ankleH + 0.007, (d.footLen - 0.06) / 2], [0.096, 0.012, d.footLen + 0.062]), false);
      }
    }
    // ムエタイの腕の飾り布・足首のサポーター
    if (o.armbands)
      for (const i of SIDES) {
        a(this.upperArm[i], k.ring, "seat", (d, m) => set(m, [0, -d.upperArm * 0.28, 0], [d.upperArmR * 1.06, d.upperArmR * 1.06, d.upperArmR * 1.02]), false);
        a(this.upperArm[i], k.box, "seat", (d, m) => set(m, [sgn(i) * d.upperArmR * 1.05, -d.upperArm * 0.36, -0.01], [0.012, 0.07, 0.02], [0, 0, sgn(i) * 0.2]), false);
      }
    if (o.ankles)
      for (const i of SIDES) a(this.shin[i], k.band, "trim", (d, m) => set(m, [0, -d.shin * 0.93, 0], [d.ankleR * 1.45, 0.075, d.ankleR * 1.55]));
    return W;
  }

  /** 見た目を決める。silhouette のときは服を着ず、全体を暗い影の色にする */
  setLook(style: StyleId | null, colors: RigColors, silhouette: boolean) {
    const key = silhouette ? "sil" : (style ?? "none");
    const outfit = silhouette ? outfitOf(null) : outfitOf(style);
    this.silhouette = silhouette;
    this.outfit = outfit;
    for (const p of this.worn) p.mesh.visible = false;
    let worn = this.outfits.get(key);
    if (!worn) this.outfits.set(key, (worn = silhouette ? [] : this.buildOutfit(outfit)));
    this.worn = worn;
    this.mats.paint(outfit, colors);
    for (const p of [...this.body, ...worn]) p.mesh.material = silhouette ? this.mats.sil : this.mats[p.mat];
    if (this.dims) this.setBody(this.dims);
  }

  /** 体格に合わせて部品の位置・大きさを直す（体格が変わっている間だけ、コマごとに呼ぶ） */
  setBody(d: BodyDims) {
    this.dims = d;
    this.hidden = hiddenParts(this.outfit, d, this.silhouette);
    for (const p of this.body) {
      p.mesh.visible = p.part === null || !this.hidden.has(p.part);
      p.fit(d, p.mesh);
    }
    for (const p of this.worn) {
      p.mesh.visible = true;
      p.fit(d, p.mesh);
    }
  }

  /** 光らせる（キャラ作りで見た目が切り替わるとき）。0 で元に戻る */
  setGlow(v: number, color: THREE.Color) {
    for (const m of this.mats.all()) {
      m.emissive.copy(color);
      m.emissiveIntensity = v;
    }
  }

  /** 輪郭の光の色と強さ */
  setRim(color: THREE.Color, strength: number) {
    this.mats.rim.value.copy(color).multiplyScalar(strength);
  }

  /** 影の色（シルエット）の材質。舞台の明るさに合わせて色を変える */
  get silhouetteMaterial() {
    return this.mats.sil;
  }

  // ---- 姿勢を骨に当てる ----

  private static readonly X = new THREE.Vector3(1, 0, 0);
  private readonly tq = new THREE.Quaternion();
  private readonly tq2 = new THREE.Quaternion();
  private readonly tq3 = new THREE.Quaternion();
  private readonly te = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly tm = new THREE.Matrix4();
  private readonly vx = new THREE.Vector3();
  private readonly vy = new THREE.Vector3();
  private readonly vz = new THREE.Vector3();
  private readonly vf = new THREE.Vector3();

  applyPose(p: Pose, d: BodyDims) {
    const at = (i: number): V3 => [p[i]!, p[i + 1]!, p[i + 2]!];
    this.pelvis.position.set(p[P.hip]!, p[P.hip + 1]!, p[P.hip + 2]!);
    this.pelvis.rotation.set(p[P.hipRot]!, p[P.hipRot + 1]!, p[P.hipRot + 2]!);
    this.spine.position.set(0, d.pelvisUp, 0);
    this.spine.rotation.set(p[P.spine]!, p[P.spine + 1]!, p[P.spine + 2]!);
    this.chest.position.set(0, d.abdomen, 0);
    this.chest.rotation.set(p[P.chest]!, p[P.chest + 1]!, p[P.chest + 2]!);
    this.neck.position.set(0, d.chestH, 0);
    this.neck.rotation.set(p[P.neck]! / 2, p[P.neck + 1]! / 2, p[P.neck + 2]! / 2);
    this.head.position.set(0, d.neck, 0);
    this.head.rotation.copy(this.neck.rotation);
    // 息で胸をふくらませる（横と前に広がり、少し上がる）
    const b = p[P.breath]!;
    this.ribs.scale.set(1 + 0.014 * b, 1 + 0.006 * b, 1 + 0.03 * b);

    // 腕：胸から見た位置で IK を解く（肩の骨は胸の骨の子で回さないので、そのまま当てられる）
    for (const i of SIDES) {
      const s = sgn(i);
      const shoulder: V3 = [s * d.shoulderHalf, d.shoulderY + p[P.shrug + i]!, 0];
      this.shoulder[i].position.set(shoulder[0], shoulder[1], shoulder[2]);
      this.forearm[i].position.set(0, -d.upperArm, 0);
      this.hand[i].position.set(0, -d.forearm, 0);
      this.solve(this.upperArm[i], this.forearm[i], [0, 0, 0], sub(at(P.hand + i * 3), shoulder), d.upperArm, d.forearm, at(P.elbow + i * 3));
      this.hand[i].rotation.set(p[P.fist + i * 3]!, p[P.fist + i * 3 + 1]!, p[P.fist + i * 3 + 2]!);
    }

    // 脚：足もとから見た足首の目標を、腰から見た位置にして IK を解く
    const pelQ = this.pelvis.quaternion; // rotation.set で更新済み
    const inv = this.tq.copy(pelQ).invert();
    const hip = this.pelvis.position;
    for (const i of SIDES) {
      const s = sgn(i);
      this.thigh[i].position.set(s * d.hipHalf, 0, 0);
      this.shin[i].position.set(0, -d.thigh, 0);
      this.foot[i].position.set(0, -d.shin, 0);
      const target = this.vf.set(p[P.foot + i * 3]! - hip.x, p[P.foot + i * 3 + 1]! - hip.y, p[P.foot + i * 3 + 2]! - hip.z).applyQuaternion(inv);
      const tLocal: V3 = [target.x, target.y, target.z];
      const pole = this.vf.set(p[P.knee + i * 3]!, p[P.knee + i * 3 + 1]!, p[P.knee + i * 3 + 2]!).applyQuaternion(inv);
      this.solve(this.thigh[i], this.shin[i], [s * d.hipHalf, 0, 0], tLocal, d.thigh, d.shin, [pole.x, pole.y, pole.z], true);
      // 足の向きは足もとから見て決める（すねがどう曲がっても床に沿う）
      this.te.set(p[P.footRot + i * 3]!, p[P.footRot + i * 3 + 1]!, p[P.footRot + i * 3 + 2]!);
      const want = this.tq2.setFromEuler(this.te);
      const chain = this.tq3.copy(pelQ).multiply(this.thigh[i].quaternion).multiply(this.shin[i].quaternion);
      this.foot[i].quaternion.copy(chain.invert().multiply(want));
    }
  }

  /**
   * 2 本の骨の向きを決める。upper の根もと root（親から見た位置）から target へ。
   * 上の骨の -Y を関節へ、+Z を曲がる側へ向け、下の骨は X 軸のまわりに曲げる
   */
  private solve(upper: THREE.Object3D, lower: THREE.Object3D, root: V3, target: V3, a: number, b: number, pole: V3, rooted = false) {
    const { mid, end } = solveTwoBone(root, target, a, b, pole);
    const y = this.vy.set(root[0] - mid[0], root[1] - mid[1], root[2] - mid[2]).normalize();
    const f = this.vx.set(end[0] - mid[0], end[1] - mid[1], end[2] - mid[2]).normalize();
    const z = this.vz.copy(f).addScaledVector(y, -f.dot(y));
    if (z.lengthSq() < 1e-8) z.set(-pole[0], -pole[1], -pole[2]).addScaledVector(y, -z.dot(y));
    z.normalize();
    const x = this.vf.crossVectors(y, z);
    this.tm.makeBasis(x, y, z);
    upper.quaternion.setFromRotationMatrix(this.tm);
    if (rooted) upper.position.set(root[0], root[1], root[2]);
    const fy = f.dot(y);
    const fz = f.dot(z);
    lower.quaternion.setFromAxisAngle(FighterRig.X, Math.atan2(-fz, -fy));
  }

  /** 体の中のある場所（頭・胸・腰）の、ワールドでの位置 */
  worldOf(part: "head" | "chest" | "hip", out: THREE.Vector3) {
    const bone = part === "head" ? this.head : part === "chest" ? this.chest : this.pelvis;
    out.set(0, part === "head" ? (this.dims?.headR ?? 0.1) * 0.8 : part === "chest" ? (this.dims?.chestH ?? 0.3) * 0.5 : 0, 0);
    return bone.localToWorld(out);
  }

  /** 技が当たるところ（こぶし・足の甲）のワールドでの位置 */
  strikePoint(limb: "hand" | "foot", i: 0 | 1, out: THREE.Vector3) {
    if (limb === "hand") out.set(0, -0.08, 0.01);
    else out.set(0, -0.02, 0.07);
    return (limb === "hand" ? this.hand[i] : this.foot[i]).localToWorld(out);
  }

  dispose() {
    this.mats.dispose();
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
