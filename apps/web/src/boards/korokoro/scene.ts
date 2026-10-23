import { Korokoro } from "@atg/core";

/*
 * ころころの盤を、ななめ上から見た立体として SVG に描くための計算。
 * 世界の座標は、x が東（右）、y が南（手前）、z が上。1 マスの幅を 1 とし、
 * (r, c) のマスは x が c〜c+1、y が r〜r+1 の範囲。カメラは盤の手前・上にいて、盤のまん中を見下ろす
 */

export type P3 = readonly [number, number, number];
export type P2 = readonly [number, number];
type Faces = Korokoro.Faces;
type Face = keyof Faces;

const N = Korokoro.SIZE;
/** キューブの一辺。マスより少し小さくして、まわりに塗った色が見えるようにする */
export const EDGE = 0.72;
/** 盤を見下ろす角度（90° なら真上から） */
const ELEVATION = (50 * Math.PI) / 180;
/** カメラから盤のまん中までの距離。遠いほど遠近の差が小さい */
const DISTANCE = 12;
/** 盤のまん中で 1 マスを viewBox の何単位にするか */
const SCALE = 100;

const COS = Math.cos(ELEVATION);
const SIN = Math.sin(ELEVATION);
const CAMERA: P3 = [N / 2, N / 2 + DISTANCE * COS, DISTANCE * SIN];

/** 透視の割り算までした座標（あとで viewBox の左上が 0 になるようにずらす） */
function raw([x, y, z]: P3): P2 {
  const qx = x - CAMERA[0];
  const qy = y - CAMERA[1];
  const qz = z - CAMERA[2];
  // カメラの上向き (0, -sin, cos) と、見ている向き (0, -cos, -sin) の成分
  const up = -qy * SIN + qz * COS;
  const depth = -qy * COS - qz * SIN;
  const k = (DISTANCE / depth) * SCALE;
  return [qx * k, -up * k];
}

/** 盤の外側の余白（マスの幅を 1 として） */
export const MARGIN = 0.16;
/** 盤の板の厚み */
const THICKNESS = 0.2;
/**
 * 奥の列のキューブの上の面まで入るように。転がる途中で一番高くなるところ（ななめ 45° のときの対角線）は、
 * 盤の外にはみ出して描く（SVG の overflow: visible）
 */
const HEADROOM = EDGE + 0.04;

const bounds = (() => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [-MARGIN, N + MARGIN])
    for (const y of [-MARGIN, N + MARGIN])
      for (const z of [-THICKNESS, HEADROOM]) {
        const [sx, sy] = raw([x, y, z]);
        xs.push(sx);
        ys.push(sy);
      }
  const pad = 6;
  return { left: Math.min(...xs) - pad, top: Math.min(...ys) - pad, right: Math.max(...xs) + pad, bottom: Math.max(...ys) + pad };
})();

export const VIEW_W = Math.round(bounds.right - bounds.left);
export const VIEW_H = Math.round(bounds.bottom - bounds.top);

/** 世界の点を viewBox の座標にする */
export function project(p: P3): P2 {
  const [x, y] = raw(p);
  return [x - bounds.left, y - bounds.top];
}

export const toPoints = (ps: readonly P2[]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** 床（z = 0 の面）の上の点の並びを、viewBox の点の並びにする */
export const onGround = (ps: readonly (readonly [number, number])[], z = 0) =>
  toPoints(ps.map(([x, y]) => project([x, y, z])));

/** 角を丸めた四角の輪郭（床の上の点）。角ごとに数点ずつ */
export function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -90],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 90],
    [x0 + r, y0 + r, 180],
  ];
  for (const [cx, cy, start] of corners) {
    for (let k = 0; k <= 4; k++) {
      const a = ((start + k * 22.5) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

/** 床の上の円（点や影）。n 角形で近づける */
export function circle(cx: number, cy: number, r: number, n = 20): [number, number][] {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * 2 * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}

/** 2 次元の点の凸包（盤の板の外形を、上の面と下の面の輪郭から作るのに使う） */
function hull(points: P2[]): P2[] {
  const ps = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: P2[]) => {
    const out: P2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(ps), ...build([...ps].reverse())];
}

/** 盤の板：上の面と、手前に見える厚みの部分 */
export const BOARD = (() => {
  const outline = roundedRect(-MARGIN, -MARGIN, N + MARGIN, N + MARGIN, 0.3);
  const top = outline.map(([x, y]) => project([x, y, 0]));
  const bottom = outline.map(([x, y]) => project([x, y, -THICKNESS]));
  return { top: toPoints(top), body: toPoints(hull([...top, ...bottom])) };
})();

/** マスのタイル（少し内側に縮めて角を丸めた四角） */
export const TILES = Array.from({ length: N * N }, (_, i) => {
  const r = Korokoro.rowOf(i);
  const c = Korokoro.colOf(i);
  return onGround(roundedRect(c + 0.05, r + 0.05, c + 0.95, r + 0.95, 0.14));
});

export const centerOf = (cell: number): [number, number] => [Korokoro.colOf(cell) + 0.5, Korokoro.rowOf(cell) + 0.5];

// ---------- キューブ ----------

const H = EDGE / 2;
/** キューブの角（底のまん中から見た位置）。添字は x・y・z の正負の組み合わせ */
const CORNERS: P3[] = [];
for (const z of [0, EDGE]) for (const y of [-H, H]) for (const x of [-H, H]) CORNERS.push([x, y, z]);
const corner = (x: number, y: number, z: number) => (z ? 4 : 0) + (y > 0 ? 2 : 0) + (x > 0 ? 1 : 0);

/** 面ごとの角（外から見て時計回り）と外向きの向き */
const FACES: { face: Face; corners: number[]; normal: P3 }[] = [
  { face: "top", corners: [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)], normal: [0, 0, 1] },
  { face: "bottom", corners: [corner(-1, -1, 0), corner(-1, 1, 0), corner(1, 1, 0), corner(1, -1, 0)], normal: [0, 0, -1] },
  { face: "north", corners: [corner(-1, -1, 0), corner(1, -1, 0), corner(1, -1, 1), corner(-1, -1, 1)], normal: [0, -1, 0] },
  { face: "south", corners: [corner(-1, 1, 0), corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, 0)], normal: [0, 1, 0] },
  { face: "east", corners: [corner(1, -1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, -1, 1)], normal: [1, 0, 0] },
  { face: "west", corners: [corner(-1, -1, 0), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, 0)], normal: [-1, 0, 0] },
];

const UNIT: Record<Korokoro.Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** 光の来る向き（左上の少し手前から）。面の明るさに使う */
const LIGHT: P3 = (() => {
  const v: P3 = [-0.4, 0.35, 1];
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

/** キューブの置き方。roll は転がっている途中（向きと 0〜1 の進み具合） */
export interface CubePose {
  cell: number;
  faces: Faces;
  roll?: { dir: Korokoro.Dir; t: number };
}

export interface DrawnFace {
  face: Face;
  color: 0 | 1;
  points: string;
  /** 明るさ（0〜1）。色に黒を混ぜる割合に使う */
  light: number;
}

/**
 * キューブの見える面（多くて 3 面）。転がっている途中は、進む向きの下の辺を軸に回しながら、
 * マスとキューブの大きさの差の分だけすべらせて、ちょうど 1 マス進んだところで向きが 1 回転がった形になる
 */
export function cubeFaces(pose: CubePose): { faces: DrawnFace[]; center: P3 } {
  const [cx, cy] = centerOf(pose.cell);
  const [ux, uy] = pose.roll ? UNIT[pose.roll.dir] : [0, 0];
  const angle = pose.roll ? (pose.roll.t * Math.PI) / 2 : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const slide = pose.roll ? (1 - EDGE) * pose.roll.t : 0;

  /** 進む向きの成分 s と高さ z を、軸のまわりに回す（向きがないときはそのまま） */
  const turn = (s: number, z: number): [number, number] => [s * cos + z * sin, -s * sin + z * cos];

  const place = ([x, y, z]: P3): P3 => {
    // 軸は、進む向きの下の辺（底のまん中から H だけ先）
    const s = x * ux + y * uy - H;
    const side: [number, number] = [x - (x * ux + y * uy) * ux, y - (x * ux + y * uy) * uy];
    const [s2, z2] = pose.roll ? turn(s, z) : [s, z];
    const along = s2 + H + slide;
    return [cx + side[0] + along * ux, cy + side[1] + along * uy, z2];
  };
  const rotate = ([x, y, z]: P3): P3 => {
    if (!pose.roll) return [x, y, z];
    const s = x * ux + y * uy;
    const side: [number, number] = [x - s * ux, y - s * uy];
    const [s2, z2] = turn(s, z);
    return [side[0] + s2 * ux, side[1] + s2 * uy, z2];
  };

  const world = CORNERS.map(place);
  const center: P3 = [
    world.reduce((a, p) => a + p[0], 0) / 8,
    world.reduce((a, p) => a + p[1], 0) / 8,
    world.reduce((a, p) => a + p[2], 0) / 8,
  ];
  const faces: DrawnFace[] = [];
  for (const f of FACES) {
    const n = rotate(f.normal);
    const pts = f.corners.map((k) => world[k]!);
    const mid = pts.reduce<[number, number, number]>((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
    // カメラの方を向いている面だけ描く（へこみのない形なので、見える面どうしは重ならない）
    const toCamera = [CAMERA[0] - mid[0], CAMERA[1] - mid[1], CAMERA[2] - mid[2]];
    if (n[0] * toCamera[0]! + n[1] * toCamera[1]! + n[2] * toCamera[2]! <= 1e-6) continue;
    const light = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    faces.push({ face: f.face, color: pose.faces[f.face], points: toPoints(pts.map(project)), light });
  }
  return { faces, center };
}

/** カメラからの遠さ（2 つのキューブを奥から順に描くのに使う） */
export const depthOf = ([x, y, z]: P3) => Math.hypot(x - CAMERA[0], y - CAMERA[1], z - CAMERA[2]);
