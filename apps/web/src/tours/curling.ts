import type { TourStep } from "../tour.ts";

export default [
  { text: "game.curling.tour.goal", target: ".curling-view" },
  { text: "game.curling.tour.aim", target: ".curling-view" },
  { text: "game.curling.tour.spin", target: ".curling-spin" },
  { text: "game.curling.tour.throw", target: ".curling-controls", advance: "move" },
  { text: "game.curling.tour.score", target: ".curling-score" },
] satisfies TourStep[];
