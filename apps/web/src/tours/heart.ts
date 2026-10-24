import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦目は左半分を描くところ（.heart-pad）から始まる。
// 「描いてみましょう」は描く場所を光らせる（案内はその上に出るので、描く場所も「描けた」も隠れない）。
// 描いたあとは後手の番に切り替わり、左半分が伏せてあるという知らせ（.heart-hidden-note）と、これまでのハート（.heart-history）が出る
export default [
  { text: "game.heart.tour.goal", target: ".heart-pad" },
  { text: "game.heart.tour.sides", target: ".heart-pad" },
  { text: "game.heart.tour.draw", target: ".heart-pad", advance: "move" },
  { text: "game.heart.tour.hidden", target: ".heart-hidden-note" },
  { text: "game.heart.tour.score", target: ".heart-history" },
] satisfies TourStep[];
