import { describe, expect, it } from "vitest";
import { IllegalMoveError, type GameDefinition, type Seat } from "../types.ts";
import { tictactoe } from "./tictactoe.ts";
import { connect4 } from "./connect4.ts";

function play<S, M>(def: GameDefinition<S, M>, moves: M[]): S {
  let state = def.initialState(Math.random);
  moves.forEach((m, i) => {
    state = def.applyMove(state, m, (i % 2) as Seat);
  });
  return state;
}

describe("tictactoe", () => {
  it("横に 3 つそろえたら勝ち", () => {
    // ○: 0,1,2  ×: 3,4
    const s = play(tictactoe, [0, 3, 1, 4, 2].map((index) => ({ index })));
    expect(tictactoe.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winLine).toEqual([0, 1, 2]);
  });

  it("埋まったら引き分け", () => {
    // ○×○ / ○×× / ×○○
    const s = play(tictactoe, [0, 1, 2, 4, 3, 5, 7, 6, 8].map((index) => ({ index })));
    expect(tictactoe.status(s)).toEqual({ kind: "finished", winner: null });
  });

  it("埋まっているマスには置けない", () => {
    const s = play(tictactoe, [{ index: 4 }]);
    expect(() => tictactoe.applyMove(s, { index: 4 }, 1)).toThrow(IllegalMoveError);
  });
});

describe("connect4", () => {
  it("下から積み上がり、縦に 4 つで勝ち", () => {
    const s = play(connect4, [0, 1, 0, 1, 0, 1, 0].map((col) => ({ col })));
    expect(connect4.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winLine).toHaveLength(4);
  });

  it("斜めの 4 つも勝ち", () => {
    // 赤が (5,0) (4,1) (3,2) (2,3) にそろう
    const s = play(connect4, [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3].map((col) => ({ col })));
    expect(connect4.status(s)).toEqual({ kind: "finished", winner: 0 });
  });

  it("埋まった列には落とせない", () => {
    const s = play(connect4, [0, 0, 0, 0, 0, 0].map((col) => ({ col })));
    expect(() => connect4.applyMove(s, { col: 0 }, 0)).toThrow(IllegalMoveError);
  });
});
