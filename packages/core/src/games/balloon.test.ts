import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  airOf,
  balloon,
  BURST_MAX,
  BURST_MIN,
  MAX_TAPS,
  MIN_TAPS,
  TURNS,
  type BalloonState,
  type BalloonView,
} from "./balloon.ts";

/** 割れる回数を決めた風船 */
const withBurst = (burstAt: number): BalloonState => ({ ...balloon.initialState(Math.random), burstAt });

/** 手番の人が順にふくらませる */
const play = (s: BalloonState, taps: number[]) => taps.reduce((st, n) => balloon.applyMove(st, { taps: n }, st.turn), s);

const view = (s: BalloonState, viewer: Seat | null, revealAll = false) =>
  balloon.viewState!(s, viewer, revealAll) as BalloonView;

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

describe("balloon", () => {
  describe("風船", () => {
    it("はじめは空気が 0 で、先手から", () => {
      const s = balloon.initialState(Math.random);
      expect(s.air).toBe(0);
      expect(s.puffs).toEqual([]);
      expect(s.poppedBy).toBeNull();
      expect(balloon.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("割れる回数は rng で決まり、12〜32 回目のどれか", () => {
      expect(balloon.initialState(() => 0).burstAt).toBe(BURST_MIN);
      expect(balloon.initialState(() => 0.9999).burstAt).toBe(BURST_MAX);
      expect(balloon.initialState(() => 0.5).burstAt).toBe(22);
      for (let i = 0; i < 100; i++) {
        const { burstAt } = balloon.initialState(Math.random);
        expect(Number.isInteger(burstAt)).toBe(true);
        expect(burstAt).toBeGreaterThanOrEqual(BURST_MIN);
        expect(burstAt).toBeLessThanOrEqual(BURST_MAX);
      }
    });
  });

  describe("ふくらませる", () => {
    it("タップした回数だけ空気が入り、手番が相手に移る", () => {
      let s = play(withBurst(30), [3]);
      expect(s.air).toBe(3);
      expect(s.puffs).toEqual([{ seat: 0, taps: 3 }]);
      expect(balloon.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [5]);
      expect(s.air).toBe(8);
      expect(airOf(s.puffs, 0)).toBe(3);
      expect(airOf(s.puffs, 1)).toBe(5);
      expect(balloon.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("1 回の手番でふくらませるのは 1〜5 回。0 回や 6 回以上、小数は受け付けない", () => {
      const s = withBurst(30);
      expect(play(s, [MIN_TAPS]).air).toBe(1);
      expect(play(s, [MAX_TAPS]).air).toBe(5);
      for (const taps of [0, -1, MAX_TAPS + 1, 100, 2.5]) {
        expect(() => balloon.applyMove(s, { taps }, 0)).toThrow(IllegalMoveError);
        expect(() => balloon.applyMove(s, { taps }, 0)).toThrow("balloon_taps");
      }
    });

    it("手番でない人はふくらませられない", () => {
      const s = withBurst(30);
      expect(() => balloon.applyMove(s, { taps: 1 }, 1)).toThrow("not_your_turn");
      expect(() => balloon.applyMove(play(s, [2]), { taps: 1 }, 0)).toThrow("not_your_turn");
    });
  });

  describe("割れる", () => {
    it("割れる回数に届いたら割れて、ふくらませた人の負け（1 つ手前では割れない）", () => {
      let s = play(withBurst(12), [5, 5, 1]);
      expect(s.air).toBe(11);
      expect(balloon.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [1]);
      expect(s.poppedBy).toBe(1);
      expect(balloon.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("割れる回数を越えて入れても、その手で割れる。先手が割ったら後手の勝ち", () => {
      const s = play(withBurst(14), [5, 5, 5]);
      expect(s.air).toBe(15);
      expect(s.poppedBy).toBe(0);
      expect(balloon.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("割れたら終わり。もうふくらませられない", () => {
      const s = play(withBurst(12), [5, 5, 5]);
      expect(() => balloon.applyMove(s, { taps: 1 }, 1)).toThrow("game_over");
      expect(() => balloon.applyMove(s, { taps: 1 }, 0)).toThrow("game_over");
    });
  });

  describe("割れずに終わったとき", () => {
    it("1 人 5 回ずつ、合わせて 10 手ふくらませて割れなければ、空気を多く入れた方の勝ち", () => {
      let s = play(withBurst(BURST_MAX), [3, 2, 3, 2, 3, 2, 3, 2, 3]);
      expect(balloon.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [2]);
      expect(s.puffs).toHaveLength(TURNS);
      expect(s.air).toBe(25);
      expect(balloon.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(() => balloon.applyMove(s, { taps: 1 }, 0)).toThrow("game_over");
    });

    it("後手が最後に追いこせば後手の勝ち", () => {
      const s = play(withBurst(BURST_MAX), [3, 2, 3, 2, 3, 2, 3, 3, 1, 5]);
      expect(airOf(s.puffs, 0)).toBe(13);
      expect(airOf(s.puffs, 1)).toBe(14);
      expect(balloon.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("同じだけ入れていたら引き分け", () => {
      const s = play(withBurst(BURST_MAX), [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
      expect(s.air).toBe(30);
      expect(balloon.status(s)).toEqual({ kind: "finished", winner: null });
    });
  });

  describe("見せる情報", () => {
    it("割れる回数は 2 人にも観戦者にも見えない", () => {
      const s = play(withBurst(23), [4, 2]);
      for (const viewer of [0, 1, null] as const) {
        expect(view(s, viewer).burstAt).toBeNull();
        expect(view(s, viewer).air).toBe(6);
        expect(view(s, viewer).puffs).toEqual(s.puffs);
      }
    });

    it("終局後は割れる回数も見える", () => {
      const s = play(withBurst(23), [5, 5, 5, 5, 5]);
      expect(balloon.status(s).kind).toBe("finished");
      expect(view(s, 0, true).burstAt).toBe(23);
      expect(view(s, 1, true).burstAt).toBe(23);
      expect(view(s, null, true).burstAt).toBe(23);
    });

    it("ふくらませた回数はもともと見えているので、手の記録はそのまま", () => {
      expect(balloon.viewMove!({ taps: 3 }, 0, 1)).toEqual({ taps: 3 });
    });
  });

  it("parseMove は整数の回数だけ受け付ける（範囲は applyMove で確かめる）", () => {
    expect(balloon.parseMove({ taps: 3 })).toEqual({ taps: 3 });
    expect(balloon.parseMove({ taps: 9 })).toEqual({ taps: 9 });
    expect(balloon.parseMove({ taps: 1.5 })).toBeNull();
    expect(balloon.parseMove({ taps: "3" })).toBeNull();
    expect(balloon.parseMove({ taps: Number.NaN })).toBeNull();
    expect(balloon.parseMove({})).toBeNull();
    expect(balloon.parseMove(null)).toBeNull();
    expect(balloon.parseMove(3)).toBeNull();
  });

  describe("コンピュータ", () => {
    const pick = (s: BalloonState, r = 0.5) =>
      (balloon.botMove!(view(s, s.turn), s.turn, () => r) as { taps: number } | null)?.taps;

    it("自分の番でなければ null。終わっていても null", () => {
      const s = withBurst(30);
      expect(balloon.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(withBurst(12), [5, 5, 5]);
      expect(balloon.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("いつも 1〜5 回の整数を返す。割れる回数は見えない形で受け取る", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(game);
        let s = balloon.initialState(rng);
        while (balloon.status(s).kind === "playing") {
          const v = view(s, s.turn);
          expect(v.burstAt).toBeNull();
          const move = balloon.botMove!(v, s.turn, rng) as { taps: number };
          expect(Number.isInteger(move.taps)).toBe(true);
          expect(move.taps).toBeGreaterThanOrEqual(MIN_TAPS);
          expect(move.taps).toBeLessThanOrEqual(MAX_TAPS);
          s = balloon.applyMove(s, move, s.turn);
        }
      }
    });

    it("まだ割れないと分かっているうちは多めに入れる", () => {
      const s = withBurst(30);
      for (const r of [0, 0.5, 0.9999]) expect(pick(s, r)).toBeGreaterThanOrEqual(3);
      // 9 まで入っていれば、11 までは割れないので 2 回
      expect(pick(play(s, [5, 4]), 0.5)).toBe(2);
    });

    it("最後の手番では、相手をちょうど 1 回上回るだけ入れる", () => {
      // 先手 7・後手 4 で後手の最後の手番。8 にすれば勝ち
      const s = play(withBurst(BURST_MAX), [1, 1, 1, 1, 1, 1, 1, 1, 3]);
      expect(s.puffs).toHaveLength(TURNS - 1);
      for (const r of [0, 0.5, 0.9999]) expect(pick(s, r)).toBe(4);
      // もう上回っていれば 1 回だけ
      const ahead = play(withBurst(BURST_MAX), [1, 1, 1, 1, 1, 1, 1, 5, 1]);
      expect(pick(ahead, 0.5)).toBe(1);
    });

    it("コンピュータ同士で 20 局とも途中で止まらずに終わる", () => {
      for (let game = 0; game < 20; game++) {
        const rng = seeded(100 + game);
        let s = balloon.initialState(rng);
        for (let ply = 0; ply < 50 && balloon.status(s).kind === "playing"; ply++) {
          const move = botMove(balloon, s, s.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = balloon.applyMove(s, move, s.turn);
        }
        expect(balloon.status(s).kind).toBe("finished");
        expect(s.puffs.length).toBeLessThanOrEqual(TURNS);
      }
    });
  });
});
