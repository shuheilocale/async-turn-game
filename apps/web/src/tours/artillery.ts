import type { TourStep } from "../tour.ts";

/** 撃つ案内を最後にする（撃ったら案内を閉じて、弾が飛ぶ様子を盤の上に何もかぶせずに見せる） */
export default [
  { text: "game.artillery.tour.goal", target: ".artillery-view" },
  { text: "game.artillery.tour.hp", target: ".artillery-hud" },
  { text: "game.artillery.tour.aim", target: ".artillery-controls" },
  { text: "game.artillery.tour.wind", target: ".artillery-wind" },
  { text: "game.artillery.tour.fire", target: ".artillery-fire", advance: "move" },
] satisfies TourStep[];
