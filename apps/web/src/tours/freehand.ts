import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦目はお題を選ぶところ（.freehand-picker）から始まる。
// 「描いてみましょう」はお題のボタンの列を光らせる（案内はその上に出るので、ボタンも描く場所も隠れない）。
// 描いたあとはコンピュータが続けて描き、結果（.freehand-reveal）が出る（出るまでは盤を光らせる）
export default [
  { text: "game.freehand.tour.goal", target: ".freehand-picker" },
  { text: "game.freehand.tour.pick", target: ".freehand-picker" },
  { text: "game.freehand.tour.draw", target: ".freehand-shapes", advance: "move" },
  { text: "game.freehand.tour.reveal", target: ".freehand-reveal" },
  { text: "game.freehand.tour.score", target: ".freehand-reveal" },
] satisfies TourStep[];
