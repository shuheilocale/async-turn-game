import { Soda } from "@atg/core";

/**
 * ふりふりソーダの「振った強さ」の測り方。3 秒の間に振った勢い（energy）をためて、0〜100 の強さにする。
 * - センサー：加速度（重力を除いたもの）の大きさから、手のふるえ分（NOISE）を引いた分を時間でためる
 * - 指：画面をこすった長さと、たたいた回数をためる
 * どちらも思い切りやると 85〜95 くらい、ふつうにやると 40〜60 くらいになるよう合わせてある（meter.test.ts）。
 * 強さは energy が大きいほど伸びにくくなる（100 ちょうどにはなかなか届かない）
 */

/** 手のふるえとして無視する加速度（m/s²） */
export const NOISE = 1.5;
/** 強さの伸び方。energy がこの値で強さ 63 くらい */
export const ENERGY_SCALE = 40;
/** 指でこすった長さ（CSS ピクセル）を energy に直す割合と、1 回たたいた分の energy */
export const PX_PER_ENERGY = 50;
export const TAP_ENERGY = 3;
/** 1 回のイベントの間隔として数える上限（秒）。止まっていた間を一度に足さないように */
const MAX_DT = 0.1;
/** 重力を引くときの、重力の向きを追いかける速さ（accelerationIncludingGravity しかない端末用） */
const GRAVITY_FOLLOW = 0.08;

export const powerOf = (energy: number) =>
  Math.min(Soda.MAX_POWER, Math.max(0, Math.round(Soda.MAX_POWER * (1 - Math.exp(-Math.max(0, energy) / ENERGY_SCALE)))));

type Vec = { x: number | null; y: number | null; z: number | null } | null | undefined;

const full = (v: Vec): v is { x: number; y: number; z: number } =>
  !!v && typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number";

/** 振った勢いをためる。計り終わったら power を送る */
export class ShakeMeter {
  energy = 0;
  /** 今の勢い（0〜1 くらい）。ボトルの揺れの大きさに使う */
  level = 0;
  /** 測っている間だけ true（かまえている間・測り終わったあとの動きは数えない） */
  open = true;
  private lastT: number | null = null;
  private gravity: [number, number, number] | null = null;

  get power() {
    return powerOf(this.energy);
  }

  /** センサーの値。acc は重力を除いた加速度、accG は重力を含む加速度（m/s²）、t はミリ秒 */
  addMotion(acc: Vec, accG: Vec, t: number) {
    if (!this.open) return;
    let m: number;
    if (full(acc)) {
      m = Math.hypot(acc.x, acc.y, acc.z);
    } else if (full(accG)) {
      // 重力を含む値しかなければ、ゆっくり追いかけた重力の向きを引く
      const g = (this.gravity ??= [accG.x, accG.y, accG.z]);
      g[0] += (accG.x - g[0]) * GRAVITY_FOLLOW;
      g[1] += (accG.y - g[1]) * GRAVITY_FOLLOW;
      g[2] += (accG.z - g[2]) * GRAVITY_FOLLOW;
      m = Math.hypot(accG.x - g[0], accG.y - g[1], accG.z - g[2]);
    } else {
      return;
    }
    const dt = this.lastT === null ? 1 / 60 : Math.min(MAX_DT, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    const push = Math.max(0, m - NOISE);
    this.energy += push * dt;
    this.level += (Math.min(1, push / 25) - this.level) * 0.25;
  }

  /** 指でこすった長さ（CSS ピクセル） */
  addRub(px: number) {
    if (!this.open || !(px > 0)) return;
    this.energy += px / PX_PER_ENERGY;
    this.level = Math.min(1, this.level + px / 400);
  }

  /** 指でたたいた */
  addTap() {
    if (!this.open) return;
    this.energy += TAP_ENERGY;
    this.level = Math.min(1, this.level + 0.35);
  }

  /** 揺れを少しずつおさめる（毎フレーム呼ぶ） */
  settle(dt: number) {
    this.level *= Math.exp(-dt * 4);
  }
}
