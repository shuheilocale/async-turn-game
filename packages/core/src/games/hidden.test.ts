import { describe, expect, it } from "vitest";
import { IllegalMoveError } from "../types.ts";
import { hitblow, judge, type HitBlowState, type HitBlowView } from "./hitblow.ts";
import { auction, CARDS, type AuctionState, type AuctionView } from "./auction.ts";

describe("hitblow", () => {
  const setup = (): HitBlowState => {
    let s = hitblow.initialState(Math.random);
    s = hitblow.applyMove(s, { kind: "secret", value: "123" }, 0);
    return hitblow.applyMove(s, { kind: "secret", value: "456" }, 1);
  };

  it("ヒットとブローを数える", () => {
    expect(judge("123", "123")).toEqual({ hit: 3, blow: 0 });
    expect(judge("123", "312")).toEqual({ hit: 0, blow: 3 });
    expect(judge("123", "143")).toEqual({ hit: 2, blow: 0 });
    expect(judge("123", "789")).toEqual({ hit: 0, blow: 0 });
  });

  it("同じ数字を含む・桁数違いは秘密の数字にできない", () => {
    const s = hitblow.initialState(Math.random);
    expect(() => hitblow.applyMove(s, { kind: "secret", value: "112" }, 0)).toThrow(IllegalMoveError);
    expect(() => hitblow.applyMove(s, { kind: "secret", value: "12" }, 0)).toThrow(IllegalMoveError);
  });

  it("相手の秘密の数字は見えない（終局後は見える）", () => {
    const s = setup();
    const view0 = hitblow.viewState!(s, 0, false) as HitBlowView;
    expect(view0.secrets).toEqual(["123", null]);
    expect(view0.secretSet).toEqual([true, true]);
    expect((hitblow.viewState!(s, null, false) as HitBlowView).secrets).toEqual([null, null]);
    expect((hitblow.viewState!(s, 0, true) as HitBlowView).secrets).toEqual(["123", "456"]);
    expect(hitblow.viewMove!({ kind: "secret", value: "456" }, 1, 0)).toEqual({ kind: "secret", value: null });
  });

  it("先手が当てても後手にもう 1 回機会があり、後手も当てれば引き分け", () => {
    let s = setup();
    s = hitblow.applyMove(s, { kind: "guess", value: "456" }, 0);
    expect(hitblow.status(s)).toEqual({ kind: "playing", turn: 1 });
    s = hitblow.applyMove(s, { kind: "guess", value: "123" }, 1);
    expect(hitblow.status(s)).toEqual({ kind: "finished", winner: null });
  });

  it("先手だけ当てたら先手の勝ち", () => {
    let s = setup();
    s = hitblow.applyMove(s, { kind: "guess", value: "456" }, 0);
    s = hitblow.applyMove(s, { kind: "guess", value: "789" }, 1);
    expect(hitblow.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.guesses[1][0]).toEqual({ value: "789", hit: 0, blow: 0 });
  });
});

describe("auction", () => {
  // 得点カードの山を 1..9 の順に固定する（rng が常に 0.999… なら並びが変わらない）
  const fixed = () => 0.9999;

  it("大きい数字を出した方が得点カードをもらい、先に出す人は交互", () => {
    let s = auction.initialState(fixed);
    expect(s.deck).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    s = auction.applyMove(s, { card: 3 }, 0);
    expect(s.turn).toBe(1);
    s = auction.applyMove(s, { card: 5 }, 1);
    expect(s.scores).toEqual([0, 1]);
    expect(s.turn).toBe(1); // 2 ラウンド目は後手から
    expect(s.hands[0]).not.toContain(3);
  });

  it("同じ数字なら次に持ち越し", () => {
    let s = auction.initialState(fixed);
    s = auction.applyMove(s, { card: 4 }, 0);
    s = auction.applyMove(s, { card: 4 }, 1);
    expect(s.carried).toEqual([1]);
    s = auction.applyMove(s, { card: 9 }, 1);
    s = auction.applyMove(s, { card: 1 }, 0);
    expect(s.scores).toEqual([0, 3]);
  });

  it("相手の入札と山札の順番は見えない", () => {
    let s: AuctionState = auction.initialState(fixed);
    s = auction.applyMove(s, { card: 7 }, 0);
    const view1 = auction.viewState!(s, 1, false) as AuctionView;
    expect(view1.bids).toEqual([true, null]);
    expect(view1.current).toBe(1);
    expect(view1).not.toHaveProperty("deck");
    expect((auction.viewState!(s, 0, false) as AuctionView).bids).toEqual([7, false]);
    expect(auction.viewMove!({ card: 7 }, 0, 1)).toEqual({ card: null });
  });

  it("相手の手札から今の入札が分からない（出したカードは結果が出るまで手札に見せる）", () => {
    let s: AuctionState = auction.initialState(fixed);
    s = auction.applyMove(s, { card: 7 }, 0);
    expect((auction.viewState!(s, 1, false) as AuctionView).hands[0]).toEqual(CARDS);
    expect((auction.viewState!(s, 0, false) as AuctionView).hands[0]).not.toContain(7);
    expect((auction.viewState!(s, 1, true) as AuctionView).hands[0]).not.toContain(7);
  });

  it("持っていないカードは出せない。9 ラウンドで終局", () => {
    let s = auction.initialState(fixed);
    s = auction.applyMove(s, { card: 1 }, 0);
    expect(() => auction.applyMove(s, { card: 10 }, 1)).toThrow(IllegalMoveError);
    s = auction.applyMove(s, { card: 2 }, 1);
    for (let round = 1; round < 9; round++) {
      const first = s.turn;
      const second = first === 0 ? 1 : 0;
      s = auction.applyMove(s, { card: s.hands[first][0]! }, first);
      s = auction.applyMove(s, { card: s.hands[second][0]! }, second);
    }
    expect(auction.status(s).kind).toBe("finished");
    expect(s.hands).toEqual([[], []]);
  });
});
