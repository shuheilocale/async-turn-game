import type { TourStep } from "../tour.ts";

/**
 * 手番の流れ（動く → 向き → 風を見る → 長押しで撃つ）の順に案内する。撃つ案内を最後にする
 * （撃ったら案内を閉じて、弾が飛ぶ様子を盤の上に何もかぶせずに見せる）
 */
export default [
  { text: "game.artillery.tour.goal", target: ".artillery-view" },
  { text: "game.artillery.tour.move", target: ".artillery-move" },
  { text: "game.artillery.tour.aim", target: ".artillery-aim" },
  { text: "game.artillery.tour.wind", target: ".artillery-wind" },
  { text: "game.artillery.tour.fire", target: ".artillery-power-fire", advance: "move" },
] satisfies TourStep[];
