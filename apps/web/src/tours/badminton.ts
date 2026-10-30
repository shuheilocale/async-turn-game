import type { TourStep } from "../tour.ts";

export default [
  { text: "game.badminton.tour.goal", target: ".badminton-court" },
  { text: "game.badminton.tour.serve", target: ".badminton-court", advance: "move" },
  { text: "game.badminton.tour.score", target: ".badminton-score" },
] satisfies TourStep[];
