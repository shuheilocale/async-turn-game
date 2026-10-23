import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * ニム（棒取り）：1・3・5・7 本の棒が 4 段に並んでいる。交互に、どれか 1 つの段から
 * 好きな本数（1 本以上）を取る。最後の 1 本を取った方の負け。
 */

export const ROWS = [1, 3, 5, 7] as const;

export interface NimMove {
  row: number;
  count: number;
}

export interface NimState {
  /** 段ごとの残りの本数 */
  rows: number[];
  turn: Seat;
  lastMove: (NimMove & { seat: Seat }) | null;
  finished: boolean;
}

export const nim: GameDefinition<NimState, NimMove> = {
  id: "nim",

  initialState() {
    return { rows: [...ROWS], turn: 0, lastMove: null, finished: false };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    // 最後の 1 本を取った人の負け
    return { kind: "finished", winner: other(state.lastMove!.seat) };
  },

  applyMove(state, { row, count }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (count < 1 || count > state.rows[row]!) throw new IllegalMoveError("cannot_take");

    const rows = [...state.rows];
    rows[row]! -= count;
    const finished = rows.every((n) => n === 0);
    return { rows, turn: finished ? seat : other(seat), lastMove: { row, count, seat }, finished };
  },

  parseMove(raw) {
    const m = raw as { row?: unknown; count?: unknown } | null;
    const row = m?.row;
    const count = m?.count;
    if (!Number.isInteger(row) || (row as number) < 0 || (row as number) >= ROWS.length) return null;
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > ROWS[row as number]!) return null;
    return { row: row as number, count: count as number };
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    return state.rows.flatMap((n, row) => Array.from({ length: n }, (_, i) => ({ row, count: i + 1 })));
  },
};
