import { Nim } from "@atg/core";
import { C, type Snapshot } from "../snapshot.ts";

const STICK = { w: 8, h: 30 };
const GAP = 12;

/** 残っている棒は濃く、取られた棒は薄く。段は中央にそろえる */
export default (s: Nim.NimState): Snapshot => {
  const widest = Math.max(...Nim.ROWS) * (STICK.w + GAP) - GAP;
  return {
    gap: GAP,
    rows: Nim.ROWS.map((size, row) => {
      const width = size * (STICK.w + GAP) - GAP;
      return {
        offset: (widest - width) / 2,
        cells: Array.from({ length: size }, (_, i) => ({
          ...STICK,
          radius: 4,
          fill: i < s.rows[row]! ? C.ink : C.line,
        })),
      };
    }),
  };
};
