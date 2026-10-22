import { describe, expect, it } from "vitest";
import { IllegalMoveError } from "../types.ts";
import { countStones, othello, SIZE, type Cell, type OthelloState } from "./othello.ts";

const stateFrom = (rows: string[], turn: 0 | 1): OthelloState => {
  const board: Cell[] = rows.join("").split("").map((ch) => (ch === "B" ? 0 : ch === "W" ? 1 : null));
  return { board, turn, finished: false, lastMove: null, passedSeat: null };
};

describe("othello", () => {
  it("初期配置では黒が先手で 4 か所に置ける", () => {
    const s = othello.initialState(Math.random);
    expect(othello.status(s)).toEqual({ kind: "playing", turn: 0 });
    expect(othello.legalMoves(s)).toEqual([
      { row: 2, col: 3 },
      { row: 3, col: 2 },
      { row: 4, col: 5 },
      { row: 5, col: 4 },
    ]);
  });

  it("石を置くと挟んだ石がひっくり返り、手番が移る", () => {
    const s = othello.applyMove(othello.initialState(Math.random), { row: 2, col: 3 }, 0);
    expect(countStones(s.board)).toEqual([4, 1]);
    expect(s.turn).toBe(1);
    expect(s.lastMove).toEqual({ row: 2, col: 3 });
  });

  it("手番でない側や置けない場所はエラー", () => {
    const s = othello.initialState(Math.random);
    expect(() => othello.applyMove(s, { row: 2, col: 3 }, 1)).toThrow(IllegalMoveError);
    expect(() => othello.applyMove(s, { row: 0, col: 0 }, 0)).toThrow(IllegalMoveError);
  });

  it("相手が置けないときはパスになり同じ手番が続く", () => {
    const s = stateFrom(
      [
        "BW......",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
        "BWW.....",
      ],
      0,
    );
    const next = othello.applyMove(s, { row: 0, col: 2 }, 0);
    expect(next.finished).toBe(false);
    expect(next.turn).toBe(0);
    expect(next.passedSeat).toBe(1);
    expect(othello.legalMoves(next)).toEqual([{ row: 7, col: 3 }]);
  });

  it("両者とも置けなくなったら終局し、石の多い方が勝ち", () => {
    const s = stateFrom(["BW......", ...Array(SIZE - 1).fill("........")], 0);
    const next = othello.applyMove(s, { row: 0, col: 2 }, 0);
    expect(next.finished).toBe(true);
    expect(othello.status(next)).toEqual({ kind: "finished", winner: 0 });
    expect(othello.legalMoves(next)).toEqual([]);
  });

  it("parseMove は不正な入力を弾く", () => {
    expect(othello.parseMove({ row: 1, col: 2 })).toEqual({ row: 1, col: 2 });
    expect(othello.parseMove({ row: 8, col: 0 })).toBeNull();
    expect(othello.parseMove({ row: "1", col: 2 })).toBeNull();
    expect(othello.parseMove(null)).toBeNull();
  });
});
