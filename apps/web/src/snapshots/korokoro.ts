import { Korokoro } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

/**
 * 塗ったマスを塗った色で描き、キューブのいるマスには濃い色の丸（白い縁どり）を置く。
 * 青・オレンジ・空きのどのマスの上でも目立つように。勝った並びは枠で示す
 */
export default (s: Korokoro.KorokoroState): Snapshot => {
  const N = Korokoro.SIZE;
  const win = new Set(s.winLine ?? []);
  return {
    gap: 3,
    background: C.line,
    radius: 10,
    rows: Array.from({ length: N }, (_, r) => ({
      cells: Array.from({ length: N }, (_, c) => {
        const i = r * N + c;
        const v = s.board[i] ?? null;
        return {
          w: 34,
          h: 34,
          fill: v === null ? C.surface : seatColor(v),
          border: win.has(i) ? C.ink : undefined,
          dot: s.cube.cell === i ? { size: 18, fill: C.ink, border: C.white } : undefined,
        };
      }),
    })),
  };
};
