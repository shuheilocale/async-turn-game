import { Bridge } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

const CELL = 28;
const GAP = 3;

/** 六角の盤を、行ごとに半マスずつ右へずらした丸の並びで描く。勝った道は枠で示す */
export default (s: Bridge.BridgeState): Snapshot => {
  const path = new Set(s.winPath ?? []);
  const N = Bridge.SIZE;
  return {
    gap: GAP,
    background: C.surface2,
    padding: 8,
    radius: 10,
    rows: Array.from({ length: N }, (_, r) => ({
      offset: (r * (CELL + GAP)) / 2,
      cells: Array.from({ length: N }, (_, c) => {
        const i = r * N + c;
        const v = s.board[i] ?? null;
        return {
          w: CELL,
          h: CELL,
          dot: {
            size: CELL - 2,
            fill: v === null ? C.surface : seatColor(v),
            border: path.has(i) || s.lastMove === i ? C.ink : v === null ? C.line : undefined,
          },
        };
      }),
    })),
  };
};
