import type { TicTacToe } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

export default (s: TicTacToe.TicTacToeState): Snapshot => {
  const win = new Set(s.winLine ?? []);
  return {
    gap: 3,
    background: C.line,
    radius: 10,
    rows: [0, 1, 2].map((r) => ({
      cells: [0, 1, 2].map((c) => {
        const i = r * 3 + c;
        const v = s.board[i] ?? null;
        return {
          w: 56,
          h: 56,
          fill: win.has(i) && v !== null ? (v === 0 ? C.p0Soft : C.p1Soft) : C.surface,
          border: s.lastMove === i ? C.ink : undefined,
          mark: v === null ? undefined : { text: v === 0 ? "○" : "×", color: seatColor(v), size: 30 },
        };
      }),
    })),
  };
};
