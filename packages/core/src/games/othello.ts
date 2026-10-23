import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

export const SIZE = 8;

/** null = 空き, 0 = 黒(先手), 1 = 白(後手) */
export type Cell = Seat | null;

export interface OthelloMove {
  row: number;
  col: number;
}

export interface OthelloState {
  board: Cell[];
  turn: Seat;
  finished: boolean;
  lastMove: OthelloMove | null;
  /** 直前に相手が置けずパスになったとき、パスした側 */
  passedSeat: Seat | null;
}

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
] as const;

const index = (row: number, col: number) => row * SIZE + col;
const inside = (row: number, col: number) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;

/** (row, col) に seat が置いたときにひっくり返る石の位置 */
export function flipsFor(board: Cell[], row: number, col: number, seat: Seat): number[] {
  if (!inside(row, col) || board[index(row, col)] !== null) return [];
  const flips: number[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c) && board[index(r, c)] === other(seat)) {
      line.push(index(r, c));
      r += dr;
      c += dc;
    }
    if (line.length > 0 && inside(r, c) && board[index(r, c)] === seat) flips.push(...line);
  }
  return flips;
}

function movesFor(board: Cell[], seat: Seat): OthelloMove[] {
  const moves: OthelloMove[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (flipsFor(board, row, col, seat).length > 0) moves.push({ row, col });
    }
  }
  return moves;
}

export function countStones(board: Cell[]): [number, number] {
  let black = 0;
  let white = 0;
  for (const cell of board) {
    if (cell === 0) black++;
    else if (cell === 1) white++;
  }
  return [black, white];
}

export const othello: GameDefinition<OthelloState, OthelloMove> & {
  /** seat を省くと手番の側の手を返す */
  legalMoves(state: OthelloState, seat?: Seat): OthelloMove[];
} = {
  id: "othello",

  initialState() {
    const board: Cell[] = Array(SIZE * SIZE).fill(null);
    board[index(3, 3)] = 1;
    board[index(3, 4)] = 0;
    board[index(4, 3)] = 0;
    board[index(4, 4)] = 1;
    return { board, turn: 0, finished: false, lastMove: null, passedSeat: null };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    const [black, white] = countStones(state.board);
    return { kind: "finished", winner: black === white ? null : black > white ? 0 : 1 };
  },

  // パスは applyMove が自動で行う（置けない側の手番は来ない）ので、パスの手はない
  legalMoves(state: OthelloState, seat: Seat = state.turn) {
    return state.finished || seat !== state.turn ? [] : movesFor(state.board, seat);
  },

  applyMove(state, move, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const flips = flipsFor(state.board, move.row, move.col, seat);
    if (flips.length === 0) throw new IllegalMoveError("cannot_place");

    const board = [...state.board];
    board[index(move.row, move.col)] = seat;
    for (const i of flips) board[i] = seat;

    // 相手が置けなければパスして自分の手番が続く。両者とも置けなければ終局。
    const opponent = other(seat);
    if (movesFor(board, opponent).length > 0) {
      return { board, turn: opponent, finished: false, lastMove: move, passedSeat: null };
    }
    if (movesFor(board, seat).length > 0) {
      return { board, turn: seat, finished: false, lastMove: move, passedSeat: opponent };
    }
    return { board, turn: seat, finished: true, lastMove: move, passedSeat: null };
  },

  parseMove(raw) {
    if (typeof raw !== "object" || raw === null) return null;
    const { row, col } = raw as Record<string, unknown>;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    if (!inside(row as number, col as number)) return null;
    return { row: row as number, col: col as number };
  },
};
