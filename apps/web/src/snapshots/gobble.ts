import { Gobble } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

/** 小・中・大のコマの直径 */
const DOT = [18, 30, 44];

export default (s: Gobble.GobbleState): Snapshot => {
  const win = new Set(s.winLine ?? []);
  return {
    gap: 3,
    background: C.line,
    radius: 10,
    rows: [0, 1, 2].map((r) => ({
      cells: [0, 1, 2].map((c) => {
        const i = r * 3 + c;
        const top = Gobble.top(s.board[i] ?? []);
        return {
          w: 56,
          h: 56,
          fill: win.has(i) && top ? (top.seat === 0 ? C.p0Soft : C.p1Soft) : C.surface,
          border: s.lastMove?.to === i ? C.ink : undefined,
          dot: top ? { size: DOT[top.size]!, fill: seatColor(top.seat) } : undefined,
        };
      }),
    })),
  };
};
