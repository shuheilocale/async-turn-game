import { Tateyoko } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

/** 棒で埋まったマスを、置いた人の色で塗る。最後に置いた棒は枠で示す */
export default (s: Tateyoko.TateyokoState): Snapshot => {
  const last = s.lastMove ? new Set(Tateyoko.cellsOf(s.lastMove.seat, s.lastMove.cell) ?? []) : new Set<number>();
  const N = Tateyoko.SIZE;
  return {
    gap: 3,
    background: C.line,
    radius: 10,
    rows: Array.from({ length: N }, (_, r) => ({
      cells: Array.from({ length: N }, (_, c) => {
        const v = s.board[r * N + c] ?? null;
        return { w: 34, h: 34, fill: v === null ? C.surface : seatColor(v), border: last.has(r * N + c) ? C.ink : undefined };
      }),
    })),
  };
};
