import type { TourStep } from "../tour.ts";

// 先手（あなた）から始まるので、はじめから札をめくれる
export default [
  { text: "game.memory.tour.goal", target: ".memory-grid" },
  { text: "game.memory.tour.flip", target: ".memory-grid", advance: "move" },
  { text: "game.memory.tour.second", target: ".memory-grid" },
  { text: "game.memory.tour.replay", target: ".memory-grid" },
  { text: "game.memory.tour.score", target: ".memory-tray.mine" },
] satisfies TourStep[];
