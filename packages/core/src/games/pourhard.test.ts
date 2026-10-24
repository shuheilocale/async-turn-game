import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  amountForHold,
  HARD_BLIND,
  holdMsFor,
  MAX_EXTRA,
  MAX_POUR,
  MIN_POUR,
  minPourFor,
  pour,
  pourHard,
  RIM,
  type PourState,
  type PourView,
} from "./pour.ts";

/** もつ量を決めたコップ */
const cup = (limit: number): PourState => ({ ...pourHard.initialState(Math.random), limit });

/** 手番の人が順に注ぐ */
const play = (s: PourState, amounts: number[]) =>
  amounts.reduce((st, amount) => pourHard.applyMove(st, { amount }, st.turn), s);

const view = (s: PourState, viewer: Seat | null, revealAll = false) => pourHard.viewState!(s, viewer, revealAll) as PourView;

/** 今注げる最低の量 */
const minOf = (s: PourState) => minPourFor(HARD_BLIND, s);

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

/** 45 + 45 + 40 = 130 ml。次に 20 ml 注ぐと、ちょうど 150 ml で目隠しになる */
const before = () => play(cup(215), [45, 45, 40]);

describe("pourhard", () => {
  it("みずそそぎとは別のゲーム", () => {
    expect(pourHard.id).toBe("pourhard");
    expect(pour.id).toBe("pour");
    expect(HARD_BLIND).toEqual({ from: 150, firstMin: 3, step: 3 });
  });

  describe("コップ", () => {
    it("はじめは空で、目隠しはまだ。もつ量は 200〜230 ml", () => {
      const s = pourHard.initialState(Math.random);
      expect(s.level).toBe(0);
      expect(s.pours).toEqual([]);
      expect(s.blind).toBe(false);
      expect(s.blindPours).toBe(0);
      expect(pourHard.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(pourHard.initialState(() => 0).limit).toBe(RIM);
      expect(pourHard.initialState(() => 0.9999).limit).toBe(RIM + MAX_EXTRA);
    });
  });

  describe("目隠し", () => {
    it("水位が 150 ml 以上になったら目隠しになる（149 ml ではまだ）", () => {
      const at149 = play(cup(215), [45, 45, 39, 20]);
      expect(at149.level).toBe(149);
      expect(at149.blind).toBe(false);
      const at150 = play(before(), [20]);
      expect(at150.level).toBe(150);
      expect(at150.blind).toBe(true);
      // 目隠しに入った手は、目隠しのあとに注いだ回数には数えない
      expect(at150.blindPours).toBe(0);
    });

    it("目隠しの前は、最低 20 ml のまま", () => {
      const s = before();
      expect(minOf(s)).toBe(MIN_POUR);
      expect(() => pourHard.applyMove(s, { amount: 19 }, s.turn)).toThrow("pour_amount");
      expect(() => pourHard.applyMove(s, { amount: 3 }, s.turn)).toThrow("pour_amount");
    });

    it("目隠しになったら、最低は 3 ml から 1 回ごとに 3 ml ずつ増える（3 → 6 → 9 → 12）", () => {
      let s = play(before(), [20]);
      for (const [i, min] of [3, 6, 9, 12].entries()) {
        expect(s.blindPours).toBe(i);
        expect(minOf(s)).toBe(min);
        expect(() => pourHard.applyMove(s, { amount: min - 1 }, s.turn)).toThrow("pour_blind_amount");
        s = pourHard.applyMove(s, { amount: min }, s.turn);
      }
      expect(s.level).toBe(150 + 3 + 6 + 9 + 12);
      expect(s.blindPours).toBe(4);
      expect(minOf(s)).toBe(15);
      expect(pourHard.status(s).kind).toBe("playing");
    });

    it("どちらが注いでも同じように増える。上限は 45 ml のまま", () => {
      const s = play(before(), [20, 3]);
      expect(s.pours.at(-1)).toEqual({ seat: 0, amount: 3 });
      expect(() => pourHard.applyMove(s, { amount: MAX_POUR + 1 }, 1)).toThrow("pour_blind_amount");
      expect(pourHard.applyMove(s, { amount: MAX_POUR }, 1).level).toBe(150 + 3 + 45);
      // 最低が 45 ml を越えることはない
      expect(minPourFor(HARD_BLIND, { blind: true, blindPours: 14 })).toBe(45);
      expect(minPourFor(HARD_BLIND, { blind: true, blindPours: 30 })).toBe(45);
    });

    it("整数でない量・範囲の外の量は受け付けない", () => {
      const s = play(before(), [20]);
      for (const amount of [0, 2, -3, 46, 1000, 3.5, Number.NaN]) {
        expect(() => pourHard.applyMove(s, { amount }, s.turn)).toThrow(IllegalMoveError);
      }
      expect(pourHard.applyMove(s, { amount: 3 }, s.turn).level).toBe(153);
    });

    it("手番でない人は注げない", () => {
      const s = play(before(), [20]);
      expect(s.turn).toBe(0);
      expect(() => pourHard.applyMove(s, { amount: 3 }, 1)).toThrow("not_your_turn");
    });

    it("みずそそぎ（pour）は 150 ml を越えても目隠しにならず、最低は 20 ml のまま", () => {
      let s: PourState = { ...pour.initialState(Math.random), limit: 230 };
      for (const amount of [45, 45, 45, 25]) s = pour.applyMove(s, { amount }, s.turn);
      expect(s.level).toBe(160);
      expect(s.blind).toBe(false);
      expect(minPourFor(null, s)).toBe(MIN_POUR);
      expect(() => pour.applyMove(s, { amount: 3 }, s.turn)).toThrow("pour_amount");
      expect((pour.viewState!(s, 0, false) as PourView).level).toBe(160);
    });
  });

  describe("あふれる", () => {
    it("目隠し中でも、もつ量を超えたら注いだ人の負け", () => {
      // 150 → 153 → 159 → 168 → 180 → 195 → 213（後手）であふれる
      let s = play(cup(212), [45, 45, 40, 20, 3, 6, 9, 12, 15]);
      expect(s.level).toBe(195);
      expect(pourHard.status(s).kind).toBe("playing");
      s = play(s, [18]);
      expect(s.level).toBe(213);
      expect(s.spilledBy).toBe(1);
      expect(pourHard.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(() => pourHard.applyMove(s, { amount: 21 }, 0)).toThrow("game_over");
    });

    it("目隠しに入る手ではあふれない（149 ml から 45 ml 注いでも 194 ml）", () => {
      const s = play(cup(RIM), [45, 45, 39, 20, 45]);
      expect(s.level).toBe(194);
      expect(s.blind).toBe(true);
      expect(pourHard.status(s).kind).toBe("playing");
    });

    it("いちばん少なく注ぎ続けても、15 手のうちにはかならず終わる", () => {
      let s = cup(RIM + MAX_EXTRA);
      for (let i = 0; i < 15 && pourHard.status(s).kind === "playing"; i++) s = play(s, [minOf(s)]);
      expect(pourHard.status(s).kind).toBe("finished");
    });
  });

  describe("見せる情報", () => {
    it("目隠しの前は、水位も注いだ量も 2 人に見える（もつ量だけ見えない）", () => {
      const s = before();
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer);
        expect(v.limit).toBeNull();
        expect(v.level).toBe(130);
        expect(v.pours).toEqual(s.pours);
        expect(v.blind).toBe(false);
      }
    });

    it("目隠し中は、水位と、目隠しに入った手からあとの量が 2 人とも見えない（自分の分も）", () => {
      // 130 ml まで見えている。後手の 25 ml で目隠しになり、先手 4 ml・後手 6 ml
      const s = play(before(), [25, 4, 6]);
      expect(s.level).toBe(165);
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer);
        expect(v.limit).toBeNull();
        expect(v.level).toBeNull();
        expect(v.blind).toBe(true);
        expect(v.blindPours).toBe(2);
        expect(v.pours).toEqual([
          { seat: 0, amount: 45 },
          { seat: 1, amount: 45 },
          { seat: 0, amount: 40 },
          { seat: 1, amount: null },
          { seat: 0, amount: null },
          { seat: 1, amount: null },
        ]);
      }
    });

    it("終局後は、もつ量・水位・すべての回の量が見える", () => {
      const s = play(cup(200), [45, 45, 40, 25, 4, 6, 45]);
      expect(pourHard.status(s).kind).toBe("finished");
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer, true);
        expect(v.limit).toBe(200);
        expect(v.level).toBe(210);
        expect(v.pours).toEqual(s.pours);
      }
    });

    it("手の記録では量を伏せる（局面がないので目隠しの前か後か分からない。前の量は pours で見えている）", () => {
      expect(pourHard.viewMove!({ amount: 30 }, 0, 1)).toEqual({ amount: null });
      expect(pourHard.viewMove!({ amount: 3 }, 0, 0)).toEqual({ amount: null });
      expect(pourHard.viewMove!({ amount: 3 }, 1, null)).toEqual({ amount: null });
      // みずそそぎはそのまま
      expect(pour.viewMove!({ amount: 30 }, 0, 1)).toEqual({ amount: 30 });
    });
  });

  describe("長押しの時間と量", () => {
    it("目隠し中は、短く押しても今の最低量が出る。長く押しても 45 ml で止まる", () => {
      expect(amountForHold(0, 3)).toBe(3);
      expect(amountForHold(100, 3)).toBe(3);
      expect(amountForHold(holdMsFor(7), 3)).toBe(7);
      expect(amountForHold(holdMsFor(7), 9)).toBe(9);
      expect(amountForHold(60_000, 3)).toBe(MAX_POUR);
      // 最低を渡さなければ、今までどおり 20 ml
      expect(amountForHold(0)).toBe(MIN_POUR);
    });
  });

  describe("コンピュータ", () => {
    const pick = (s: PourState, r = 0.5) => pourHard.botMove!(view(s, s.turn), s.turn, () => r) as { amount: number } | null;

    it("自分の番でなければ null。終わっていても null", () => {
      const s = cup(210);
      expect(pourHard.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(cup(RIM), [45, 45, 40, 25, 4, 6, 45]);
      expect(pourHard.botMove!(view(over, 0), 0, Math.random)).toBeNull();
      expect(pourHard.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("いつも今の最低量〜45 ml の整数を返す。目隠し中は水位の見えない形で受け取る", () => {
      let blindTurns = 0;
      for (let game = 0; game < 40; game++) {
        const rng = seeded(game);
        let s = pourHard.initialState(rng);
        while (pourHard.status(s).kind === "playing") {
          const v = view(s, s.turn);
          expect(v.limit).toBeNull();
          if (s.blind) {
            blindTurns++;
            expect(v.level).toBeNull();
          }
          const move = pourHard.botMove!(v, s.turn, rng) as { amount: number };
          expect(Number.isInteger(move.amount)).toBe(true);
          expect(move.amount).toBeGreaterThanOrEqual(minOf(s));
          expect(move.amount).toBeLessThanOrEqual(MAX_POUR);
          s = pourHard.applyMove(s, move, s.turn);
        }
      }
      expect(blindTurns).toBeGreaterThan(40);
    });

    it("ふちを越えていそうなら、今の最低量を注ぐ", () => {
      // 130 ml から目隠しに入り、そのあと 6 回注いだ（最低だけでも 130 + 20 + 3 + 6 + 9 + 12 + 15 + 18 = 213 ml 以上）
      const s = play(cup(230), [45, 45, 40, 20, 3, 6, 9, 12, 15, 18]);
      expect(s.blindPours).toBe(6);
      for (const r of [0, 0.5, 0.9999]) expect(pick(s, r)).toEqual({ amount: minOf(s) });
    });

    it("目隠しの前でも、目隠しに届かないうちは 20〜45 ml の中から選ぶ", () => {
      const s = play(cup(230), [45]);
      for (const r of [0, 0.5, 0.9999]) {
        const { amount } = pick(s, r)!;
        expect(amount).toBeGreaterThanOrEqual(MIN_POUR);
        expect(amount).toBeLessThanOrEqual(MAX_POUR);
      }
    });

    it("コンピュータ同士で 30 局とも途中で止まらずに終わり、手数は 6〜14 手ほど", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(100 + game);
        let s = pourHard.initialState(rng);
        for (let ply = 0; ply < 50 && pourHard.status(s).kind === "playing"; ply++) {
          const move = botMove(pourHard, s, s.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = pourHard.applyMove(s, move, s.turn);
        }
        expect(pourHard.status(s).kind).toBe("finished");
        expect(s.pours.length).toBeGreaterThanOrEqual(5);
        expect(s.pours.length).toBeLessThanOrEqual(14);
      }
    });

    it("いつも最低量だけ注ぐ人は、コンピュータに勝ち越せない", () => {
      let wins = 0;
      const games = 400;
      for (let game = 0; game < games; game++) {
        const rng = seeded(1000 + game);
        // 半分ずつ、いつも最低量の人が先手と後手になる
        const minimal: Seat = game % 2 === 0 ? 0 : 1;
        let s = pourHard.initialState(rng);
        while (pourHard.status(s).kind === "playing") {
          const move = s.turn === minimal ? { amount: minOf(s) } : botMove(pourHard, s, s.turn, rng)!;
          s = pourHard.applyMove(s, move, s.turn);
        }
        const st = pourHard.status(s);
        if (st.kind === "finished" && st.winner === minimal) wins++;
      }
      expect(wins / games).toBeLessThan(0.5);
    });
  });
});
