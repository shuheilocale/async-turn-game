import type { TourStep } from "../tour.ts";

export default [
  { text: "game.sotto.tour.goal", target: ".sotto-table" },
  { text: "game.sotto.tour.hand", target: ".sotto-hand" },
  { text: "game.sotto.tour.act", target: ".sotto-actions", advance: "move" },
  { text: "game.sotto.tour.miss", target: ".sotto-meters" },
  { text: "game.sotto.tour.signal", target: ".sotto-table" },
] satisfies TourStep[];
