import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦はあなたが先に挑戦する。はじめは「準備」のボタン（.qd-ready）がタップ面（.qd-pad）の真ん中にある。
// 準備を押したら案内を閉じる（待っている間や合図のときに、案内がじゃまにならないように）
export default [
  { text: "game.quickdraw.tour.goal", target: ".qd-strip" },
  { text: "game.quickdraw.tour.pad", target: ".qd-pad" },
  { text: "game.quickdraw.tour.foul", target: ".qd-pad" },
  { text: "game.quickdraw.tour.hidden", target: ".qd-strip" },
  { text: "game.quickdraw.tour.go", target: ".qd-ready", advance: "move" },
] satisfies TourStep[];
