import type { TourStep } from "../tour.ts";

export default [
  { text: "game.tapioca.tour.goal", target: ".tapioca-glass" },
  { text: "game.tapioca.tour.pieces", target: ".tapioca-pick" },
  { text: "game.tapioca.tour.try", target: ".tapioca-glass", advance: "move" },
  { text: "game.tapioca.tour.ice", target: ".board-note" },
  { text: "game.tapioca.tour.end", target: ".tapioca-glass" },
] satisfies TourStep[];
