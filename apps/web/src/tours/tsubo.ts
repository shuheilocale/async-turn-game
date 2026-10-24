import type { TourStep } from "../tour.ts";

// あなたが先手なので、1 回戦はお客さんとしてこりを置くところから始まる（置いて「これで決定」で次へ）。
// そのあとコンピュータが施術して指の跡（近さの色）が増えていき、2 回戦はあなたが施術する
export default [
  { text: "game.tsubo.tour.goal", target: ".tsubo-back" },
  { text: "game.tsubo.tour.hide", target: ".tsubo-back", advance: "move" },
  { text: "game.tsubo.tour.watch", target: ".tsubo-back" },
  { text: "game.tsubo.tour.levels", target: ".tsubo-legend" },
  { text: "game.tsubo.tour.search", target: ".tsubo-back" },
] satisfies TourStep[];
