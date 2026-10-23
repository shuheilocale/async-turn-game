import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import { bridge, canSwap, indexOf, neighbors, SIZE, type BridgeMove, type BridgeState } from "./bridge.ts";

/** マス番号の並びを、先手から交互に置いていく */
function play(moves: (number | "swap")[]): BridgeState {
  let s = bridge.initialState(Math.random);
  moves.forEach((m, i) => {
    const move: BridgeMove = m === "swap" ? { swap: true } : { cell: m };
    s = bridge.applyMove(s, move, (i % 2) as Seat);
  });
  return s;
}

describe("bridge", () => {
  it("5×5 の盤がすべて空きで、先手の番からはじまる", () => {
    const s = bridge.initialState(Math.random);
    expect(s.board).toHaveLength(SIZE * SIZE);
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(bridge.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("となりは (r-1,c) (r-1,c+1) (r,c-1) (r,c+1) (r+1,c-1) (r+1,c) の 6 マス", () => {
    expect(neighbors(indexOf(2, 2)).sort((a, b) => a - b)).toEqual(
      [indexOf(1, 2), indexOf(1, 3), indexOf(2, 1), indexOf(2, 3), indexOf(3, 1), indexOf(3, 2)].sort((a, b) => a - b),
    );
    // 角のマスは盤の外を数えない
    expect(neighbors(indexOf(0, 0)).sort((a, b) => a - b)).toEqual([indexOf(0, 1), indexOf(1, 0)]);
  });

  it("先手が上の辺と下の辺をつないだら勝ち。勝った道は上から下の順", () => {
    // 先手：2・7・12・17・22（まっすぐ下へ）  後手：0・5・10・15
    const s = play([2, 0, 7, 5, 12, 10, 17, 15, 22]);
    expect(bridge.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winPath).toEqual([2, 7, 12, 17, 22]);
    expect(s.lastMove).toBe(22);
  });

  it("(r+1,c-1) の向きでもつながる", () => {
    // 先手：(0,4) (1,3) (2,2) (3,1) (4,0) のななめ
    const s = play([4, 0, 8, 1, 12, 2, 16, 3, 20]);
    expect(bridge.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winPath).toEqual([4, 8, 12, 16, 20]);
  });

  it("後手が左の辺と右の辺をつないだら勝ち。勝った道は左から右の順", () => {
    // 後手：10〜14（まん中の行）  先手：0・1・2・3・20（上の行と下の行で、つながっていない）
    const s = play([0, 10, 1, 11, 2, 12, 3, 13, 20, 14]);
    expect(bridge.status(s)).toEqual({ kind: "finished", winner: 1 });
    expect(s.winPath).toEqual([10, 11, 12, 13, 14]);
  });

  it("勝った道には、つながっていても遠回りの石は入らない", () => {
    // 先手：2・7・12・17・22 のほかに、12 のとなりの 13・14 も持っている
    const s = play([2, 0, 13, 5, 14, 10, 7, 15, 12, 1, 17, 3, 22]);
    expect(bridge.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winPath).toEqual([2, 7, 12, 17, 22]);
  });

  it("つながっていなければ続く", () => {
    // 先手：(0,0) (1,1) (2,2) (3,3) (4,4)。(r+1,c+1) はとなりではないので、つながらない
    const s = play([0, 1, 6, 2, 12, 3, 18, 4, 24]);
    expect(bridge.status(s)).toEqual({ kind: "playing", turn: 1 });
    expect(s.winPath).toBeNull();
  });

  it("先手が左右をつないでも勝ちにはならない", () => {
    // 先手：まん中の行 10〜14  後手：0〜3
    const s = play([10, 0, 11, 1, 12, 2, 13, 3, 14]);
    expect(bridge.status(s)).toEqual({ kind: "playing", turn: 1 });
  });

  it("盤が埋まる前にかならずどちらかが勝つ（引き分けはない）", () => {
    let s = bridge.initialState(Math.random);
    for (let i = 0; i < SIZE * SIZE && !s.finished; i++) s = bridge.applyMove(s, { cell: i }, s.turn);
    expect(bridge.status(s)).toMatchObject({ kind: "finished" });
    expect(s.winner).not.toBeNull();
  });

  it("後手は最初の手番に入れ替えられる。先手の石 (r,c) が (c,r) の後手の石になり、先手の番に戻る", () => {
    const first = play([indexOf(1, 3)]);
    expect(canSwap(first)).toBe(true);
    const s = bridge.applyMove(first, { swap: true }, 1);
    expect(s.board[indexOf(1, 3)]).toBeNull();
    expect(s.board[indexOf(3, 1)]).toBe(1);
    expect(s.board.filter((c) => c !== null)).toHaveLength(1);
    expect(s.lastMove).toBe(indexOf(3, 1));
    expect(s.swapped).toBe(true);
    expect(bridge.status(s)).toEqual({ kind: "playing", turn: 0 });
    // 取りのぞかれたマスには、また置ける
    const next = bridge.applyMove(s, { cell: indexOf(1, 3) }, 0);
    expect(next.board[indexOf(1, 3)]).toBe(0);
  });

  it("ななめの線の上の石を入れ替えると、同じマスが後手の石になる", () => {
    const s = play([indexOf(2, 2), "swap"]);
    expect(s.board[indexOf(2, 2)]).toBe(1);
    expect(s.lastMove).toBe(indexOf(2, 2));
  });

  it("入れ替えは後手の最初の手番だけ", () => {
    // 先手の最初の手番にはできない
    expect(() => bridge.applyMove(bridge.initialState(Math.random), { swap: true }, 0)).toThrow("bridge_cannot_swap");
    // 後手がふつうに置いたあとはできない
    const later = play([12, 0, 1]);
    expect(canSwap(later)).toBe(false);
    expect(() => bridge.applyMove(later, { swap: true }, 1)).toThrow("bridge_cannot_swap");
    // 入れ替えたあと、もう一度は入れ替えられない
    const swapped = play([12, "swap", 7]);
    expect(canSwap(swapped)).toBe(false);
    expect(() => bridge.applyMove(swapped, { swap: true }, 1)).toThrow("bridge_cannot_swap");
  });

  it("埋まったマスには置けない", () => {
    const s = play([12]);
    expect(() => bridge.applyMove(s, { cell: 12 }, 1)).toThrow(IllegalMoveError);
    expect(() => bridge.applyMove(s, { cell: 12 }, 1)).toThrow("cannot_place");
  });

  it("手番でなければ置けない・終わったあとは置けない", () => {
    const s = play([12]);
    expect(() => bridge.applyMove(s, { cell: 0 }, 0)).toThrow("not_your_turn");
    const done = play([2, 0, 7, 5, 12, 10, 17, 15, 22]);
    expect(() => bridge.applyMove(done, { cell: 24 }, 1)).toThrow("game_over");
  });

  it("parseMove は盤の中のマスか、入れ替えだけ受け付ける", () => {
    expect(bridge.parseMove({ cell: 0 })).toEqual({ cell: 0 });
    expect(bridge.parseMove({ cell: 24 })).toEqual({ cell: 24 });
    expect(bridge.parseMove({ swap: true })).toEqual({ swap: true });
    expect(bridge.parseMove({ cell: 25 })).toBeNull();
    expect(bridge.parseMove({ cell: -1 })).toBeNull();
    expect(bridge.parseMove({ cell: 1.5 })).toBeNull();
    expect(bridge.parseMove({ cell: "3" })).toBeNull();
    expect(bridge.parseMove({ swap: false })).toBeNull();
    expect(bridge.parseMove({ swap: "true" })).toBeNull();
    expect(bridge.parseMove({ swap: true, cell: 3 })).toBeNull();
    expect(bridge.parseMove({})).toBeNull();
    expect(bridge.parseMove(null)).toBeNull();
  });
});
