import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";
import { findLine } from "./lines.ts";

export const COLS = 7;
export const ROWS = 6;

/** null = 空き, 0 = 赤(先手), 1 = 黄(後手)。行優先で、0 行目が一番上 */
export type Cell = Seat | null;

export interface Connect4Move {
  col: number;
}

export interface Connect4State {
  board: Cell[];
  turn: Seat;
  lastMove: number | null;
  winLine: number[] | null;
  finished: boolean;
}

/** その列に落としたときに止まる位置。列が埋まっていれば null */
export function landingIndex(board: Cell[], col: number): number | null {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row * COLS + col] === null) return row * COLS + col;
  }
  return null;
}

export const connect4: GameDefinition<Connect4State, Connect4Move> = {
  id: "connect4",

  initialState() {
    return { board: Array(COLS * ROWS).fill(null), turn: 0, lastMove: null, winLine: null, finished: false };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    return { kind: "finished", winner: state.winLine ? state.board[state.winLine[0]!]! : null };
  },

  applyMove(state, { col }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const index = landingIndex(state.board, col);
    if (index === null) throw new IllegalMoveError("column_full");

    const board = [...state.board];
    board[index] = seat;
    const winLine = findLine(board, COLS, index, 4);
    const finished = winLine !== null || board.every((c) => c !== null);
    return { board, turn: finished ? seat : other(seat), lastMove: index, winLine, finished };
  },

  parseMove(raw) {
    const col = (raw as { col?: unknown } | null)?.col;
    return Number.isInteger(col) && (col as number) >= 0 && (col as number) < COLS ? { col: col as number } : null;
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    return Array.from({ length: COLS }, (_, col) => ({ col })).filter(({ col }) => landingIndex(state.board, col) !== null);
  },
};
