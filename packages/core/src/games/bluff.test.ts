import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import { bluff, CARDS, legalActions, ROUNDS, type BluffAction, type BluffState, type BluffView } from "./bluff.ts";

/** 配り方を決めた状態を作る。指定しなかった回戦は [1, 2] にする */
function dealt(...deals: [number, number][]): BluffState {
  const s = bluff.initialState(Math.random);
  return { ...s, deals: Array.from({ length: ROUNDS }, (_, i) => deals[i] ?? [1, 2]) };
}

function play(s: BluffState, moves: [Seat, BluffAction][]): BluffState {
  return moves.reduce((st, [seat, action]) => bluff.applyMove(st, { action }, seat), s);
}

const view = (s: BluffState, viewer: Seat | null, revealAll = false) =>
  bluff.viewState!(s, viewer, revealAll) as BluffView;

describe("bluff", () => {
  describe("配り方", () => {
    it("6 回戦分を最初に配る。毎回戦 2 人に違うカードを 1 枚ずつ", () => {
      const s = bluff.initialState(Math.random);
      expect(s.deals).toHaveLength(ROUNDS);
      for (const [a, b] of s.deals) {
        expect(CARDS).toContain(a);
        expect(CARDS).toContain(b);
        expect(a).not.toBe(b);
      }
      expect(s.scores).toEqual([0, 0]);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("配り方は rng で決まる", () => {
      // 常に 0.999… なら並びは 1・2・3 のまま、常に 0 なら 2・3・1 になる
      expect(bluff.initialState(() => 0.9999).deals[0]).toEqual([1, 2]);
      expect(bluff.initialState(() => 0).deals[0]).toEqual([2, 3]);
    });
  });

  describe("チップの移動", () => {
    it("両方パスなら見せ合い、大きい方が 1 枚もらう", () => {
      const s = play(dealt([3, 1]), [
        [0, "pass"],
        [1, "pass"],
      ]);
      expect(s.scores).toEqual([1, -1]);
      expect(s.history[0]).toMatchObject({ cards: [3, 1], winner: 0, won: 1, showdown: true });
    });

    it("上乗せを受けたら見せ合い、大きい方が 2 枚もらう", () => {
      const s = play(dealt([1, 3]), [
        [0, "bet"],
        [1, "call"],
      ]);
      expect(s.scores).toEqual([-2, 2]);
      expect(s.history[0]).toMatchObject({ winner: 1, won: 2, showdown: true });
    });

    it("上乗せされておりたら、カードに関係なく上乗せした人が 1 枚もらう", () => {
      const s = play(dealt([1, 3]), [
        [0, "bet"],
        [1, "fold"],
      ]);
      expect(s.scores).toEqual([1, -1]);
      expect(s.history[0]).toMatchObject({ winner: 0, won: 1, showdown: false });
    });

    it("パスのあとに上乗せされ、受けたら見せ合いで 2 枚", () => {
      const s = play(dealt([2, 1]), [
        [0, "pass"],
        [1, "bet"],
        [0, "call"],
      ]);
      expect(s.scores).toEqual([2, -2]);
      expect(s.history[0]).toMatchObject({ winner: 0, won: 2, showdown: true });
    });

    it("パスのあとに上乗せされ、おりたら上乗せした人が 1 枚", () => {
      const s = play(dealt([3, 1]), [
        [0, "pass"],
        [1, "bet"],
        [0, "fold"],
      ]);
      expect(s.scores).toEqual([-1, 1]);
      expect(s.history[0]).toMatchObject({ winner: 1, won: 1, showdown: false });
    });

    it("場のチップは最初 1 枚ずつ、上乗せ・受けるで 1 枚ずつ増える", () => {
      let s = dealt([2, 1]);
      expect(view(s, 0).stakes).toEqual([1, 1]);
      s = play(s, [[0, "pass"]]);
      expect(view(s, 0).stakes).toEqual([1, 1]);
      s = play(s, [[1, "bet"]]);
      expect(view(s, 0).stakes).toEqual([1, 2]);
    });
  });

  describe("手番", () => {
    it("回戦の中では交互に動き、status().turn で分かる", () => {
      let s = dealt([2, 1]);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [[0, "pass"]]);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [[1, "bet"]]);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("先に動く人は回戦ごとに交互（1 回戦目は先手）", () => {
      let s = play(dealt([2, 1], [2, 1], [2, 1]), [
        [0, "bet"],
        [1, "fold"],
      ]);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 1 });
      // 2 回戦目は後手から。前の回戦を後手が終えても、続けて後手が動く
      s = play(s, [
        [1, "pass"],
        [0, "pass"],
      ]);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(s.history.map((r) => r.acts[0]!.seat)).toEqual([0, 1]);
    });

    it("手番でない人は動けない", () => {
      const s = dealt();
      expect(() => bluff.applyMove(s, { action: "bet" }, 1)).toThrow(IllegalMoveError);
      expect(() => bluff.applyMove(s, { action: "bet" }, 1)).toThrow("not_your_turn");
    });
  });

  describe("選べない手", () => {
    it("上乗せされていなければ、受ける・おりるは選べない", () => {
      const s = dealt();
      expect(legalActions(s.acts)).toEqual(["bet", "pass"]);
      expect(() => bluff.applyMove(s, { action: "call" }, 0)).toThrow("bluff_no_bet");
      expect(() => bluff.applyMove(s, { action: "fold" }, 0)).toThrow("bluff_no_bet");
      const passed = play(s, [[0, "pass"]]);
      expect(() => bluff.applyMove(passed, { action: "call" }, 1)).toThrow("bluff_no_bet");
    });

    it("上乗せされたら、受けるかおりるしか選べない", () => {
      const s = play(dealt(), [[0, "bet"]]);
      expect(legalActions(s.acts)).toEqual(["call", "fold"]);
      expect(() => bluff.applyMove(s, { action: "bet" }, 1)).toThrow("bluff_answer_bet");
      expect(() => bluff.applyMove(s, { action: "pass" }, 1)).toThrow("bluff_answer_bet");
    });
  });

  describe("決着", () => {
    /** 2 人ともパスする回戦を rounds 回くり返す */
    const passAll = (s: BluffState, rounds = ROUNDS) => {
      for (let round = 0; round < rounds; round++) {
        const first = bluff.status(s);
        if (first.kind !== "playing") throw new Error("終わっている");
        s = play(s, [
          [first.turn, "pass"],
          [first.turn === 0 ? 1 : 0, "pass"],
        ]);
      }
      return s;
    };

    it("6 回戦で終わり、合計が多い方の勝ち", () => {
      const s = passAll(dealt([3, 1], [3, 1], [3, 1], [1, 3], [1, 3], [3, 2]));
      expect(s.history).toHaveLength(ROUNDS);
      expect(s.scores).toEqual([2, -2]);
      expect(bluff.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(() => bluff.applyMove(s, { action: "pass" }, 0)).toThrow("game_over");
      expect(() => bluff.applyMove(s, { action: "pass" }, 1)).toThrow("game_over");
    });

    it("合計が同じなら引き分け", () => {
      const s = passAll(dealt([3, 1], [1, 3], [3, 1], [1, 3], [2, 1], [1, 2]));
      expect(s.scores).toEqual([0, 0]);
      expect(bluff.status(s)).toEqual({ kind: "finished", winner: null });
    });

    it("5 回戦目までは終わらない", () => {
      const s = passAll(dealt(), ROUNDS - 1);
      expect(bluff.status(s)).toEqual({ kind: "playing", turn: 1 });
      expect(view(s, 0).round).toBe(ROUNDS - 1);
    });
  });

  describe("見せる情報", () => {
    it("相手のカードと、これからの配り方は見えない", () => {
      const s = dealt([3, 1], [2, 3]);
      expect(view(s, 0).cards).toEqual([3, null]);
      expect(view(s, 1).cards).toEqual([null, 1]);
      expect(view(s, null).cards).toEqual([null, null]);
      expect(view(s, 0)).not.toHaveProperty("deals");
    });

    it("見せ合った回戦は両者のカードが見える", () => {
      const s = play(dealt([3, 1], [2, 3]), [
        [0, "bet"],
        [1, "call"],
      ]);
      expect(view(s, 0).history[0]!.cards).toEqual([3, 1]);
      expect(view(s, 1).history[0]!.cards).toEqual([3, 1]);
      expect(view(s, null).history[0]!.cards).toEqual([3, 1]);
      // 次の回戦のカードはまた伏せる
      expect(view(s, 0).cards).toEqual([2, null]);
    });

    it("おりた回戦は終局まで相手のカードを伏せる（自分のカードは見える）", () => {
      let s = play(dealt([3, 1]), [
        [0, "bet"],
        [1, "fold"],
      ]);
      expect(view(s, 0).history[0]!.cards).toEqual([3, null]);
      expect(view(s, 1).history[0]!.cards).toEqual([null, 1]);
      expect(view(s, null).history[0]!.cards).toEqual([null, null]);
      // 何回戦か進めても伏せたまま
      s = play(s, [
        [1, "pass"],
        [0, "pass"],
      ]);
      expect(view(s, 1).history[0]!.cards).toEqual([null, 1]);
    });

    it("終局後はすべて見える", () => {
      let s = dealt([3, 1], [1, 2], [2, 3], [3, 2], [1, 3], [2, 1]);
      s = play(s, [
        [0, "bet"],
        [1, "fold"],
        [1, "bet"],
        [0, "fold"],
        [0, "pass"],
        [1, "pass"],
        [1, "bet"],
        [0, "call"],
        [0, "pass"],
        [1, "bet"],
        [0, "fold"],
        [1, "pass"],
        [0, "pass"],
      ]);
      expect(bluff.status(s).kind).toBe("finished");
      const all = view(s, 0, true);
      expect(all.history.map((r) => r.cards)).toEqual([
        [3, 1],
        [1, 2],
        [2, 3],
        [3, 2],
        [1, 3],
        [2, 1],
      ]);
      expect(view(s, null, true).history[0]!.cards).toEqual([3, 1]);
      // 終わったあとは今の回戦がない
      expect(all.round).toBe(ROUNDS);
      expect(all.cards).toEqual([null, null]);
    });

    it("手（上乗せ・パスなど）はもともと見えているので、手の記録はそのまま", () => {
      expect(bluff.viewMove!({ action: "bet" }, 0, 1)).toEqual({ action: "bet" });
    });
  });

  it("parseMove は 4 種類の手だけ受け付ける", () => {
    for (const action of ["bet", "pass", "call", "fold"] as const) {
      expect(bluff.parseMove({ action })).toEqual({ action });
    }
    expect(bluff.parseMove({ action: "raise" })).toBeNull();
    expect(bluff.parseMove({ action: 1 })).toBeNull();
    expect(bluff.parseMove({})).toBeNull();
    expect(bluff.parseMove(null)).toBeNull();
    expect(bluff.parseMove("bet")).toBeNull();
  });
});
