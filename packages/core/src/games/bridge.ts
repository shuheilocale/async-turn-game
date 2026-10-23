import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * つなぎ橋（Hex と同じルール）：5×5 のひし形に並んだ六角形のマスに、交互に自分の石を 1 つ置く。
 * 先手（青）は上の辺と下の辺を、後手（オレンジ）は左の辺と右の辺を、自分の石でつないだら勝ち。
 * 盤が埋まるまでにかならずどちらかがつながるので、引き分けはない。
 * 先手が有利すぎないよう、後手は最初の手番だけ置く代わりに「入れ替え」を選べる。
 * 先手の 1 つ目の石 (r,c) を取りのぞき、(c,r) に後手の石を置いたことにして、手番は先手に戻る。
 */

export const SIZE = 5;

/** null = 空き, 0 = 青(先手), 1 = オレンジ(後手) */
export type Cell = Seat | null;

export type BridgeMove = { cell: number } | { swap: true };

export interface BridgeState {
  /** 行優先の 1 次元配列（index = r * SIZE + c）。行が下がるごとに盤は半マス右へずれる */
  board: Cell[];
  turn: Seat;
  /** 最後に石が置かれたマス。入れ替えたときは後手の石が置かれたマス */
  lastMove: number | null;
  /** 入れ替えが行われたか */
  swapped: boolean;
  /** 指した手の数（入れ替えも 1 手と数える） */
  moveCount: number;
  /** 勝った道。先手は上→下、後手は左→右の順に並んだマス。決着していなければ null */
  winPath: number[] | null;
  winner: Seat | null;
  finished: boolean;
}

export const rowOf = (i: number) => Math.floor(i / SIZE);
export const colOf = (i: number) => i % SIZE;
export const indexOf = (r: number, c: number) => r * SIZE + c;

/** となりのマスへの向き（六角形の辺どうしが接しているマス） */
const STEPS = [
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
] as const;

export function neighbors(i: number): number[] {
  const r = rowOf(i);
  const c = colOf(i);
  const result: number[] = [];
  for (const [dr, dc] of STEPS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) result.push(indexOf(nr, nc));
  }
  return result;
}

/** 入れ替えたときに後手の石が置かれるマス（(r,c) → (c,r)） */
export const mirror = (i: number) => indexOf(colOf(i), rowOf(i));

/** 入れ替えを選べるか（後手の最初の手番） */
export const canSwap = (state: BridgeState) => !state.finished && state.turn === 1 && state.moveCount === 1;

/**
 * seat の石で自分の 2 つの辺がつながっていれば、その道（石の数が一番少ないもの）を返す。
 * 先手は行 0 から行 SIZE-1 へ、後手は列 0 から列 SIZE-1 へ、幅優先でたどる。
 */
export function findPath(board: Cell[], seat: Seat): number[] | null {
  const along = seat === 0 ? rowOf : colOf;
  /** たどり着いたマス → ひとつ前のマス（出発の辺のマスは null） */
  const from = new Map<number, number | null>();
  const queue: number[] = [];
  board.forEach((cell, i) => {
    if (cell === seat && along(i) === 0) {
      from.set(i, null);
      queue.push(i);
    }
  });
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    if (along(i) === SIZE - 1) {
      const path: number[] = [];
      for (let p: number | null = i; p !== null; p = from.get(p) ?? null) path.push(p);
      return path.reverse();
    }
    for (const n of neighbors(i)) {
      if (board[n] === seat && !from.has(n)) {
        from.set(n, i);
        queue.push(n);
      }
    }
  }
  return null;
}

const isCell = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SIZE * SIZE;

export const bridge: GameDefinition<BridgeState, BridgeMove> = {
  id: "bridge",

  initialState() {
    return {
      board: Array(SIZE * SIZE).fill(null),
      turn: 0,
      lastMove: null,
      swapped: false,
      moveCount: 0,
      winPath: null,
      winner: null,
      finished: false,
    };
  },

  status(state): GameStatus {
    return state.finished ? { kind: "finished", winner: state.winner } : { kind: "playing", turn: state.turn };
  },

  applyMove(state, move, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");

    const board = [...state.board];
    let cell: number;
    if ("swap" in move) {
      if (!canSwap(state)) throw new IllegalMoveError("bridge_cannot_swap");
      // 盤の上にあるのは先手の 1 つ目の石だけ。それをななめに折り返した場所へ、後手の石として置き直す
      board[state.lastMove!] = null;
      cell = mirror(state.lastMove!);
    } else {
      cell = move.cell;
      if (board[cell] !== null) throw new IllegalMoveError("cannot_place");
    }
    board[cell] = seat;

    // つながるとしたら、いま置いた石を通る道しかない
    const winPath = findPath(board, seat);
    const finished = winPath !== null;
    return {
      board,
      turn: finished ? seat : other(seat),
      lastMove: cell,
      swapped: state.swapped || "swap" in move,
      moveCount: state.moveCount + 1,
      winPath,
      winner: finished ? seat : null,
      finished,
    };
  },

  parseMove(raw) {
    const m = raw as { cell?: unknown; swap?: unknown } | null;
    if (!m || typeof m !== "object") return null;
    if (m.swap === true && m.cell === undefined) return { swap: true };
    if (isCell(m.cell) && m.swap === undefined) return { cell: m.cell };
    return null;
  },
};
