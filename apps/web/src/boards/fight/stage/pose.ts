import type { BodyDims } from "./body.ts";
import { add, apply3, applyT3, eulerYXZ, mul3, sub, type M3, type V3 } from "./math.ts";

/**
 * 姿勢。数を 1 列に並べたもの（重ねる・補間するのを速く、コマごとにものを作らずにできるように）。
 *
 * 向きはその人の足もと（root）から見て、+Z が相手のほう（前）、+X がその人の左、+Y が上。
 * 角度は three の Euler "YXZ"（x = 前へ倒す、y = 左へひねる、z = 右へ傾ける）。
 * 左右のあるもの（手・足など）は [左, 右] の順。
 *
 * - hip：腰（左右の股関節の真ん中）の位置。hipRot：腰の向き
 * - spine / chest：おなか・胸の曲げ。neck：頭の向き（首と頭で半分ずつ曲げる）
 * - shrug：肩をすくめる高さ（息を吸うと上がる）
 * - hand：手首の目標の位置（胸から見た位置。胸が動くと手もついてくる）。elbow：ひじが張り出す向き（胸から見て）
 * - fist：こぶしの曲げ（前腕から見た角度）
 * - foot：足首の目標の位置（足もとから見て）。footRot：足の向き。knee：ひざが張り出す向き
 * - breath：胸のふくらみ（-1〜1）
 */
export interface PoseDesc {
  hip: V3;
  hipRot: V3;
  spine: V3;
  chest: V3;
  neck: V3;
  shrug: [number, number];
  hand: [V3, V3];
  elbow: [V3, V3];
  fist: [V3, V3];
  foot: [V3, V3];
  footRot: [V3, V3];
  knee: [V3, V3];
  breath: number;
}

export type Pose = Float64Array;

/** 1 列に並べたときの、それぞれの場所 */
export const P = {
  hip: 0,
  hipRot: 3,
  spine: 6,
  chest: 9,
  neck: 12,
  shrug: 15,
  hand: 17,
  elbow: 23,
  fist: 29,
  foot: 35,
  footRot: 41,
  knee: 47,
  breath: 53,
} as const;
export const POSE_SIZE = 54;

/** 左右の向きを入れかえるとき、符号を変える数（位置の x、角度の y と z） */
const FLIP = new Float64Array(POSE_SIZE).fill(1);
/** 左右の向きを入れかえるとき、左と右を入れかえる組 */
const SWAPS: [number, number, number][] = [];
{
  const pos = (i: number) => (FLIP[i] = -1);
  const rot = (i: number) => {
    FLIP[i + 1] = -1;
    FLIP[i + 2] = -1;
  };
  pos(P.hip);
  rot(P.hipRot);
  rot(P.spine);
  rot(P.chest);
  rot(P.neck);
  for (const side of [0, 3]) {
    pos(P.hand + side);
    pos(P.elbow + side);
    rot(P.fist + side);
    pos(P.foot + side);
    rot(P.footRot + side);
    pos(P.knee + side);
  }
  SWAPS.push([P.shrug, P.shrug + 1, 1]);
  for (const at of [P.hand, P.elbow, P.fist, P.foot, P.footRot, P.knee]) SWAPS.push([at, at + 3, 3]);
}

export const newPose = (): Pose => new Float64Array(POSE_SIZE);

export function pack(d: PoseDesc, out: Pose = newPose()): Pose {
  const put = (at: number, v: readonly number[]) => v.forEach((x, i) => (out[at + i] = x));
  put(P.hip, d.hip);
  put(P.hipRot, d.hipRot);
  put(P.spine, d.spine);
  put(P.chest, d.chest);
  put(P.neck, d.neck);
  put(P.shrug, d.shrug);
  put(P.hand, [...d.hand[0], ...d.hand[1]]);
  put(P.elbow, [...d.elbow[0], ...d.elbow[1]]);
  put(P.fist, [...d.fist[0], ...d.fist[1]]);
  put(P.foot, [...d.foot[0], ...d.foot[1]]);
  put(P.footRot, [...d.footRot[0], ...d.footRot[1]]);
  put(P.knee, [...d.knee[0], ...d.knee[1]]);
  out[P.breath] = d.breath;
  return out;
}

export function unpack(p: Pose): PoseDesc {
  const v = (at: number): V3 => [p[at]!, p[at + 1]!, p[at + 2]!];
  const pair = (at: number): [V3, V3] => [v(at), v(at + 3)];
  return {
    hip: v(P.hip),
    hipRot: v(P.hipRot),
    spine: v(P.spine),
    chest: v(P.chest),
    neck: v(P.neck),
    shrug: [p[P.shrug]!, p[P.shrug + 1]!],
    hand: pair(P.hand),
    elbow: pair(P.elbow),
    fist: pair(P.fist),
    foot: pair(P.foot),
    footRot: pair(P.footRot),
    knee: pair(P.knee),
    breath: p[P.breath]!,
  };
}

/** 姿勢を書きかえた写しを作る（技の動きを組み立てるときに使う。コマごとには使わない） */
export function edit(p: Pose, fn: (d: PoseDesc) => void): Pose {
  const d = unpack(p);
  fn(d);
  return pack(d);
}

/** a と b のあいだ（t = 0 で a、1 で b）を out に入れる */
export function lerpPose(a: Pose, b: Pose, t: number, out: Pose = newPose()): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}

/** a に b を w 倍して足す（待ちの動きや息づかいを重ねる） */
export function addPose(a: Pose, b: Pose, w: number, out: Pose = a): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i]! + b[i]! * w;
  return out;
}

/** 左右を入れかえた姿勢（左構え ⇔ 右構え）。2 回かけると元に戻る */
export function mirrorPose(p: Pose, out: Pose = newPose()): Pose {
  const src = out === p ? Float64Array.from(p) : p;
  for (let i = 0; i < POSE_SIZE; i++) out[i] = src[i]! * FLIP[i]!;
  for (const [l, r, n] of SWAPS)
    for (let k = 0; k < n; k++) {
      out[l + k] = src[r + k]! * FLIP[l + k]!;
      out[r + k] = src[l + k]! * FLIP[r + k]!;
    }
  return out;
}

// ---- 骨をたどって、体のそれぞれの場所を足もとから見た位置にする（three の骨の組み方と同じ） ----

export interface Frame {
  o: V3;
  r: M3;
}

const rot3 = (p: Pose, at: number) => eulerYXZ([p[at]!, p[at + 1]!, p[at + 2]!]);

export function pelvisFrame(p: Pose): Frame {
  return { o: [p[P.hip]!, p[P.hip + 1]!, p[P.hip + 2]!], r: rot3(p, P.hipRot) };
}

/** 胸の骨（胸の付け根）の位置と向き */
export function chestFrame(p: Pose, d: BodyDims): Frame {
  const pel = pelvisFrame(p);
  const spineO = add(pel.o, apply3(pel.r, [0, d.pelvisUp, 0]));
  const rs = mul3(pel.r, rot3(p, P.spine));
  const o = add(spineO, apply3(rs, [0, d.abdomen, 0]));
  return { o, r: mul3(rs, rot3(p, P.chest)) };
}

/** 頭の中心 */
export function headCenter(p: Pose, d: BodyDims): V3 {
  const c = chestFrame(p, d);
  const half: V3 = [p[P.neck]! / 2, p[P.neck + 1]! / 2, p[P.neck + 2]! / 2];
  const rn = mul3(c.r, eulerYXZ(half));
  const neckO = add(c.o, apply3(c.r, [0, d.chestH, 0]));
  const headO = add(neckO, apply3(rn, [0, d.neck, 0]));
  const rh = mul3(rn, eulerYXZ(half));
  return add(headO, apply3(rh, [0, d.headR * 0.8, 0.012]));
}

/** 肩の関節（胸から見た位置）。side = 0 が左、1 が右 */
export const shoulderLocal = (d: BodyDims, side: 0 | 1, shrug = 0): V3 => [
  (side === 0 ? 1 : -1) * d.shoulderHalf,
  d.shoulderY + shrug,
  0,
];

/** 足もとから見た位置を、胸から見た位置にする */
export const toChest = (f: Frame, v: V3): V3 => applyT3(f.r, sub(v, f.o));
/** 胸から見た位置を、足もとから見た位置にする */
export const fromChest = (f: Frame, v: V3): V3 => add(f.o, apply3(f.r, v));
