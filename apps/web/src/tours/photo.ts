import type { TourStep } from "../tour.ts";

// 協力ゲームなので、お試しではひとりで 2 人分の写真を出す。順番はないので、名前の札を押すとどちらとして出すかを選べる。
// お試しでは写真をどこにも送らず、端末の中だけで見せる（見本の絵でも試せる）。1 枚出すと、相手の枠は「まだです」のまま
export default [
  { text: "game.photo.tour.goal", target: ".photo-topic" },
  { text: "game.photo.tour.pick", target: ".photo-pair", advance: "move" },
  { text: "game.photo.tour.secret", target: ".versus" },
  { text: "game.photo.tour.album", target: ".photo-album" },
] satisfies TourStep[];
