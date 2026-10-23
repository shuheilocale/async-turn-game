import type { TourStep } from "../tour.ts";

export default [
  { text: "game.fading.tour.goal", target: ".grid-board" },
  { text: "game.fading.tour.place", target: ".grid-board", advance: "move" },
  { text: "game.fading.tour.limit", target: ".grid-board" },
  { text: "game.fading.tour.faded", target: ".grid-board", advance: "move" },
  { text: "game.fading.tour.end", target: ".board-note" },
] satisfies TourStep[];
