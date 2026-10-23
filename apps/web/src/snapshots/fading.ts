import type { Fading } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

/** 次に消える印は薄い色で描く */
const FADED = ["#a9baf8", "#f9c69a"] as const;

export default (s: Fading.FadingState): Snapshot => {
  const win = new Set(s.winLine ?? []);
  const owner = (i: number) => (s.marks[0].includes(i) ? 0 : s.marks[1].includes(i) ? 1 : null);
  const fading = (seat: 0 | 1, i: number) => !s.finished && s.marks[seat].length >= 3 && s.marks[seat][0] === i;
  return {
    gap: 3,
    background: C.line,
    radius: 10,
    rows: [0, 1, 2].map((r) => ({
      cells: [0, 1, 2].map((c) => {
        const i = r * 3 + c;
        const v = owner(i);
        return {
          w: 56,
          h: 56,
          fill: win.has(i) && v !== null ? (v === 0 ? C.p0Soft : C.p1Soft) : C.surface,
          border: s.lastMove === i ? C.ink : undefined,
          mark:
            v === null
              ? undefined
              : { text: v === 0 ? "○" : "×", color: fading(v, i) ? FADED[v] : seatColor(v), size: 30 },
        };
      }),
    })),
  };
};
