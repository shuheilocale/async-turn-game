import { Othello } from "@atg/core";
import { C, type Snapshot } from "../snapshot.ts";

export default (s: Othello.OthelloState): Snapshot => {
  const N = Othello.SIZE;
  return {
    gap: 2,
    background: C.feltLine,
    padding: 2,
    radius: 8,
    rows: Array.from({ length: N }, (_, r) => ({
      cells: Array.from({ length: N }, (_, c) => {
        const v = s.board[r * N + c] ?? null;
        const last = s.lastMove?.row === r && s.lastMove?.col === c;
        return {
          w: 24,
          h: 24,
          fill: C.felt,
          border: last ? "#ffd666" : undefined,
          dot: v === null ? undefined : { size: 19, fill: v === 0 ? C.ink : C.white },
        };
      }),
    })),
  };
};
