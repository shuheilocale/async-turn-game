import type { TourStep } from "../tour.ts";

// 協力ゲームなので、お試しではひとりで 2 人分をお世話する。お世話を 1 つえらぶとすぐに相手の番に切り替わり、
// 時計が半日すすむ（Learn.tsx）。具合（.mochi-meters）は卵がかえってから出るので、時間の案内は部屋を光らせる
export default [
  { text: "game.mochi.tour.goal", target: ".mochi-room-box" },
  { text: "game.mochi.tour.care", target: ".mochi-cares", advance: "move" },
  { text: "game.mochi.tour.time", target: ".mochi-head" },
  { text: "game.mochi.tour.away", target: ".mochi-treasures" },
  { text: "game.mochi.tour.form", target: ".mochi-two" },
] satisfies TourStep[];
