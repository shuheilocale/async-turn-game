import { Billiards } from "@atg/core";
import { C, type SnapCell, type Snapshot } from "../snapshot.ts";
import { ballHex } from "../boards/billiards/colors.ts";

/**
 * 台を上から見た図（横向き。ブレイクする側が左）。木の枠の中にラシャを 10 行に分けて、
 * 1 行（5px）ごとに、球のある所に丸を、上と下の行の両端とまん中にポケットの穴を置く。球は行の高さにそろえる
 * （縦の位置は少し丸まる）。ストライプは白い縁取りの丸、手球は白い丸。
 *
 * カードでは 112px に縮めて描かれる。線の太さが 1px になるよう 1.5 倍の大きさで作り、
 * 縮めたときに箱の幅がちょうど整数になるよう、幅はすべて 1.5 の倍数にする
 */

const { HALF_L, HALF_W } = Billiards;

const K = 1.5;
/** 縮めたあとの大きさ（px）。木の枠の太さ・ラシャの幅・行の高さ・行の数 */
const PAD = 5;
const FIELD = 112 - 2 * PAD;
const ROW = 5;
const ROWS = 10;
const BALL = 5;

const FELT = "#2f7a5c";
const WOOD = "#4b2f21";
const HOLE = "#0e1012";

const dotOf = (id: number): NonNullable<SnapCell["dot"]> =>
  id === Billiards.CUE
    ? { size: BALL * K, fill: "#f6f3ea" }
    : id >= 9
      ? { size: BALL * K, fill: ballHex(id), border: C.white }
      : { size: BALL * K, fill: ballHex(id) };

export default (s: Billiards.BilliardsState): Snapshot => {
  const rows = Array.from({ length: ROWS }, (_, r) => {
    // この行に置く丸（左から順に、重ならないようにずらす）。球を先に、ポケットはあいている所だけ
    const marks: { cx: number; dot: NonNullable<SnapCell["dot"]>; pocket: boolean }[] = s.balls
      .filter((b) => Math.min(ROWS - 1, Math.max(0, Math.floor(((HALF_W - b.y) / (2 * HALF_W)) * ROWS))) === r)
      .map((b) => ({ cx: ((b.x + HALF_L) / (2 * HALF_L)) * FIELD, dot: dotOf(b.id), pocket: false }));
    if (r === 0 || r === ROWS - 1) {
      for (const cx of [BALL / 2, FIELD / 2, FIELD - BALL / 2]) marks.push({ cx, dot: { size: BALL * K, fill: HOLE }, pocket: true });
    }
    marks.sort((a, b) => a.cx - b.cx || Number(a.pocket) - Number(b.pocket));
    const placed: { from: number; dot: NonNullable<SnapCell["dot"]> }[] = [];
    let end = 0;
    for (const m of marks) {
      const want = Math.min(FIELD - BALL, Math.max(0, Math.round(m.cx - BALL / 2)));
      const from = Math.max(end, want);
      // ポケットは、球をよけてずれるなら描かない。球も右の端で入りきらなければ描かない
      if ((m.pocket && from !== want) || from > FIELD - BALL) continue;
      placed.push({ from, dot: m.dot });
      end = from + BALL;
    }
    const cells: SnapCell[] = [];
    let px = 0;
    for (const p of placed) {
      if (p.from > px) cells.push({ w: (p.from - px) * K, h: ROW * K, fill: FELT });
      cells.push({ w: BALL * K, h: ROW * K, fill: FELT, dot: p.dot });
      px = p.from + BALL;
    }
    if (px < FIELD) cells.push({ w: (FIELD - px) * K, h: ROW * K, fill: FELT });
    return { cells };
  });
  return { gap: 0, background: WOOD, padding: PAD * K, radius: 6 * K, rows };
};
