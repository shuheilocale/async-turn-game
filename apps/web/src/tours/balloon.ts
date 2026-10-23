import type { TourStep } from "../tour.ts";

// あなたが先手なので、はじめから風船（.balloon-stage）をタップできる
export default [
  { text: "game.balloon.tour.goal", target: ".balloon-stage" },
  { text: "game.balloon.tour.tap", target: ".balloon-stage", advance: "move" },
  { text: "game.balloon.tour.burst", target: ".balloon-stage" },
  { text: "game.balloon.tour.score", target: ".balloon-scores" },
] satisfies TourStep[];
