import { Boxes } from "@atg/core";
import { C, seatColor, type SnapCell, type Snapshot } from "../snapshot.ts";

const DOT = 8;
const SPAN = 40;
const UNDRAWN = "#e3e7ee";

/** 点・線・箱を 7×7 のマス目に並べて描く（偶数番目が点と線、奇数番目が線と箱） */
export default (s: Boxes.BoxesState): Snapshot => {
  const N = Boxes.SIZE;
  const edgeIndex = new Map<string, number>();
  for (let e = 0; e < Boxes.EDGES; e++) {
    const { dir, row, col } = Boxes.edgeAt(e);
    edgeIndex.set(`${dir}${row},${col}`, e);
  }
  const edge = (dir: "h" | "v", row: number, col: number, w: number, h: number): SnapCell => {
    const e = edgeIndex.get(`${dir}${row},${col}`)!;
    const by = s.edges[e] ?? null;
    return { w, h, radius: 3, fill: by === null ? UNDRAWN : seatColor(by), border: s.lastMove?.edge === e ? C.ink : undefined };
  };
  const rows = [];
  for (let r = 0; r <= N; r++) {
    // 点と横線の行
    rows.push({
      cells: Array.from({ length: N * 2 + 1 }, (_, k) =>
        k % 2 === 0 ? { w: DOT, h: DOT, radius: DOT / 2, fill: C.ink } : edge("h", r, (k - 1) / 2, SPAN, DOT),
      ),
    });
    if (r === N) break;
    // 縦線と箱の行
    rows.push({
      cells: Array.from({ length: N * 2 + 1 }, (_, k) => {
        if (k % 2 === 0) return edge("v", r, k / 2, DOT, SPAN);
        const owner = s.boxes[r * N + (k - 1) / 2] ?? null;
        return { w: SPAN, h: SPAN, fill: owner === null ? C.surface : owner === 0 ? C.p0Soft : C.p1Soft };
      }),
    });
  }
  return { gap: 0, background: C.surface, padding: 6, radius: 10, rows };
};
