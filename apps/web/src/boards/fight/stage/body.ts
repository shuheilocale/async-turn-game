import { clamp, lerp } from "./math.ts";
import type { FighterStats, StyleId } from "./types.ts";

/**
 * 体格（骨の長さと、体のそれぞれの部分の太さ）。単位はメートル。
 * stats から決まり、キャラ作りで ± を押すたびに、いまの体格から新しい体格へ少しずつ寄せていく
 */
export interface BodyDims {
  /** 足首の高さ（床から） */
  ankleH: number;
  /** すね（ひざ → 足首） */
  shin: number;
  /** 太もも（股関節 → ひざ） */
  thigh: number;
  /** 足首からつま先まで */
  footLen: number;
  /** 左右の股関節の間の半分 */
  hipHalf: number;
  /** 腰（骨盤の中心）から背骨の付け根まで */
  pelvisUp: number;
  /** 背骨の付け根から胸の付け根まで（おなか） */
  abdomen: number;
  /** 胸の付け根から首の付け根まで */
  chestH: number;
  /** 胸の中心から肩の関節まで（横） */
  shoulderHalf: number;
  /** 胸の付け根から肩の関節までの高さ */
  shoulderY: number;
  neck: number;
  headR: number;
  upperArm: number;
  forearm: number;
  /** 胸（あばら）の横・前後の半分 */
  chestW: number;
  chestD: number;
  /** 腰のくびれの横・前後の半分 */
  waistW: number;
  waistD: number;
  /** お尻まわりの横・前後の半分 */
  hipW: number;
  hipD: number;
  neckR: number;
  /** 肩の筋肉（三角筋）の半径 */
  deltR: number;
  /** 首から肩への盛り上がり（僧帽筋）の大きさ */
  trap: number;
  upperArmR: number;
  forearmR: number;
  wristR: number;
  thighR: number;
  kneeR: number;
  calfR: number;
  ankleR: number;
  fistR: number;
  /** 胸の筋肉・背中の広がりの大きさ（1 がふつう） */
  pec: number;
  lat: number;
  /** おなかのふくらみ（相撲だけ少し） */
  belly: number;
  /** stats を -1.3〜1 にならしたもの。構えの重さ・軽さに使う */
  power: number;
  guard: number;
  speed: number;
  stamina: number;
}

/** stats を、ふつう（5）を 0 として -1.33〜1 にならす */
export const statLevel = (v: number) => (clamp(Number.isFinite(v) ? v : 5, 1, 8) - 5) / 3;

/** stats がそろっていないとき（シルエット）に使う、ふつうの体格 */
export const NEUTRAL_STATS: FighterStats = { power: 5, guard: 5, speed: 5, stamina: 5 };

export function bodyOf(stats: FighterStats, style: StyleId | null = null): BodyDims {
  const p = statLevel(stats.power);
  const g = statLevel(stats.guard);
  const s = statLevel(stats.speed);
  const st = statLevel(stats.stamina);
  const sumo = style === "sumo" ? 1 : 0;
  // すばやさは手足を長く細く、守りは胴を厚く、攻撃は上半身を太く、スタミナは胸を大きくする
  const reach = 1 + 0.065 * s;
  const slim = 1 - 0.13 * s;
  // 細くなる側は控えめにする（攻撃が低くても、腕が棒のようにならないように）
  const pw = p >= 0 ? p : p * 0.5;
  return {
    ankleH: 0.075,
    shin: 0.42 * reach,
    thigh: 0.435 * reach,
    footLen: 0.2 + 0.008 * s,
    hipHalf: 0.088 * (1 + 0.04 * g + 0.05 * sumo),
    pelvisUp: 0.085,
    abdomen: 0.178 * (1 + 0.02 * s),
    chestH: 0.31 * (1 + 0.05 * st),
    shoulderHalf: 0.19 * (1 + 0.11 * p - 0.03 * s),
    shoulderY: 0.25 * (1 + 0.03 * st),
    neck: 0.08 * (1 - 0.12 * Math.max(0, p) + 0.04 * s),
    headR: 0.105,
    upperArm: 0.295 * reach,
    forearm: 0.265 * reach,
    chestW: 0.155 * (1 + 0.07 * p + 0.1 * st - 0.06 * s),
    chestD: 0.102 * (1 + 0.13 * g + 0.18 * st - 0.06 * s + 0.08 * sumo),
    waistW: 0.114 * (1 + 0.22 * g - 0.1 * s + 0.24 * sumo),
    waistD: 0.088 * (1 + 0.3 * g - 0.1 * s + 0.35 * sumo),
    hipW: 0.134 * (1 + 0.12 * g - 0.05 * s + 0.14 * sumo),
    hipD: 0.098 * (1 + 0.08 * g + 0.1 * sumo),
    neckR: 0.061 * (1 + 0.3 * pw + 0.1 * g),
    deltR: 0.061 * (1 + 0.32 * pw - 0.06 * s),
    trap: 1 + 0.8 * pw + 0.15 * g,
    upperArmR: 0.054 * (1 + 0.34 * pw) * slim,
    forearmR: 0.046 * (1 + 0.26 * pw) * slim,
    wristR: 0.029 * (1 + 0.08 * p),
    thighR: 0.088 * (1 + 0.2 * g + 0.05 * p + 0.12 * sumo) * slim,
    kneeR: 0.051 * (1 + 0.05 * g),
    calfR: 0.059 * (1 + 0.14 * g) * slim,
    ankleR: 0.031,
    fistR: 0.043 * (1 + 0.08 * p),
    pec: 1 + 0.3 * p + 0.35 * st,
    lat: 1 + 0.55 * pw - 0.12 * s,
    belly: sumo * (1 + 0.3 * g),
    power: p,
    guard: g,
    speed: s,
    stamina: st,
  };
}

/** 2 つの体格のあいだ（t = 0 で a、1 で b） */
export function lerpBody(a: BodyDims, b: BodyDims, t: number): BodyDims {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof BodyDims)[]) out[k] = lerp(a[k], b[k], t);
  return out;
}

/** 股関節の高さ（足をまっすぐ伸ばして立ったとき） */
export const legLength = (d: BodyDims) => d.ankleH + d.shin + d.thigh;
/** 腕の長さ（肩 → 手首） */
export const armLength = (d: BodyDims) => d.upperArm + d.forearm;
/** まっすぐ立ったときの頭のてっぺんの高さ */
export const standingHeight = (d: BodyDims) =>
  legLength(d) + d.pelvisUp + d.abdomen + d.chestH + d.neck + d.headR * 1.9;
