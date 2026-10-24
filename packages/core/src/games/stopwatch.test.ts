import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  errorOf,
  FAIL_ERROR,
  isValidTarget,
  MAX_MS,
  MAX_TARGET,
  MIN_TARGET,
  roundResult,
  ROUNDS,
  stopwatch,
  tally,
  toCentis,
  type StopwatchMove,
  type StopwatchState,
  type StopwatchView,
} from "./stopwatch.ts";

const start = (target?: number): StopwatchMove => (target === undefined ? { kind: "start" } : { kind: "start", target });
const stop = (ms: number): StopwatchMove => ({ kind: "stop", ms });
const fail: StopwatchMove = { kind: "fail" };

/** 手番の人が順に指す */
const play = (s: StopwatchState, moves: StopwatchMove[]) => moves.reduce((st, m) => stopwatch.applyMove(st, m, st.turn), s);

/** 1 回戦ぶん：出題者が target を出して setterMs で止め、相手が otherMs で止める */
const round = (target: number, setterMs: number | null, otherMs: number | null): StopwatchMove[] => [
  start(target),
  setterMs === null ? fail : stop(setterMs),
  start(),
  otherMs === null ? fail : stop(otherMs),
];

const fresh = () => stopwatch.initialState(Math.random);
const view = (s: StopwatchState, viewer: Seat | null, revealAll = false) =>
  stopwatch.viewState!(s, viewer, revealAll) as StopwatchView;

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

describe("stopwatch", () => {
  describe("はじめ", () => {
    it("1 回戦目は先手が出題する。目標はまだ決まっていない", () => {
      const s = fresh();
      expect(s.rounds).toEqual([{ setter: 0, target: null, tries: [null, null], running: null }]);
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("出題", () => {
    it("目標は 5.0〜15.0 秒の 0.1 秒きざみ（ミリ秒で 5000〜15000 の 100 の倍数）", () => {
      for (const ms of [MIN_TARGET, 5100, 9900, 10000, 13700, MAX_TARGET]) expect(isValidTarget(ms), String(ms)).toBe(true);
      for (const ms of [0, 4900, 4999, 5050, 13750, 15001, 15100, 20000, -5000, 10000.5, Number.NaN, Infinity])
        expect(isValidTarget(ms), String(ms)).toBe(false);
    });

    it("出題者は最初のスタートで目標を一緒に送る。範囲外や半端な秒数は受け付けない", () => {
      const s = fresh();
      expect(play(s, [start(13700)]).rounds[0]!.target).toBe(13700);
      for (const target of [4900, 15100, 13750, 0])
        expect(() => stopwatch.applyMove(s, start(target), 0)).toThrow("stopwatch_target");
      // 目標なしではスタートできない
      expect(() => stopwatch.applyMove(s, start(), 0)).toThrow("stopwatch_target");
    });

    it("出題者は続けて自分が挑戦する（スタートしても手番は移らない）", () => {
      let s = play(fresh(), [start(8000)]);
      expect(s.rounds[0]!.running).toBe(0);
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [stop(8120)]);
      expect(s.rounds[0]!.tries).toEqual([{ ms: 8120 }, null]);
      expect(s.rounds[0]!.running).toBeNull();
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("相手は同じ目標に挑戦する。目標を変えることはできない", () => {
      const s = play(fresh(), [start(8000), stop(8120)]);
      expect(() => stopwatch.applyMove(s, start(9000), 1)).toThrow("stopwatch_target_set");
      const next = play(s, [start()]);
      expect(next.rounds[0]!.target).toBe(8000);
      expect(next.rounds[0]!.running).toBe(1);
    });
  });

  describe("挑戦", () => {
    it("かかった時間は 0〜60 秒の整数ミリ秒。範囲外は受け付けない", () => {
      const s = play(fresh(), [start(10000)]);
      expect(play(s, [stop(0)]).rounds[0]!.tries[0]).toEqual({ ms: 0 });
      expect(play(s, [stop(MAX_MS)]).rounds[0]!.tries[0]).toEqual({ ms: MAX_MS });
      for (const ms of [-1, MAX_MS + 1, 1e9, 10000.5]) expect(() => stopwatch.applyMove(s, stop(ms), 0)).toThrow("stopwatch_ms");
    });

    it("スタートの前にストップや失敗扱いはできない。スタートを 2 回はできない", () => {
      const s = fresh();
      expect(() => stopwatch.applyMove(s, stop(1000), 0)).toThrow("stopwatch_not_started");
      expect(() => stopwatch.applyMove(s, fail, 0)).toThrow("stopwatch_not_started");
      const running = play(s, [start(10000)]);
      expect(() => stopwatch.applyMove(running, start(), 0)).toThrow("stopwatch_running");
      expect(() => stopwatch.applyMove(running, start(10000), 0)).toThrow("stopwatch_running");
    });

    it("ずれは目標との差の大きさ。早くても遅くても同じ", () => {
      expect(errorOf(13700, { ms: 13520 })).toBe(180);
      expect(errorOf(13700, { ms: 13880 })).toBe(180);
      expect(errorOf(13700, { ms: 13700 })).toBe(0);
    });
  });

  it("かかった時間は 1/100 秒に丸め、0〜60 秒におさめる", () => {
    expect(toCentis(13524.9)).toBe(13520);
    expect(toCentis(13525)).toBe(13530);
    expect(toCentis(-3)).toBe(0);
    expect(toCentis(MAX_MS + 999)).toBe(MAX_MS);
  });

  describe("始めたまま開き直したとき（やり直しはできない）", () => {
    it("失敗扱いの手で、その挑戦は時間なし（ms: null）になり、手番が移る", () => {
      const s = play(fresh(), [start(10000), fail]);
      expect(s.rounds[0]!.tries).toEqual([{ ms: null }, null]);
      expect(s.rounds[0]!.running).toBeNull();
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 1 });
      // もう一度スタートしてやり直すことはできない
      expect(() => stopwatch.applyMove(s, start(), 0)).toThrow("not_your_turn");
    });

    it("失敗扱いのずれは、どんなストップよりも悪い（60 秒で止めても失敗よりはまし）", () => {
      expect(errorOf(MIN_TARGET, { ms: null })).toBe(FAIL_ERROR);
      for (const target of [MIN_TARGET, 10000, MAX_TARGET]) {
        for (const ms of [0, target, MAX_MS]) expect(errorOf(target, { ms })).toBeLessThan(FAIL_ERROR);
      }
      const s = play(fresh(), round(MIN_TARGET, null, MAX_MS));
      expect(roundResult(s.rounds[0]!)).toEqual({ errors: [FAIL_ERROR, MAX_MS - MIN_TARGET], winner: 1 });
    });

    it("2 人とも失敗扱いなら、その回戦は引き分け", () => {
      const s = play(fresh(), round(10000, null, null));
      expect(roundResult(s.rounds[0]!)).toEqual({ errors: [FAIL_ERROR, FAIL_ERROR], winner: null });
    });
  });

  describe("隠す情報", () => {
    it("出題者の結果は、相手が挑戦し終わるまで相手にも観戦者にも伏せる", () => {
      const s = play(fresh(), [start(13700), stop(13520)]);
      expect(view(s, 0).rounds[0]!.tries).toEqual([{ ms: 13520 }, null]);
      expect(view(s, 1).rounds[0]!.tries).toEqual(["hidden", null]);
      expect(view(s, null).rounds[0]!.tries).toEqual(["hidden", null]);
      // 目標と、挑戦中かどうかは見える
      const running = play(s, [start()]);
      expect(view(running, 0).rounds[0]).toMatchObject({ target: 13700, running: 1, tries: [{ ms: 13520 }, null] });
      expect(view(running, 1).rounds[0]).toMatchObject({ target: 13700, running: 1, tries: ["hidden", null] });
    });

    it("失敗扱いだったことも伏せる", () => {
      const s = play(fresh(), [start(13700), fail]);
      expect(view(s, 1).rounds[0]!.tries).toEqual(["hidden", null]);
    });

    it("相手が挑戦し終わった瞬間に、2 人の結果を見せ合う", () => {
      const s = play(fresh(), round(13700, 13520, 14030));
      for (const viewer of [0, 1, null] as const) {
        expect(view(s, viewer).rounds[0]!.tries).toEqual([{ ms: 13520 }, { ms: 14030 }]);
      }
      // 次の回戦で出題者が止めた分は、また伏せる
      const next = play(s, [start(7000), stop(7100)]);
      // 2 回戦の出題者は後手
      expect(view(next, 0).rounds.map((r) => r.tries)).toEqual([
        [{ ms: 13520 }, { ms: 14030 }],
        [null, "hidden"],
      ]);
    });

    it("終局後は全部見せる", () => {
      const s = play(fresh(), [...round(10000, 10100, 10300), ...round(9000, 9100, 9300), ...round(8000, 8050, 8400)]);
      expect(stopwatch.status(s).kind).toBe("finished");
      expect(view(s, 1, true)).toEqual(s);
      expect(view(s, null, true)).toEqual(s);
    });

    it("手の記録では、相手のストップと失敗扱いの区別と時間を伏せる。スタート（目標）はそのまま", () => {
      expect(stopwatch.viewMove!(stop(13520), 0, 0)).toEqual(stop(13520));
      expect(stopwatch.viewMove!(stop(13520), 0, 1)).toEqual({ kind: "stop", ms: null });
      expect(stopwatch.viewMove!(fail, 0, 1)).toEqual({ kind: "stop", ms: null });
      expect(stopwatch.viewMove!(stop(13520), 1, null)).toEqual({ kind: "stop", ms: null });
      expect(stopwatch.viewMove!(start(13700), 0, 1)).toEqual(start(13700));
    });
  });

  describe("回戦の勝ち負け", () => {
    it("ずれが小さい方がその回戦の勝ち", () => {
      const s = play(fresh(), round(13700, 13520, 14030));
      expect(roundResult(s.rounds[0]!)).toEqual({ errors: [180, 330], winner: 0 });
      const t = play(fresh(), round(13700, 14100, 13600));
      expect(roundResult(t.rounds[0]!)).toEqual({ errors: [400, 100], winner: 1 });
    });

    it("ずれが同じなら引き分けの回戦（早い・遅いは関係ない）", () => {
      const s = play(fresh(), round(10000, 9800, 10200));
      expect(roundResult(s.rounds[0]!)).toEqual({ errors: [200, 200], winner: null });
    });

    it("終わっていない回戦や、伏せてある回戦は結果なし", () => {
      const s = play(fresh(), [start(10000), stop(10100)]);
      expect(roundResult(s.rounds[0]!)).toBeNull();
      expect(roundResult(view(s, 1).rounds[0]!)).toBeNull();
    });

    it("回戦ごとに出題者が交代し、出題する人がそのまま手番を続ける", () => {
      let s = play(fresh(), round(10000, 10100, 10300));
      expect(s.rounds).toHaveLength(2);
      expect(s.rounds[1]).toEqual({ setter: 1, target: null, tries: [null, null], running: null });
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [start(6000), stop(6100)]);
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [start(), stop(6500)]);
      expect(s.rounds[2]!.setter).toBe(0);
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("勝敗", () => {
    it("3 回戦で多く勝った方の勝ち", () => {
      // 先手が 1・3 回戦、後手が 2 回戦に勝つ
      const s = play(fresh(), [...round(10000, 10100, 10300), ...round(9000, 9000, 9200), ...round(8000, 8050, 8400)]);
      expect(s.rounds).toHaveLength(ROUNDS);
      expect(tally(s.rounds).wins).toEqual([2, 1]);
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("2 回戦で 2 勝したら、3 回戦はせずにそこで終わる", () => {
      // 1 回戦（出題 先手）も 2 回戦（出題 後手）も後手のずれが小さい
      const s = play(fresh(), [...round(10000, 10500, 10100), ...round(9000, 9050, 9400)]);
      expect(s.rounds).toHaveLength(2);
      expect(tally(s.rounds).wins).toEqual([0, 2]);
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: 1 });
      expect(() => stopwatch.applyMove(s, start(10000), 0)).toThrow("game_over");
      expect(() => stopwatch.applyMove(s, start(10000), 1)).toThrow("game_over");
    });

    it("1 勝 0 敗 1 分けでは、まだ逆転があるので 3 回戦をする", () => {
      const s = play(fresh(), [...round(10000, 10100, 10300), ...round(9000, 9200, 8800)]);
      expect(tally(s.rounds).wins).toEqual([1, 0]);
      expect(stopwatch.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("勝った数が同じなら、3 回戦のずれの合計が小さい方の勝ち", () => {
      // 1 勝 1 敗 1 分け。ずれの合計は 先手 100 + 500 + 300 = 900、後手 300 + 100 + 300 = 700
      const s = play(fresh(), [...round(10000, 10100, 10300), ...round(9000, 9100, 9500), ...round(8000, 7700, 8300)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], errors: [900, 700] });
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("1 勝 0 敗 2 分けなら、1 勝した方の勝ち", () => {
      // 3 回戦だけ先手のずれ 50・後手 100
      const s = play(fresh(), [...round(10000, 10100, 9900), ...round(9000, 9100, 8900), ...round(8000, 8050, 7900)]);
      expect(tally(s.rounds).wins).toEqual([1, 0]);
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("3 回戦とも引き分けなら引き分け（どの回戦もずれが同じなので、合計も同じ）", () => {
      const s = play(fresh(), [...round(10000, 10100, 9900), ...round(9000, 9100, 8900), ...round(8000, 8050, 7950)]);
      expect(tally(s.rounds)).toEqual({ wins: [0, 0], errors: [250, 250] });
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: null });
    });

    it("勝った数もずれの合計も同じなら引き分け", () => {
      // 1 回戦は先手（100 対 300）、2 回戦は後手（100 対 300）、3 回戦は引き分け
      const s = play(fresh(), [...round(10000, 10100, 10300), ...round(9000, 9100, 9300), ...round(8000, 8000, 8000)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], errors: [400, 400] });
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: null });
    });

    it("失敗扱いはずれの合計にも 60 秒として入る", () => {
      // 1 回戦は先手が失敗扱いで後手の勝ち、2 回戦は先手（100 対 300）、3 回戦は引き分け
      const s = play(fresh(), [...round(10000, null, 10300), ...round(9000, 9300, 9100), ...round(8000, 8000, 8000)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], errors: [FAIL_ERROR + 100, 600] });
      expect(stopwatch.status(s)).toEqual({ kind: "finished", winner: 1 });
    });
  });

  describe("手番", () => {
    it("手番でない人は指せない", () => {
      const s = fresh();
      expect(() => stopwatch.applyMove(s, start(10000), 1)).toThrow("not_your_turn");
      const waiting = play(s, [start(10000)]);
      expect(() => stopwatch.applyMove(waiting, stop(10000), 1)).toThrow("not_your_turn");
      const next = play(waiting, [stop(10000)]);
      expect(() => stopwatch.applyMove(next, start(), 0)).toThrow("not_your_turn");
    });

    it("不正な手は IllegalMoveError で、状態は変えない", () => {
      const s = play(fresh(), [start(10000)]);
      const before = JSON.stringify(s);
      expect(() => stopwatch.applyMove(s, stop(-5), 0)).toThrow(IllegalMoveError);
      expect(JSON.stringify(s)).toBe(before);
    });
  });

  it("parseMove は形だけ確かめる（範囲は applyMove で確かめる）", () => {
    expect(stopwatch.parseMove({ kind: "start" })).toEqual({ kind: "start" });
    expect(stopwatch.parseMove({ kind: "start", target: 13700 })).toEqual({ kind: "start", target: 13700 });
    expect(stopwatch.parseMove({ kind: "start", target: 99999 })).toEqual({ kind: "start", target: 99999 });
    expect(stopwatch.parseMove({ kind: "start", target: 13700.5 })).toBeNull();
    expect(stopwatch.parseMove({ kind: "start", target: "13700" })).toBeNull();
    expect(stopwatch.parseMove({ kind: "start", target: null })).toBeNull();
    expect(stopwatch.parseMove({ kind: "stop", ms: 13520 })).toEqual({ kind: "stop", ms: 13520 });
    expect(stopwatch.parseMove({ kind: "stop", ms: -1 })).toEqual({ kind: "stop", ms: -1 });
    expect(stopwatch.parseMove({ kind: "stop", ms: 13520.4 })).toBeNull();
    expect(stopwatch.parseMove({ kind: "stop", ms: Number.NaN })).toBeNull();
    expect(stopwatch.parseMove({ kind: "stop" })).toBeNull();
    expect(stopwatch.parseMove({ kind: "fail" })).toEqual({ kind: "fail" });
    // 余計な値は落とす
    expect(stopwatch.parseMove({ kind: "fail", ms: 3 })).toEqual({ kind: "fail" });
    expect(stopwatch.parseMove({ kind: "stop", ms: 100, target: 5000 })).toEqual({ kind: "stop", ms: 100 });
    for (const raw of [{ kind: "reset" }, {}, null, undefined, 3, "start", []]) expect(stopwatch.parseMove(raw)).toBeNull();
    // 送り直しても同じ手として読める
    for (const m of [start(), start(5000), stop(0), fail]) expect(stopwatch.parseMove(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  describe("コンピュータ", () => {
    const pick = (s: StopwatchState, rng: Rng = Math.random) => stopwatch.botMove!(view(s, s.turn), s.turn, rng);

    it("自分の番でなければ null。終わっていても null", () => {
      const s = fresh();
      expect(stopwatch.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(s, [...round(10000, 10500, 10100), ...round(9000, 9050, 9400)]);
      expect(stopwatch.status(over).kind).toBe("finished");
      expect(stopwatch.botMove!(view(over, 0), 0, Math.random)).toBeNull();
      expect(stopwatch.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("出題では 5.0〜15.0 秒の 0.1 秒きざみから選び、スタートする", () => {
      const rng = seeded(1);
      const targets = new Set<number>();
      for (let i = 0; i < 300; i++) {
        const move = pick(fresh(), rng) as { kind: string; target: number };
        expect(move.kind).toBe("start");
        expect(isValidTarget(move.target)).toBe(true);
        targets.add(move.target);
      }
      // 毎回同じ秒数ではない
      expect(targets.size).toBeGreaterThan(20);
    });

    it("相手の出題には目標なしでスタートし、始めたらストップする", () => {
      const s = play(fresh(), [start(12300), stop(12000)]);
      expect(pick(s)).toEqual({ kind: "start" });
      const running = play(s, [start()]);
      const move = pick(running) as { kind: string; ms: number };
      expect(move.kind).toBe("stop");
      expect(Number.isInteger(move.ms)).toBe(true);
      expect(move.ms).toBeGreaterThanOrEqual(0);
      expect(move.ms).toBeLessThanOrEqual(MAX_MS);
      // ずれがない乱数なら目標ちょうど
      expect(pick(running, () => 0)).toEqual({ kind: "stop", ms: 12300 });
      // 画面と同じく 1/100 秒に丸めて止める
      for (let i = 0; i < 50; i++) expect((pick(running) as { ms: number }).ms % 10).toBe(0);
    });

    it("相手の結果は伏せた形で受け取っても選べる", () => {
      const s = play(fresh(), [start(12300), stop(12000), start()]);
      const v = view(s, 1);
      expect(v.rounds[0]!.tries[0]).toBe("hidden");
      expect(stopwatch.botMove!(v, 1, Math.random)).toMatchObject({ kind: "stop" });
    });

    it("ずれは人間らしく、標準偏差 0.3〜0.5 秒ほど。長い秒数ほど大きい", () => {
      const sd = (target: number) => {
        const rng = seeded(target);
        const s = play(fresh(), [start(target)]);
        const errs: number[] = [];
        for (let i = 0; i < 3000; i++) errs.push((pick(s, rng) as { ms: number }).ms - target);
        const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
        return Math.sqrt(errs.reduce((a, e) => a + (e - mean) ** 2, 0) / errs.length);
      };
      const short = sd(MIN_TARGET);
      const long = sd(MAX_TARGET);
      expect(short).toBeGreaterThan(250);
      expect(short).toBeLessThan(400);
      expect(long).toBeGreaterThan(400);
      expect(long).toBeLessThan(550);
      expect(long).toBeGreaterThan(short);
    });

    it("コンピュータ同士で 30 局とも途中で止まらずに終わる。手はいつも受け付けられる", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(200 + game);
        let s = stopwatch.initialState(rng);
        for (let ply = 0; ply < 30 && stopwatch.status(s).kind === "playing"; ply++) {
          const move = botMove(stopwatch, s, s.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = stopwatch.applyMove(s, move, s.turn);
        }
        expect(stopwatch.status(s).kind).toBe("finished");
        expect(s.rounds.length).toBeGreaterThanOrEqual(2);
        expect(s.rounds.length).toBeLessThanOrEqual(ROUNDS);
      }
    });
  });
});
