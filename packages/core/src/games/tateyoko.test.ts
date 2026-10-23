import { describe, expect, it } from "vitest";
import { IllegalMoveError, other, type Seat } from "../types.ts";
import { placeable, SIZE, tateyoko, type TateyokoState } from "./tateyoko.ts";

/** 先手から交互に、棒の起点のマスを並べて指す */
function play(cells: number[]): TateyokoState {
  let s = tateyoko.initialState(Math.random);
  cells.forEach((cell, i) => {
    s = tateyoko.applyMove(s, { cell }, (i % 2) as Seat);
  });
  return s;
}

/** 決まった順に値を返す乱数（テストを毎回同じにするため） */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

// マスの番号（行優先）
//  0  1  2  3  4
//  5  6  7  8  9
// 10 11 12 13 14
// 15 16 17 18 19
// 20 21 22 23 24

describe("tateyoko", () => {
  it("5×5 の空の盤から先手ではじまり、どちらも 20 か所に置ける", () => {
    const s = tateyoko.initialState(Math.random);
    expect(s.board).toHaveLength(SIZE * SIZE);
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(s.bars).toEqual([]);
    expect(s.lastMove).toBeNull();
    expect(tateyoko.status(s)).toEqual({ kind: "playing", turn: 0 });
    expect(placeable(s.board, 0)).toHaveLength(20);
    expect(placeable(s.board, 1)).toHaveLength(20);
  });

  it("先手は起点から下へ、後手は起点から右へ 2 マスを埋める", () => {
    const s = play([7, 13]);
    expect(s.board[7]).toBe(0);
    expect(s.board[12]).toBe(0);
    expect(s.board[13]).toBe(1);
    expect(s.board[14]).toBe(1);
    expect(s.board.filter((c) => c !== null)).toHaveLength(4);
    expect(s.bars).toEqual([
      { seat: 0, cell: 7 },
      { seat: 1, cell: 13 },
    ]);
    expect(s.lastMove).toEqual({ seat: 1, cell: 13 });
    expect(tateyoko.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("埋まっているマスに重ねては置けない", () => {
    const s = play([7]);
    // 7・12 が埋まっている。後手の 6（6・7）も 12（12・13）も重なる
    expect(() => tateyoko.applyMove(s, { cell: 6 }, 1)).toThrow(IllegalMoveError);
    expect(() => tateyoko.applyMove(s, { cell: 12 }, 1)).toThrow(IllegalMoveError);
    // 先手の 2（2・7）も重なる
    const s2 = play([7, 0]);
    expect(() => tateyoko.applyMove(s2, { cell: 2 }, 0)).toThrow(IllegalMoveError);
  });

  it("盤からはみ出す置き方はできない（先手は一番下の段、後手は一番右の列を起点にできない）", () => {
    const s = tateyoko.initialState(Math.random);
    for (const cell of [20, 22, 24]) expect(() => tateyoko.applyMove(s, { cell }, 0)).toThrow(IllegalMoveError);
    const s1 = play([0]);
    for (const cell of [4, 9, 24]) expect(() => tateyoko.applyMove(s1, { cell }, 1)).toThrow(IllegalMoveError);
    // 一番右の列は先手なら起点にできる。一番下の段は後手なら起点にできる
    expect(() => tateyoko.applyMove(s, { cell: 4 }, 0)).not.toThrow();
    expect(() => tateyoko.applyMove(s1, { cell: 20 }, 1)).not.toThrow();
  });

  it("自分の番でなければ置けない", () => {
    const s = tateyoko.initialState(Math.random);
    expect(() => tateyoko.applyMove(s, { cell: 0 }, 1)).toThrow(IllegalMoveError);
  });

  it("後手が置けなくなったら、その直前に指した先手の勝ち", () => {
    // 左から 2 列目と 4 列目が埋まると、どの段にも横に 2 つ続く空きがなくなる
    const moves = [1, 20, 3, 12, 0, 18, 9, 22];
    const before = play(moves);
    expect(tateyoko.status(before)).toEqual({ kind: "playing", turn: 0 });
    expect(placeable(before.board, 1).length).toBeGreaterThan(0);

    const s = play([...moves, 11]);
    expect(placeable(s.board, 1)).toEqual([]);
    expect(tateyoko.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.lastMove).toEqual({ seat: 0, cell: 11 });
    expect(() => tateyoko.applyMove(s, { cell: 15 }, 1)).toThrow(IllegalMoveError);
    expect(() => tateyoko.applyMove(s, { cell: 10 }, 0)).toThrow(IllegalMoveError);
  });

  it("自分が置けなくなっても、相手が置けるうちは続き、相手が指したあとに負けが決まる", () => {
    // 7 手目で上から 2 段目と 4 段目が埋まり、先手（縦）はもう置けない。それでも後手は置けるので続く
    const moves = [4, 5, 10, 7, 18, 16, 19];
    const before = play(moves);
    expect(placeable(before.board, 0)).toEqual([]);
    expect(placeable(before.board, 1).length).toBeGreaterThan(0);
    expect(tateyoko.status(before)).toEqual({ kind: "playing", turn: 1 });

    const s = play([...moves, 0]);
    expect(tateyoko.status(s)).toEqual({ kind: "finished", winner: 1 });
  });

  it("どう指しても引き分けにならず、置けなくなった方の負けで終わる", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = seeded(seed);
      let s = tateyoko.initialState(rng);
      let moves = 0;
      while (!s.finished) {
        const turn = s.turn;
        const options = placeable(s.board, turn);
        expect(options.length).toBeGreaterThan(0);
        s = tateyoko.applyMove(s, { cell: options[Math.floor(rng() * options.length)]! }, turn);
        moves++;
      }
      // 25 マスに 2 マスの棒なので、多くても 12 手で終わる
      expect(moves).toBeLessThanOrEqual(12);
      const status = tateyoko.status(s);
      expect(status.kind).toBe("finished");
      const winner = (status as { winner: Seat | null }).winner;
      expect(winner).toBe(s.lastMove!.seat);
      expect(placeable(s.board, other(winner!))).toEqual([]);
      expect(s.bars).toHaveLength(moves);
    }
  });

  it("parseMove は盤の中のマスの番号だけ受け付ける", () => {
    expect(tateyoko.parseMove({ cell: 0 })).toEqual({ cell: 0 });
    expect(tateyoko.parseMove({ cell: 24 })).toEqual({ cell: 24 });
    expect(tateyoko.parseMove({ cell: 25 })).toBeNull();
    expect(tateyoko.parseMove({ cell: -1 })).toBeNull();
    expect(tateyoko.parseMove({ cell: 1.5 })).toBeNull();
    expect(tateyoko.parseMove({ cell: "3" })).toBeNull();
    expect(tateyoko.parseMove({})).toBeNull();
    expect(tateyoko.parseMove(null)).toBeNull();
  });
});
