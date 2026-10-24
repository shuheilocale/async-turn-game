import type { TourStep } from "../tour.ts";

// 1 品目はあなたから入札するので、はじめから入札の欄（.shop-bid）が出ている。
// 入札するとコンピュータも入札して結果（.shop-result）が出る
export default [
  { text: "game.shopping.tour.goal", target: ".shop-window" },
  { text: "game.shopping.tour.bid", target: ".shop-bid", advance: "move" },
  { text: "game.shopping.tour.result", target: ".shop-result" },
  { text: "game.shopping.tour.sets", target: ".shop-shelves" },
  { text: "game.shopping.tour.end", target: ".shop-wallets" },
] satisfies TourStep[];
