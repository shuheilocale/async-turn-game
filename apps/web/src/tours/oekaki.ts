import type { TourStep } from "../tour.ts";

// お試しはひとりで 2 人分なので、1 問目は先手（描く人）の見え方から始まる。
// 「描いてみましょう」はお題の見出し（.oekaki-task。描く場所の上にある）を光らせ、案内はその上に出る（描く場所を隠さない）。
// 選ぶ前は見出しがないので盤を光らせる。描いて送ると当てる人の見え方に切り替わり、選択肢（.oekaki-options）が出る
export default [
  { text: "game.oekaki.tour.goal", target: ".oekaki-head" },
  { text: "game.oekaki.tour.pick", target: ".oekaki-picker" },
  { text: "game.oekaki.tour.draw", target: ".oekaki-task", advance: "move" },
  { text: "game.oekaki.tour.guess", target: ".oekaki-options" },
  { text: "game.oekaki.tour.stars", target: ".oekaki-head" },
] satisfies TourStep[];
