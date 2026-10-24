import { Artillery } from "@atg/core";

/*
 * たまうちバトルの、強さのゲージと向きの線。盤（ArtilleryBoard）から使う、画面だけの計算
 */

/** ゲージが 0 から 100 までたまる時間（ms）。100 まで行ったら 0 へ戻り、また上がる（行ったり来たり） */
export const GAUGE_MS = 1600;

/** 「撃つ」を押し始めてから t ms たったときの強さ（0〜100 の整数） */
export function gaugeAt(t: number): number {
  const k = (Math.max(0, t) / GAUGE_MS) % 2;
  return Math.round((k <= 1 ? k : 2 - k) * 100);
}

/** 向きの線の点の数と、点の間（単位） */
const DOTS = 6;
const GAP = 3.4;

/** 向きの線：砲口からまっすぐ、向きの方へ少しだけ（強さが決まっていないので、飛ぶ先は見せない） */
export function previewOf(cannon: Artillery.Cannon, angle: number): [number, number][] {
  const [mx, my] = Artillery.muzzle(cannon, angle);
  const dx = Artillery.cosDeg(angle);
  const dy = Artillery.sinDeg(angle);
  return Array.from({ length: DOTS }, (_, i) => [mx + dx * GAP * (i + 1), my + dy * GAP * (i + 1)]);
}
