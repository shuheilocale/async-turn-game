import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import { nim, ROWS, type NimMove, type NimState } from "./nim.ts";

function play(moves: NimMove[]): NimState {
  let s = nim.initialState(Math.random);
  moves.forEach((m, i) => {
    s = nim.applyMove(s, m, (i % 2) as Seat);
  });
  return s;
}

describe("nim", () => {
  it("棒は 1・3・5・7 本の 4 段", () => {
    expect(nim.initialState(Math.random).rows).toEqual([...ROWS]);
  });

  it("1 つの段から 1 本以上取れる", () => {
    const s = play([{ row: 3, count: 4 }]);
    expect(s.rows).toEqual([1, 3, 5, 3]);
    expect(nim.status(s)).toEqual({ kind: "playing", turn: 1 });
  });

  it("最後の 1 本を取った方の負け", () => {
    const s = play([
      { row: 3, count: 7 },
      { row: 2, count: 5 },
      { row: 1, count: 3 },
      { row: 0, count: 1 },
    ]);
    expect(s.rows).toEqual([0, 0, 0, 0]);
    // 最後に取ったのは後手（4 手目）なので先手の勝ち
    expect(nim.status(s)).toEqual({ kind: "finished", winner: 0 });
  });

  it("残りより多くは取れない・0 本は取れない・手番でなければ取れない", () => {
    const s = nim.initialState(Math.random);
    expect(() => nim.applyMove(s, { row: 0, count: 2 }, 0)).toThrow(IllegalMoveError);
    expect(() => nim.applyMove(s, { row: 1, count: 0 }, 0)).toThrow(IllegalMoveError);
    expect(() => nim.applyMove(s, { row: 1, count: 1 }, 1)).toThrow(IllegalMoveError);
  });

  it("parseMove は段と本数が範囲内の手だけ受け付ける", () => {
    expect(nim.parseMove({ row: 2, count: 3 })).toEqual({ row: 2, count: 3 });
    expect(nim.parseMove({ row: 4, count: 1 })).toBeNull();
    expect(nim.parseMove({ row: 0, count: 0 })).toBeNull();
    expect(nim.parseMove({ row: 0, count: 1.5 })).toBeNull();
  });
});
