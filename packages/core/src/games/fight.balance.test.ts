import { describe, expect, it } from "vitest";
import type { Rng, Seat } from "../types.ts";
import { botBuild, EXCHANGES, fight, STYLE_IDS, type Fighter, type FighterStats, type FightState, type StyleId } from "./fight.ts";

/**
 * バックボーン・ファイトのバランス（コンピュータ同士の勝率）。たくさん対局して時間がかかるので、ほかのテストと並んで動くよう
 * fight.test.ts とは別のファイルにしてある
 */

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

const stats = (power: number, guard: number, speed: number, stamina: number): FighterStats => ({ power, guard, speed, stamina });
const f = (style: StyleId, s: FighterStats): Fighter => ({ style, stats: s });

/** コンピュータ同士で最後まで戦う。キャラは決めておく（コンピュータの技の選び方だけで戦う） */
function botGame(a: Fighter, b: Fighter, rng: Rng): FightState {
  let s = fight.initialState(rng);
  s = fight.applyMove(s, { type: "build", style: a.style, stats: a.stats }, 0);
  s = fight.applyMove(s, { type: "build", style: b.style, stats: b.stats }, 1);
  for (let i = 0; i < EXCHANGES * 2 + 2; i++) {
    const st = fight.status(s);
    if (st.kind === "finished") return s;
    const move = fight.botMove!(fight.viewState!(s, st.turn, false), st.turn, rng);
    if (move === null) throw new Error("コンピュータが技を選べなかった");
    s = fight.applyMove(s, move, st.turn);
  }
  throw new Error("終わらなかった");
}

/** 何局か戦った結果の数え */
interface Tally {
  /** a 側の勝ち点（勝ち 1・引き分け 0.5）の割合 */
  rate: number;
  games: number;
  kos: number;
  draws: number;
  /** 攻防の数の合計 */
  exchanges: number;
}

/** a 側から見た勝率と、KO・引き分け・攻防の数。席の有利不利が出ないよう、半分は席を入れ替える */
function tally(make: (rng: Rng) => [Fighter, Fighter], games: number, seed: number): Tally {
  const rng = seeded(seed);
  let points = 0;
  const out = { games, kos: 0, draws: 0, exchanges: 0 };
  for (let g = 0; g < games; g++) {
    const [a, b] = make(rng);
    const swap = g % 2 === 1;
    const end = botGame(swap ? b : a, swap ? a : b, rng);
    const st = fight.status(end);
    if (st.kind !== "finished") throw new Error("終わっていない");
    const aSeat: Seat = swap ? 1 : 0;
    points += st.winner === null ? 0.5 : st.winner === aSeat ? 1 : 0;
    out.exchanges += end.history.length;
    if (end.history.at(-1)?.ko != null) out.kos++;
    else if (st.winner === null) out.draws++;
  }
  return { rate: points / games, ...out };
}
const winRate = (make: (rng: Rng) => [Fighter, Fighter], games: number, seed: number) => tally(make, games, seed).rate;

describe("fight", () => {
  describe("バランス", () => {
    /** 1 組あたりの局数（25 × 25 の 300 組。テストの時間が長くなりすぎないように） */
    const GAMES = 120;
    /** 35〜65% から外れた組だけ、局数を足して確かめ直す（局数が少ないと運のぶれだけで外れることがあるため） */
    const RECHECK = 600;
    /** たくさん対局するので、ほかのテストと並んで動いても間に合うように長めに待つ */
    const SLOW = 120_000;

    it("どのバックボーンどうしでも、勝率は 35〜65%。回復や強化・弱体があっても決着はつく（コンピュータ同士、振り分けはそれらしく）", () => {
      const out: string[] = [];
      const all = { games: 0, kos: 0, draws: 0, exchanges: 0 };
      const outside = (rate: number) => rate < 0.35 || rate > 0.65;
      STYLE_IDS.forEach((a, i) => {
        STYLE_IDS.slice(i + 1).forEach((b, j) => {
          const make = (rng: Rng): [Fighter, Fighter] => [f(a, botBuild(a, rng)), f(b, botBuild(b, rng))];
          const t = tally(make, GAMES, 7 + i * 31 + j);
          for (const k of ["games", "kos", "draws", "exchanges"] as const) all[k] += t[k];
          if (!outside(t.rate)) return;
          const more = tally(make, RECHECK, 100_007 + i * 31 + j);
          const rate = (t.rate * t.games + more.rate * more.games) / (t.games + more.games);
          if (outside(rate)) out.push(`${a} vs ${b}: ${Math.round(rate * 100)}%`);
        });
      });
      expect(out).toEqual([]);
      // 判定ばかり・引き分けばかりにならない
      expect(all.kos / all.games).toBeGreaterThan(0.3);
      expect(all.draws / all.games).toBeLessThan(0.03);
      expect(all.exchanges / all.games).toBeLessThan(EXCHANGES);
    }, SLOW);

    it("極端な振り分けにも勝ち目と弱点がある", () => {
      const extremes: FighterStats[] = [stats(8, 1, 3, 8), stats(8, 1, 8, 3), stats(1, 8, 3, 8), stats(3, 8, 8, 1), stats(1, 3, 8, 8), stats(8, 8, 1, 3)];
      for (const x of extremes) {
        // どのバックボーンで使うかごとに、ふつうに振り分けた相手（バックボーンはでたらめ）との勝率
        const rates = STYLE_IDS.map((style, i) =>
          winRate((rng) => {
            const opp = STYLE_IDS[Math.floor(rng() * STYLE_IDS.length)]!;
            return [f(style, x), f(opp, botBuild(opp, rng))];
          }, 40, 99 + i),
        );
        const label = JSON.stringify(x);
        // 合うバックボーンなら五分以上に戦え（勝ち目）、どれでも勝ち越せるわけではない（弱点）。勝ちすぎ・負けすぎもない
        expect(Math.max(...rates), label).toBeGreaterThan(0.45);
        expect(Math.min(...rates), label).toBeLessThan(0.5);
        const avg = rates.reduce((a, r) => a + r, 0) / rates.length;
        expect(avg, label).toBeGreaterThan(0.3);
        expect(avg, label).toBeLessThan(0.7);
      }
    }, SLOW);
  });
});
