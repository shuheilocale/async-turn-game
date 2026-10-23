import type { TourStep } from "../tour.ts";

// .hand は自分の手札・相手の残りの手札・これから出る得点カードにあるが、最初に並ぶのが自分の手札
export default [
  { text: "game.auction.tour.goal", target: ".prize-area" },
  { text: "game.auction.tour.bid", target: ".hand", advance: "move" },
  { text: "game.auction.tour.win", target: ".prize-area" },
  { text: "game.auction.tour.tie", target: ".prize-area" },
  { text: "game.auction.tour.end", target: ".hand" },
] satisfies TourStep[];
