import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * かぶせマルバツ：3×3 の盤で、大・中・小のコマを 2 つずつ使うマルバツ。
 * 空いているマスか、自分より小さいコマの上に置ける（相手のコマにも自分のコマにも）。
 * 手持ちから置く代わりに、盤上で一番上にある自分のコマを別のマスへ動かしてもよい。
 * 一番上に見えているコマが 3 つ並んだら勝ち。動かした結果、相手の列が見えたら相手の勝ち。
 */

/** 0 = 小, 1 = 中, 2 = 大 */
export type Size = 0 | 1 | 2;

export interface Piece {
  seat: Seat;
  size: Size;
}

export interface GobbleMove {
  from: { kind: "hand"; size: Size } | { kind: "board"; index: number };
  to: number;
}

export interface GobbleState {
  /** マスごとのコマの重なり。先頭が一番下、末尾が見えているコマ */
  board: Piece[][];
  /** 手持ちの数。[席][大きさ] */
  hands: [[number, number, number], [number, number, number]];
  turn: Seat;
  lastMove: GobbleMove | null;
  winLine: number[] | null;
  winner: Seat | null;
  moveCount: number;
  finished: boolean;
}

/** この手数で決着がつかなければ引き分け（コマを動かし続けて終わらないのを防ぐ） */
export const MAX_MOVES = 20;
export const PIECES_PER_SIZE = 2;

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const top = (stack: Piece[]): Piece | undefined => stack[stack.length - 1];

/** そのコマを置けるマスか（空き、または一番上が自分より小さい） */
export const canCover = (stack: Piece[], size: Size) => (top(stack)?.size ?? -1) < size;

function lineOf(board: Piece[][], seat: Seat): number[] | null {
  return LINES.find((line) => line.every((i) => top(board[i]!)?.seat === seat)) ?? null;
}

const isSize = (v: unknown): v is Size => v === 0 || v === 1 || v === 2;
const isCell = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 9;

export const gobble: GameDefinition<GobbleState, GobbleMove> = {
  id: "gobble",

  initialState() {
    const full = (): [number, number, number] => [PIECES_PER_SIZE, PIECES_PER_SIZE, PIECES_PER_SIZE];
    return {
      board: Array.from({ length: 9 }, () => []),
      hands: [full(), full()],
      turn: 0,
      lastMove: null,
      winLine: null,
      winner: null,
      moveCount: 0,
      finished: false,
    };
  },

  status(state): GameStatus {
    return state.finished ? { kind: "finished", winner: state.winner } : { kind: "playing", turn: state.turn };
  },

  applyMove(state, move, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");

    const board = state.board.map((stack) => [...stack]);
    const hands = state.hands.map((h) => [...h]) as GobbleState["hands"];
    let piece: Piece;
    if (move.from.kind === "hand") {
      if (hands[seat][move.from.size] === 0) throw new IllegalMoveError("no_piece");
      hands[seat][move.from.size]--;
      piece = { seat, size: move.from.size };
    } else {
      const source = board[move.from.index]!;
      const lifted = top(source);
      if (!lifted || lifted.seat !== seat) throw new IllegalMoveError("not_your_piece");
      if (move.from.index === move.to) throw new IllegalMoveError("cannot_place");
      source.pop();
      piece = lifted;
    }
    if (!canCover(board[move.to]!, piece.size)) throw new IllegalMoveError("cannot_place");
    board[move.to]!.push(piece);

    const moveCount = state.moveCount + 1;
    // 動かして相手の列を見せてしまったら、自分の列がそろっていても相手の勝ち
    const theirs = lineOf(board, other(seat));
    const mine = theirs ? null : lineOf(board, seat);
    const winner = theirs ? other(seat) : mine ? seat : null;
    const finished = winner !== null || moveCount >= MAX_MOVES;
    return {
      board,
      hands,
      turn: finished ? seat : other(seat),
      lastMove: move,
      winLine: theirs ?? mine,
      winner,
      moveCount,
      finished,
    };
  },

  parseMove(raw) {
    const m = raw as { from?: { kind?: unknown; size?: unknown; index?: unknown }; to?: unknown } | null;
    if (!m || !isCell(m.to) || !m.from) return null;
    if (m.from.kind === "hand" && isSize(m.from.size)) return { from: { kind: "hand", size: m.from.size }, to: m.to };
    if (m.from.kind === "board" && isCell(m.from.index)) return { from: { kind: "board", index: m.from.index }, to: m.to };
    return null;
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    const moves: GobbleMove[] = [];
    const cells = state.board.map((_, i) => i);
    // 手持ちから置く手（同じ大きさは 1 つ分だけ数える）
    for (const size of [0, 1, 2] as const) {
      if (state.hands[seat][size] === 0) continue;
      for (const to of cells) if (canCover(state.board[to]!, size)) moves.push({ from: { kind: "hand", size }, to });
    }
    // 盤上で一番上にある自分のコマを、別のマスへ動かす手
    state.board.forEach((stack, index) => {
      const piece = top(stack);
      if (piece?.seat !== seat) return;
      for (const to of cells) {
        if (to !== index && canCover(state.board[to]!, piece.size)) moves.push({ from: { kind: "board", index }, to });
      }
    });
    return moves;
  },
};
