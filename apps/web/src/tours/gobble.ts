import type { TourStep } from "../tour.ts";

export default [
  { text: "game.gobble.tour.goal", target: ".gobble-grid" },
  // 手持ちは相手・盤・自分の順に並ぶので、盤より後ろにある方（自分の手持ち）を指す
  { text: "game.gobble.tour.place", target: ".gobble-grid ~ .gobble-hand", advance: "move" },
  { text: "game.gobble.tour.cover", target: ".gobble-grid", advance: "move" },
  { text: "game.gobble.tour.move", target: ".gobble-grid" },
  { text: "game.gobble.tour.end", target: ".gobble-grid" },
] satisfies TourStep[];
