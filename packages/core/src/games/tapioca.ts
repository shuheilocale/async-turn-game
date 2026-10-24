import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";
import { findLine } from "./lines.ts";

/**
 * しずむタピオカ・うかぶ氷：縦長のグラス（COLS 列 × ROWS 段）に、2 人が交互に、列を 1 つ選んで
 * 自分の色の「タピオカ」か「氷」を 1 つ入れる。先手が青（バタフライピー）、後手がオレンジ（タイティー）。
 * タピオカは沈んでその列の一番下の空きに、氷は浮いてその列の一番上の空きに入る。
 * 列は下と上の両方から埋まっていき、真ん中が最後に埋まる。氷は先手 3 個・後手 4 個まで（ICE）。
 * 自分の色（タピオカと氷はまぜて数える）がたて・よこ・ななめに LINE 個並んだら勝ち。全部埋まったら引き分け。
 */

export const COLS = 5;
export const ROWS = 6;
/** 何個並んだら勝ちか */
export const LINE = 4;
/**
 * 席ごとに使える氷の数。先手が少し有利なので、後手を 1 つ多くする
 * （コンピュータ同士の対局で、先手・後手の勝ちの割合がいちばん近かった）
 */
export const ICE: readonly [number, number] = [3, 4];

export type Piece = "pearl" | "ice";

/** 入っているもの。空きは null */
export interface Cell {
  seat: Seat;
  piece: Piece;
}

export interface TapiocaMove {
  col: number;
  piece: Piece;
}

export interface TapiocaState {
  /** 行優先で、0 行目が一番上（グラスのふち側）。空きは null */
  board: (Cell | null)[];
  turn: Seat;
  /** 席ごとの残りの氷 */
  ice: [number, number];
  /** 最後に入れたマス */
  lastMove: number | null;
  /** 勝った並び（LINE 個以上並んだマス）。決着していなければ null */
  winLine: number[] | null;
  finished: boolean;
}

export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;

/** その列に入れたときに止まる位置。タピオカは一番下の空き、氷は一番上の空き。列が埋まっていれば null */
export function landingIndex(board: (Cell | null)[], col: number, piece: Piece): number | null {
  for (let k = 0; k < ROWS; k++) {
    const row = piece === "pearl" ? ROWS - 1 - k : k;
    if (board[row * COLS + col] === null) return row * COLS + col;
  }
  return null;
}

/**
 * index に入っているものが、何マス動いて止まったか（画面の動きに使う）。タピオカは空きの一番上から沈み、
 * 氷は空きの一番下から浮かぶので、入れたあとの盤で、その先（タピオカなら上、氷なら下）に続く空きの数になる
 */
export function travelOf(board: (Cell | null)[], index: number): number {
  const cell = board[index];
  if (!cell) return 0;
  const step = cell.piece === "pearl" ? -COLS : COLS;
  let n = 0;
  for (let i = index + step; i >= 0 && i < board.length && board[i] === null; i += step) n++;
  return n;
}

const isPiece = (v: unknown): v is Piece => v === "pearl" || v === "ice";

export const tapioca: GameDefinition<TapiocaState, TapiocaMove> = {
  id: "tapioca",

  initialState() {
    return {
      board: Array(COLS * ROWS).fill(null),
      turn: 0,
      ice: [ICE[0], ICE[1]],
      lastMove: null,
      winLine: null,
      finished: false,
    };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    return { kind: "finished", winner: state.winLine ? state.board[state.winLine[0]!]!.seat : null };
  },

  applyMove(state, { col, piece }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (piece === "ice" && state.ice[seat] <= 0) throw new IllegalMoveError("tapioca_no_ice");
    const index = landingIndex(state.board, col, piece);
    if (index === null) throw new IllegalMoveError("column_full");

    const board = [...state.board];
    board[index] = { seat, piece };
    const ice: [number, number] = [...state.ice];
    if (piece === "ice") ice[seat] -= 1;
    // タピオカか氷かは問わず、席だけで並びを数える
    const winLine = findLine(
      board.map((c) => c?.seat ?? null),
      COLS,
      index,
      LINE,
    );
    const finished = winLine !== null || board.every((c) => c !== null);
    return { board, turn: finished ? seat : other(seat), ice, lastMove: index, winLine, finished };
  },

  parseMove(raw) {
    const m = raw as { col?: unknown; piece?: unknown } | null;
    const col = m?.col;
    if (!Number.isInteger(col) || (col as number) < 0 || (col as number) >= COLS || !isPiece(m?.piece)) return null;
    return { col: col as number, piece: m.piece };
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    const moves: TapiocaMove[] = [];
    for (let col = 0; col < COLS; col++) {
      if (landingIndex(state.board, col, "pearl") === null) continue;
      moves.push({ col, piece: "pearl" });
      if (state.ice[seat] > 0) moves.push({ col, piece: "ice" });
    }
    return moves;
  },
};
