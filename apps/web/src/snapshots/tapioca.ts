import { Tapioca } from "@atg/core";
import { C, seatColor, type Snapshot } from "../snapshot.ts";

/** ミルクティーの地と、空きマスの色（画面の明るい配色に合わせる） */
const TEA = "#e5c9a6";
const SLOT = "#f0e0cb";
/** タピオカは各色の濃い丸 */
const PEARL = ["#1f40ad", "#ae580d"] as const;

/**
 * グラスをミルクティー色の地で描き、タピオカは濃い丸、氷は角丸の四角（その色のうすい地に、その色の枠）で描き分ける。
 * 最後に入れたものと勝った並びは、白い縁（タピオカ）か濃い枠（氷・勝った並び）で示す
 */
export default (s: Tapioca.TapiocaState): Snapshot => {
  const win = new Set(s.winLine ?? []);
  return {
    gap: 3,
    background: TEA,
    padding: 6,
    radius: 14,
    rows: Array.from({ length: Tapioca.ROWS }, (_, r) => ({
      cells: Array.from({ length: Tapioca.COLS }, (_, c) => {
        const i = r * Tapioca.COLS + c;
        const v = s.board[i] ?? null;
        const mark = win.has(i) || s.lastMove === i;
        if (v?.piece === "ice") {
          // C は snapshot.ts が読み込み終わってから使う（このファイルは snapshot.ts から読み込まれるので、外に置くとまだない）
          return { w: 28, h: 28, fill: v.seat === 0 ? C.p0Soft : C.p1Soft, radius: 8, border: mark ? C.ink : seatColor(v.seat) };
        }
        return {
          w: 28,
          h: 28,
          fill: SLOT,
          radius: 6,
          border: win.has(i) ? C.ink : undefined,
          dot: v ? { size: 22, fill: PEARL[v.seat], border: s.lastMove === i ? C.white : undefined } : undefined,
        };
      }),
    })),
  };
};
