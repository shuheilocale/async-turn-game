import type { TourStep } from "../tour.ts";

export default [
  { text: "game.billiards.tour.goal", target: ".billiards-table" },
  { text: "game.billiards.tour.aim", target: ".billiards-table" },
  { text: "game.billiards.tour.power", target: ".billiards-power" },
  { text: "game.billiards.tour.spin", target: ".billiards-spin" },
  { text: "game.billiards.tour.shoot", target: ".billiards-shootrow", advance: "move" },
  { text: "game.billiards.tour.players", target: ".billiards-players" },
] satisfies TourStep[];
