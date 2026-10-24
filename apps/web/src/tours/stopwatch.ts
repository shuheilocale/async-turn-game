import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦はあなたが出題する。はじめは目標の秒数を選ぶ画面（.sw-picker）で、
// 「この秒数で出題する」も「スタート」も同じ .sw-button。スタートを押したら案内を閉じる（測っている間は出さない）
export default [
  { text: "game.stopwatch.tour.goal", target: ".sw-strip" },
  { text: "game.stopwatch.tour.pick", target: ".sw-picker" },
  { text: "game.stopwatch.tour.hidden", target: ".sw-strip" },
  { text: "game.stopwatch.tour.go", target: ".sw-button", advance: "move" },
] satisfies TourStep[];
