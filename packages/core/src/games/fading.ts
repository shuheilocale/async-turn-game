import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";
import { findLine } from "./lines.ts";

/**
 * きえるマルバツ：3×3 のマルバツで、自分の印は盤に 3 つまで。
 * すでに 3 つあるときに置くと、自分の一番古い印が消える（消えてから新しい印を置き、そのあとで並びを判定する）。
 * 置けるのは空いているマスだけなので、次に消える自分の印のマスにも置けない。
 */

export interface FadingMove {
  index: number;
}

export interface FadingState {
  /** 席ごとの印の位置。古い順で、先頭が次に消える印 */
  marks: [number[], number[]];
  turn: Seat;
  lastMove: number | null;
  /** この手で消えた印の位置。消えなければ null */
  removed: number | null;
  /** 3 つそろった位置。そろっていなければ null */
  winLine: number[] | null;
  winner: Seat | null;
  moveCount: number;
  finished: boolean;
}

/** 盤に置いておける自分の印の数 */
export const MAX_MARKS = 3;
/** この手数で決着がつかなければ引き分け（消えては置くので、放っておくと終わらない） */
export const MAX_MOVES = 30;

/** 印の位置から盤（null = 空き, 0 = ○, 1 = ×）を作る */
export function boardOf(marks: FadingState["marks"]): (Seat | null)[] {
  const board: (Seat | null)[] = Array(9).fill(null);
  marks.forEach((cells, seat) => cells.forEach((i) => (board[i] = seat as Seat)));
  return board;
}

/** 次に置いたら消える印の位置。印がまだ 3 つなければ null */
export const nextToFade = (marks: FadingState["marks"], seat: Seat): number | null =>
  marks[seat].length >= MAX_MARKS ? marks[seat][0]! : null;

export const fading: GameDefinition<FadingState, FadingMove> = {
  id: "fading",

  initialState() {
    return {
      marks: [[], []],
      turn: 0,
      lastMove: null,
      removed: null,
      winLine: null,
      winner: null,
      moveCount: 0,
      finished: false,
    };
  },

  status(state): GameStatus {
    return state.finished ? { kind: "finished", winner: state.winner } : { kind: "playing", turn: state.turn };
  },

  applyMove(state, { index }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    // 消える前の盤で空きを確かめるので、次に消える自分の印のマスには置けない
    if (boardOf(state.marks)[index] !== null) throw new IllegalMoveError("cannot_place");

    const marks = state.marks.map((cells) => [...cells]) as FadingState["marks"];
    const removed = marks[seat].length >= MAX_MARKS ? marks[seat].shift()! : null;
    marks[seat].push(index);

    const moveCount = state.moveCount + 1;
    const winLine = findLine(boardOf(marks), 3, index, 3);
    const winner = winLine ? seat : null;
    const finished = winner !== null || moveCount >= MAX_MOVES;
    return { marks, turn: finished ? seat : other(seat), lastMove: index, removed, winLine, winner, moveCount, finished };
  },

  parseMove(raw) {
    const index = (raw as { index?: unknown } | null)?.index;
    return Number.isInteger(index) && (index as number) >= 0 && (index as number) < 9 ? { index: index as number } : null;
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    // applyMove と同じく消える前の盤で空きを見る（次に消える自分の印のマスは含めない）
    return boardOf(state.marks).flatMap((c, index) => (c === null ? [{ index }] : []));
  },
};
