import type { TourStep } from "../tour.ts";

// あなたが先手なので、はじめから「そそぐ」ボタン（.pour-button）が押せる。
// 目隠しの説明は、目隠しになる前（はじめの数手）に読むので、最低量の並び（.pour-ladder）は先の分を見せている
export default [
  { text: "game.pourhard.tour.goal", target: ".pour-cup" },
  { text: "game.pourhard.tour.press", target: ".pour-button", advance: "move" },
  { text: "game.pourhard.tour.blind", target: ".pour-cup" },
  { text: "game.pourhard.tour.min", target: ".pour-ladder" },
  { text: "game.pourhard.tour.rim", target: ".pour-cup" },
] satisfies TourStep[];
