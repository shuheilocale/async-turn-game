import type { TourStep } from "../tour.ts";

// 協力ゲームなので、お試しではひとりで 2 人分を選ぶ。先手がキャラを決めると後手の見え方に切り替わり、
// 後手も決めるとボス戦（.raid-intent・.raid-actions・.raid-party）になる
export default [
  { text: "game.raid.tour.goal", target: ".raid-picker" },
  { text: "game.raid.tour.pick", target: ".raid-styles", advance: "move" },
  { text: "game.raid.tour.intent", target: ".raid-intent" },
  { text: "game.raid.tour.act", target: ".raid-actions" },
  { text: "game.raid.tour.party", target: ".raid-party" },
] satisfies TourStep[];
