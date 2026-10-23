import type { TourStep } from "../tour.ts";

// あなたが先手なので、はじめから「そそぐ」ボタン（.pour-button）が押せる
export default [
  { text: "game.pour.tour.goal", target: ".pour-cup" },
  { text: "game.pour.tour.press", target: ".pour-button", advance: "move" },
  { text: "game.pour.tour.rim", target: ".pour-cup" },
  { text: "game.pour.tour.trap", target: ".pour-cup" },
] satisfies TourStep[];
