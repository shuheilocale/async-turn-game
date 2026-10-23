import type { TourStep } from "../tour.ts";

export default [
  { text: "game.nim.tour.goal", target: ".nim-rows" },
  { text: "game.nim.tour.oneRow", target: ".nim-rows" },
  { text: "game.nim.tour.take", target: ".nim-rows", advance: "move" },
  { text: "game.nim.tour.count", target: ".board-note" },
  { text: "game.nim.tour.end", target: ".nim-rows" },
] satisfies TourStep[];
