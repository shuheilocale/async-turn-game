import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import { gobble, MAX_MOVES, type GobbleMove, type GobbleState } from "./gobble.ts";

const hand = (size: 0 | 1 | 2, to: number): GobbleMove => ({ from: { kind: "hand", size }, to });
const board = (index: number, to: number): GobbleMove => ({ from: { kind: "board", index }, to });

function play(moves: GobbleMove[]): GobbleState {
  let s = gobble.initialState(Math.random);
  moves.forEach((m, i) => {
    s = gobble.applyMove(s, m, (i % 2) as Seat);
  });
  return s;
}

describe("gobble", () => {
  it("手持ちは大・中・小が 2 つずつ", () => {
    const s = gobble.initialState(Math.random);
    expect(s.hands).toEqual([
      [2, 2, 2],
      [2, 2, 2],
    ]);
  });

  it("見えているコマが 3 つ並んだら勝ち", () => {
    const s = play([hand(0, 0), hand(0, 3), hand(0, 1), hand(0, 4), hand(1, 2)]);
    expect(gobble.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winLine).toEqual([0, 1, 2]);
  });

  it("小さいコマには大きいコマをかぶせられるが、同じ大きさ以上にはかぶせられない", () => {
    const s = play([hand(1, 4)]);
    expect(() => gobble.applyMove(s, hand(1, 4), 1)).toThrow(IllegalMoveError);
    expect(() => gobble.applyMove(s, hand(0, 4), 1)).toThrow(IllegalMoveError);
    const next = gobble.applyMove(s, hand(2, 4), 1);
    expect(next.board[4]).toEqual([
      { seat: 0, size: 1 },
      { seat: 1, size: 2 },
    ]);
    expect(next.hands[1]).toEqual([2, 2, 1]);
  });

  it("盤上の自分のコマを動かせる。相手のコマや下に隠れたコマは動かせない", () => {
    const s = play([hand(0, 0), hand(2, 0)]);
    expect(() => gobble.applyMove(s, board(0, 1), 0)).toThrow(IllegalMoveError);
    const moved = gobble.applyMove(play([hand(1, 0), hand(0, 8)]), board(0, 4), 0);
    expect(moved.board[0]).toEqual([]);
    expect(moved.board[4]).toEqual([{ seat: 0, size: 1 }]);
  });

  it("自分のコマを動かして、隠していた相手の列が見えたら相手の勝ち", () => {
    // 後手の小（2）に先手が中をかぶせたまま、後手が 0・1 に置く
    const s = play([hand(0, 8), hand(0, 2), hand(1, 2), hand(0, 0), hand(0, 7), hand(1, 1)]);
    expect(gobble.status(s).kind).toBe("playing");
    expect(s.board[2]).toEqual([
      { seat: 1, size: 0 },
      { seat: 0, size: 1 },
    ]);
    // 先手が 2 の中を 3 へ動かすと、後手の 0・1・2 が見える
    const next = gobble.applyMove(s, board(2, 3), 0);
    expect(gobble.status(next)).toEqual({ kind: "finished", winner: 1 });
  });

  it("手持ちにない大きさは出せない", () => {
    const s = play([hand(2, 0), hand(0, 3), hand(2, 1), hand(0, 4)]);
    expect(() => gobble.applyMove(s, hand(2, 8), 0)).toThrow(IllegalMoveError);
  });

  it("同じマスへは動かせない", () => {
    const s = play([hand(1, 0), hand(0, 8)]);
    expect(() => gobble.applyMove(s, board(0, 0), 0)).toThrow(IllegalMoveError);
  });

  it("決着がつかないまま MAX_MOVES 手になったら引き分け", () => {
    // 大を 2 つずつ置いたあと、互いに大を行ったり来たりさせる（4 手で元に戻る）
    const opening = [hand(2, 0), hand(2, 8), hand(2, 2), hand(2, 6)];
    const cycle = [board(0, 4), board(8, 5), board(4, 0), board(5, 8)];
    const moves = [...opening];
    while (moves.length < MAX_MOVES) moves.push(...cycle);
    const before = play(moves.slice(0, MAX_MOVES - 1));
    expect(gobble.status(before).kind).toBe("playing");
    const s = play(moves.slice(0, MAX_MOVES));
    expect(s.moveCount).toBe(MAX_MOVES);
    expect(gobble.status(s)).toEqual({ kind: "finished", winner: null });
  });

  it("parseMove は形の正しい手だけ受け付ける", () => {
    expect(gobble.parseMove({ from: { kind: "hand", size: 2 }, to: 4 })).toEqual(hand(2, 4));
    expect(gobble.parseMove({ from: { kind: "board", index: 0 }, to: 8 })).toEqual(board(0, 8));
    expect(gobble.parseMove({ from: { kind: "hand", size: 3 }, to: 4 })).toBeNull();
    expect(gobble.parseMove({ from: { kind: "board", index: 9 }, to: 4 })).toBeNull();
    expect(gobble.parseMove({ to: 4 })).toBeNull();
  });
});
