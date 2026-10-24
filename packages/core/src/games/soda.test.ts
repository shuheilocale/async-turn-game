import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  addedOf,
  LIMIT_MAX,
  LIMIT_MIN,
  MAX_POWER,
  MIN_POWER,
  pressureOf,
  SHAKES,
  soda,
  type SodaMove,
  type SodaState,
  type SodaView,
} from "./soda.ts";

/** 限界を決めたボトル */
const withLimit = (limit: number): SodaState => ({ ...soda.initialState(Math.random), limit });

const start: SodaMove = { kind: "start" };
const shake = (power: number, input: "motion" | "touch" = "motion"): SodaMove => ({ kind: "shake", power, input });
const fail: SodaMove = { kind: "fail" };

/** 手番の人が順に「振る」を押して、その強さで振る */
const play = (s: SodaState, powers: number[]) =>
  powers.reduce((st, p) => soda.applyMove(soda.applyMove(st, start, st.turn), shake(p), st.turn), s);

const view = (s: SodaState, viewer: Seat | null, revealAll = false) => soda.viewState!(s, viewer, revealAll) as SodaView;

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

describe("soda", () => {
  describe("ボトル", () => {
    it("はじめは圧力 0 で、先手から。まだ誰も振っていない", () => {
      const s = soda.initialState(Math.random);
      expect(s.pressure).toBe(0);
      expect(s.shakes).toEqual([]);
      expect(s.shaking).toBeNull();
      expect(s.burstBy).toBeNull();
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("限界は rng で決まり、LIMIT_MIN〜LIMIT_MAX のどれか", () => {
      expect(soda.initialState(() => 0).limit).toBe(LIMIT_MIN);
      expect(soda.initialState(() => 0.9999).limit).toBe(LIMIT_MAX);
      for (let i = 0; i < 100; i++) {
        const { limit } = soda.initialState(Math.random);
        expect(Number.isInteger(limit)).toBe(true);
        expect(limit).toBeGreaterThanOrEqual(LIMIT_MIN);
        expect(limit).toBeLessThanOrEqual(LIMIT_MAX);
      }
    });
  });

  describe("振りはじめ", () => {
    it("「振る」を押すとサーバに記録され、手番はそのまま", () => {
      const s = soda.applyMove(withLimit(400), start, 0);
      expect(s.shaking).toBe(0);
      expect(s.pressure).toBe(0);
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("振りはじめたら、もう一度は始められない（やり直しできない）", () => {
      const s = soda.applyMove(withLimit(400), start, 0);
      expect(() => soda.applyMove(s, start, 0)).toThrow("soda_shaking");
    });

    it("振りはじめずに結果は送れない", () => {
      expect(() => soda.applyMove(withLimit(400), shake(50), 0)).toThrow("soda_not_started");
      expect(() => soda.applyMove(withLimit(400), fail, 0)).toThrow("soda_not_started");
    });

    it("手番でない人は始めることも振ることもできない", () => {
      const s = withLimit(400);
      expect(() => soda.applyMove(s, start, 1)).toThrow("not_your_turn");
      const started = soda.applyMove(s, start, 0);
      expect(() => soda.applyMove(started, shake(40), 1)).toThrow("not_your_turn");
    });
  });

  describe("圧力", () => {
    it("振った強さの分だけ圧力が上がり、手番が相手に移る", () => {
      let s = play(withLimit(400), [62]);
      expect(s.pressure).toBe(62);
      expect(s.shaking).toBeNull();
      expect(s.shakes).toEqual([{ seat: 0, power: 62, added: 62, input: "motion" }]);
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [35]);
      expect(s.pressure).toBe(97);
      expect(pressureOf(s.shakes, 0)).toBe(62);
      expect(pressureOf(s.shakes, 1)).toBe(35);
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("どちらで遊んだか（センサー・指）を記録する", () => {
      let s = soda.applyMove(withLimit(400), start, 0);
      s = soda.applyMove(s, shake(40, "touch"), 0);
      expect(s.shakes[0]!.input).toBe("touch");
    });

    it("振りが足りない（MIN_POWER 未満）ときは、最低量の MIN_POWER が足される", () => {
      expect(addedOf(0)).toBe(MIN_POWER);
      expect(addedOf(MIN_POWER - 1)).toBe(MIN_POWER);
      expect(addedOf(MIN_POWER)).toBe(MIN_POWER);
      expect(addedOf(MAX_POWER)).toBe(MAX_POWER);
      const s = play(withLimit(400), [3]);
      expect(s.pressure).toBe(MIN_POWER);
      expect(s.shakes[0]).toEqual({ seat: 0, power: 3, added: MIN_POWER, input: "motion" });
    });

    it("強さは 0〜MAX_POWER の整数。範囲外や小数は受け付けない", () => {
      const s = soda.applyMove(withLimit(400), start, 0);
      expect(soda.applyMove(s, shake(0), 0).pressure).toBe(MIN_POWER);
      expect(soda.applyMove(s, shake(MAX_POWER), 0).pressure).toBe(MAX_POWER);
      for (const power of [-1, MAX_POWER + 1, 1000, 12.5, Number.NaN]) {
        expect(() => soda.applyMove(s, shake(power), 0)).toThrow(IllegalMoveError);
        expect(() => soda.applyMove(s, shake(power), 0)).toThrow("soda_power");
      }
    });
  });

  describe("吹き出す", () => {
    it("圧力が限界を超えたら吹き出して、振った人の負け（ちょうど限界ならまだ大丈夫）", () => {
      let s = play(withLimit(200), [100, 100]);
      expect(s.pressure).toBe(200);
      expect(s.burstBy).toBeNull();
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [20]);
      expect(s.burstBy).toBe(0);
      expect(soda.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("後手が吹き出させたら先手の勝ち", () => {
      const t = play(withLimit(250), [100, 100, 40, 20]);
      expect(t.pressure).toBe(260);
      expect(t.burstBy).toBe(1);
      expect(soda.status(t)).toEqual({ kind: "finished", winner: 0 });
    });

    it("吹き出したら終わり。もう振れない", () => {
      const s = play(withLimit(LIMIT_MIN), [100, 100]);
      expect(soda.status(s).kind).toBe("finished");
      expect(() => soda.applyMove(s, start, 0)).toThrow("game_over");
      expect(() => soda.applyMove(s, start, 1)).toThrow("game_over");
    });
  });

  describe("吹き出さずに終わったとき（ほとんど振らないのが一番安全にならないように）", () => {
    it("1 人 4 回ずつ、合わせて 8 回振って吹き出さなければ、圧力を多く入れた方の勝ち", () => {
      let s = play(withLimit(LIMIT_MAX), [60, 40, 60, 40, 60, 40, 60]);
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [40]);
      expect(s.shakes).toHaveLength(SHAKES);
      expect(s.pressure).toBe(400);
      expect(soda.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(() => soda.applyMove(s, start, 0)).toThrow("game_over");
    });

    it("毎回ほとんど振らない人は、最低量しか入らないので、ふつうに振る人に負ける", () => {
      const s = play(withLimit(LIMIT_MAX), [2, 50, 0, 50, 5, 50, 1, 50]);
      expect(pressureOf(s.shakes, 0)).toBe(4 * MIN_POWER);
      expect(soda.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("後手が最後に追いこせば後手の勝ち。同じなら引き分け", () => {
      const head = [50, 40, 50, 40, 50, 40, 50];
      const s = play(withLimit(LIMIT_MAX), [...head, 81]);
      expect(pressureOf(s.shakes, 0)).toBe(200);
      expect(pressureOf(s.shakes, 1)).toBe(201);
      expect(soda.status(s)).toEqual({ kind: "finished", winner: 1 });
      expect(soda.status(play(withLimit(LIMIT_MAX), [...head, 80]))).toEqual({ kind: "finished", winner: null });
      expect(soda.status(play(withLimit(LIMIT_MAX), [...head, 79]))).toEqual({ kind: "finished", winner: 0 });
    });

    it("コンピュータ同士で比べると、毎回ほとんど振らないやり方は、ふつうに振るやり方に負け越す", () => {
      // 先手と後手を入れ替えながら、いつも 0（最低量）と、いつも 50 前後で 400 局
      let weakWins = 0;
      let games = 0;
      for (let i = 0; i < 400; i++) {
        const rng = seeded(1000 + i);
        const weakSeat: Seat = i % 2 === 0 ? 0 : 1;
        let s = soda.initialState(rng);
        while (soda.status(s).kind === "playing") {
          const power = s.turn === weakSeat ? 0 : Math.round(45 + rng() * 10);
          s = soda.applyMove(soda.applyMove(s, start, s.turn), shake(power), s.turn);
        }
        const st = soda.status(s);
        games++;
        if (st.kind === "finished" && st.winner === weakSeat) weakWins++;
      }
      expect(weakWins / games).toBeLessThan(0.4);
    });
  });

  describe("始めたまま閉じたとき", () => {
    it("失敗扱いで閉じると、いちばん強く振ったこと（MAX_POWER）になる", () => {
      let s = soda.applyMove(withLimit(400), start, 0);
      s = soda.applyMove(s, fail, 0);
      expect(s.pressure).toBe(MAX_POWER);
      expect(s.shakes[0]).toEqual({ seat: 0, power: null, added: MAX_POWER, input: null });
      expect(soda.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("失敗扱いでも限界を超えれば吹き出す", () => {
      let s = play(withLimit(LIMIT_MIN), [100]);
      s = soda.applyMove(soda.applyMove(s, start, 1), fail, 1);
      expect(s.burstBy).toBe(1);
      expect(soda.status(s)).toEqual({ kind: "finished", winner: 0 });
    });
  });

  describe("見せる情報", () => {
    it("限界は 2 人にも観戦者にも見えない。圧力と振った強さは見える", () => {
      const s = play(withLimit(321), [44, 70]);
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer);
        expect(v.limit).toBeNull();
        expect(v.pressure).toBe(114);
        expect(v.shakes).toEqual(s.shakes);
      }
    });

    it("振っている最中かどうかも見える", () => {
      const s = soda.applyMove(withLimit(321), start, 0);
      expect(view(s, 1).shaking).toBe(0);
    });

    it("終局後は限界も見える", () => {
      const s = play(withLimit(LIMIT_MIN), [100, 100]);
      expect(soda.status(s).kind).toBe("finished");
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer, true).limit).toBe(LIMIT_MIN);
    });

    it("振った強さはもともと見えているので、手の記録はそのまま", () => {
      expect(soda.viewMove!(shake(30), 0, 1)).toEqual(shake(30));
      expect(soda.viewMove!(start, 0, 1)).toEqual(start);
    });
  });

  it("parseMove は形だけ確かめる（強さの範囲は applyMove で確かめる）", () => {
    expect(soda.parseMove({ kind: "start" })).toEqual({ kind: "start" });
    expect(soda.parseMove({ kind: "fail" })).toEqual({ kind: "fail" });
    expect(soda.parseMove({ kind: "shake", power: 40, input: "motion" })).toEqual(shake(40));
    expect(soda.parseMove({ kind: "shake", power: 400, input: "touch" })).toEqual(shake(400, "touch"));
    expect(soda.parseMove({ kind: "shake", power: 4.5, input: "motion" })).toBeNull();
    expect(soda.parseMove({ kind: "shake", power: "40", input: "motion" })).toBeNull();
    expect(soda.parseMove({ kind: "shake", power: 40 })).toBeNull();
    expect(soda.parseMove({ kind: "shake", power: 40, input: "keyboard" })).toBeNull();
    expect(soda.parseMove({ kind: "pour" })).toBeNull();
    expect(soda.parseMove({})).toBeNull();
    expect(soda.parseMove(null)).toBeNull();
    expect(soda.parseMove("start")).toBeNull();
  });

  describe("コンピュータ", () => {
    const powerOf = (s: SodaState, r: Rng = () => 0.5) => {
      const started = soda.applyMove(s, start, s.turn);
      const m = soda.botMove!(view(started, started.turn), started.turn, r) as SodaMove;
      expect(m.kind).toBe("shake");
      return (m as { power: number }).power;
    };

    it("自分の番でなければ null。終わっていても null", () => {
      const s = withLimit(400);
      expect(soda.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(withLimit(LIMIT_MIN), [100, 100]);
      expect(soda.botMove!(view(over, 0), 0, Math.random)).toBeNull();
    });

    it("まず「振る」を押し、振りはじめていれば強さを送る", () => {
      const s = withLimit(400);
      expect(soda.botMove!(view(s, 0), 0, Math.random)).toEqual({ kind: "start" });
      const started = soda.applyMove(s, start, 0);
      const m = soda.botMove!(view(started, 0), 0, Math.random) as SodaMove;
      expect(m.kind).toBe("shake");
    });

    it("強さはいつも 0〜MAX_POWER の整数。限界は見えない形で受け取る", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(game);
        let s = soda.initialState(rng);
        while (soda.status(s).kind === "playing") {
          const v = view(s, s.turn);
          expect(v.limit).toBeNull();
          const m = soda.botMove!(v, s.turn, rng) as SodaMove;
          if (m.kind === "shake") {
            expect(Number.isInteger(m.power)).toBe(true);
            expect(m.power).toBeGreaterThanOrEqual(0);
            expect(m.power).toBeLessThanOrEqual(MAX_POWER);
          }
          s = soda.applyMove(s, m, s.turn);
        }
      }
    });

    it("まだ吹き出さないと分かっているうちは強めに、危ないところでは控えめに振る", () => {
      const safe = powerOf(withLimit(LIMIT_MAX));
      const risky = powerOf(play(withLimit(LIMIT_MAX), [90, 90]));
      expect(safe).toBeGreaterThanOrEqual(50);
      expect(risky).toBeLessThan(safe);
    });

    it("最後の手番では、相手を少し上回るくらいに振る", () => {
      // 先手 4 回で 200、後手 3 回で 90。後手は 111 以上入れれば勝てる…が、最大 100 なのでできるだけ強く
      const behind = play(withLimit(LIMIT_MAX), [50, 30, 50, 30, 50, 30, 50]);
      expect(powerOf(behind)).toBeGreaterThanOrEqual(85);
      // 先手 4 回で 120、後手 3 回で 90。31 以上入れれば勝てるので、強く振りすぎない
      const close = play(withLimit(LIMIT_MAX), [30, 30, 30, 30, 30, 30, 30]);
      const p = powerOf(close);
      expect(p).toBeGreaterThanOrEqual(31);
      expect(p).toBeLessThan(70);
    });

    it("コンピュータ同士で 20 局とも途中で止まらずに終わる", () => {
      for (let game = 0; game < 20; game++) {
        const rng = seeded(100 + game);
        let s = soda.initialState(rng);
        for (let ply = 0; ply < 50 && soda.status(s).kind === "playing"; ply++) {
          const move = botMove(soda, s, s.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = soda.applyMove(s, move, s.turn);
        }
        expect(soda.status(s).kind).toBe("finished");
        expect(s.shakes.length).toBeLessThanOrEqual(SHAKES);
      }
    });
  });
});
