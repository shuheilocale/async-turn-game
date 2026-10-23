import type { TourStep } from "../tour.ts";

export default [
  { text: "game.treasure.tour.goal", target: ".treasure-grid" },
  { text: "game.treasure.tour.roles", target: ".treasure-grid" },
  { text: "game.treasure.tour.move", target: ".treasure-grid", advance: "move" },
  { text: "game.treasure.tour.rock", target: ".board-note" },
  { text: "game.treasure.tour.signal", target: ".treasure-grid" },
] satisfies TourStep[];
