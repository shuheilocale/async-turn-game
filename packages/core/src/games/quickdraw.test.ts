import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  BOT_FOUL_RATE,
  FOUL_MS,
  MAX_DELAY,
  MAX_MS,
  MIN_DELAY,
  quickdraw,
  roundResult,
  ROUNDS,
  tally,
  type QuickdrawMove,
  type QuickdrawState,
  type QuickdrawView,
} from "./quickdraw.ts";

const ready: QuickdrawMove = { kind: "ready" };
const tap = (ms: number): QuickdrawMove => ({ kind: "tap", ms });
const foul: QuickdrawMove = { kind: "foul" };

/** 手番の人が順に指す */
const play = (s: QuickdrawState, moves: QuickdrawMove[]) => moves.reduce((st, m) => quickdraw.applyMove(st, m, st.turn), s);

/** 1 回戦ぶん：先に挑戦する人が firstMs、あとの人が secondMs で押す（null ならおてつき） */
const round = (firstMs: number | null, secondMs: number | null): QuickdrawMove[] => [
  ready,
  firstMs === null ? foul : tap(firstMs),
  ready,
  secondMs === null ? foul : tap(secondMs),
];

const fresh = () => quickdraw.initialState(Math.random);
const view = (s: QuickdrawState, viewer: Seat | null, revealAll = false) =>
  quickdraw.viewState!(s, viewer, revealAll) as QuickdrawView;

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

/** 決まった値を順に返す乱数（足りなくなったら最後の値をくり返す） */
const sequence = (values: number[]): Rng => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe("quickdraw", () => {
  describe("はじめ", () => {
    it("1 回戦目は先手が先に挑戦する。まだだれも始めていない", () => {
      const s = fresh();
      expect(s.rounds).toEqual([{ first: 0, tries: [null, null], running: null }]);
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("合図までの待ち時間は、3 回戦の 2 人分をはじめに決めておく（1.5〜5 秒の整数ミリ秒）", () => {
      for (let game = 0; game < 50; game++) {
        const s = quickdraw.initialState(seeded(game));
        expect(s.delays).toHaveLength(ROUNDS);
        for (const pair of s.delays) {
          expect(pair).toHaveLength(2);
          for (const ms of pair) {
            expect(Number.isInteger(ms)).toBe(true);
            expect(ms).toBeGreaterThanOrEqual(MIN_DELAY);
            expect(ms).toBeLessThanOrEqual(MAX_DELAY);
          }
        }
      }
    });

    it("待ち時間は rng で決まる。端の値も出る", () => {
      const s = quickdraw.initialState(sequence([0, 0.9999999, 0.5, 0.25, 0.75, 0.1]));
      expect(s.delays).toEqual([
        [MIN_DELAY, MAX_DELAY],
        [3250, 2375],
        [4125, 1850],
      ]);
      // 同じ種なら同じ、ちがう種ならちがう
      expect(quickdraw.initialState(seeded(7)).delays).toEqual(quickdraw.initialState(seeded(7)).delays);
      expect(quickdraw.initialState(seeded(7)).delays).not.toEqual(quickdraw.initialState(seeded(8)).delays);
    });

    it("待ち時間は毎回ばらばら", () => {
      const all = new Set<number>();
      for (let game = 0; game < 100; game++) for (const pair of quickdraw.initialState(seeded(1000 + game)).delays) pair.forEach((ms) => all.add(ms));
      expect(all.size).toBeGreaterThan(450);
    });
  });

  describe("待ち時間を見せる時", () => {
    // 1 回戦 先手 1500 / 後手 5000、2 回戦 先手 3250 / 後手 2375、3 回戦 先手 4125 / 後手 1850
    const known = () => quickdraw.initialState(sequence([0, 0.9999999, 0.5, 0.25, 0.75, 0.1]));
    const leaks = (v: QuickdrawView, s: QuickdrawState) => {
      const json = JSON.stringify(v);
      return s.delays.flat().filter((ms) => json.includes(String(ms)));
    };

    it("始めるまでは、だれにも見えない（全部の待ち時間も渡さない）", () => {
      const s = known();
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer);
        expect(v.delay).toBeNull();
        expect(v).not.toHaveProperty("delays");
        expect(leaks(v, s)).toEqual([]);
      }
    });

    it("始めた手が受け付けられたら、挑戦している本人にだけ、その挑戦の待ち時間を渡す", () => {
      const s = play(known(), [ready]);
      expect(view(s, 0).delay).toBe(1500);
      expect(view(s, 1).delay).toBeNull();
      expect(view(s, null).delay).toBeNull();
      // ほかの挑戦の待ち時間は、本人にも渡さない
      expect(leaks(view(s, 0), s)).toEqual([1500]);
      expect(leaks(view(s, 1), s)).toEqual([]);
    });

    it("押し終わったら、もう渡さない。相手の挑戦では相手の分だけ", () => {
      let s = play(known(), [ready, tap(250)]);
      expect(view(s, 0).delay).toBeNull();
      s = play(s, [ready]);
      expect(view(s, 1).delay).toBe(5000);
      expect(view(s, 0).delay).toBeNull();
      // 2 回戦は後手が先に挑戦する
      s = play(s, [tap(260), ready]);
      expect(s.rounds[1]!.first).toBe(1);
      expect(view(s, 1).delay).toBe(2375);
      expect(view(s, 0).delay).toBeNull();
      s = play(s, [foul, ready]);
      expect(view(s, 0).delay).toBe(3250);
    });

    it("終局後は全部見せる", () => {
      // 1 回戦も 2 回戦（後手が先に挑戦）も先手が速い
      const s = play(known(), [...round(250, 300), ...round(310, 260)]);
      expect(quickdraw.status(s).kind).toBe("finished");
      const v = view(s, 1, true);
      expect(v.delays).toEqual(s.delays);
      expect(v.rounds).toEqual(s.rounds);
      expect(v.delay).toBeNull();
    });
  });

  describe("準備と挑戦", () => {
    it("準備しても手番は移らない。押したら相手の番", () => {
      let s = play(fresh(), [ready]);
      expect(s.rounds[0]!.running).toBe(0);
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [tap(287)]);
      expect(s.rounds[0]!.tries).toEqual([{ ms: 287 }, null]);
      expect(s.rounds[0]!.running).toBeNull();
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("反応時間は 0〜3 秒の整数ミリ秒。範囲外は受け付けない", () => {
      const s = play(fresh(), [ready]);
      expect(play(s, [tap(0)]).rounds[0]!.tries[0]).toEqual({ ms: 0 });
      expect(play(s, [tap(MAX_MS)]).rounds[0]!.tries[0]).toEqual({ ms: MAX_MS });
      for (const ms of [-1, MAX_MS + 1, 1e9, 250.5, Number.NaN, Infinity])
        expect(() => quickdraw.applyMove(s, tap(ms), 0), String(ms)).toThrow("quickdraw_ms");
    });

    it("準備の前に押すことはできない。準備を 2 回はできない", () => {
      const s = fresh();
      expect(() => quickdraw.applyMove(s, tap(300), 0)).toThrow("quickdraw_not_started");
      expect(() => quickdraw.applyMove(s, foul, 0)).toThrow("quickdraw_not_started");
      const running = play(s, [ready]);
      expect(() => quickdraw.applyMove(running, ready, 0)).toThrow("quickdraw_running");
    });
  });

  describe("おてつき", () => {
    it("合図の前に押したら、その挑戦は記録なし（ms: null）で、手番が移る", () => {
      const s = play(fresh(), [ready, foul]);
      expect(s.rounds[0]!.tries).toEqual([{ ms: null }, null]);
      expect(s.rounds[0]!.running).toBeNull();
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("おてつきはその回戦の負け。相手がどんなに遅くても", () => {
      const s = play(fresh(), round(null, MAX_MS));
      expect(roundResult(s.rounds[0]!)).toEqual({ ms: [null, MAX_MS], winner: 1 });
      const t = play(fresh(), round(120, null));
      expect(roundResult(t.rounds[0]!)).toEqual({ ms: [120, null], winner: 0 });
    });

    it("2 人ともおてつきなら、その回戦は引き分け", () => {
      const s = play(fresh(), round(null, null));
      expect(roundResult(s.rounds[0]!)).toEqual({ ms: [null, null], winner: null });
    });
  });

  describe("始めたまま画面を閉じたとき（やり直しはできない）", () => {
    it("開き直した画面がおてつきの手を送って閉じる。もう一度準備することはできない", () => {
      const s = play(fresh(), [ready, foul]);
      expect(s.rounds[0]!.tries[0]).toEqual({ ms: null });
      expect(() => quickdraw.applyMove(s, ready, 0)).toThrow("not_your_turn");
      expect(() => quickdraw.applyMove(s, tap(200), 0)).toThrow("not_your_turn");
    });

    it("始めたままの間は、ほかの手では閉じられない（準備のやり直しも、相手の手もだめ）", () => {
      const s = play(fresh(), [ready]);
      expect(() => quickdraw.applyMove(s, ready, 0)).toThrow("quickdraw_running");
      expect(() => quickdraw.applyMove(s, ready, 1)).toThrow("not_your_turn");
      expect(() => quickdraw.applyMove(s, foul, 1)).toThrow("not_your_turn");
    });
  });

  describe("隠す情報", () => {
    it("先に挑戦した人の結果は、相手が挑戦し終わるまで相手にも観戦者にも伏せる", () => {
      const s = play(fresh(), [ready, tap(287)]);
      expect(view(s, 0).rounds[0]!.tries).toEqual([{ ms: 287 }, null]);
      expect(view(s, 1).rounds[0]!.tries).toEqual(["hidden", null]);
      expect(view(s, null).rounds[0]!.tries).toEqual(["hidden", null]);
      // 挑戦中かどうかは見える
      const running = play(s, [ready]);
      expect(view(running, 1).rounds[0]).toMatchObject({ running: 1, tries: ["hidden", null] });
      expect(view(running, 0).rounds[0]).toMatchObject({ running: 1, tries: [{ ms: 287 }, null] });
    });

    it("おてつきだったことも伏せる", () => {
      const s = play(fresh(), [ready, foul]);
      expect(view(s, 1).rounds[0]!.tries).toEqual(["hidden", null]);
    });

    it("相手が挑戦し終わった瞬間に、2 人の結果を見せ合う。次の回戦で先に押した分は、また伏せる", () => {
      const s = play(fresh(), round(287, 301));
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).rounds[0]!.tries).toEqual([{ ms: 287 }, { ms: 301 }]);
      const next = play(s, [ready, tap(256)]);
      expect(view(next, 0).rounds.map((r) => r.tries)).toEqual([
        [{ ms: 287 }, { ms: 301 }],
        [null, "hidden"],
      ]);
    });

    it("手の記録では、相手の反応時間とおてつきの区別を伏せる。準備はそのまま", () => {
      expect(quickdraw.viewMove!(tap(287), 0, 0)).toEqual(tap(287));
      expect(quickdraw.viewMove!(tap(287), 0, 1)).toEqual({ kind: "tap", ms: null });
      expect(quickdraw.viewMove!(foul, 0, 1)).toEqual({ kind: "tap", ms: null });
      expect(quickdraw.viewMove!(tap(287), 1, null)).toEqual({ kind: "tap", ms: null });
      expect(quickdraw.viewMove!(ready, 0, 1)).toEqual(ready);
    });
  });

  describe("回戦の勝ち負け", () => {
    it("反応時間が短い方がその回戦の勝ち。同じなら引き分け", () => {
      expect(roundResult(play(fresh(), round(287, 301)).rounds[0]!)).toEqual({ ms: [287, 301], winner: 0 });
      expect(roundResult(play(fresh(), round(350, 240)).rounds[0]!)).toEqual({ ms: [350, 240], winner: 1 });
      expect(roundResult(play(fresh(), round(300, 300)).rounds[0]!)).toEqual({ ms: [300, 300], winner: null });
    });

    it("終わっていない回戦や、伏せてある回戦は結果なし", () => {
      const s = play(fresh(), [ready, tap(250)]);
      expect(roundResult(s.rounds[0]!)).toBeNull();
      expect(roundResult(view(s, 1).rounds[0]!)).toBeNull();
    });

    it("回戦ごとに先に挑戦する人が交代し、その人がそのまま手番を続ける", () => {
      let s = play(fresh(), round(250, 300));
      expect(s.rounds).toHaveLength(2);
      expect(s.rounds[1]).toEqual({ first: 1, tries: [null, null], running: null });
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 1 });
      // 2 回戦は後手が勝って 1 勝 1 敗（決着しないので 3 回戦へ）
      s = play(s, [ready, tap(260)]);
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [ready, tap(280)]);
      expect(s.rounds[2]!.first).toBe(0);
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("勝敗", () => {
    it("3 回戦で多く勝った方の勝ち", () => {
      // 1・3 回戦は先手（1 回戦と 3 回戦は先手が先に挑戦）、2 回戦は後手の勝ち。合計が長くても勝ち数で決まる
      const s = play(fresh(), [...round(250, 300), ...round(260, 2900), ...round(240, 330)]);
      expect(s.rounds).toHaveLength(ROUNDS);
      expect(tally(s.rounds)).toEqual({ wins: [2, 1], total: [250 + 2900 + 240, 300 + 260 + 330] });
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("2 回戦で 2 勝したら、3 回戦はせずにそこで終わる", () => {
      // 1 回戦（先に挑戦 先手）も 2 回戦（先に挑戦 後手）も後手が速い
      const s = play(fresh(), [...round(320, 280), ...round(250, 330)]);
      expect(s.rounds).toHaveLength(2);
      expect(tally(s.rounds).wins).toEqual([0, 2]);
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: 1 });
      expect(() => quickdraw.applyMove(s, ready, 0)).toThrow("game_over");
      expect(() => quickdraw.applyMove(s, ready, 1)).toThrow("game_over");
    });

    it("おてつきで 2 敗しても、2 回戦で決着する", () => {
      const s = play(fresh(), [...round(null, 400), ...round(500, null)]);
      expect(tally(s.rounds).wins).toEqual([0, 2]);
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("1 勝 0 敗 1 分けでは、まだ逆転があるので 3 回戦をする", () => {
      const s = play(fresh(), [...round(250, 300), ...round(280, 280)]);
      expect(tally(s.rounds).wins).toEqual([1, 0]);
      expect(quickdraw.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("勝った数が同じなら、反応時間の合計が短い方の勝ち", () => {
      // 1 勝 1 敗 1 分け。合計は 先手 250 + 400 + 300 = 950、後手 300 + 260 + 300 = 860
      const s = play(fresh(), [...round(250, 300), ...round(260, 400), ...round(300, 300)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], total: [950, 860] });
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("おてつきは合計に 3 秒（いちばん遅い記録と同じ）として入る", () => {
      expect(FOUL_MS).toBe(MAX_MS);
      // 1 回戦は先手のおてつきで後手の勝ち、2 回戦は先手（後手が先に挑戦して 400、先手 300）、3 回戦は 2 人ともおてつき
      const s = play(fresh(), [...round(null, 900), ...round(400, 300), ...round(null, null)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], total: [FOUL_MS + 300 + FOUL_MS, 900 + 400 + FOUL_MS] });
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("1 勝 0 敗 2 分けなら、1 勝した方の勝ち", () => {
      const s = play(fresh(), [...round(300, 300), ...round(null, null), ...round(2900, 2950)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 0], total: [300 + FOUL_MS + 2900, 300 + FOUL_MS + 2950] });
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("勝った数も反応時間の合計も同じなら引き分け", () => {
      // 1 回戦は先手（250 対 300）、2 回戦は後手（後手が先に 250、先手 300）、3 回戦は引き分け
      const s = play(fresh(), [...round(250, 300), ...round(250, 300), ...round(280, 280)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], total: [830, 830] });
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: null });
    });

    it("3 回戦とも引き分けなら引き分け", () => {
      const s = play(fresh(), [...round(280, 280), ...round(null, null), ...round(300, 300)]);
      expect(tally(s.rounds).wins).toEqual([0, 0]);
      expect(quickdraw.status(s)).toEqual({ kind: "finished", winner: null });
    });
  });

  describe("手番", () => {
    it("手番でない人は指せない", () => {
      const s = fresh();
      expect(() => quickdraw.applyMove(s, ready, 1)).toThrow("not_your_turn");
      const waiting = play(s, [ready]);
      expect(() => quickdraw.applyMove(waiting, tap(300), 1)).toThrow("not_your_turn");
      const next = play(waiting, [tap(300)]);
      expect(() => quickdraw.applyMove(next, ready, 0)).toThrow("not_your_turn");
    });

    it("不正な手は IllegalMoveError で、状態は変えない", () => {
      const s = play(fresh(), [ready]);
      const before = JSON.stringify(s);
      expect(() => quickdraw.applyMove(s, tap(-5), 0)).toThrow(IllegalMoveError);
      expect(() => quickdraw.applyMove(s, tap(300), 1)).toThrow(IllegalMoveError);
      expect(JSON.stringify(s)).toBe(before);
    });
  });

  it("parseMove は形だけ確かめる（範囲は applyMove で確かめる）", () => {
    expect(quickdraw.parseMove({ kind: "ready" })).toEqual(ready);
    expect(quickdraw.parseMove({ kind: "tap", ms: 287 })).toEqual(tap(287));
    expect(quickdraw.parseMove({ kind: "tap", ms: -1 })).toEqual(tap(-1));
    expect(quickdraw.parseMove({ kind: "tap", ms: 99999 })).toEqual(tap(99999));
    expect(quickdraw.parseMove({ kind: "tap", ms: 287.5 })).toBeNull();
    expect(quickdraw.parseMove({ kind: "tap", ms: "287" })).toBeNull();
    expect(quickdraw.parseMove({ kind: "tap", ms: Number.NaN })).toBeNull();
    expect(quickdraw.parseMove({ kind: "tap", ms: null })).toBeNull();
    expect(quickdraw.parseMove({ kind: "tap" })).toBeNull();
    expect(quickdraw.parseMove({ kind: "foul" })).toEqual(foul);
    // 余計な値は落とす（待ち時間を送りつけても使わない）
    expect(quickdraw.parseMove({ kind: "ready", delay: 1500 })).toEqual(ready);
    expect(quickdraw.parseMove({ kind: "foul", ms: 3 })).toEqual(foul);
    expect(quickdraw.parseMove({ kind: "tap", ms: 100, delay: 1500 })).toEqual(tap(100));
    for (const raw of [{ kind: "start" }, { kind: "fail" }, {}, null, undefined, 3, "ready", []]) expect(quickdraw.parseMove(raw)).toBeNull();
    // 送り直しても同じ手として読める
    for (const m of [ready, tap(0), tap(MAX_MS), foul]) expect(quickdraw.parseMove(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  describe("コンピュータ", () => {
    const pick = (s: QuickdrawState, rng: Rng = Math.random) => quickdraw.botMove!(view(s, s.turn), s.turn, rng);

    it("自分の番でなければ null。終わっていても null", () => {
      const s = fresh();
      expect(quickdraw.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(s, [...round(320, 280), ...round(250, 330)]);
      expect(quickdraw.status(over).kind).toBe("finished");
      expect(quickdraw.botMove!(view(over, 0), 0, Math.random)).toBeNull();
      expect(quickdraw.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("まだ始めていなければ準備し、始めたら押す", () => {
      const s = fresh();
      expect(pick(s)).toEqual(ready);
      const running = play(s, [ready]);
      expect(pick(running, () => 0.5)).toEqual(tap(305));
      // 乱数が小さければおてつき
      expect(pick(running, () => 0)).toEqual(foul);
    });

    it("相手の結果は伏せた形で受け取っても選べる", () => {
      const s = play(fresh(), [ready, tap(250), ready]);
      const v = view(s, 1);
      expect(v.rounds[0]!.tries[0]).toBe("hidden");
      expect(quickdraw.botMove!(v, 1, Math.random)).toMatchObject({ kind: expect.stringMatching(/^(tap|foul)$/) });
    });

    it("反応時間は 230〜380 ms くらいの人間らしい値。ときどき（5% くらい）おてつき", () => {
      const rng = seeded(42);
      const running = play(fresh(), [ready]);
      const times: number[] = [];
      let fouls = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const move = pick(running, rng)!;
        if (move.kind === "foul") fouls++;
        else if (move.kind === "tap") times.push(move.ms);
        else throw new Error(`思わぬ手 ${move.kind}`);
      }
      expect(BOT_FOUL_RATE).toBeCloseTo(0.05);
      expect(fouls / n).toBeGreaterThan(0.03);
      expect(fouls / n).toBeLessThan(0.07);
      for (const ms of times) {
        expect(Number.isInteger(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(230);
        expect(ms).toBeLessThanOrEqual(380);
      }
      // 真ん中あたりに集まり、毎回同じではない
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      expect(mean).toBeGreaterThan(280);
      expect(mean).toBeLessThan(330);
      expect(new Set(times).size).toBeGreaterThan(100);
      const middle = times.filter((ms) => ms >= 270 && ms <= 340).length / times.length;
      expect(middle).toBeGreaterThan(0.55);
    });

    it("コンピュータ同士で 30 局とも途中で止まらずに終わる。手はいつも受け付けられる", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(200 + game);
        let s = quickdraw.initialState(rng);
        for (let ply = 0; ply < 30 && quickdraw.status(s).kind === "playing"; ply++) {
          const move = botMove(quickdraw, s, s.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = quickdraw.applyMove(s, move, s.turn);
        }
        expect(quickdraw.status(s).kind).toBe("finished");
        expect(s.rounds.length).toBeGreaterThanOrEqual(2);
        expect(s.rounds.length).toBeLessThanOrEqual(ROUNDS);
      }
    });
  });
});
