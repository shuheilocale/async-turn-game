import type { TourStep } from "../tour.ts";

export default [
  { text: "game.korokoro.tour.goal", target: ".korokoro-board" },
  { text: "game.korokoro.tour.cube", target: ".korokoro-cube" },
  { text: "game.korokoro.tour.dots", target: ".korokoro-board", advance: "move" },
  { text: "game.korokoro.tour.careful", target: ".korokoro-board" },
  { text: "game.korokoro.tour.end", target: ".board-note" },
] satisfies TourStep[];
