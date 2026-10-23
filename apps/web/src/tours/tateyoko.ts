import type { TourStep } from "../tour.ts";

export default [
  { text: "game.tateyoko.tour.goal", target: ".tateyoko-grid" },
  { text: "game.tateyoko.tour.direction", target: ".tateyoko-grid" },
  { text: "game.tateyoko.tour.place", target: ".tateyoko-grid", advance: "move" },
  { text: "game.tateyoko.tour.room", target: ".board-note" },
  { text: "game.tateyoko.tour.end", target: ".tateyoko-grid" },
] satisfies TourStep[];
