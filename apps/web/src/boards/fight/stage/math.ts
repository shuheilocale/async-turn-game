/**
 * 3D の舞台で使う、three に頼らない小さな計算（ベクトル・回転・イージング・2 本の骨の IK）。
 * テストで確かめられるよう、ここには three を読み込まない
 */

export type V3 = [number, number, number];
/** 3×3 の回転行列（行ごとに並べる） */
export type M3 = [number, number, number, number, number, number, number, number, number];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** a から b までのどこにあるか（0〜1 に収める） */
export const unlerp = (a: number, b: number, v: number) => (a === b ? 0 : clamp((v - a) / (b - a), 0, 1));

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => len(sub(a, b));
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export function norm(a: V3): V3 {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/**
 * オイラー角（x = 前後の傾き、y = ひねり、z = 左右の傾き）から回転行列を作る。
 * three の Euler の順番 "YXZ"（Ry・Rx・Rz の順にかける）と同じ
 */
export function eulerYXZ(e: V3): M3 {
  const [cx, sx] = [Math.cos(e[0]), Math.sin(e[0])];
  const [cy, sy] = [Math.cos(e[1]), Math.sin(e[1])];
  const [cz, sz] = [Math.cos(e[2]), Math.sin(e[2])];
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}

export function mul3(a: M3, b: M3): M3 {
  const r = new Array(9).fill(0) as M3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r;
}

export const apply3 = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** 回転行列の逆（転置）をかける */
export const applyT3 = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];

/**
 * 2 本の骨（上腕と前腕、太ももとすね）の IK。根もと root から長さ a・b の骨で target に届く、
 * 曲がる関節（ひじ・ひざ）の位置を返す。関節は pole の向きへ張り出す。届かないときはまっすぐ伸ばす
 */
export function solveTwoBone(root: V3, target: V3, a: number, b: number, pole: V3): { mid: V3; end: V3 } {
  const d = sub(target, root);
  const raw = len(d);
  const dir: V3 = raw > 1e-6 ? scale(d, 1 / raw) : [0, -1, 0];
  const l = clamp(raw, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const along = (a * a + l * l - b * b) / (2 * l);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  let side = sub(pole, scale(dir, dot(pole, dir)));
  if (len(side) < 1e-6) side = Math.abs(dir[1]) < 0.9 ? cross(dir, [0, 1, 0]) : cross(dir, [1, 0, 0]);
  side = norm(side);
  const mid = add(add(root, scale(dir, along)), scale(side, h));
  return { mid, end: add(root, scale(dir, l)) };
}

// ---- イージング（0〜1 → 0〜1） ----
export type EaseName = "linear" | "in" | "out" | "inOut" | "outBack" | "snap" | "outQuint";
export const easings: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c = 1.5;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
  // 技が当たる瞬間のように、一気に伸びてぴたりと止まる
  snap: (t) => 1 - (1 - t) ** 5,
  outQuint: (t) => 1 - (1 - t) ** 5,
};
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** 時間 dt のあいだに、目標へ半分近づくのに halfLife 秒かかる速さで寄せる（コマの速さによらない） */
export const damp = (current: number, target: number, halfLife: number, dt: number) =>
  halfLife <= 0 ? target : target + (current - target) * Math.pow(2, -dt / halfLife);

/** 数から決まる、なめらかな揺れ（-1〜1）。待ちの動きに小さなゆらぎを足すのに使う */
export function wobble(t: number, seed = 0) {
  return (
    Math.sin(t * 1.13 + seed * 1.7) * 0.5 +
    Math.sin(t * 2.31 + seed * 3.1) * 0.3 +
    Math.sin(t * 4.07 + seed * 0.7) * 0.2
  );
}
