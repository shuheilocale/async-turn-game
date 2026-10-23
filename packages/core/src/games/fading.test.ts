import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import { boardOf, fading, MAX_MARKS, MAX_MOVES, type FadingState } from "./fading.ts";

/** 先手から交互に、マスの番号で指していく */
function play(cells: number[]): FadingState {
  let s = fading.initialState(Math.random);
  cells.forEach((index, i) => {
    s = fading.applyMove(s, { index }, (i % 2) as Seat);
  });
  return s;
}

// ○: 0, 1, 6  ×: 4, 2, 3 と置いた局面。どちらも印が 3 つで、まだ並んでいない
const SIX = [0, 4, 1, 2, 6, 3];

describe("fading", () => {
  it("縦・横・斜めに 3 つ並べたら勝ち", () => {
    // ○: 0, 1, 2  ×: 3, 4
    const s = play([0, 3, 1, 4, 2]);
    expect(fading.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winLine).toEqual([0, 1, 2]);
  });

  it("印は古い順に持ち、3 つまではどれも消えない", () => {
    const s = play(SIX);
    expect(s.marks).toEqual([
      [0, 1, 6],
      [4, 2, 3],
    ]);
    expect(s.removed).toBeNull();
    expect(s.lastMove).toBe(3);
    expect(fading.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("4 つ目を置くと、自分の一番古い印が消える", () => {
    const s = play([...SIX, 8]);
    expect(s.marks[0]).toEqual([1, 6, 8]);
    expect(s.marks[1]).toEqual([4, 2, 3]);
    expect(s.removed).toBe(0);
    expect(s.lastMove).toBe(8);
    expect(boardOf(s.marks)[0]).toBeNull();
    expect(fading.status(s)).toEqual({ kind: "playing", turn: 1 });
  });

  it("消えたマスには次から置ける。消える印がなければ removed は null に戻る", () => {
    const s = play([...SIX, 8, 0]);
    expect(s.marks[1]).toEqual([2, 3, 0]);
    expect(s.removed).toBe(4);
    const early = play([0, 4]);
    expect(early.removed).toBeNull();
  });

  it("次に消える自分の印のマスや、埋まっているマスには置けない", () => {
    const s = play(SIX);
    expect(() => fading.applyMove(s, { index: 0 }, 0)).toThrow(IllegalMoveError);
    expect(() => fading.applyMove(s, { index: 1 }, 0)).toThrow(IllegalMoveError);
    expect(() => fading.applyMove(s, { index: 4 }, 0)).toThrow(IllegalMoveError);
  });

  it("消えてから並びを判定する（消える印を含む並びは数えない）", () => {
    // ○: 0, 1, 7  ×: 4, 3, 8 のあと、○ が 2 に置いても 0 が先に消えるので並ばない
    const s = play([0, 4, 1, 3, 7, 8, 2]);
    expect(s.marks[0]).toEqual([1, 7, 2]);
    expect(s.winLine).toBeNull();
    expect(fading.status(s)).toEqual({ kind: "playing", turn: 1 });
  });

  it("古い印が消えたあと、残りの 2 つと新しい印で並べば勝ち", () => {
    // ○: 1, 6, 8 のあと 7 に置くと 1 が消えて 6・7・8 が並ぶ
    const s = play([...SIX, 8, 0, 7]);
    expect(s.removed).toBe(1);
    expect(s.winLine).toEqual([6, 7, 8]);
    expect(fading.status(s)).toEqual({ kind: "finished", winner: 0 });
  });

  it(`${MAX_MOVES} 手で決着がつかなければ引き分け`, () => {
    // ○ は 0・1・5・6、× は 2・3・4・7 をくり返す。どの 3 つも並びにならない
    const cycle = [0, 2, 1, 3, 5, 4, 6, 7];
    const cells = Array.from({ length: MAX_MOVES }, (_, i) => cycle[i % cycle.length]!);
    const before = play(cells.slice(0, -1));
    expect(fading.status(before)).toEqual({ kind: "playing", turn: 1 });
    expect(before.marks.every((m) => m.length === MAX_MARKS)).toBe(true);
    const s = play(cells);
    expect(s.moveCount).toBe(MAX_MOVES);
    expect(fading.status(s)).toEqual({ kind: "finished", winner: null });
    expect(() => fading.applyMove(s, { index: 8 }, 0)).toThrow(IllegalMoveError);
  });

  it("手番でなければ置けない・終局後は置けない", () => {
    const s = fading.initialState(Math.random);
    expect(() => fading.applyMove(s, { index: 0 }, 1)).toThrow(IllegalMoveError);
    const won = play([0, 3, 1, 4, 2]);
    expect(() => fading.applyMove(won, { index: 5 }, 1)).toThrow(IllegalMoveError);
  });

  it("parseMove は 0〜8 の整数のマスだけ受け付ける", () => {
    expect(fading.parseMove({ index: 4 })).toEqual({ index: 4 });
    expect(fading.parseMove({ index: 0 })).toEqual({ index: 0 });
    expect(fading.parseMove({ index: 9 })).toBeNull();
    expect(fading.parseMove({ index: -1 })).toBeNull();
    expect(fading.parseMove({ index: 1.5 })).toBeNull();
    expect(fading.parseMove({ index: "4" })).toBeNull();
    expect(fading.parseMove(null)).toBeNull();
    expect(fading.parseMove({})).toBeNull();
  });
});
