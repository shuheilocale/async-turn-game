import type { TourStep } from "../tour.ts";

// 数字の入力（.numpad）は自分の番のときだけ、推理の一覧（.guess-columns）は秘密の数字を決め終えてから出る
export default [
  { text: "game.hitblow.tour.goal" },
  { text: "game.hitblow.tour.secret", target: ".numpad", advance: "move" },
  { text: "game.hitblow.tour.guess", target: ".numpad", advance: "move" },
  { text: "game.hitblow.tour.hint", target: ".guess-columns" },
  { text: "game.hitblow.tour.end", target: ".guess-columns" },
] satisfies TourStep[];
