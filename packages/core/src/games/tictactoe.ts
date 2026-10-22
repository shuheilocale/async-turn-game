import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";
import { findLine } from "./lines.ts";

/** null = 空き, 0 = ○(先手), 1 = ×(後手) */
export type Cell = Seat | null;

export interface TicTacToeMove {
  index: number;
}

export interface TicTacToeState {
  board: Cell[];
  turn: Seat;
  lastMove: number | null;
  /** 3 つそろった位置。そろっていなければ null */
  winLine: number[] | null;
  finished: boolean;
}

export const tictactoe: GameDefinition<TicTacToeState, TicTacToeMove> = {
  id: "tictactoe",

  initialState() {
    return { board: Array(9).fill(null), turn: 0, lastMove: null, winLine: null, finished: false };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    return { kind: "finished", winner: state.winLine ? state.board[state.winLine[0]!]! : null };
  },

  applyMove(state, { index }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (state.board[index] !== null) throw new IllegalMoveError("cannot_place");

    const board = [...state.board];
    board[index] = seat;
    const winLine = findLine(board, 3, index, 3);
    const finished = winLine !== null || board.every((c) => c !== null);
    return { board, turn: finished ? seat : other(seat), lastMove: index, winLine, finished };
  },

  parseMove(raw) {
    const index = (raw as { index?: unknown } | null)?.index;
    return Number.isInteger(index) && (index as number) >= 0 && (index as number) < 9 ? { index: index as number } : null;
  },
};
