import type { TourStep } from "../tour.ts";

// あなたが先手なので、はじめはあなたがキャラを作る（.fight-styles・.fight-build が出ている）。
// 決定するとコンピュータもキャラを作って技を選ぶので、そのまま戦いの画面（.fight-moves など）になる
export default [
  { text: "game.fight.tour.goal", target: ".fight-styles" },
  { text: "game.fight.tour.build", target: ".fight-build", advance: "move" },
  { text: "game.fight.tour.moves", target: ".fight-moves" },
  { text: "game.fight.tour.position", target: ".fight-ring" },
  { text: "game.fight.tour.effects", target: ".fight-bars" },
  { text: "game.fight.tour.end", target: ".fight-bars" },
] satisfies TourStep[];
