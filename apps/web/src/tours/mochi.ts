import type { TourStep } from "../tour.ts";

// 協力ゲームなので、お試しではひとりで 2 人分をお世話する。順番はないので、上の名前の札を押すとどちらとしてお世話するかを
// 選べる（選ぶまでは、直前にお世話していない人）。お世話を 1 つえらぶと時計が半日すすむ（Learn.tsx）。具合（.mochi-meters）は卵がかえってから出るので、時間の案内は部屋を光らせる
export default [
  { text: "game.mochi.tour.goal", target: ".mochi-room-box" },
  { text: "game.mochi.tour.care", target: ".mochi-cares", advance: "move" },
  { text: "game.mochi.tour.time", target: ".mochi-head" },
  { text: "game.mochi.tour.away", target: ".mochi-treasures" },
  { text: "game.mochi.tour.form", target: ".mochi-two" },
] satisfies TourStep[];
