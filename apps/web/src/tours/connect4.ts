import type { TourStep } from "../tour.ts";

export default [
  { text: "game.connect4.tour.goal", target: ".grid-board" },
  { text: "game.connect4.tour.drop", target: ".grid-board", advance: "move" },
  { text: "game.connect4.tour.block", target: ".grid-board", advance: "move" },
  { text: "game.connect4.tour.end", target: ".grid-board" },
] satisfies TourStep[];
