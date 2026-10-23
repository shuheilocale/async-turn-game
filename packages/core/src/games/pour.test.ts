import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  amountForHold,
  holdMsFor,
  MAX_EXTRA,
  MAX_POUR,
  MIN_POUR,
  pour,
  RIM,
  type PourState,
  type PourView,
} from "./pour.ts";

/** もつ量を決めたコップ */
const cup = (limit: number): PourState => ({ ...pour.initialState(Math.random), limit });

/** 手番の人が順に注ぐ */
const play = (s: PourState, amounts: number[]) => amounts.reduce((st, amount) => pour.applyMove(st, { amount }, st.turn), s);

const view = (s: PourState, viewer: Seat | null, revealAll = false) => pour.viewState!(s, viewer, revealAll) as PourView;

/** 同じ種から同じ並びを返す乱数（mulberry32） */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("pour", () => {
  describe("コップ", () => {
    it("はじめは空で、先手から注ぐ", () => {
      const s = pour.initialState(Math.random);
      expect(s.level).toBe(0);
      expect(s.pours).toEqual([]);
      expect(s.spilledBy).toBeNull();
      expect(pour.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("もつ量は rng で決まり、ふちから ふち + 30 ml までのどれか", () => {
      expect(pour.initialState(() => 0).limit).toBe(RIM);
      expect(pour.initialState(() => 0.9999).limit).toBe(RIM + MAX_EXTRA);
      expect(pour.initialState(() => 0.5).limit).toBe(RIM + 15);
      for (let i = 0; i < 100; i++) {
        const { limit } = pour.initialState(Math.random);
        expect(Number.isInteger(limit)).toBe(true);
        expect(limit).toBeGreaterThanOrEqual(RIM);
        expect(limit).toBeLessThanOrEqual(RIM + MAX_EXTRA);
      }
    });
  });

  describe("注ぐ", () => {
    it("注いだ量だけ水位が上がり、手番が相手に移る", () => {
      let s = play(cup(210), [30]);
      expect(s.level).toBe(30);
      expect(s.pours).toEqual([{ seat: 0, amount: 30 }]);
      expect(pour.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [45]);
      expect(s.level).toBe(75);
      expect(s.pours.at(-1)).toEqual({ seat: 1, amount: 45 });
      expect(pour.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("1 回に注ぐ量は 20〜45 ml。少なすぎても多すぎても受け付けない", () => {
      const s = cup(210);
      expect(play(s, [MIN_POUR]).level).toBe(20);
      expect(play(s, [MAX_POUR]).level).toBe(45);
      for (const amount of [MIN_POUR - 1, MAX_POUR + 1, 0, -20, 1000]) {
        expect(() => pour.applyMove(s, { amount }, 0)).toThrow(IllegalMoveError);
        expect(() => pour.applyMove(s, { amount }, 0)).toThrow("pour_amount");
      }
    });

    it("手番でない人は注げない", () => {
      const s = cup(210);
      expect(() => pour.applyMove(s, { amount: 30 }, 1)).toThrow("not_your_turn");
      const next = play(s, [30]);
      expect(() => pour.applyMove(next, { amount: 30 }, 0)).toThrow("not_your_turn");
    });
  });

  describe("あふれる", () => {
    it("もつ量ちょうどまではあふれない。超えたら、注いだ人の負け", () => {
      // 45 × 4 = 180、先手が 34 で 214（ちょうど）。後手が 20 で 234 になってあふれる
      let s = play(cup(214), [45, 45, 45, 45, 34]);
      expect(s.level).toBe(214);
      expect(s.spilledBy).toBeNull();
      expect(pour.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [20]);
      expect(s.spilledBy).toBe(1);
      expect(pour.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("先手があふれさせたら後手の勝ち", () => {
      const s = play(cup(205), [45, 45, 45, 45, 26]);
      expect(s.level).toBe(206);
      expect(s.spilledBy).toBe(0);
      expect(pour.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("ふちまではかならずあふれない（ふちちょうどまでしかもたないコップでも）", () => {
      let s = play(cup(RIM), [40, 40, 40, 40, 40]);
      expect(s.level).toBe(RIM);
      expect(pour.status(s).kind).toBe("playing");
      s = play(s, [20]);
      expect(pour.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("あふれたら終わり。もう注げない", () => {
      const s = play(cup(RIM), [45, 45, 45, 45, 45]);
      expect(pour.status(s).kind).toBe("finished");
      expect(() => pour.applyMove(s, { amount: 30 }, 1)).toThrow("game_over");
      expect(() => pour.applyMove(s, { amount: 30 }, 0)).toThrow("game_over");
    });

    it("どう注いでも 12 手のうちにはかならず終わる", () => {
      // いちばん少なく注ぎ続けても、もつ量の上限を超える
      let s = cup(RIM + MAX_EXTRA);
      for (let i = 0; i < 12 && pour.status(s).kind === "playing"; i++) s = play(s, [MIN_POUR]);
      expect(pour.status(s).kind).toBe("finished");
    });
  });

  describe("見せる情報", () => {
    it("もつ量は 2 人にも観戦者にも見えない", () => {
      const s = play(cup(222), [30, 40]);
      for (const viewer of [0, 1, null] as const) {
        expect(view(s, viewer).limit).toBeNull();
        expect(view(s, viewer).level).toBe(70);
        expect(view(s, viewer).pours).toEqual(s.pours);
      }
    });

    it("終局後はもつ量も見える", () => {
      const s = play(cup(222), [45, 45, 45, 45, 45]);
      expect(pour.status(s).kind).toBe("finished");
      expect(view(s, 0, true).limit).toBe(222);
      expect(view(s, 1, true).limit).toBe(222);
      expect(view(s, null, true).limit).toBe(222);
    });

    it("注いだ量はもともと見えているので、手の記録はそのまま", () => {
      expect(pour.viewMove!({ amount: 30 }, 0, 1)).toEqual({ amount: 30 });
    });
  });

  it("parseMove は整数の量だけ受け付ける（範囲は applyMove で確かめる）", () => {
    expect(pour.parseMove({ amount: 30 })).toEqual({ amount: 30 });
    expect(pour.parseMove({ amount: 999 })).toEqual({ amount: 999 });
    expect(pour.parseMove({ amount: 30.5 })).toBeNull();
    expect(pour.parseMove({ amount: "30" })).toBeNull();
    expect(pour.parseMove({ amount: Number.NaN })).toBeNull();
    expect(pour.parseMove({ amount: Infinity })).toBeNull();
    expect(pour.parseMove({})).toBeNull();
    expect(pour.parseMove(null)).toBeNull();
    expect(pour.parseMove(30)).toBeNull();
  });

  describe("長押しの時間と量", () => {
    it("押していた時間に比例し、20〜45 ml におさまる", () => {
      expect(amountForHold(0)).toBe(MIN_POUR);
      expect(amountForHold(300)).toBe(MIN_POUR);
      expect(amountForHold(holdMsFor(30))).toBe(30);
      expect(amountForHold(holdMsFor(MAX_POUR))).toBe(MAX_POUR);
      expect(amountForHold(60_000)).toBe(MAX_POUR);
      // 長く押すほど多い（同じか増える）
      let prev = 0;
      for (let ms = 0; ms <= holdMsFor(MAX_POUR) + 500; ms += 37) {
        const a = amountForHold(ms);
        expect(Number.isInteger(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(prev);
        prev = a;
      }
    });
  });

  describe("コンピュータ", () => {
    const pick = (s: PourState, r = 0.5) => pour.botMove!(view(s, s.turn), s.turn, () => r) as { amount: number } | null;

    it("自分の番でなければ null。終わっていても null", () => {
      const s = cup(210);
      expect(pour.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(cup(RIM), [45, 45, 45, 45, 45]);
      expect(pour.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("いつも 20〜45 ml の整数を返す。もつ量は見えない形で受け取る", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(game);
        let s = pour.initialState(rng);
        while (pour.status(s).kind === "playing") {
          const v = view(s, s.turn);
          expect(v.limit).toBeNull();
          const move = pour.botMove!(v, s.turn, rng) as { amount: number };
          expect(Number.isInteger(move.amount)).toBe(true);
          expect(move.amount).toBeGreaterThanOrEqual(MIN_POUR);
          expect(move.amount).toBeLessThanOrEqual(MAX_POUR);
          s = pour.applyMove(s, move, s.turn);
        }
      }
    });

    it("ふちを越えるしかないときは、いちばん少なく注ぐ", () => {
      const s = play(cup(230), [45, 45, 45, 30, 20]);
      expect(s.level).toBe(185);
      for (const r of [0, 0.5, 0.9999]) expect(pick(s, r)).toEqual({ amount: MIN_POUR });
    });

    it("ふちのすぐ下に届くなら、ふちを越えない高さで相手に渡す", () => {
      // 水位 150 からなら 170〜195 にできる。相手がふちを越えるしかない 181〜200 をねらう
      const s = play(cup(230), [45, 45, 30, 30]);
      expect(s.level).toBe(150);
      for (const r of [0, 0.3, 0.6, 0.9999]) {
        const after = s.level + pick(s, r)!.amount;
        expect(after).toBeGreaterThan(RIM - MIN_POUR);
        expect(after).toBeLessThanOrEqual(RIM);
      }
    });

    it("コンピュータ同士で 20 局とも途中で止まらずに終わり、手数は 6〜15 手ほど", () => {
      const lengths: number[] = [];
      for (let game = 0; game < 20; game++) {
        const rng = seeded(100 + game);
        let s = pour.initialState(rng);
        for (let ply = 0; ply < 50 && pour.status(s).kind === "playing"; ply++) {
          const move = botMove(pour, s, s.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = pour.applyMove(s, move, s.turn);
        }
        expect(pour.status(s).kind).toBe("finished");
        lengths.push(s.pours.length);
      }
      for (const n of lengths) {
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThanOrEqual(12);
      }
    });
  });
});
