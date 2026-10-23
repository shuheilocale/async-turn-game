import type { TourStep } from "../tour.ts";

// 1 回戦目はあなたから動くので、はじめから手の選択肢（.bluff-actions）が出ている
export default [
  { text: "game.bluff.tour.goal", target: ".bluff-table" },
  { text: "game.bluff.tour.act", target: ".bluff-actions", advance: "move" },
  { text: "game.bluff.tour.pass", target: ".bluff-table" },
  { text: "game.bluff.tour.answer", target: ".bluff-table" },
  { text: "game.bluff.tour.end", target: ".bluff-table" },
] satisfies TourStep[];
