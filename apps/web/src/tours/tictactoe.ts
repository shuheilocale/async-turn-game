import type { TourStep } from "../tour.ts";

export default [
  { text: "game.tictactoe.tour.goal", target: ".grid-board" },
  { text: "game.tictactoe.tour.players", target: ".versus" },
  { text: "game.tictactoe.tour.place", target: ".grid-board", advance: "move" },
  { text: "game.tictactoe.tour.block", target: ".grid-board", advance: "move" },
  { text: "game.tictactoe.tour.end", target: ".grid-board" },
] satisfies TourStep[];
