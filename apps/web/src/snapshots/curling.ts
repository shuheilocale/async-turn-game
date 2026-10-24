import { Curling } from "@atg/core";
import { C, seatColor, type SnapCell, type Snapshot } from "../snapshot.ts";

/**
 * ハウスのまわりを上から見た図。横はシートの幅いっぱい、縦はハウスの手前から奥の線まで。
 * 1 行（8px）ごとに、ハウスの色の区切りで横に長い箱を並べ、石のある所に丸を置く。
 * 石は行の高さにそろえて置く（縦の位置は少し丸まる）。ハウスより手前の石（ガード）は描かない。
 *
 * カードでは 112px に縮めて描かれる。線の太さが 1px になるよう 1.5 倍の大きさで作り、
 * 縮めたときに箱の幅がちょうど整数になるよう、幅はすべて 1.5 の倍数にする
 */

const { SHEET_W, TEE_Y, RINGS } = Curling;

/** 縮めたあとの大きさ（px） */
const SIZE = 112;
const K = 1.5;
/** 1 m が何 px か */
const M = SIZE / SHEET_W;
const ROW = 8;
const ROWS = SIZE / ROW;
/** 図の上の端（奥の線より少し奥） */
const TOP = TEE_Y + 2.05;
/** 石の丸の大きさ（縮めたあと） */
const STONE = 7;

/** 3D のハウスと同じ落ち着いた青・赤 */
const ICE = "#e9eff5";
const OUTER = "#5677b4";
const INNER = "#b85c6e";

function colorAt(x: number, y: number): string {
  const d = Math.hypot(x, y - TEE_Y);
  if (d <= RINGS[3]) return C.white;
  if (d <= RINGS[2]) return INNER;
  if (d <= RINGS[1]) return C.white;
  if (d <= RINGS[0]) return OUTER;
  return ICE;
}

export default (s: Curling.CurlingState): Snapshot => {
  // エンドの区切り（次のエンドの 1 投目の前）なら、終わったエンドの並びを描く
  const stones = s.thrown > 0 ? s.stones : (s.ends.at(-1)?.stones ?? []);

  const rows = Array.from({ length: ROWS }, (_, r) => {
    const y = TOP - ((r + 0.5) * ROW) / M;
    const fills = Array.from({ length: SIZE }, (_, px) => colorAt((px + 0.5) / M - SHEET_W / 2, y));

    // この行に置く石（左から順に、重ならないようにずらす）
    const here = stones
      .filter((st) => Math.floor(((TOP - st.y) * M) / ROW) === r)
      .map((st) => ({ st, cx: (st.x + SHEET_W / 2) * M }))
      .sort((a, b) => a.cx - b.cx);
    const marks: { from: number; seat: 0 | 1; under: string }[] = [];
    let end = 0;
    for (const { st, cx } of here) {
      const from = Math.min(SIZE - ROW, Math.max(end, Math.round(cx - ROW / 2)));
      // 右の端で入りきらなければ描かない
      if (from < end) continue;
      marks.push({ from, seat: st.seat, under: fills[Math.min(SIZE - 1, Math.max(0, Math.round(cx)))]! });
      end = from + ROW;
    }

    const cells: SnapCell[] = [];
    let px = 0;
    let mark = 0;
    while (px < SIZE) {
      const m = marks[mark];
      if (m && m.from === px) {
        cells.push({ w: ROW * K, h: ROW * K, fill: m.under, dot: { size: STONE * K, fill: seatColor(m.seat), border: C.white } });
        px += ROW;
        mark++;
        continue;
      }
      // 同じ色が続く所を 1 つの箱にする（次の石の手前まで）
      const stop = m ? m.from : SIZE;
      let to = px + 1;
      while (to < stop && fills[to] === fills[px]) to++;
      cells.push({ w: (to - px) * K, h: ROW * K, fill: fills[px] });
      px = to;
    }
    return { cells };
  });

  return { gap: 0, background: ICE, radius: 10 * K, rows };
};
