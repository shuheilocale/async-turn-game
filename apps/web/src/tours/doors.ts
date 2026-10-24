import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦はあなたが仕掛ける。仕掛けて決定したら、コンピュータがくぐって仕掛け返し、
// 2 回戦はあなたがくぐる番になる
export default [
  { text: "game.doors.tour.goal", target: ".doors-hall" },
  { text: "game.doors.tour.set", target: ".doors-hall", advance: "move" },
  { text: "game.doors.tour.watch", target: ".doors-hall" },
  { text: "game.doors.tour.points", target: ".doors-hall" },
  { text: "game.doors.tour.end", target: ".doors-history" },
] satisfies TourStep[];
