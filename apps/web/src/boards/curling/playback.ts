import { Curling, type Seat } from "@atg/core";
import { releaseAngle, STEP } from "./params.ts";
import type { Simulation } from "./physics.ts";

/**
 * 1 投を動かして見せるための計算（React・planck・three を使わない）。
 * 物理演算の結果（コマの列）から、各コマで描く石の位置・濃さと、カメラの向け方を決める
 */

const { HOG_Y, TEE_Y } = Curling;

/** 描く石（scene3d.ts の StoneView と同じ形） */
export interface Shown {
  id: number;
  seat: Seat;
  x: number;
  y: number;
  angle: number;
  opacity: number;
  counts?: boolean;
}

export type Camera = { mode: "aim" | "follow" | "house"; focus?: { x: number; y: number } };

/** 動かしている 1 投 */
export interface Anim {
  /** 投げたあとの、通しの投数（エンド × 8 + そのエンドで投げた数） */
  key: number;
  seat: Seat;
  /** 投げた石の id */
  id: number;
  /** 投げる前の石 */
  before: Curling.CurlingStone[];
  aim: number;
  speed: number;
  spin: Curling.Spin;
  /** 物理演算の結果。読み込み・計算が済むまでは null */
  sim: Simulation | null;
  /** 最後にそろえる位置（保存された位置。自分で投げたときは計算した位置） */
  target: Curling.CurlingStone[] | null;
  /** 1 コマ目を出す時刻（performance.now()） */
  start: number;
  /** ハウスを上から見るのに切り替えるコマ */
  houseFrom: number;
  /** 上から見るとき、ここまで手前を入れる（止まったあと残る石のうち、いちばん手前の石の y） */
  near: number;
}

/** 上から見るときに入れる、いちばん手前の y。ハウスより手前の石（ガード）があればそこまで */
export const nearOf = (stones: readonly { y: number }[]) => Math.min(TEE_Y, ...stones.map((s) => s.y));

/** シートの外に出た石が消えるまでのコマ数 */
const FADE_FRAMES = Math.round(0.45 / STEP);
/** 最後に取り除かれる石（ホッグラインの手前で止まった石など）は、最後のこのコマ数で消す */
const END_FADE = 24;

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 通しの投数 */
export const seqOf = (s: Curling.CurlingState) => s.ends.length * Curling.THROWS + s.thrown;

/** 石の id から色（席）を引く表 */
function seatsOf(anim: Pick<Anim, "before" | "id" | "seat">): Map<number, Seat> {
  const seats = new Map(anim.before.map((s) => [s.id, s.seat]));
  seats.set(anim.id, anim.seat);
  return seats;
}

/**
 * ハウスを上から見るのに切り替えるコマ。投げた石がハウスの手前まで来たとき・遅くなってきたとき・
 * 外に出たとき（強く投げたときは、当たる前に切り替えて当たるところを上から見せる）
 */
export function houseFromOf(sim: Simulation): number {
  const k = sim.ids.length - 1;
  for (let i = 1; i < sim.frames.length; i++) {
    const [x, y] = sim.frames[i]![k]!;
    const [px, py] = sim.frames[i - 1]![k]!;
    const speed = Math.hypot(x - px, y - py) / STEP;
    if (y > TEE_Y - 5.2 || (y > HOG_Y - 3 && speed < 3.4) || (sim.outAt[k] !== null && i >= sim.outAt[k]!)) return i;
  }
  return sim.frames.length - 1;
}

/** 物理演算の結果を入れた Anim にする */
export function withSim(anim: Anim, sim: Simulation, now: number): Anim {
  const seats = seatsOf(anim);
  const target = anim.target ?? sim.stones.map(([id, x, y, angle]) => ({ id, seat: seats.get(id)!, x, y, angle }));
  return { ...anim, sim, target, start: Math.max(anim.start, now), houseFrom: houseFromOf(sim), near: nearOf(target) };
}

export const lastFrame = (anim: Anim) => (anim.sim ? anim.sim.frames.length - 1 : 0);

/**
 * i コマ目に描く石。端末による計算のずれは、少しずつ埋めて最後は保存された位置にそろえる。
 * 外に出た石・最後に取り除かれる石は、だんだん消す
 */
export function stonesAt(anim: Anim, i: number): Shown[] {
  const seats = seatsOf(anim);
  const sim = anim.sim;
  if (!sim) {
    // 計算が済むまでは、投げる前の位置で待つ
    return [
      ...anim.before.map((s) => ({ ...s, opacity: 1 })),
      { id: anim.id, seat: anim.seat, x: 0, y: 0, angle: releaseAngle(anim.spin), opacity: 1 },
    ];
  }
  const last = sim.frames.length - 1;
  const f = Math.max(0, Math.min(last, i));
  const end = sim.frames[last]!;
  const goal = new Map((anim.target ?? []).map((s) => [s.id, s]));
  const w = smooth(last > 0 ? f / last : 1);
  return sim.ids.map((id, k) => {
    const [x, y, angle] = sim.frames[f]![k]!;
    const g = goal.get(id);
    const seat = seats.get(id)!;
    if (g) {
      const [ex, ey, ea] = end[k]!;
      return { id, seat, x: x + (g.x - ex) * w, y: y + (g.y - ey) * w, angle: angle + wrap(g.angle - ea) * w, opacity: 1 };
    }
    const out = sim.outAt[k];
    const opacity = out !== null && out !== undefined ? 1 - (f - out) / FADE_FRAMES : (last - f) / END_FADE;
    return { id, seat, x, y, angle, opacity: clamp01(opacity) };
  });
}

/** i コマ目のカメラ。投げる前は投げる人の後ろ、すべっている間は石を追い、ハウスに近づいたら上から */
export function cameraAt(anim: Anim, i: number): Camera {
  const sim = anim.sim;
  if (!sim || i <= 0) return { mode: "aim" };
  if (i >= anim.houseFrom) return { mode: "house", focus: { x: 0, y: anim.near } };
  const [x, y] = sim.frames[Math.min(i, sim.frames.length - 1)]![sim.ids.length - 1]!;
  return { mode: "follow", focus: { x, y } };
}
