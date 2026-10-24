import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦はあなたが先に挑戦する。迷路は .tilt-preview、センサーの許可の案内は .sensor-bar。
// 「スタート」（.tilt-go）を押したら案内を閉じる（転がしている間は全画面になるので出さない）
export default [
  { text: "game.tilt.tour.goal", target: ".tilt-preview" },
  { text: "game.tilt.tour.holes", target: ".tilt-preview" },
  { text: "game.tilt.tour.sensor", target: ".sensor-bar" },
  { text: "game.tilt.tour.hidden", target: ".tilt-strip" },
  { text: "game.tilt.tour.go", target: ".tilt-go", advance: "move" },
] satisfies TourStep[];
