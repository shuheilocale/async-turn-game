import type { TourStep } from "../tour.ts";

// あなたが先手なので、はじめは並びが空で、好きなパッドを 1 つ押すだけ。押すとコンピュータが足して、
// 自分の番の始めに並びが光る（3 枚目はちょうどそのときに出る）
export default [
  { text: "game.chain.tour.goal", target: ".chain-pads" },
  { text: "game.chain.tour.first", target: ".chain-pads", advance: "move" },
  { text: "game.chain.tour.replay", target: ".chain-pads" },
  { text: "game.chain.tour.copy", target: ".chain-progress" },
  { text: "game.chain.tour.end", target: ".chain-progress" },
] satisfies TourStep[];
