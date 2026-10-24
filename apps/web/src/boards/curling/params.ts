import { Curling } from "@atg/core";

/**
 * カーリングの物理と操作で共通に使う値。物理演算（physics.ts）・3D（scene3d.ts）・盤（CurlingBoard.tsx）から読む。
 * planck や three を読み込まなくても使えるよう、ここには planck・three を使うものを置かない
 */

const { HOG_Y, TEE_Y, BACK_Y, HOUSE_R, STONE_R } = Curling;

/** 物理演算の 1 コマの時間（秒）。再生するときもこの間隔で 1 コマずつ進める */
export const STEP = 1 / 60;

/** 氷の上で石が遅くなる割合（m/s²）。本物よりかなり強くして、投げてから止まるまでを 7 秒くらいにしている */
export const DECEL = 1;

/** 強さのつまみ（0〜1）の、この割合までを「ハウスに止める」くらいの強さに使う（細かく合わせやすいように） */
const SOFT = 0.6;
/** 何にも当たらなければ止まるはずの距離。つまみの 0・SOFT・1 のとき */
const REACH = [14, 25, 60] as const;

/** 強さのつまみ（0〜1）から、何にも当たらなければ止まるはずの距離（m） */
export function reachOf(power: number): number {
  const p = Math.max(0, Math.min(1, power));
  return p <= SOFT
    ? REACH[0] + ((REACH[1] - REACH[0]) * p) / SOFT
    : REACH[1] + ((REACH[2] - REACH[1]) * (p - SOFT)) / (1 - SOFT);
}

/** 距離から強さのつまみへ（reachOf の逆） */
export function powerOfReach(reach: number): number {
  const d = Math.max(REACH[0], Math.min(REACH[2], reach));
  return d <= REACH[1]
    ? (SOFT * (d - REACH[0])) / (REACH[1] - REACH[0])
    : SOFT + ((1 - SOFT) * (d - REACH[1])) / (REACH[2] - REACH[1]);
}

/** 強さのつまみから投げる速さ（m/s）。v² = 2 × DECEL × 距離 */
export const speedOf = (power: number) => Math.sqrt(2 * DECEL * reachOf(power));

/** 速さから強さのつまみへ */
export const powerOfSpeed = (speed: number) => powerOfReach((speed * speed) / (2 * DECEL));

/** 強さの目安。止まるはずの距離で分ける */
export type Zone = "short" | "guard" | "house" | "hit";
/** 目安の境目（止まるはずの距離）。ホッグラインを越える・ハウスにかかる・ハウスを越える */
export const ZONE_EDGES = { guard: HOG_Y + STONE_R, house: TEE_Y - HOUSE_R - STONE_R, hit: BACK_Y + STONE_R } as const;

export function zoneOf(power: number): Zone {
  const d = reachOf(power);
  if (d < ZONE_EDGES.guard) return "short";
  if (d < ZONE_EDGES.house) return "guard";
  if (d < ZONE_EDGES.hit) return "house";
  return "hit";
}

/** はじめの強さ：ハウスの中心に止まるくらい */
export const DEFAULT_POWER = powerOfReach(TEE_Y);

/** 画面で選べる向きの範囲（ラジアン）。シートの端より少し外まで */
export const AIM_UI_MAX = 0.12;

/**
 * 放すときの石の向き。本物と同じく、右回りなら取っ手を 10 時の向き、左回りなら 2 時の向きにして放す
 * （回しながら 12 時の向きを通る）
 */
export const releaseAngle = (spin: Curling.Spin) => (spin * Math.PI) / 3;
