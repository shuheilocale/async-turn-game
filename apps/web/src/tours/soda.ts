import type { TourStep } from "../tour.ts";

// あなたが先手なので、はじめから「振る」（.soda-go）を押せる。センサーの許可の案内は .sensor-bar を光らせる。
// 「振る」を押したら案内を閉じる（振っている間は全画面になるので出さない）
export default [
  { text: "game.soda.tour.goal", target: ".soda-stage" },
  { text: "game.soda.tour.sensor", target: ".sensor-bar" },
  { text: "game.soda.tour.rule", target: ".soda-scores" },
  { text: "game.soda.tour.go", target: ".soda-go", advance: "move" },
] satisfies TourStep[];
