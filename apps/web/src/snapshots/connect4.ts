import { Connect4 } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

export default (s: Connect4.Connect4State): Snapshot => {
  const win = new Set(s.winLine ?? []);
  return {
    gap: 3,
    background: C.rack,
    padding: 6,
    radius: 12,
    rows: Array.from({ length: Connect4.ROWS }, (_, r) => ({
      cells: Array.from({ length: Connect4.COLS }, (_, c) => {
        const i = r * Connect4.COLS + c;
        const v = s.board[i] ?? null;
        return {
          w: 26,
          h: 26,
          dot: {
            size: 22,
            fill: v === null ? "#e8ebf1" : seatColor(v),
            border: win.has(i) || s.lastMove === i ? C.white : undefined,
          },
        };
      }),
    })),
  };
};
