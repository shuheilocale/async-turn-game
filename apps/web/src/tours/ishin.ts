import type { TourStep } from "../tour.ts";

// 協力ゲームなので、お試しではひとりで 2 人分を答える。先手が答えて決定すると、後手の見え方に切り替わり、
// 先手の答えは伏せたまま「もう答えました」と出る
export default [
  { text: "game.ishin.tour.goal", target: ".ishin-q" },
  { text: "game.ishin.tour.pick", target: ".ishin-choices", advance: "move" },
  { text: "game.ishin.tour.secret", target: ".ishin-partner" },
  { text: "game.ishin.tour.hearts", target: ".ishin-hearts" },
  { text: "game.ishin.tour.result", target: ".ishin-top" },
] satisfies TourStep[];
