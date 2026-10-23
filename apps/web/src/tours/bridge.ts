import type { TourStep } from "../tour.ts";

// 入れ替えは相手（後手）の最初の番だけなので、自分が 1 手目を置いた直後に説明する
export default [
  { text: "game.bridge.tour.goal", target: ".bridge-board" },
  { text: "game.bridge.tour.place", target: ".bridge-board", advance: "move" },
  { text: "game.bridge.tour.swap", target: ".bridge-board" },
  { text: "game.bridge.tour.link", target: ".bridge-board", advance: "move" },
  { text: "game.bridge.tour.end", target: ".bridge-board" },
] satisfies TourStep[];
