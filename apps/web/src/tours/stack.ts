import type { TourStep } from "../tour.ts";

export default [
  { text: "game.stack.tour.goal", target: ".stack-view" },
  { text: "game.stack.tour.aim", target: ".stack-view" },
  { text: "game.stack.tour.drop", target: ".stack-controls", advance: "move" },
  { text: "game.stack.tour.next", target: ".stack-inset" },
  { text: "game.stack.tour.tip", target: ".board-note" },
] satisfies TourStep[];
