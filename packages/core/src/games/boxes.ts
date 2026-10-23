import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * 線とり陣取り（Dots and Boxes）：4×4 の点のあいだに交互に線を 1 本ずつ引く。
 * 箱の 4 辺目を閉じた人がその箱を取り、もう 1 本続けて引く（2 箱同時でも 1 本だけ）。
 * 24 本すべて引いたら終わりで、箱の多い方の勝ち（9 箱なので引き分けはない）。
 *
 * 線の番号
 *   ・ 0 ・ 1 ・ 2 ・        横線 0〜11：上の行から 3 本ずつ（row 0〜3, col 0〜2）
 *  12   13  14  15         縦線 12〜23：上の段から 4 本ずつ（row 0〜2, col 0〜3）
 *   ・ 3 ・ 4 ・ 5 ・
 *  16   17  18  19         箱の番号は左上から 0〜8（row * 3 + col）
 *   ・ 6 ・ 7 ・ 8 ・
 *  20   21  22  23
 *   ・ 9 ・10 ・11 ・
 */

/** 1 辺あたりの箱の数（点は SIZE + 1 個） */
export const SIZE = 3;
/** 横線の本数。これより後ろの番号は縦線 */
export const H_EDGES = (SIZE + 1) * SIZE;
export const EDGES = H_EDGES * 2;
export const BOXES = SIZE * SIZE;

export interface BoxesMove {
  edge: number;
}

export interface BoxesState {
  /** 線ごとに引いた人。null = まだ引いていない */
  edges: (Seat | null)[];
  /** 箱ごとの持ち主。null = まだ閉じていない */
  boxes: (Seat | null)[];
  turn: Seat;
  lastMove: (BoxesMove & { seat: Seat }) | null;
  /** 直前の手で閉じた箱の番号（0〜2 個）。1 つ以上あれば同じ人が続けて引く */
  closed: number[];
  finished: boolean;
}

/** 線の向きと位置。横線なら row 行目の点の col 列目から右へ、縦線なら row 行目の点の col 列目から下へ */
export function edgeAt(edge: number): { dir: "h" | "v"; row: number; col: number } {
  if (edge < H_EDGES) return { dir: "h", row: Math.floor(edge / SIZE), col: edge % SIZE };
  const i = edge - H_EDGES;
  return { dir: "v", row: Math.floor(i / (SIZE + 1)), col: i % (SIZE + 1) };
}

/** 箱の 4 辺（上・下・左・右） */
export function boxEdges(box: number): number[] {
  const row = Math.floor(box / SIZE);
  const col = box % SIZE;
  const left = H_EDGES + row * (SIZE + 1) + col;
  return [row * SIZE + col, (row + 1) * SIZE + col, left, left + 1];
}

/** edge を引くと閉じる箱。edges はまだ edge を引いていない状態を渡す */
export function boxesClosedBy(edges: (Seat | null)[], edge: number): number[] {
  const { dir, row, col } = edgeAt(edge);
  // 線をはさむ 2 つの箱（盤の端なら 1 つ）
  const sides =
    dir === "h"
      ? [row > 0 && (row - 1) * SIZE + col, row < SIZE && row * SIZE + col]
      : [col > 0 && row * SIZE + col - 1, col < SIZE && row * SIZE + col];
  return sides.filter(
    (box): box is number =>
      box !== false && boxEdges(box).every((e) => e === edge || edges[e] !== null),
  );
}

export const boxes: GameDefinition<BoxesState, BoxesMove> = {
  id: "boxes",

  initialState() {
    return {
      edges: Array(EDGES).fill(null),
      boxes: Array(BOXES).fill(null),
      turn: 0,
      lastMove: null,
      closed: [],
      finished: false,
    };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    const mine = state.boxes.filter((b) => b === 0).length;
    const theirs = state.boxes.filter((b) => b === 1).length;
    return { kind: "finished", winner: mine === theirs ? null : mine > theirs ? 0 : 1 };
  },

  applyMove(state, { edge }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (state.edges[edge] !== null) throw new IllegalMoveError("boxes_drawn");

    const closed = boxesClosedBy(state.edges, edge);
    const edges = [...state.edges];
    edges[edge] = seat;
    const owners = [...state.boxes];
    for (const box of closed) owners[box] = seat;
    const finished = edges.every((e) => e !== null);
    // 箱を閉じたら同じ人がもう 1 本。閉じなければ相手の番
    const turn = finished || closed.length > 0 ? seat : other(seat);
    return { edges, boxes: owners, turn, lastMove: { edge, seat }, closed, finished };
  },

  parseMove(raw) {
    const edge = (raw as { edge?: unknown } | null)?.edge;
    return Number.isInteger(edge) && (edge as number) >= 0 && (edge as number) < EDGES ? { edge: edge as number } : null;
  },
};
