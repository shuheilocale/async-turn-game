import type { TourStep } from "../tour.ts";

export default [
  { text: "game.othello.tour.goal", target: ".grid-board" },
  { text: "game.othello.tour.place", target: ".grid-board", advance: "move" },
  { text: "game.othello.tour.flip", target: ".grid-board", advance: "move" },
  { text: "game.othello.tour.count", target: ".summary" },
  { text: "game.othello.tour.end", target: ".grid-board" },
] satisfies TourStep[];
