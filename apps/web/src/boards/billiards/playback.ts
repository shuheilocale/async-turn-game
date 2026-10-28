import { Billiards } from "@atg/core";
import { POCKETS, STEP } from "./table.ts";
import type { Simulation } from "./physics.ts";

/**
 * 1 打を動かして見せるための計算（React・planck・canvas を使わない）。
 * 物理演算の結果（コマの列）から、各コマで描く球の位置・大きさ・濃さ・向き（転がって回る）を決める
 */

const { BALL_R } = Billiards;

/** 球の向き。四元数 [w, x, y, z]（球の中の向き → 台の向き） */
export type Quat = [number, number, number, number];

/** 描く球 */
export interface Shown {
  id: number;
  x: number;
  y: number;
  /** 大きさ（1 がふつう。ポケットに落ちるときは小さくなる） */
  scale: number;
  opacity: number;
  q: Quat;
}

/** 再生する 1 打 */
export interface Clip {
  /** 何打目か（通し） */
  n: number;
  /** 打つ前の球 */
  before: Billiards.Ball[];
  angle: number;
  speed: number;
  spin: number;
  /** 最後にそろえる位置（保存された位置。自分で打ったときは計算した位置） */
  target: Billiards.Ball[];
  /** 物理演算の結果。計算が済むまでは null */
  sim: Simulation | null;
  /** 1 コマ目を出す時刻（performance.now()） */
  start: number;
  /** 転がって回った向き（コマごと・球ごと。はじめの向きからの回転） */
  roll: Float64Array[] | null;
  /** k 番目の球が止まったコマ（動かなければ 0） */
  rest: number[] | null;
}

/** ポケットに落ちていく様子を見せるコマ数 */
export const SINK_FRAMES = 14;
/** 止まった球が、番号の見える向きへゆっくり戻るコマ数 */
const SETTLE_FRAMES = 22;
/** 計算のずれで、保存では落ちたのに計算では落ちなかった球は、最後のこのコマ数で消す */
const END_FADE = 18;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function qMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function qNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** 2 つの向きのあいだ（近い方の回り方で） */
export function qLerp(a: Quat, b: Quat, t: number): Quat {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  return qNormalize([a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t]);
}

/** 回転の行列（列が、球の中の x・y・z の向き）から四元数 */
export function qFromMatrix(m: [number, number, number][]): Quat {
  // m[行][列]
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m as [[number, number, number], [number, number, number], [number, number, number]];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return qNormalize([s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return qNormalize([(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return qNormalize([(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s]);
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return qNormalize([(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4]);
}

/** 四元数の回転行列 m[行][列] */
export function qMatrix(q: Quat): [number, number, number][] {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

/**
 * 止まっているときの向き：番号（球の中の x の向き）が真上、番号の上（球の中の z）が画面の上、を向く。
 * up は画面の上の向きを台の座標で表したもの（台を縦に置くなら [1, 0]、横なら [0, 1]）
 */
export function restingQuat(up: [number, number]): Quat {
  // 画面の右 = 上を時計回りに 90 度
  const right: [number, number] = [up[1], -up[0]];
  return qFromMatrix([
    [0, right[0], up[0]],
    [0, right[1], up[1]],
    [1, 0, 0],
  ]);
}

/** 物理演算の結果から、コマごとの転がった向きと、止まったコマを計算して入れる */
export function withSim(clip: Clip, sim: Simulation, now: number): Clip {
  const n = sim.ids.length;
  const roll: Float64Array[] = [];
  const rest: number[] = new Array(n).fill(0);
  let cur = new Float64Array(4 * n);
  for (let k = 0; k < n; k++) cur[4 * k] = 1;
  roll.push(cur);
  for (let f = 1; f < sim.frames.length; f++) {
    const next = new Float64Array(cur);
    const a = sim.frames[f - 1]!;
    const b = sim.frames[f]!;
    for (let k = 0; k < n; k++) {
      const dx = b[2 * k]! - a[2 * k]!;
      const dy = b[2 * k + 1]! - a[2 * k + 1]!;
      const d = Math.hypot(dx, dy);
      if (d < 1e-7) continue;
      rest[k] = f;
      // 台の上を転がる：進む向きと直角な水平の軸のまわりに、進んだ距離 / 半径 だけ回る
      const half = d / BALL_R / 2;
      const s = Math.sin(half) / d;
      const dq: Quat = [Math.cos(half), -dy * s, dx * s, 0];
      const q = qNormalize(qMul(dq, [cur[4 * k]!, cur[4 * k + 1]!, cur[4 * k + 2]!, cur[4 * k + 3]!]));
      next.set(q, 4 * k);
    }
    roll.push(next);
    cur = next;
  }
  return { ...clip, sim, roll, rest, start: Math.max(clip.start, now) };
}

export const lastFrame = (clip: Clip) => (clip.sim ? clip.sim.frames.length - 1 : 0);
/** 再生にかかる時間（ミリ秒） */
export const durationOf = (clip: Clip) => (lastFrame(clip) + 1) * STEP * 1000;

/** 止まっている球（再生していないとき） */
export const restingBalls = (balls: readonly Billiards.Ball[], q: Quat): Shown[] =>
  balls.map((b) => ({ id: b.id, x: b.x, y: b.y, scale: 1, opacity: 1, q }));

/**
 * i コマ目に描く球。端末による計算のずれは少しずつ埋めて、最後は保存された位置にそろえる。
 * 落ちた球はポケットの穴へ吸い込まれて消える。q0 は止まっているときの向き
 */
export function ballsAt(clip: Clip, i: number, q0: Quat): Shown[] {
  const sim = clip.sim;
  if (!sim || !clip.roll || !clip.rest) return restingBalls(clip.before, q0);
  const last = sim.frames.length - 1;
  const f = Math.max(0, Math.min(last, i));
  const frame = sim.frames[f]!;
  const end = sim.frames[last]!;
  const goal = new Map(clip.target.map((b) => [b.id, b]));
  const w = smooth(last > 0 ? f / last : 1);
  const shown: Shown[] = [];
  sim.ids.forEach((id, k) => {
    const r = clip.roll![f]!;
    const rolled = qNormalize(qMul([r[4 * k]!, r[4 * k + 1]!, r[4 * k + 2]!, r[4 * k + 3]!], q0));
    // 止まったら、番号が見える向きへゆっくり戻す
    const settle = clamp01((f - clip.rest![k]!) / SETTLE_FRAMES);
    const q = settle > 0 ? qLerp(rolled, q0, smooth(settle)) : rolled;
    let x = frame[2 * k]!;
    let y = frame[2 * k + 1]!;
    const g = goal.get(id);
    if (g) {
      x += (g.x - end[2 * k]!) * w;
      y += (g.y - end[2 * k + 1]!) * w;
      shown.push({ id, x, y, scale: 1, opacity: 1, q });
      return;
    }
    const at = sim.pocketAt[k];
    if (at !== null && at !== undefined) {
      if (f < at) {
        shown.push({ id, x, y, scale: 1, opacity: 1, q });
        return;
      }
      // 穴の中心へ寄りながら小さく・薄くなる
      const t = clamp01((f - at) / SINK_FRAMES);
      if (t >= 1) return;
      const hole = POCKETS[sim.pocketIn[k]!]!.hole;
      const e = smooth(t);
      shown.push({ id, x: x + (hole[0] - x) * e, y: y + (hole[1] - y) * e, scale: 1 - 0.45 * e, opacity: 1 - e * e, q });
      return;
    }
    shown.push({ id, x, y, scale: 1, opacity: clamp01((last - f) / END_FADE), q });
  });
  return shown;
}

/** i コマ目までにポケットに落ちた球（落ちた順）。再生中に「入った球」を数えるのに使う */
export function pocketedBy(clip: Clip, i: number): number[] {
  const sim = clip.sim;
  if (!sim) return [];
  return sim.pocketed.filter((id) => {
    const k = sim.ids.indexOf(id);
    return sim.pocketAt[k]! <= i;
  });
}
