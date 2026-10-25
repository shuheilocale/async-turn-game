import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BodyDims } from "./body.ts";
import { solveTwoBone, type V3 } from "./math.ts";
import { hangsDown, outfitOf, PROP_LENGTH, type Cloth, type Outfit } from "./outfit.ts";
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

/** マントの形：背中側の半分だけの筒で、下へ行くほど広がる。上の端が 0、下の端が -1 */
function capeShape() {
  const pts = [
    [-1, 1.55],
    [-0.6, 1.36],
    [-0.25, 1.16],
    [0, 1.0],
  ].map(([y, r]) => v2(r!, y!));
  return new THREE.LatheGeometry(pts, 14, Math.PI / 2, Math.PI);
}

/** カップの底のタピオカ（小さな玉を、半径 1 の輪に並べて 1 つにまとめる） */
function pearlsShape() {
  const parts: THREE.BufferGeometry[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = new THREE.SphereGeometry(0.26, 8, 6);
    g.translate(Math.cos(a), (i % 2) * 0.3, Math.sin(a));
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

/** コック帽：ひだのある筒と、上のふくらみ（高さ 1、半径 1） */
function toqueShape() {
  const body = new THREE.CylinderGeometry(1, 0.92, 0.72, 40, 1, true);
  const pos = body.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.045 * Math.cos(a * 14);
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  body.translate(0, 0.36, 0);
  const top = new THREE.SphereGeometry(1.12, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  top.scale(1, 0.5, 1);
  top.translate(0, 0.66, 0);
  const merged = mergeGeometries([body.toNonIndexed(), top.toNonIndexed()])!;
  body.dispose();
  top.dispose();
  merged.computeVertexNormals();
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
    /** 上半分の輪（ヘッドセットのバンド）。XY 面にある */
    arc: new THREE.TorusGeometry(1, 0.09, 6, 20, Math.PI),
    cape: capeShape(),
    toque: toqueShape(),
    pearls: pearlsShape(),
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

/** 布の色（"seat" はその人の色） */
const CLOTH: Record<Exclude<Cloth, "seat">, string> = {
  white: "#e4e1d9",
  ivory: "#e2d8c3",
  charcoal: "#252a35",
  black: "#16171c",
  silk: "#ece4d2",
  navy: "#232a3d",
};

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

const shade = (hex: string, k: number) => {
  const col = new THREE.Color(hex);
  col.multiplyScalar(k);
  return `#${col.getHexString()}`;
};

/** 布のテクスチャに描く道具。横の真ん中（u = 0.5）が正面、u > 0.5 がその人の左。上の端（v = 1）が上 */
function painter(W = 256) {
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
  const rect = (u0: number, v0: number, u1: number, v1: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(X(u0), Y(v1), X(u1) - X(u0), Y(v0) - Y(v1));
  };
  const dot = (u: number, v: number, r: number, fill: string) => {
    g.beginPath();
    g.ellipse(X(u), Y(v), r * W, r * W * 0.9, 0, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  const line = (pts: [number, number][], stroke: string, width: number) => {
    g.beginPath();
    pts.forEach(([u, v], i) => (i === 0 ? g.moveTo(X(u), Y(v)) : g.lineTo(X(u), Y(v))));
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.stroke();
  };
  /** きらきらした細かい点（ステージ衣装） */
  const glitter = (u0: number, u1: number, color: string) => {
    for (let i = 0; i < 260; i++) {
      const u = u0 + Math.random() * (u1 - u0);
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      dot(u, Math.random(), 0.002 + Math.random() * 0.004, color);
    }
    g.globalAlpha = 1;
  };
  const texture = () => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { g, W, poly, rect, dot, line, glitter, texture };
}

/**
 * 胸の服のテクスチャ。道着は重なった襟、テコンドーの道着は V 字の襟、シングレットは肩ひもの形に切り抜く。
 * 新しい服も、襟・ボタン・前合わせなどをここで描く
 */
function topTexture(kind: Outfit["top"], cloth: string, seat: string, skin: string, bib: boolean) {
  const { g, W, poly, rect, dot, line, glitter, texture } = painter();
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
    return texture();
  }
  g.fillStyle = cloth;
  g.fillRect(0, 0, W, W);
  switch (kind) {
    case "gi": {
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
      line([[0.555, 1.0], [0.415, 0.18]], edge, 2);
      break;
    }
    case "dobok": {
      // V 字の襟（その人の色）
      poly([[0.43, 1.01], [0.47, 1.01], [0.5, 0.6], [0.5, 0.52]], seat);
      poly([[0.53, 1.01], [0.57, 1.01], [0.5, 0.52], [0.5, 0.6]], seat);
      poly([[0.47, 1.01], [0.53, 1.01], [0.5, 0.62]], shade(cloth, 0.97));
      break;
    }
    case "hoodie": {
      // 首まわりのリブと、前に垂れるひも（先は白い留め具）
      rect(0, 0.95, 1, 1.01, shade(cloth, 0.78));
      for (const u of [0.475, 0.525]) {
        line([[u, 0.97], [u + (u - 0.5) * 0.2, 0.62]], "#f1f1ef", 3);
        dot(u + (u - 0.5) * 0.2, 0.61, 0.007, "#f1f1ef");
      }
      // 縫い目（肩から胸の切りかえ）
      g.globalAlpha = 0.3;
      line([[0.3, 0.9], [0.42, 0.97]], shade(cloth, 0.6), 2);
      line([[0.7, 0.9], [0.58, 0.97]], shade(cloth, 0.6), 2);
      g.globalAlpha = 1;
      break;
    }
    case "tunic": {
      // 立ち襟（その人の色）と、前の打ち合わせに並ぶ結びボタン
      rect(0, 0.93, 1, 1.01, seat);
      line([[0.5, 0.93], [0.5, 0]], shade(cloth, 0.72), 2);
      for (let i = 0; i < 4; i++) {
        const v = 0.86 - i * 0.2;
        rect(0.465, v - 0.012, 0.535, v + 0.012, seat);
        dot(0.462, v, 0.012, seat);
        dot(0.538, v, 0.012, seat);
      }
      break;
    }
    case "tailcoat": {
      // 白いシャツの V と、つやのある襟（ラペル）。シャツには小さなボタン
      const lapel = shade(cloth, 2.1);
      poly([[0.4, 1.01], [0.6, 1.01], [0.53, 0.3], [0.5, 0.26], [0.47, 0.3]], lapel);
      poly([[0.43, 1.01], [0.57, 1.01], [0.515, 0.36], [0.5, 0.33], [0.485, 0.36]], "#f3f2ee");
      for (const v of [0.78, 0.62, 0.48]) dot(0.5, v, 0.006, "#c8c6c0");
      break;
    }
    case "scrub": {
      // V 字の襟（肌が見える）と、ふちどり。左胸に小さなポケット
      poly([[0.44, 1.01], [0.56, 1.01], [0.5, 0.72]], skin);
      line([[0.44, 1.0], [0.5, 0.72], [0.56, 1.0]], shade(cloth, 0.7), 4);
      line([[0.58, 0.68], [0.58, 0.5], [0.66, 0.5], [0.66, 0.68]], shade(cloth, 0.72), 2);
      line([[0.6, 0.66], [0.6, 0.72]], "#dfe4ea", 2);
      break;
    }
    case "jacket": {
      // きらきらした布。前は開いていて、白いシャツが見える。ふちは明るく光らせる
      glitter(0, 1, "#ffffff");
      poly([[0.45, 1.01], [0.55, 1.01], [0.545, 0], [0.455, 0]], "#f4f4f2");
      line([[0.448, 1.0], [0.452, 0]], "#fff6d8", 3);
      line([[0.552, 1.0], [0.548, 0]], "#fff6d8", 3);
      rect(0, 0.95, 0.445, 1.01, shade(cloth, 1.25));
      rect(0.555, 0.95, 1, 1.01, shade(cloth, 1.25));
      break;
    }
    case "tee": {
      // 首まわりのリブだけの、無地の大きめの T シャツ
      rect(0, 0.955, 1, 1.01, shade(cloth, 0.8));
      g.globalAlpha = 0.25;
      line([[0.3, 0.9], [0.4, 0.95]], shade(cloth, 0.6), 2);
      line([[0.7, 0.9], [0.6, 0.95]], shade(cloth, 0.6), 2);
      g.globalAlpha = 1;
      break;
    }
    case "chef": {
      // ダブルの前合わせ：左の身ごろが右に重なり、ボタンが 2 列に並ぶ。立ち襟
      rect(0, 0.94, 1, 1.01, shade(cloth, 0.93));
      line([[0.58, 0.94], [0.58, 0]], shade(cloth, 0.75), 2);
      for (let i = 0; i < 3; i++) {
        const v = 0.8 - i * 0.22;
        dot(0.445, v, 0.011, "#2b2e36");
        dot(0.555, v, 0.011, "#2b2e36");
      }
      break;
    }
    case "shinobi": {
      // 黒い布の打ち合わせ（襟はほんの少し明るく）と、おなかの上の刺し子の線
      const lap = shade(cloth, 2.0);
      poly([[0.44, 1.01], [0.5, 1.01], [0.6, 0.36], [0.55, 0.32]], lap);
      poly([[0.5, 1.01], [0.56, 1.01], [0.45, 0.2], [0.4, 0.23]], lap);
      g.globalAlpha = 0.18;
      for (let v = 0.06; v < 0.3; v += 0.06) line([[0.05, v], [0.95, v]], "#ffffff", 1);
      g.globalAlpha = 1;
      break;
    }
    case "shirt": {
      // 開襟シャツ：V に開いた襟元（肌が見える）、寝かせた襟、前のボタン、左胸のポケット。うすい水玉の柄
      g.globalAlpha = 0.16;
      for (let y = 0.04; y < 1; y += 0.09) for (let x = (y * 7) % 0.08; x < 1; x += 0.08) dot(x, y, 0.008, "#ffffff");
      g.globalAlpha = 1;
      poly([[0.43, 1.01], [0.57, 1.01], [0.5, 0.7]], skin);
      poly([[0.37, 1.01], [0.43, 1.01], [0.5, 0.7], [0.455, 0.76]], shade(cloth, 1.18));
      poly([[0.57, 1.01], [0.63, 1.01], [0.545, 0.76], [0.5, 0.7]], shade(cloth, 1.18));
      line([[0.43, 1.0], [0.5, 0.7], [0.57, 1.0]], shade(cloth, 0.62), 2);
      line([[0.5, 0.7], [0.5, 0]], shade(cloth, 0.7), 2);
      for (const v of [0.55, 0.32, 0.1]) dot(0.5, v, 0.008, "#f4f1ea");
      line([[0.58, 0.66], [0.58, 0.5], [0.66, 0.5], [0.66, 0.66], [0.58, 0.66]], shade(cloth, 0.68), 2);
      break;
    }
    case "stunt": {
      // 黒いスーツの前のファスナーと、その人の色のライン（わきを縦に、胸を横に）
      for (const u of [0.25, 0.75]) rect(u - 0.018, 0, u + 0.018, 1.01, seat);
      rect(0.3, 0.8, 0.7, 0.83, seat);
      line([[0.5, 1.0], [0.5, 0]], "#6d717c", 2);
      rect(0, 0.95, 1, 1.01, shade(cloth, 1.8));
      break;
    }
    case "suit": {
      // スーツの上着：白いシャツの V、その人の色のネクタイ、襟（ラペル）の縁、胸ポケットのチーフ
      poly([[0.42, 1.01], [0.58, 1.01], [0.5, 0.36]], "#f2f1ec");
      poly([[0.485, 0.965], [0.515, 0.965], [0.528, 0.5], [0.5, 0.42], [0.472, 0.5]], seat);
      line([[0.49, 0.9], [0.51, 0.86]], shade(seat, 0.7), 1);
      const lapel = shade(cloth, 1.55);
      poly([[0.38, 1.01], [0.42, 1.01], [0.5, 0.36], [0.47, 0.42], [0.43, 0.62], [0.39, 0.66]], lapel);
      poly([[0.58, 1.01], [0.62, 1.01], [0.61, 0.66], [0.57, 0.62], [0.53, 0.42], [0.5, 0.36]], lapel);
      line([[0.6, 0.6], [0.68, 0.6]], shade(cloth, 0.7), 2);
      poly([[0.61, 0.6], [0.635, 0.66], [0.66, 0.6]], "#f2f1ec");
      break;
    }
    default:
      break;
  }
  // 胸当てのエプロン（その人の色）：胸の前を覆い、肩ひもを首の後ろへ回す
  if (bib) {
    poly([[0.38, 0], [0.62, 0], [0.6, 0.78], [0.4, 0.78]], seat);
    rect(0.4, 0.74, 0.6, 0.78, shade(seat, 0.8));
    for (const u of [0.41, 0.59]) {
      const top = u + (u - 0.5) * 0.6;
      poly([[u - 0.012, 0.78], [u + 0.012, 0.78], [top + 0.012, 1.01], [top - 0.012, 1.01]], shade(seat, 0.85));
    }
    line([[0.44, 0.55], [0.56, 0.55]], shade(seat, 0.7), 2);
  }
  return texture();
}

/** おなかの服のテクスチャ（ポケット・ボタン・前合わせの続き） */
function waistTexture(kind: Outfit["top"], cloth: string, seat: string, bib: boolean) {
  const { g, W, rect, dot, line, glitter, texture } = painter(128);
  g.fillStyle = cloth;
  g.fillRect(0, 0, W, W);
  switch (kind) {
    case "hoodie":
      // おなかの大きなポケットと、すそのリブ
      line([[0.38, 0.12], [0.41, 0.62], [0.59, 0.62], [0.62, 0.12]], shade(cloth, 0.7), 2);
      rect(0, 0, 1, 0.1, shade(cloth, 0.78));
      break;
    case "tunic":
      line([[0.5, 1], [0.5, 0]], shade(cloth, 0.72), 2);
      rect(0.465, 0.55, 0.535, 0.6, seat);
      dot(0.462, 0.575, 0.024, seat);
      dot(0.538, 0.575, 0.024, seat);
      break;
    case "tailcoat":
      // 前は短く切れていて、白いシャツとその人の色の腰帯（カマーバンド）が見える
      rect(0.38, 0, 0.62, 1, "#f3f2ee");
      rect(0.3, 0.02, 0.7, 0.42, seat);
      for (const v of [0.14, 0.26, 0.38]) rect(0.3, v, 0.7, v + 0.012, shade(seat, 0.75));
      break;
    case "scrub":
      for (const u of [0.38, 0.62]) line([[u - 0.07, 0.5], [u - 0.07, 0.15], [u + 0.07, 0.15], [u + 0.07, 0.5]], shade(cloth, 0.72), 2);
      break;
    case "jacket":
      glitter(0, 1, "#ffffff");
      rect(0.455, 0, 0.545, 1, "#f4f4f2");
      break;
    case "chef":
      line([[0.58, 1], [0.58, 0]], shade(cloth, 0.75), 2);
      dot(0.445, 0.6, 0.022, "#2b2e36");
      dot(0.555, 0.6, 0.022, "#2b2e36");
      break;
    case "shirt":
      g.globalAlpha = 0.16;
      for (let y = 0.04; y < 1; y += 0.18) for (let x = (y * 7) % 0.16; x < 1; x += 0.16) dot(x, y, 0.016, "#ffffff");
      g.globalAlpha = 1;
      line([[0.5, 1], [0.5, 0]], shade(cloth, 0.7), 2);
      for (const v of [0.75, 0.3]) dot(0.5, v, 0.016, "#f4f1ea");
      break;
    case "stunt":
      for (const u of [0.25, 0.75]) rect(u - 0.018, 0, u + 0.018, 1, seat);
      line([[0.5, 1], [0.5, 0]], "#6d717c", 2);
      break;
    case "suit":
      // 前のボタンと、腰のポケットのふた
      line([[0.5, 1], [0.5, 0]], shade(cloth, 0.6), 2);
      for (const v of [0.78, 0.38]) dot(0.5, v, 0.02, "#11131a");
      for (const u of [0.32, 0.68]) rect(u - 0.1, 0.2, u + 0.1, 0.24, shade(cloth, 0.7));
      break;
    default:
      break;
  }
  if (bib) rect(0.38, 0, 0.62, 1, seat);
  return texture();
}

/** ステージ衣装のきらめき（4 本の光の筋） */
function glintTexture() {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? S * 0.09 : S * 0.5;
    g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
  /** ズボンの布 */
  readonly pants = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  /** 胸の服（襟・肩ひものテクスチャ付き） */
  readonly top = new THREE.MeshStandardMaterial({ roughness: 0.9, alphaTest: 0.5 });
  /** おなかの服（ポケット・ボタンのテクスチャ付き） */
  readonly waist = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  readonly trim = new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.55 });
  readonly dark = new THREE.MeshStandardMaterial({ color: "#1f2228", roughness: 0.45 });
  /** 金属（ロボットの体・フライパン・スプーン） */
  readonly metal = new THREE.MeshStandardMaterial({ color: "#b9c0cb", roughness: 0.32, metalness: 0.75 });
  /** その人の色の金属の板（ロボットの装甲） */
  readonly plate = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.45 });
  readonly gold = new THREE.MeshStandardMaterial({ color: "#e0b54e", roughness: 0.28, metalness: 1 });
  /** ミルクティー（タピオカのカップの中身） */
  readonly tea = new THREE.MeshStandardMaterial({ color: "#d4ad86", roughness: 0.25 });
  /** マントの裏地（その人の色。内側から見える） */
  readonly lining = new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.BackSide });
  /** 光るもの（ロボットの目・ペンライト・ヘッドセットの光）。lamp はいつも、pulse は息に合わせて点滅する */
  readonly lamp = new THREE.MeshBasicMaterial({ toneMapped: false });
  readonly pulse = new THREE.MeshBasicMaterial({ toneMapped: false });
  /** まだ決まっていない人のシルエット */
  readonly sil = new THREE.MeshStandardMaterial({ color: "#2a3040", roughness: 0.55, metalness: 0.15 });
  readonly glint = new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private readonly weave = weaveTexture();
  private topKey = "";
  private waistKey = "";
  readonly lampColor = new THREE.Color();
  readonly pulseColor = new THREE.Color();
  /** 輪郭に差す、その人の色の光（リムライト）。すべての材質で同じ値を使う */
  readonly rim = { value: new THREE.Color(0, 0, 0) };

  constructor() {
    for (const m of [this.cloth, this.top, this.seat, this.deep, this.pants, this.waist]) {
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
    return [
      this.skin,
      this.hair,
      this.eye,
      this.seat,
      this.gloss,
      this.deep,
      this.cloth,
      this.pants,
      this.top,
      this.waist,
      this.trim,
      this.dark,
      this.metal,
      this.plate,
      this.gold,
      this.tea,
      this.lining,
      this.sil,
    ];
  }

  paint(outfit: Outfit, colors: RigColors) {
    this.skin.color.set(colors.skin);
    this.seat.color.set(colors.seat);
    this.gloss.color.set(colors.seat);
    this.plate.color.set(colors.seat);
    this.lining.color.set(colors.seat);
    this.deep.color.set(colors.seat).lerp(new THREE.Color("#15171c"), 0.52);
    const cloth = outfit.cloth === "seat" ? colors.seat : CLOTH[outfit.cloth];
    const pants = outfit.pants === "seat" ? colors.seat : CLOTH[outfit.pants];
    this.cloth.color.set(cloth);
    this.pants.color.set(pants);
    // 絹・サテンは少しつやを出す。ステージ衣装は金属のように光らせる
    const sheen = outfit.sheen;
    for (const m of [this.cloth, this.top, this.waist]) {
      m.roughness = 0.9 - 0.45 * sheen;
      m.metalness = outfit.top === "jacket" ? 0.35 : 0;
    }
    this.pants.roughness = outfit.pants === "black" && sheen > 0 ? 0.6 : 0.9;
    // 光るもの：その人の色を明るくした色
    this.lampColor.set(colors.seat).lerp(new THREE.Color("#ffffff"), outfit.robot ? 0.35 : 0.45);
    this.lamp.color.copy(this.lampColor);
    this.pulseColor.copy(this.lampColor);
    this.pulse.color.copy(this.pulseColor);
    const key = `${outfit.top}|${cloth}|${colors.seat}|${colors.skin}|${outfit.bib}`;
    if (key !== this.topKey && outfit.top !== "none") {
      this.topKey = key;
      this.top.map?.dispose();
      this.top.map = topTexture(outfit.top, cloth, colors.seat, colors.skin, outfit.bib);
      this.top.transparent = false;
      this.top.needsUpdate = true;
    }
    if (key !== this.waistKey && outfit.top !== "none" && outfit.top !== "singlet") {
      this.waistKey = key;
      this.waist.map?.dispose();
      this.waist.map = waistTexture(outfit.top, cloth, colors.seat, outfit.bib);
      this.waist.needsUpdate = true;
    }
  }

  dispose() {
    this.all().forEach((m) => m.dispose());
    this.lamp.dispose();
    this.pulse.dispose();
    this.top.map?.dispose();
    this.waist.map?.dispose();
    this.glint.map?.dispose();
    this.glint.dispose();
    this.weave.dispose();
  }
}

type MatKey =
  | "skin"
  | "hair"
  | "eye"
  | "seat"
  | "gloss"
  | "deep"
  | "cloth"
  | "pants"
  | "top"
  | "waist"
  | "trim"
  | "dark"
  | "metal"
  | "plate"
  | "gold"
  | "tea"
  | "lining"
  | "lamp"
  | "pulse";

// ---- 骨と部品 ----

interface Piece {
  mesh: THREE.Mesh;
  mat: MatKey;
  /** 体格に合わせて、位置・大きさ・向きを決める */
  fit(d: BodyDims, m: THREE.Mesh): void;
  /** 体の部品の名前（服で隠れるものを消すのに使う）。服の部品は null */
  part: string | null;
  /** 技に合わせて見せる部品（ふだんは隠す）と、その手（骨の左右） */
  cue?: CueName;
  side?: 0 | 1;
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

/** 胴と腕を覆う、新しい服（パーカー・燕尾服など） */
const isCoat = (o: Outfit) => o.top !== "none" && o.top !== "singlet" && !isWrap(o);
/** 前を打ち合わせて帯でしめる上着（道着・テコンドーの道着・忍び装束） */
const isWrap = (o: Outfit) => o.top === "gi" || o.top === "dobok" || o.top === "shinobi";

/** 服で隠れる体の部品 */
export function hiddenParts(o: Outfit, d: BodyDims, sil: boolean): Set<string> {
  const h = new Set<string>();
  if (sil) return h;
  if (o.robot) {
    // ロボットは体の部品をすべて金属の板に置きかえる
    BODY_PARTS.forEach((p) => h.add(p));
    return h;
  }
  if (isWrap(o)) ["ribs", "pec", "lat", "back", "abdomen", "upperArm", "bicep", "trap", "clav", "delt", "belly"].forEach((p) => h.add(p));
  if (isCoat(o)) {
    ["ribs", "pec", "lat", "back", "abdomen", "bicep", "trap", "clav", "delt", "belly"].forEach((p) => h.add(p));
    if (o.upper >= 0.98) h.add("upperArm");
  }
  if (o.top === "singlet") ["abdomen", "belly"].forEach((p) => h.add(p));
  h.add("pelvis");
  const cover = legCover(o, d);
  if (cover >= d.thigh * 0.98) h.add("thigh");
  if (cover >= d.thigh + d.shin * 0.97) ["shin", "calf"].forEach((p) => h.add(p));
  if (o.hands === "gloves" || o.hands === "white") ["fist", "thumb"].forEach((p) => h.add(p));
  // サンダルは足の甲が見える
  if (o.feet !== "bare" && o.feet !== "sandals") h.add("foot");
  if (o.hair === "none") h.add("hair");
  if (o.bottom === "mawashi") h.delete("pelvis");
  return h;
}

/** 体の部品の名前（buildBody で付けるもの） */
const BODY_PARTS = [
  "pelvis",
  "abdomen",
  "belly",
  "ribs",
  "pec",
  "lat",
  "trap",
  "clav",
  "back",
  "neck",
  "head",
  "hair",
  "topknot",
  "delt",
  "upperArm",
  "bicep",
  "elbow",
  "forearm",
  "fist",
  "thumb",
  "thigh",
  "knee",
  "shin",
  "calf",
  "ankle",
  "foot",
];

/**
 * 技に合わせて見せる部品：包帯・味見のスプーン・持ち物を持たない手に移したカップ（held）・盾にするトレイと、
 * 持ち物の形（form0 = ふだん、form1 = 太いストロー、form2 = シェイカー）
 */
type CueName = "bandage" | "spoon" | "held" | "tray" | "form0" | "form1" | "form2";

/** 技に合わせて、そのときだけ変える見た目 */
export interface RigCues {
  /** 体を消す（消えて現れる） */
  hidden: boolean;
  /** 外して飛ばしている手（ロケットパンチ）。-1 はなし。0 = 左、1 = 右（骨の左右） */
  detached: -1 | 0 | 1;
  /** ウインクの深さ（0〜1） */
  wink: number;
  /** 包帯・スプーンを見せる手（骨の左右）。-1 は見せない */
  bandage: -1 | 0 | 1;
  spoon: -1 | 0 | 1;
  /** 光るもの（目・胸の光など）の明るさ（1 がふつう、0 で消える） */
  lamp: number;
  /** 持ち物の形（0 = ふだん、1・2 = 技で持ちかえた形）と、持ち物を移した手（骨の左右。-1 は移さない） */
  form: 0 | 1 | 2;
  held: -1 | 0 | 1;
  /** トレイを盾にしている腕（骨の左右。-1 はなし） */
  tray: -1 | 0 | 1;
}

export const NO_CUES: RigCues = { hidden: false, detached: -1, wink: 0, bandage: -1, spoon: -1, lamp: 1, form: 0, held: -1, tray: -1 };

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
  /** 持ち物：持つ手に付ける入れ物（左右を入れかえるときは鏡に映す）と、握るところに合わせた中身 */
  private readonly propHold = new THREE.Group();
  private readonly propRoot = new THREE.Group();
  /** 持ち物を持たない手に、技のあいだだけ持たせるものの入れ物（左右の手に 1 つずつ。持ち物の手と鏡の形） */
  private readonly heldRoot = [new THREE.Group(), new THREE.Group()] as const;
  private mirrored = false;
  private cues: RigCues = { ...NO_CUES };
  /** 目（ウインクで細める） */
  private eyes: THREE.Mesh[] = [];
  /** ステージ衣装のきらめき */
  private glints: THREE.Sprite[] = [];

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
    this.eyes = this.body.filter((p) => p.mat === "eye").map((p) => p.mesh);
    // 持ち物は右手に持つ。握るところ（こぶしの中）から親指の側を +Y にする
    this.hand[R].add(this.propHold);
    this.propHold.add(this.propRoot);
    this.propRoot.rotation.set(0, 0, Math.PI / 2);
    for (const i of SIDES) {
      this.hand[i].add(this.heldRoot[i]);
      this.heldRoot[i].scale.x = i === L ? -1 : 1;
      this.heldRoot[i].rotation.set(0, 0, Math.PI / 2);
    }
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
    const a = (bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: MatKey, fit: Piece["fit"], shadow = true, cue?: CueName, side?: 0 | 1) => {
      this.add(W, bone, geo, mat, null, fit, shadow);
      const p = W[W.length - 1]!;
      if (cue) {
        p.cue = cue;
        p.side = side;
      }
    };
    if (o.robot) {
      this.buildRobot(a);
      return W;
    }
    const bottomMat: MatKey = o.bottom === "pants" ? "pants" : o.bottom === "mawashi" ? "deep" : "seat";

    // 上着（道着・テコンドーの道着・忍び装束）
    if (isWrap(o)) {
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
        // 忍び装束は袖口をしぼる（手甲の中に入れる）
        a(this.forearm[i], k.tube(o.top === "shinobi" ? o.cuff : 1.25), "cloth", (d, m) => set(m, [0, 0, 0], [d.forearmR * 1.55 + 0.01, d.forearm * o.sleeve, d.forearmR * 1.45 + 0.01]));
      }
    }
    // 新しい服（パーカー・中国風の上着・燕尾服・スクラブ・ステージ衣装・T シャツ・コックコート）
    if (isCoat(o)) {
      const z = o.loose;
      const loose = (z - 1) / 0.26;
      // ゆったりした服ほど、胸からまっすぐ下に落ちる
      const waistW = (d: BodyDims) => Math.max(d.waistW * z * 1.05, d.chestW * (z - 0.2)) + 0.012;
      const waistD = (d: BodyDims) => Math.max(d.waistD * z * 1.1, d.chestD * (z - 0.2)) + 0.014;
      a(this.ribs, k.chest, "top", (d, m) => set(m, [0, -0.04, -0.004], [d.chestW * z + 0.012, d.chestH + 0.05, d.chestD * z * 1.04 + 0.014]));
      a(this.spine, k.abdomen, "waist", (d, m) => set(m, [0, -0.045, 0], [waistW(d), d.abdomen + 0.075, waistD(d)]));
      if (o.hem >= 0.06) {
        const top = (d: BodyDims) => d.pelvisUp + 0.02;
        const len = (d: BodyDims) => top(d) + o.hem - 0.06;
        // ゆるいズボンの太ももより外に出す
        const legs = o.bottom === "pants" ? o.baggy : 1.1;
        const hw = (d: BodyDims) => Math.max(d.hipW * 1.1 + 0.03, waistW(d) + 0.006, d.hipHalf + d.thighR * legs + 0.03);
        const hd = (d: BodyDims) => Math.max(d.hipD * 1.16 + 0.03, waistD(d) + 0.006, d.thighR * legs * 1.08 + 0.035);
        const flare = o.top === "tunic" ? 1.12 : 1.04 + 0.04 * loose;
        a(this.pelvis, k.tube(flare), "cloth", (d, m) => set(m, [0, top(d), 0], [hw(d), len(d), hd(d)]));
        // パーカーのすそのリブ
        if (o.top === "hoodie") a(this.pelvis, k.band, "deep", (d, m) => set(m, [0, top(d) - len(d) + 0.022, 0], [hw(d) * flare + 0.002, 0.045, hd(d) * flare + 0.002]), false);
      }
      for (const i of SIDES) {
        const s = sgn(i);
        a(this.chest, k.sphere, "cloth", (d, m) => set(m, [s * d.shoulderHalf * 0.5, d.chestH * 0.93, -d.chestD * 0.1], [d.shoulderHalf * 0.52, 0.042 * (0.7 + 0.3 * d.trap), 0.078], [0, 0, -s * 0.38]));
        a(this.upperArm[i], k.sphere, "cloth", (d, m) => set(m, [0, -0.035, 0], [d.deltR * (1.12 + 0.2 * loose) + 0.01, d.deltR * 1.6 + 0.012, d.deltR * (1.12 + 0.2 * loose) + 0.01]));
        a(this.shoulder[i], k.sphere, "cloth", (d, m) => set(m, [-s * 0.012, 0.006, -0.004], [d.deltR * 1.08 + 0.008, d.deltR * 0.95 + 0.008, d.deltR * 1.08 + 0.008]));
        const sleeveR = 1.3 + 0.35 * loose;
        a(this.upperArm[i], k.tube(o.upper < 1 ? 1.12 : 1.06), "cloth", (d, m) =>
          set(m, [0, 0.01, 0], [d.upperArmR * sleeveR + 0.01, d.upperArm * o.upper + 0.02, d.upperArmR * sleeveR * 0.97 + 0.01]),
        );
        if (o.upper >= 0.98) {
          a(this.upperArm[i], k.sphere, "cloth", (d, m) => set(m, [0, -d.upperArm, 0], [d.upperArmR * sleeveR + 0.008, d.forearmR * 1.45, d.upperArmR * sleeveR * 0.97 + 0.008]));
          if (o.sleeve > 0) {
            a(this.forearm[i], k.tube(o.cuff), "cloth", (d, m) => set(m, [0, 0, 0], [d.forearmR * (1.4 + 0.3 * loose) + 0.01, d.forearm * o.sleeve, d.forearmR * (1.32 + 0.3 * loose) + 0.01]));
            // 袖口：パーカーはリブ、中国風の上着はその人の色の縁取り、スーツは白いシャツの袖口
            if (o.top === "hoodie" || o.top === "tunic" || o.top === "suit")
              a(this.forearm[i], k.band, o.top === "hoodie" ? "deep" : o.top === "suit" ? "trim" : "seat", (d, m) => {
                const r = (d.forearmR * (1.4 + 0.3 * loose) + 0.01) * o.cuff;
                const shirt = o.top === "suit" ? -0.012 : 0;
                set(m, [0, -d.forearm * o.sleeve + 0.018 + shirt * 2, 0], [r + 0.002 + shirt * 0.6, 0.036, r * 0.95 + 0.002 + shirt * 0.6]);
              }, false);
          }
        }
        // スタントスーツの袖の外側の線（その人の色）
        if (o.top === "stunt") {
          a(this.upperArm[i], k.box, "seat", (d, m) => set(m, [s * (d.upperArmR * sleeveR + 0.008), -d.upperArm * 0.5, 0], [0.008, d.upperArm * 0.9, 0.022]), false);
          a(this.forearm[i], k.box, "seat", (d, m) => set(m, [s * (d.forearmR * (1.4 + 0.3 * loose) + 0.008), -d.forearm * 0.45, 0], [0.008, d.forearm * 0.75, 0.02]), false);
        }
      }
      // 襟
      if (o.top === "tunic" || o.top === "chef" || o.top === "tailcoat" || o.top === "suit" || o.top === "stunt")
        a(this.neck, k.band, o.top === "tunic" ? "seat" : o.top === "chef" || o.top === "stunt" ? "cloth" : "trim", (d, m) => set(m, [0, 0.012, -0.003], [d.neckR * 1.2 + 0.004, 0.042, d.neckR * 1.16 + 0.004]), false);
      // パーカーのフード（首の後ろにたたまれている）
      if (o.top === "hoodie")
        a(this.chest, k.sphere, "cloth", (d, m) => set(m, [0, d.chestH * 0.97, -d.chestD * 0.7], [d.shoulderHalf * 0.55, 0.075, 0.085], [0.5, 0, 0]));
      // 燕尾服のすそ（背中に 2 枚）
      if (o.top === "tailcoat")
        for (const i of SIDES) {
          const s = sgn(i);
          a(this.pelvis, k.box, "cloth", (d, m) => set(m, [s * d.hipW * 0.42, -0.14, -d.hipD * 1.12 - 0.012], [d.hipW * 0.8, 0.46, 0.018], [0.1, 0, s * 0.06]));
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
      const tight = o.bottom === "singlet" || o.bottom === "jammer";
      const shell = tight ? 1.03 : 1.09;
      a(this.pelvis, k.pelvis, bottomMat, (d, m) => set(m, [0, 0.025, -0.012], [d.hipW * shell + 0.01, 0.112, d.hipD * (shell + 0.03) + 0.01]));
      // 腰のゴム（トランクスは白く、ムエタイ・キックは太く）。パンツの上の端より少し外に巻く
      const band =
        o.bottom === "trunks"
          ? { h: 0.06, mat: "trim" as MatKey }
          : o.bottom === "thai" || o.bottom === "kick"
            ? { h: 0.075, mat: "trim" as MatKey }
            : o.bottom === "mma"
              ? { h: 0.045, mat: "deep" as MatKey }
              : null;
      if (band)
        a(this.pelvis, k.band, band.mat, (d, m) =>
          set(m, [0, 0.112 - band.h / 2, -0.012], [(d.hipW * shell + 0.01) * 0.93 + 0.01, band.h, (d.hipD * (shell + 0.03) + 0.01) * 0.93 + 0.01]),
        );
      for (const i of SIDES) {
        const s = sgn(i);
        const loose = o.bottom === "pants" ? o.baggy : tight ? 1.04 : 1.13;
        // 太ももの部分
        a(this.thigh[i], k.tube(o.bottom === "pants" ? 1.0 : o.flare), bottomMat, (d, m) => {
          const len = Math.min(legCover(o, d), d.thigh + 0.02);
          set(m, [0, o.bottom === "pants" ? 0.04 : 0.0, 0], [d.thighR * loose + 0.008, len + (o.bottom === "pants" ? 0.04 : 0), d.thighR * loose * 1.05 + 0.008]);
        });
        if (o.bottom === "pants") {
          a(this.thigh[i], k.sphere, "pants", (d, m) => set(m, [0, -d.thigh, 0], [d.kneeR * 1.6 * (loose / 1.2), d.kneeR * 1.5, d.kneeR * 1.65 * (loose / 1.2)]));
          a(this.shin[i], k.tube(o.flare), "pants", (d, m) => {
            const len = Math.max(0.01, legCover(o, d) - d.thigh);
            set(m, [0, 0.01, 0], [d.calfR * 1.4 * (loose / 1.2) + 0.012, len + 0.01, d.calfR * 1.45 * (loose / 1.2) + 0.012]);
          });
        } else if (!tight) {
          // すその縁取り
          const hem: MatKey = o.bottom === "mma" ? "deep" : "trim";
          a(this.thigh[i], k.band, hem, (d, m) => {
            const len = Math.min(legCover(o, d), d.thigh);
            const r = (d.thighR * loose + 0.008) * (1 + (o.flare - 1) * 0.97);
            set(m, [0, -len + 0.012, 0], [r + 0.002, 0.024, r * 1.05 + 0.002]);
          }, false);
        }
        // スタントスーツのズボンの外側の線（太もも・すね）
        if (o.top === "stunt") {
          a(this.thigh[i], k.box, "seat", (d, m) => set(m, [s * (d.thighR * loose + 0.009), -d.thigh * 0.5, 0], [0.008, d.thigh * 0.9, 0.024]), false);
          a(this.shin[i], k.box, "seat", (d, m) => set(m, [s * (d.calfR * 1.4 * (loose / 1.2) + 0.012), -d.shin * 0.45, 0], [0.008, d.shin * 0.8, 0.022]), false);
        }
        // キックパンツ・水着の外側の線
        if (o.bottom === "kick" || o.bottom === "jammer")
          a(this.thigh[i], k.box, o.bottom === "kick" ? "trim" : "deep", (d, m) => {
            const len = Math.min(legCover(o, d), d.thigh) * 0.9;
            const r = (d.thighR * loose + 0.008) * (o.bottom === "kick" ? 1 + (o.flare - 1) * 0.5 : 1);
            set(m, [s * (r + 0.001), -len / 2 - 0.01, 0], [0.008, len, 0.035], [0, 0, s * (o.bottom === "kick" ? 0.1 : 0)]);
          }, false);
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

    // 手：グローブ・オープンフィンガーグローブ・白い手袋
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
      } else if (o.hands === "white") {
        a(this.hand[i], k.boxSoft, "trim", (d, m) => set(m, [0, -d.fistR * 1.02, d.fistR * 0.14], [d.fistR * 2.08, d.fistR * 2.15, d.fistR * 1.8]));
        a(this.hand[i], k.sphereLo, "trim", (d, m) => set(m, [s * d.fistR * 0.82, -d.fistR * 0.7, d.fistR * 0.66], [0.016, 0.03, 0.018], [0, 0, s * 0.5]), false);
      }
    }
    // 足：ボクシングシューズ・レスリングシューズ
    if (o.feet === "boots" || o.feet === "shoes") {
      const high = o.feet === "boots" ? 0.36 : 0.22;
      for (const i of SIDES) {
        a(this.shin[i], k.tube(0.92), "dark", (d, m) => set(m, [0, -d.shin * (1 - high), 0], [d.calfR * 0.98 + 0.008, d.shin * high + 0.01, d.calfR * 1.05 + 0.008]));
        a(this.shin[i], k.band, o.feet === "boots" ? "trim" : "seat", (d, m) => set(m, [0, -d.shin * (1 - high) - 0.012, 0], [d.calfR * 1.0 + 0.01, 0.022, d.calfR * 1.07 + 0.01]), false);
        a(this.foot[i], k.box, "dark", (d, m) => set(m, [0, -d.ankleH * 0.5 + 0.006, (d.footLen - 0.06) / 2], [0.094, d.ankleH + 0.016, d.footLen + 0.06], [0.05, 0, 0]));
        a(this.foot[i], k.box, "trim", (d, m) => set(m, [0, -d.ankleH + 0.007, (d.footLen - 0.06) / 2], [0.096, 0.012, d.footLen + 0.062]), false);
      }
    }
    // 低い靴：スニーカー（白に、その人の色の縁）・革靴・布の靴（白い底）・足袋（ズボンと同じ布に黒い底）
    if (o.feet === "sneakers" || o.feet === "dress" || o.feet === "slip" || o.feet === "tabi") {
      const upper: MatKey = o.feet === "sneakers" ? "trim" : o.feet === "dress" ? "dark" : "pants";
      const sole: MatKey = o.feet === "sneakers" ? "deep" : o.feet === "dress" || o.feet === "tabi" ? "dark" : "trim";
      const chunky = o.feet === "sneakers" ? 1 : 0;
      for (const i of SIDES) {
        a(this.foot[i], k.box, upper, (d, m) => set(m, [0, -d.ankleH * 0.42 + 0.008, (d.footLen - 0.06) / 2], [0.096 + 0.006 * chunky, d.ankleH + 0.03, d.footLen + 0.066], [0.05, 0, 0]));
        a(this.foot[i], k.box, sole, (d, m) => set(m, [0, -d.ankleH + 0.008 + 0.004 * chunky, (d.footLen - 0.06) / 2], [0.1 + 0.006 * chunky, 0.014 + 0.012 * chunky, d.footLen + 0.07]), false);
        if (chunky) a(this.shin[i], k.band, "seat", (d, m) => set(m, [0, -d.shin + 0.01, 0], [d.ankleR * 1.55, 0.04, d.ankleR * 1.7]), false);
      }
    }
    // サンダル：足の甲が見え、底と甲のベルトだけ
    if (o.feet === "sandals")
      for (const i of SIDES) {
        a(this.foot[i], k.box, "dark", (d, m) => set(m, [0, -d.ankleH + 0.004, (d.footLen - 0.06) / 2], [0.1, 0.016, d.footLen + 0.075]));
        a(this.foot[i], k.boxSoft, "deep", (d, m) => set(m, [0, -d.ankleH * 0.35, d.footLen * 0.32], [0.094, 0.022, 0.05], [0.12, 0, 0]), false);
      }
    // ムエタイの腕の飾り布・足首のサポーター
    if (o.armbands)
      for (const i of SIDES) {
        a(this.upperArm[i], k.ring, "seat", (d, m) => set(m, [0, -d.upperArm * 0.28, 0], [d.upperArmR * 1.06, d.upperArmR * 1.06, d.upperArmR * 1.02]), false);
        a(this.upperArm[i], k.box, "seat", (d, m) => set(m, [sgn(i) * d.upperArmR * 1.05, -d.upperArm * 0.36, -0.01], [0.012, 0.07, 0.02], [0, 0, sgn(i) * 0.2]), false);
      }
    if (o.ankles)
      for (const i of SIDES) a(this.shin[i], k.band, "trim", (d, m) => set(m, [0, -d.shin * 0.93, 0], [d.ankleR * 1.45, 0.075, d.ankleR * 1.55]));
    // キックボクシングのすねのサポーター（足の甲まで覆う）と、その人の色の留め帯
    if (o.shins)
      for (const i of SIDES) {
        a(this.shin[i], k.tube(0.82), "trim", (d, m) => set(m, [0, -d.shin * 0.1, d.calfR * 0.18], [d.calfR * 1.12 + 0.012, d.shin * 0.84, d.calfR * 1.22 + 0.014]));
        a(this.shin[i], k.band, "seat", (d, m) => set(m, [0, -d.shin * 0.42, d.calfR * 0.12], [d.calfR * 1.08 + 0.016, 0.035, d.calfR * 1.18 + 0.018]), false);
        a(this.foot[i], k.boxSoft, "trim", (d, m) => set(m, [0, -d.ankleH * 0.1, d.footLen * 0.28], [0.082, 0.04, d.footLen * 0.62], [0.12, 0, 0]), false);
      }
    // 手甲（前腕を覆うその人の色の布）
    if (o.bracers)
      for (const i of SIDES)
        a(this.forearm[i], k.tube(0.9), "seat", (d, m) => set(m, [0, -d.forearm * 0.42, 0], [d.forearmR * 1.32 + 0.012, d.forearm * 0.56, d.forearmR * 1.24 + 0.012]), false);
    // ひじ・ひざのプロテクター（ひじは腕の後ろ、ひざは脚の前に当てる）
    if (o.pads)
      for (const i of SIDES) {
        // 袖・ズボンのひじ・ひざのふくらみより外に付ける
        const elbow = (d: BodyDims) => d.upperArmR * 1.4 + 0.012;
        const knee = (d: BodyDims) => d.kneeR * 1.6 * (o.baggy / 1.2) + 0.008;
        a(this.upperArm[i], k.boxSoft, "deep", (d, m) => set(m, [0, -d.upperArm + 0.005, -elbow(d)], [d.forearmR * 2.3, d.forearmR * 2.4, 0.04]), false);
        a(this.thigh[i], k.boxSoft, "deep", (d, m) => set(m, [0, -d.thigh + 0.01, -knee(d)], [d.kneeR * 2.4, d.kneeR * 2.7, 0.045]), false);
      }
    // 背中に負った刀（右の肩の上に柄が出る）
    if (o.sword) {
      const tilt = 0.62;
      const dir: V3 = [-Math.sin(tilt), Math.cos(tilt), 0];
      const at = (d: BodyDims, u: number): V3 => [dir[0] * u, d.chestH * 0.5 + dir[1] * u, -d.chestD * 1.3 - 0.02];
      a(this.chest, k.cap, "dark", (d, m) => set(m, at(d, -0.04), [0.017, 0.62, 0.012], [0, 0, tilt]), false);
      a(this.chest, k.cap, "metal", (d, m) => set(m, at(d, 0.28), [0.036, 0.008, 0.036], [0, 0, tilt]), false);
      a(this.chest, k.cap, "seat", (d, m) => set(m, at(d, 0.36), [0.014, 0.15, 0.014], [0, 0, tilt]), false);
    }

    // 頭の持ち物
    const hr = (d: BodyDims) => d.headR;
    switch (o.head) {
      case "tophat":
        // シルクハット：高い筒・つば・その人の色のリボン
        a(this.head, k.cap, "dark", (d, m) => set(m, [0, hr(d) * 1.7 + 0.085, -0.012], [hr(d) * 0.74, 0.17, hr(d) * 0.78], [-0.1, 0, 0]));
        a(this.head, k.cap, "dark", (d, m) => set(m, [0, hr(d) * 1.69, -0.004], [hr(d) * 1.3, 0.012, hr(d) * 1.36], [-0.1, 0, 0]));
        a(this.head, k.cap, "seat", (d, m) => set(m, [0, hr(d) * 1.7 + 0.024, -0.009], [hr(d) * 0.75, 0.03, hr(d) * 0.79], [-0.1, 0, 0]), false);
        break;
      case "toque":
        // 背の高いコック帽（ひだのある筒と、上のふくらみ）
        a(this.head, k.toque, "trim", (d, m) => set(m, [0, hr(d) * 1.42, -0.01], [hr(d) * 0.94, 0.27, hr(d) * 0.98], [-0.08, 0, 0]));
        a(this.head, k.band, "trim", (d, m) => set(m, [0, hr(d) * 1.45, -0.01], [hr(d) * 0.95, 0.05, hr(d) * 0.99], [-0.08, 0, 0]), false);
        break;
      case "cap":
        // うしろ向きのキャップ（つばが後ろ）
        a(this.head, k.hair, "dark", (d, m) => set(m, [0, hr(d) * 0.86, -hr(d) * 0.02], [hr(d) * 0.95, hr(d) * 1.06, hr(d) * 1.05], [-0.3, 0, 0]));
        a(this.head, k.box, "dark", (d, m) => set(m, [0, hr(d) * 1.12, -hr(d) * 1.12], [hr(d) * 1.05, 0.012, hr(d) * 0.75], [-0.35, 0, 0]));
        a(this.head, k.sphereLo, "seat", (d, m) => set(m, [0, hr(d) * 1.87, -hr(d) * 0.18], [0.014, 0.008, 0.014]), false);
        a(this.head, k.band, "seat", (d, m) => set(m, [0, hr(d) * 1.0, -hr(d) * 0.08], [hr(d) * 0.9, 0.02, hr(d) * 0.99], [-0.3, 0, 0]), false);
        break;
      case "swim":
        // スイムキャップ（その人の色）と、額に上げたゴーグル
        a(this.head, k.hair, "gloss", (d, m) => set(m, [0, hr(d) * 0.82, -hr(d) * 0.02], [hr(d) * 0.93, hr(d) * 1.08, hr(d) * 1.05], [-0.62, 0, 0]));
        a(this.head, k.band, "dark", (d, m) => set(m, [0, hr(d) * 1.24, -hr(d) * 0.05], [hr(d) * 0.93, 0.014, hr(d) * 1.05], [-0.42, 0, 0]), false);
        for (const i of SIDES)
          a(this.head, k.sphereLo, "dark", (d, m) => set(m, [sgn(i) * hr(d) * 0.33, hr(d) * 1.3, hr(d) * 0.8], [0.024, 0.017, 0.012], [-0.4, 0, 0]), false);
        break;
      case "headset":
        // ヘッドセット：頭の上のバンド・耳あて（その人の色に光る縁）・口もとのマイク
        a(this.head, k.arc, "dark", (d, m) => set(m, [0, hr(d) * 0.85, -0.01], [hr(d) * 0.98, hr(d) * 1.05, hr(d) * 0.45]), false);
        for (const i of SIDES) {
          const s = sgn(i);
          a(this.head, k.cap, "dark", (d, m) => set(m, [s * hr(d) * 0.9, hr(d) * 0.75, -0.01], [0.047, 0.034, 0.05], [0, 0, Math.PI / 2]), false);
          a(this.head, k.band, "lamp", (d, m) => set(m, [s * (hr(d) * 0.9 + 0.018), hr(d) * 0.75, -0.01], [0.034, 0.006, 0.036], [0, 0, Math.PI / 2]), false);
        }
        a(this.head, k.cap, "dark", (d, m) => set(m, [hr(d) * 0.66, hr(d) * 0.42, hr(d) * 0.55], [0.005, 0.12, 0.005], [1.15, 0, -0.55]), false);
        a(this.head, k.sphereLo, "dark", (d, m) => set(m, [hr(d) * 0.3, hr(d) * 0.3, hr(d) * 0.98], [0.014, 0.012, 0.012]), false);
        break;
      case "mic":
        // ヘッドセットのマイク（耳からほおを通って口もとへ）
        a(this.head, k.sphereLo, "dark", (d, m) => set(m, [-hr(d) * 0.88, hr(d) * 0.72, -0.01], [0.012, 0.022, 0.014]), false);
        a(this.head, k.cap, "dark", (d, m) => set(m, [-hr(d) * 0.66, hr(d) * 0.42, hr(d) * 0.5], [0.004, 0.13, 0.004], [1.05, 0, 0.55]), false);
        a(this.head, k.sphereLo, "seat", (d, m) => set(m, [-hr(d) * 0.3, hr(d) * 0.32, hr(d) * 0.98], [0.012, 0.01, 0.01]), false);
        break;
      case "hood":
        // 忍びの頭巾：額から後ろ頭と首の後ろまで覆い、口元の布で鼻から下を隠す（目のまわりだけ見える）
        a(this.head, k.hair, "cloth", (d, m) => set(m, [0, hr(d) * 0.84, -hr(d) * 0.03], [hr(d) * 0.95, hr(d) * 1.09, hr(d) * 1.07], [-0.33, 0, 0]));
        a(this.head, k.sphere, "cloth", (d, m) => set(m, [0, hr(d) * 0.36, -hr(d) * 0.42], [hr(d) * 0.84, hr(d) * 0.66, hr(d) * 0.62]));
        a(this.head, k.sphere, "cloth", (d, m) => set(m, [0, hr(d) * 0.47, hr(d) * 0.14], [hr(d) * 0.9, hr(d) * 0.42, hr(d) * 0.92]), false);
        // 結び目の垂れ（その人の色）
        a(this.head, k.boxSoft, "seat", (d, m) => set(m, [hr(d) * 0.2, hr(d) * 1.05, -hr(d) * 1.02], [0.03, 0.09, 0.012], [0.3, 0, -0.4]), false);
        break;
      case "bandana":
        // バンダナ（その人の色）。後ろで結び、端を垂らす
        a(this.head, k.hair, "seat", (d, m) => set(m, [0, hr(d) * 0.86, -hr(d) * 0.02], [hr(d) * 0.95, hr(d) * 1.08, hr(d) * 1.06], [-0.45, 0, 0]));
        a(this.head, k.boxSoft, "seat", (d, m) => set(m, [0, hr(d) * 0.72, -hr(d) * 1.02], [0.04, 0.08, 0.014], [0.25, 0, 0.2]), false);
        break;
      default:
        break;
    }
    // 首まわり
    if (o.neck === "bowtie") {
      for (const i of SIDES)
        a(this.chest, k.boxSoft, "seat", (d, m) => set(m, [sgn(i) * 0.03, d.chestH + 0.012, d.neckR * 0.95 + 0.012], [0.045, 0.034, 0.016], [0, 0, sgn(i) * 0.2]), false);
      a(this.chest, k.boxSoft, "deep", (d, m) => set(m, [0, d.chestH + 0.012, d.neckR * 0.95 + 0.02], [0.018, 0.022, 0.016]), false);
    } else if (o.neck === "chain") {
      // 太いチェーン（首にかけて胸の前に垂れる）と、丸い飾り
      a(this.chest, k.ring, "gold", (d, m) => set(m, [0, d.chestH * 0.9, d.chestD * 0.32], [d.neckR * 1.9, 0.06, d.chestD * 1.05], [0.75, 0, 0]), false);
      a(this.chest, k.cap, "gold", (d, m) => set(m, [0, d.chestH * 0.62, d.chestD * 1.08 + 0.02], [0.03, 0.01, 0.03], [Math.PI / 2 - 0.2, 0, 0]), false);
    } else if (o.neck === "scarf") {
      // コックのスカーフ（その人の色）
      a(this.neck, k.band, "seat", (d, m) => set(m, [0, 0.03, -0.003], [d.neckR * 1.12 + 0.004, 0.035, d.neckR * 1.1 + 0.004]), false);
      a(this.chest, k.boxSoft, "seat", (d, m) => set(m, [0, d.chestH - 0.012, d.neckR * 1.15 + 0.012], [0.04, 0.05, 0.018], [-0.3, 0, Math.PI / 4]), false);
    } else if (o.neck === "towel") {
      // 首にかけたタオル（白）：首の後ろから肩へかけ、両端を胸の前に垂らす
      a(this.chest, k.ring, "trim", (d, m) => set(m, [0, d.chestH * 0.97, -d.chestD * 0.05], [d.neckR * 1.75 + 0.01, 0.12, d.chestD * 0.95], [0.25, 0, 0]));
      for (const i of SIDES)
        a(this.chest, k.boxSoft, "trim", (d, m) => set(m, [sgn(i) * (d.neckR + 0.02), d.chestH * 0.72, d.chestD * 1.12 + 0.012], [0.06, 0.2, 0.02], [-0.12, 0, sgn(i) * 0.08]), false);
    } else if (o.neck === "tie") {
      // ネクタイの結び目（ネクタイは上着のテクスチャに描く）
      a(this.chest, k.boxSoft, "seat", (d, m) => set(m, [0, d.chestH + 0.004, d.neckR * 0.98 + 0.008], [0.028, 0.026, 0.018], [-0.2, 0, 0]), false);
    }
    // マント（外は黒、内側はその人の色）
    if (o.cape) {
      a(this.chest, k.cape, "cloth", (d, m) => set(m, [0, d.chestH * 1.0, -0.01], [d.shoulderHalf * 1.25, 0.8, d.chestD * 1.55], [-0.06, 0, 0]));
      a(this.chest, k.cape, "lining", (d, m) => set(m, [0, d.chestH * 1.0, -0.01], [d.shoulderHalf * 1.25 - 0.006, 0.8, d.chestD * 1.55 - 0.006], [-0.06, 0, 0]), false);
    }
    // エプロン（その人の色）
    if (o.apron) {
      // 太いズボン・太い脚でも隠れないよう、太ももの前より外に垂らす
      a(this.pelvis, k.box, "seat", (d, m) => set(m, [0, -0.17, Math.max(d.hipD * 1.22, d.thighR * o.baggy * 1.08 + 0.01) + 0.016], [d.hipW * 1.65, 0.42, 0.012], [-0.07, 0, 0]));
      a(this.pelvis, k.band, "seat", (d, m) => set(m, [0, d.pelvisUp * 0.75, 0], [d.waistW * o.loose * 1.2 + 0.02, 0.03, d.waistD * o.loose * 1.26 + 0.022]), false);
    }
    // 持ち物（右手）
    this.buildProp(o, a);
    // 技に合わせて見せる部品：看護師の包帯、料理人の味見のスプーン（左右どちらの手でも見せられるように両方に作る）
    if (o.top === "scrub")
      for (const i of SIDES)
        a(this.forearm[i], k.band, "trim", (d, m) => set(m, [0, -d.forearm * 0.55, 0], [d.forearmR * 1.18, d.forearm * 0.32, d.forearmR * 1.08]), false, "bandage", i);
    if (o.prop === "pan")
      for (const i of SIDES) {
        a(this.hand[i], k.sphereLo, "metal", (d, m) => set(m, [sgn(i) * 0.02, -d.fistR, d.fistR + 0.13], [0.028, 0.01, 0.036]), false, "spoon", i);
        a(this.hand[i], k.cap, "metal", (d, m) => set(m, [sgn(i) * 0.01, -d.fistR, d.fistR + 0.05], [0.005, 0.12, 0.005], [Math.PI / 2, 0, 0]), false, "spoon", i);
      }
    return W;
  }

  /** 右手の持ち物。握るところを原点に、+Y を親指の側へ伸ばして作る（ステッキは -Y を前腕の先へ） */
  private buildProp(o: Outfit, a: (bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: MatKey, fit: Piece["fit"], shadow?: boolean, cue?: CueName, side?: 0 | 1) => void) {
    const k = this.kit;
    const g = this.propRoot;
    const fix = (p: V3, s: V3, r?: V3): Piece["fit"] => (_, m) => set(m, p, s, r);
    /** ストローの刺さった大きなカップ（中身はミルクティー、底にタピオカ、丸いふた） */
    const cup = (root: THREE.Object3D, cue: CueName, side?: 0 | 1) => {
      a(root, k.cap, "tea", fix([0, 0.03, 0.012], [0.05, 0.19, 0.05]), true, cue, side);
      a(root, k.pearls, "dark", fix([0, -0.045, 0.012], [0.042, 0.042, 0.042]), false, cue, side);
      a(root, k.sphere, "trim", fix([0, 0.125, 0.012], [0.052, 0.024, 0.052]), false, cue, side);
      a(root, k.cap, "seat", fix([0.012, 0.2, 0.012], [0.0075, 0.13, 0.0075], [0, 0, -0.18]), false, cue, side);
    };
    switch (o.prop) {
      case "cane":
        // ステッキは前腕の向きに続けて持つ（握りの玉は手のひらの中）
        a(g, k.cap, "dark", fix([0, -0.43, 0], [0.011, 0.94, 0.011]));
        a(g, k.sphereLo, "trim", fix([0, 0.03, 0], [0.021, 0.021, 0.021]), false);
        a(g, k.cap, "trim", fix([0, -0.88, 0], [0.012, 0.05, 0.012]), false);
        break;
      case "pan":
        a(g, k.box, "dark", fix([0, 0.06, 0], [0.026, 0.2, 0.018]));
        a(g, k.cap, "dark", fix([0, 0.27, 0], [0.13, 0.034, 0.13], [Math.PI / 2, 0, 0]));
        a(g, k.cap, "metal", fix([0, 0.27, 0.018], [0.116, 0.002, 0.116], [Math.PI / 2, 0, 0]), false);
        break;
      case "penlight":
        a(g, k.cap, "dark", fix([0, 0.0, 0], [0.013, 0.1, 0.013]), false);
        a(g, k.cap, "lamp", fix([0, 0.14, 0], [0.017, 0.18, 0.017]), false);
        break;
      case "bag":
        // ビジネスバッグ：手の下に垂らす（前腕の向き）。黒い革に、金具と持ち手
        a(g, k.arc, "dark", fix([0, -0.035, 0], [0.05, 0.045, 0.12], [Math.PI, Math.PI / 2, 0]), false);
        a(g, k.box, "dark", fix([0, -0.2, 0], [0.075, 0.27, 0.38]));
        a(g, k.box, "metal", fix([0, -0.1, 0], [0.082, 0.026, 0.06]), false);
        break;
      case "cup":
        // ふだんはカップ。振る技では太いストロー（カップは反対の手へ）、見せる技ではシェイカーに持ちかえる
        cup(g, "form0");
        a(g, k.cap, "seat", fix([0, 0.24, 0], [0.017, 0.5, 0.017]), true, "form1");
        a(g, k.cap, "metal", fix([0, 0.06, 0.01], [0.042, 0.2, 0.042]), true, "form2");
        a(g, k.cap, "metal", fix([0, 0.19, 0.01], [0.032, 0.07, 0.032]), false, "form2");
        for (const i of SIDES) {
          cup(this.heldRoot[i], "held", i);
          // 盾にする丸いトレイ（前腕の外側に当てて持つ）
          a(this.forearm[i], k.cap, "deep", fix([0, -0.17, -0.07], [0.19, 0.012, 0.19], [Math.PI / 2, 0, 0]), true, "tray", i);
          a(this.forearm[i], k.band, "trim", fix([0, -0.17, -0.08], [0.192, 0.024, 0.192], [Math.PI / 2, 0, 0]), false, "tray", i);
        }
        break;
      default:
        break;
    }
  }

  /** ロボット：体の部品の代わりに、金属の板を骨に付ける。攻撃で腕が太く、防御で装甲が厚くなる */
  private buildRobot(a: (bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: MatKey, fit: Piece["fit"], shadow?: boolean) => void) {
    const k = this.kit;
    const armor = (d: BodyDims) => 1 + 0.16 * d.guard;
    const arm = (d: BodyDims) => 1 + 0.22 * d.power;
    a(this.pelvis, k.box, "metal", (d, m) => set(m, [0, 0.03, -0.01], [d.hipW * 2.05 * armor(d), 0.16, d.hipD * 2.1 * armor(d)]));
    a(this.pelvis, k.box, "plate", (d, m) => set(m, [0, 0.0, d.hipD * 1.05 * armor(d) + 0.004], [d.hipW * 0.9, 0.11, 0.02]), false);
    a(this.spine, k.cap, "dark", (d, m) => set(m, [0, d.abdomen * 0.45, 0], [d.waistW * 0.72, d.abdomen + 0.04, d.waistD * 0.72]));
    a(this.spine, k.box, "plate", (d, m) => set(m, [0, d.abdomen * 0.42, 0.01], [d.waistW * 1.75 * armor(d), d.abdomen * 0.5, d.waistD * 1.85 * armor(d)]));
    a(this.ribs, k.box, "metal", (d, m) => set(m, [0, d.chestH * 0.52, -0.005], [d.chestW * 2.05 * armor(d), d.chestH * 0.95, d.chestD * 2.0 * armor(d)]));
    a(this.ribs, k.box, "plate", (d, m) => set(m, [0, d.chestH * 0.6, d.chestD * armor(d) + 0.006], [d.chestW * 1.45, d.chestH * 0.55, 0.03]));
    // 胸の光（息の代わりに点滅する）
    a(this.ribs, k.cap, "pulse", (d, m) => set(m, [0, d.chestH * 0.62, d.chestD * armor(d) + 0.024], [0.034, 0.008, 0.034], [Math.PI / 2, 0, 0]), false);
    a(this.neck, k.cap, "dark", (d, m) => set(m, [0, d.neck * 0.45, 0], [d.neckR * 0.7, d.neck + 0.05, d.neckR * 0.7]));
    // 頭：箱の頭、光るバイザー、アンテナ、耳の円盤
    a(this.head, k.box, "metal", (d, m) => set(m, [0, d.headR * 0.85, 0], [d.headR * 1.72, d.headR * 1.62, d.headR * 1.8]));
    a(this.head, k.boxSoft, "lamp", (d, m) => set(m, [0, d.headR * 0.95, d.headR * 0.9], [d.headR * 1.38, d.headR * 0.3, 0.022]), false);
    a(this.head, k.cap, "dark", (d, m) => set(m, [d.headR * 0.45, d.headR * 1.66 + 0.06, -0.01], [0.006, 0.12, 0.006]), false);
    a(this.head, k.sphereLo, "pulse", (d, m) => set(m, [d.headR * 0.45, d.headR * 1.66 + 0.125, -0.01], [0.017, 0.017, 0.017]), false);
    for (const i of SIDES) {
      const s = sgn(i);
      a(this.head, k.cap, "plate", (d, m) => set(m, [s * d.headR * 0.88, d.headR * 0.85, 0], [0.042, 0.03, 0.042], [0, 0, Math.PI / 2]), false);
      // 肩・腕
      a(this.shoulder[i], k.sphere, "dark", (d, m) => set(m, [0, 0, 0], [d.deltR * 0.95, d.deltR * 0.95, d.deltR * 0.95]));
      a(this.upperArm[i], k.box, "plate", (d, m) => set(m, [0, -0.012, 0], [d.deltR * 2.3 * arm(d), d.deltR * 1.25, d.deltR * 2.2 * arm(d)]));
      a(this.upperArm[i], k.box, "metal", (d, m) => set(m, [0, -d.upperArm * 0.52, 0], [d.upperArmR * 1.75 * arm(d), d.upperArm * 0.8, d.upperArmR * 1.75 * arm(d)]));
      a(this.upperArm[i], k.sphere, "dark", (d, m) => set(m, [0, -d.upperArm, 0], [d.forearmR * 1.15, d.forearmR * 1.15, d.forearmR * 1.15]));
      a(this.forearm[i], k.box, "metal", (d, m) => set(m, [0, -d.forearm * 0.52, 0], [d.forearmR * 2.15 * arm(d), d.forearm * 0.85, d.forearmR * 2.15 * arm(d)]));
      // こぶし（ロケットパンチで飛んでいく）
      a(this.hand[i], k.box, "plate", (d, m) => set(m, [0, -d.fistR * 1.05, d.fistR * 0.1], [d.fistR * 2.25 * arm(d), d.fistR * 2.2, d.fistR * 2.0 * arm(d)]));
      // 脚
      a(this.thigh[i], k.box, "metal", (d, m) => set(m, [0, -d.thigh * 0.5, 0], [d.thighR * 1.75 * armor(d), d.thigh * 0.82, d.thighR * 1.75 * armor(d)]));
      a(this.thigh[i], k.sphere, "dark", (d, m) => set(m, [0, -d.thigh, 0], [d.kneeR * 1.15, d.kneeR * 1.15, d.kneeR * 1.15]));
      a(this.shin[i], k.box, "metal", (d, m) => set(m, [0, -d.shin * 0.5, 0], [d.calfR * 1.95 * armor(d), d.shin * 0.82, d.calfR * 2.05 * armor(d)]));
      a(this.shin[i], k.box, "plate", (d, m) => set(m, [0, -d.shin * 0.14, d.calfR * armor(d) + 0.012], [d.calfR * 1.4, d.shin * 0.22, 0.03]), false);
      a(this.foot[i], k.box, "dark", (d, m) => set(m, [0, -d.ankleH * 0.42 + 0.008, (d.footLen - 0.06) / 2], [0.105, d.ankleH + 0.03, d.footLen + 0.07], [0.05, 0, 0]));
    }
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
    // ステージ衣装のきらめき（胸と袖に小さく光る）
    if (outfit.top === "jacket" && !this.glints.length) {
      const spots: [THREE.Object3D, V3][] = [
        [this.ribs, [0.09, 0.22, 0.12]],
        [this.ribs, [-0.11, 0.12, 0.11]],
        [this.upperArm[L], [0.03, -0.12, 0.05]],
        [this.upperArm[R], [-0.03, -0.2, 0.05]],
      ];
      this.glints = spots.map(([bone, at]) => {
        const g = new THREE.Sprite(this.mats.glint);
        g.position.set(at[0], at[1], at[2]);
        g.renderOrder = 8;
        bone.add(g);
        return g;
      });
    }
    for (const g of this.glints) g.visible = outfit.top === "jacket" && !silhouette;
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
      p.mesh.visible = p.cue ? this.cueShown(p) : true;
      p.fit(d, p.mesh);
    }
    this.propRoot.position.set(0, -d.fistR * 1.02, d.fistR * 0.14);
    for (const h of this.heldRoot) h.position.copy(this.propRoot.position);
    // ステッキ・カバンは前腕の向きに続け（下へ垂らす）、ほかは親指の側へ伸ばす
    this.propRoot.rotation.set(0, 0, hangsDown(this.outfit.prop) ? 0 : Math.PI / 2);
  }

  private cueShown(p: Piece) {
    const c = this.cues;
    switch (p.cue) {
      case "bandage":
        return c.bandage === p.side;
      case "spoon":
        return c.spoon === p.side;
      case "held":
        return c.held === p.side;
      case "tray":
        return c.tray === p.side;
      case "form0":
        return c.form === 0;
      case "form1":
        return c.form === 1;
      default:
        return c.form === 2;
    }
  }

  /** 左右を入れかえて描くか。持ち物を持つ手（右手の動きを描く骨）を入れかえ、形も鏡に映す */
  setMirror(m: boolean) {
    if (m === this.mirrored) return;
    this.mirrored = m;
    this.hand[m ? L : R].add(this.propHold);
    this.propHold.scale.x = m ? -1 : 1;
  }

  /** 技に合わせて変える見た目（消える・手を飛ばす・ウインク・包帯・スプーン・光の明るさ） */
  setCues(c: RigCues) {
    const prev = this.cues;
    this.cues = c;
    this.pelvis.visible = !c.hidden;
    if (prev.detached !== c.detached) for (const i of SIDES) this.hand[i].visible = c.detached !== i;
    if (prev.bandage !== c.bandage || prev.spoon !== c.spoon || prev.form !== c.form || prev.held !== c.held || prev.tray !== c.tray) for (const p of this.worn) if (p.cue) p.mesh.visible = this.cueShown(p);
  }

  /**
   * コマごとの小さな動き：胸の光の点滅（breath は息の波 -1〜1）、光るものの明るさ、ステージ衣装のきらめき
   */
  tick(time: number, breath: number) {
    const lamp = this.cues.lamp;
    this.mats.lamp.color.copy(this.mats.lampColor).multiplyScalar(lamp);
    this.mats.pulse.color.copy(this.mats.pulseColor).multiplyScalar(lamp * (0.35 + 0.65 * (0.5 + 0.5 * breath)));
    for (let i = 0; i < this.glints.length; i++) {
      const g = this.glints[i]!;
      const k = Math.max(0, Math.sin(time * (2.1 + i * 0.37) + i * 2.3)) ** 6;
      g.scale.setScalar(0.012 + 0.05 * k);
      g.material.rotation = time * 0.6 + i;
    }
  }

  /** 持ち物の先（振る技の軌跡）のワールドでの位置。持ち物がなければ右手（いま持っている手）の位置 */
  propTip(out: THREE.Vector3) {
    const len = PROP_LENGTH[this.outfit.prop];
    if (!len) return this.strikePoint("hand", this.mirrored ? L : R, out);
    out.set(0, hangsDown(this.outfit.prop) ? -len : len, 0);
    return this.propRoot.localToWorld(out);
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
    // 息で胸をふくらませる（横と前に広がり、少し上がる）。ロボットはふくらまない
    const b = this.outfit.robot ? 0 : p[P.breath]!;
    this.ribs.scale.set(1 + 0.014 * b, 1 + 0.006 * b, 1 + 0.03 * b);
    // ウインク（見ている人の側の目を細める）
    for (const i of SIDES) {
      const eye = this.eyes[i];
      if (eye) eye.scale.y = 0.0062 * (1 - 0.88 * (i === (this.mirrored ? R : L) ? this.cues.wink : 0));
    }

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
