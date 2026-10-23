import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import {
  HAND_SIZE,
  legalActions,
  LIVES,
  MAX_CARD,
  sotto,
  WAITS,
  type SottoAction,
  type SottoState,
  type SottoView,
} from "./sotto.ts";

/** 手札を決めた状態を作る（ほかは配った直後と同じ） */
function dealt(hand0: number[], hand1: number[], extra: Partial<SottoState> = {}): SottoState {
  return { ...sotto.initialState(Math.random), hands: [hand0, hand1], ...extra };
}

function play(s: SottoState, moves: [Seat, SottoAction][]): SottoState {
  return moves.reduce((st, [seat, action]) => sotto.applyMove(st, { action }, seat), s);
}

const view = (s: SottoState, viewer: Seat | null, revealAll = false) =>
  sotto.viewState!(s, viewer, revealAll) as SottoView;

describe("sotto", () => {
  describe("配り方", () => {
    it("1〜30 の札から 2 人に 3 枚ずつ、小さい順に並べて配る", () => {
      const s = sotto.initialState(Math.random);
      const all = [...s.hands[0], ...s.hands[1]];
      expect(s.hands[0]).toHaveLength(HAND_SIZE);
      expect(s.hands[1]).toHaveLength(HAND_SIZE);
      expect(new Set(all).size).toBe(HAND_SIZE * 2);
      for (const card of all) {
        expect(Number.isInteger(card)).toBe(true);
        expect(card).toBeGreaterThanOrEqual(1);
        expect(card).toBeLessThanOrEqual(MAX_CARD);
      }
      for (const hand of s.hands) expect(hand).toEqual([...hand].sort((a, b) => a - b));
      expect(s).toMatchObject({ pile: [], discards: [], mistakes: [], lives: LIVES, waits: WAITS, last: null });
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("配り方は rng で決まる", () => {
      // 常に 0.999… なら山は 1〜30 の順のまま。常に 0 なら 1 が一番下に回り 2 から始まる
      expect(sotto.initialState(() => 0.9999).hands).toEqual([
        [1, 2, 3],
        [4, 5, 6],
      ]);
      expect(sotto.initialState(() => 0).hands).toEqual([
        [2, 3, 4],
        [5, 6, 7],
      ]);
    });
  });

  describe("出す", () => {
    it("自分の一番小さい札を場に出し、手番が相手に移る", () => {
      const s = play(dealt([4, 9, 20], [12, 15, 30]), [[0, "play"]]);
      expect(s.hands).toEqual([
        [9, 20],
        [12, 15, 30],
      ]);
      expect(s.pile).toEqual([{ seat: 0, card: 4 }]);
      expect(s.last).toEqual({ seat: 0, action: "play", card: 4, missed: [] });
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("2 人で小さい順に全部出しきればクリア", () => {
      const s = play(dealt([1, 5, 9], [3, 7, 11]), [
        [0, "play"],
        [1, "play"],
        [0, "play"],
        [1, "play"],
        [0, "play"],
        [1, "play"],
      ]);
      expect(s.pile.map((p) => p.card)).toEqual([1, 3, 5, 7, 9, 11]);
      expect(s.pile.map((p) => p.seat)).toEqual([0, 1, 0, 1, 0, 1]);
      expect(s.lives).toBe(LIVES);
      expect(sotto.status(s)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
      expect(() => sotto.applyMove(s, { action: "play" }, 0)).toThrow("game_over");
    });
  });

  describe("ミス", () => {
    it("相手がもっと小さい札を持っていたら、ライフが 1 減り、相手のその札をすべて捨てる", () => {
      const s = play(dealt([12, 20, 25], [9, 11, 30]), [[0, "play"]]);
      expect(s.lives).toBe(LIVES - 1);
      // 出した 12 は場に残り、後手の 9・11 は場に出ずに捨てられる
      expect(s.pile).toEqual([{ seat: 0, card: 12 }]);
      expect(s.hands).toEqual([
        [20, 25],
        [30],
      ]);
      expect(s.discards).toEqual([
        { seat: 1, card: 9 },
        { seat: 1, card: 11 },
      ]);
      expect(s.mistakes).toEqual([{ seat: 0, card: 12, missed: [9, 11] }]);
      expect(s.last).toEqual({ seat: 0, action: "play", card: 12, missed: [9, 11] });
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("出した札より大きい相手の札は残る", () => {
      const s = play(dealt([10, 20, 25], [9, 11, 30]), [[0, "play"]]);
      expect(s.hands[1]).toEqual([11, 30]);
      expect(s.discards).toEqual([{ seat: 1, card: 9 }]);
    });

    it("ミスのあとも、ライフが残っていれば続けられ、出しきればクリア", () => {
      const s = play(dealt([12, 20, 25], [9, 11, 30]), [
        [0, "play"],
        [1, "wait"],
        [0, "play"],
        [1, "wait"],
        [0, "play"],
        [1, "play"],
      ]);
      expect(s.pile.map((p) => p.card)).toEqual([12, 20, 25, 30]);
      expect(s.lives).toBe(LIVES - 1);
      expect(sotto.status(s)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    });

    it("ライフが 0 になったら失敗", () => {
      const s = play(dealt([12, 20, 28], [9, 25, 30]), [
        [0, "play"],
        [1, "play"],
      ]);
      // 先手の 12 で後手の 9 が、後手の 25 で先手の 20 が捨てられた
      expect(s.lives).toBe(0);
      expect(s.mistakes).toEqual([
        { seat: 0, card: 12, missed: [9] },
        { seat: 1, card: 25, missed: [20] },
      ]);
      expect(s.hands).toEqual([[28], [30]]);
      expect(sotto.status(s)).toEqual({ kind: "finished", winner: null, coop: "failed" });
      expect(() => sotto.applyMove(s, { action: "play" }, 0)).toThrow("game_over");
      expect(() => sotto.applyMove(s, { action: "wait" }, 1)).toThrow("game_over");
    });

    it("最後の札でライフが 0 になったら、札がなくなっても失敗", () => {
      const s = play(dealt([8], [5], { lives: 1 }), [[0, "play"]]);
      expect(s.hands).toEqual([[], []]);
      expect(sotto.status(s)).toEqual({ kind: "finished", winner: null, coop: "failed" });
    });
  });

  describe("待つ", () => {
    it("札を出さずに手番を相手に渡し、待てる回数が 1 減る", () => {
      const s = play(dealt([20, 25, 30], [2, 3, 4]), [[0, "wait"]]);
      expect(s.hands[0]).toEqual([20, 25, 30]);
      expect(s.pile).toEqual([]);
      expect(s.waits).toBe(WAITS - 1);
      expect(s.last).toEqual({ seat: 0, action: "wait", card: null, missed: [] });
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("待てるのは 2 人合わせて 4 回まで。使いきったら出すしかない", () => {
      let s = play(dealt([20, 25, 30], [2, 3, 4]), [
        [0, "wait"],
        [1, "wait"],
        [0, "wait"],
        [1, "wait"],
      ]);
      expect(s.waits).toBe(0);
      expect(legalActions(s)).toEqual(["play"]);
      expect(() => sotto.applyMove(s, { action: "wait" }, 0)).toThrow(IllegalMoveError);
      expect(() => sotto.applyMove(s, { action: "wait" }, 0)).toThrow("sotto_no_waits");
      s = play(s, [[0, "play"]]);
      expect(s.pile).toEqual([{ seat: 0, card: 20 }]);
    });

    it("待てる回数が残っていれば、出すか待つかを選べる", () => {
      expect(legalActions(dealt([1], [2]))).toEqual(["play", "wait"]);
    });
  });

  describe("手札がない人", () => {
    it("手札がなくなった人の番は飛ばし、相手が続けて出す", () => {
      let s = play(dealt([1, 2, 3], [10, 20, 30]), [
        [0, "play"],
        [1, "wait"],
        [0, "play"],
        [1, "wait"],
        [0, "play"],
      ]);
      expect(s.hands[0]).toEqual([]);
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [[1, "play"]]);
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [
        [1, "play"],
        [1, "play"],
      ]);
      expect(s.pile.map((p) => p.card)).toEqual([1, 2, 3, 10, 20, 30]);
      expect(sotto.status(s)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    });

    it("ミスで相手の札がなくなったときも、相手の番は飛ばす", () => {
      const s = play(dealt([5, 6, 7], [1, 2, 3]), [[0, "play"]]);
      expect(s.hands[1]).toEqual([]);
      expect(s.lives).toBe(LIVES - 1);
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 0 });
      const end = play(s, [
        [0, "play"],
        [0, "play"],
      ]);
      expect(sotto.status(end)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    });

    it("手札がない人は出せない", () => {
      const s = play(dealt([1], [10, 20]), [[0, "play"]]);
      expect(() => sotto.applyMove(s, { action: "play" }, 0)).toThrow(IllegalMoveError);
      // 手番が回ってくることはないが、回ってきても出せない
      expect(() => sotto.applyMove({ ...s, turn: 0 }, { action: "play" }, 0)).toThrow("sotto_no_cards");
    });

    it("相手の札がもうなければ、待っても意味がないので待てない", () => {
      const s = play(dealt([1], [10, 20]), [[0, "play"]]);
      expect(legalActions(s)).toEqual(["play"]);
      expect(() => sotto.applyMove(s, { action: "wait" }, 1)).toThrow("sotto_wait_alone");
      expect(s.waits).toBe(WAITS);
    });
  });

  describe("手番", () => {
    it("1 手ごとに交互で、先手からはじまる", () => {
      let s = dealt([10, 20, 30], [11, 21, 29]);
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [[0, "play"]]);
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [[1, "wait"]]);
      expect(sotto.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("手番でない人は動けない", () => {
      const s = dealt([10, 20, 30], [11, 21, 29]);
      expect(() => sotto.applyMove(s, { action: "play" }, 1)).toThrow(IllegalMoveError);
      expect(() => sotto.applyMove(s, { action: "wait" }, 1)).toThrow("not_your_turn");
    });
  });

  describe("見せる情報", () => {
    it("相手の札の数字は見えない（枚数は分かる）", () => {
      const s = play(dealt([4, 9, 20], [12, 15, 30]), [[0, "play"]]);
      expect(view(s, 0).hands).toEqual([
        [9, 20],
        [null, null, null],
      ]);
      expect(view(s, 1).hands).toEqual([
        [null, null],
        [12, 15, 30],
      ]);
      expect(view(s, null).hands).toEqual([
        [null, null],
        [null, null, null],
      ]);
    });

    it("場の札・捨てた札・ミス・直前の手・ライフ・待てる回数は誰にでも見える", () => {
      const s = play(dealt([12, 20, 25], [9, 11, 30]), [
        [0, "play"],
        [1, "wait"],
      ]);
      const { hands, ...open } = s;
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer)).toMatchObject(open);
    });

    it("終局後はすべて見える", () => {
      // ライフがなくなって、2 人とも札が 1 枚ずつ残ったまま終わる
      const s = play(dealt([12, 20, 28], [9, 25, 30]), [
        [0, "play"],
        [1, "play"],
      ]);
      expect(sotto.status(s).kind).toBe("finished");
      for (const viewer of [0, 1, null] as const) {
        expect(view(s, viewer, true).hands).toEqual([[28], [30]]);
      }
    });
  });

  it("parseMove は「出す」「待つ」だけ受け付ける", () => {
    expect(sotto.parseMove({ action: "play" })).toEqual({ action: "play" });
    expect(sotto.parseMove({ action: "wait" })).toEqual({ action: "wait" });
    expect(sotto.parseMove({ action: "pass" })).toBeNull();
    expect(sotto.parseMove({ action: 1 })).toBeNull();
    expect(sotto.parseMove({})).toBeNull();
    expect(sotto.parseMove(null)).toBeNull();
    expect(sotto.parseMove("play")).toBeNull();
  });
});
