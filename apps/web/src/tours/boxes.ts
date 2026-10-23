import type { TourStep } from "../tour.ts";

export default [
  { text: "game.boxes.tour.goal", target: ".boxes-board" },
  { text: "game.boxes.tour.draw", target: ".boxes-board", advance: "move" },
  { text: "game.boxes.tour.again", target: ".boxes-board" },
  { text: "game.boxes.tour.score", target: ".boxes-score" },
  { text: "game.boxes.tour.end", target: ".boxes-board" },
] satisfies TourStep[];
