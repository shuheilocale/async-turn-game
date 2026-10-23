import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * タテヨコ置き：5×5 の盤に、2 マス分の棒を交互に置く。先手はいつも縦、後手はいつも横。
 * 棒は空いているマスにしか置けない。自分の番に置ける場所がなくなった方の負け（引き分けはない）。
 */

export const SIZE = 5;

export interface TateyokoMove {
  /** 棒の起点のマス（行優先）。先手なら上端、後手なら左端 */
  cell: number;
}

/** 盤に置かれた棒。cell は起点のマス */
export interface Bar {
  seat: Seat;
  cell: number;
}

export interface TateyokoState {
  /** マスごとに、そこを埋めている棒の席。空きは null */
  board: (Seat | null)[];
  /** 置いた棒（置いた順）。盤の描画用 */
  bars: Bar[];
  turn: Seat;
  lastMove: Bar | null;
  finished: boolean;
}

/** 起点から棒が埋める 2 マス。盤からはみ出すなら null */
export function cellsOf(seat: Seat, cell: number): [number, number] | null {
  if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return null;
  const row = Math.floor(cell / SIZE);
  const col = cell % SIZE;
  // 先手は下のマスへ、後手は右のマスへのびる
  if (seat === 0) return row < SIZE - 1 ? [cell, cell + SIZE] : null;
  return col < SIZE - 1 ? [cell, cell + 1] : null;
}

/** その席がその起点に棒を置けるか（盤の中で、2 マスとも空いている） */
export function canPlace(board: (Seat | null)[], seat: Seat, cell: number): boolean {
  const cells = cellsOf(seat, cell);
  return !!cells && cells.every((c) => board[c] === null);
}

/** その席が置ける起点の一覧 */
export function placeable(board: (Seat | null)[], seat: Seat): number[] {
  return board.flatMap((_, cell) => (canPlace(board, seat, cell) ? [cell] : []));
}

export const tateyoko: GameDefinition<TateyokoState, TateyokoMove> = {
  id: "tateyoko",

  initialState() {
    return { board: Array(SIZE * SIZE).fill(null), bars: [], turn: 0, lastMove: null, finished: false };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    // 次の人が置けなくなった時点で終わるので、最後に指した人の勝ち
    return { kind: "finished", winner: state.lastMove!.seat };
  },

  applyMove(state, { cell }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!canPlace(state.board, seat, cell)) throw new IllegalMoveError("cannot_place");

    const board = [...state.board];
    for (const c of cellsOf(seat, cell)!) board[c] = seat;
    const bar = { seat, cell };
    // 指した直後に、次の人が置けるかを調べる。置けなければここで終局
    const finished = placeable(board, other(seat)).length === 0;
    return { board, bars: [...state.bars, bar], turn: finished ? seat : other(seat), lastMove: bar, finished };
  },

  parseMove(raw) {
    const cell = (raw as { cell?: unknown } | null)?.cell;
    return Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < SIZE * SIZE
      ? { cell: cell as number }
      : null;
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    return placeable(state.board, seat).map((cell) => ({ cell }));
  },
};
