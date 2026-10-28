import { describe, expect, it } from "vitest";
import type { Rng, Seat } from "../types.ts";
import { STYLE_IDS, type StyleId } from "./fight.ts";
import { raid, randomAct, type RaidMove, type RaidState, type RaidView } from "./raid.ts";

/**
 * ふたりのボス戦のバランス（コンピュータ同士のクリア率）。31 人から 2 人のすべての組（同じキャラどうしも含む 496 組）で、
 * 何局か遊んで数える。それらしく戦うコンピュータ（botMove）はほどほどにクリアでき、でたらめに選ぶとかなり負ける。
 * どの組でも、極端に勝てない・負けないことがない
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

/** 1 組あたりの局数（半分は席を入れ替える） */
const GAMES = 16;
/** たくさん遊ぶので、ほかのテストと並んで動いても間に合うように長めに待つ */
const SLOW = 60_000;

type Chooser = (v: RaidView, seat: Seat, rng: Rng) => RaidMove;
const smart: Chooser = (v, seat, rng) => raid.botMove!(v, seat, rng) as RaidMove;
const random: Chooser = (v, seat, rng) => ({ type: "act", act: randomAct(v, seat, rng) });

function play(a: StyleId, b: StyleId, choose: Chooser, rng: Rng): RaidState {
  let s = raid.initialState(rng);
  s = raid.applyMove(s, { type: "pick", style: a }, 0);
  s = raid.applyMove(s, { type: "pick", style: b }, 1);
  for (let ply = 0; ply < 200; ply++) {
    const st = raid.status(s);
    if (st.kind === "finished") return s;
    s = raid.applyMove(s, choose(raid.viewState!(s, st.turn, false) as RaidView, st.turn, rng), st.turn);
  }
  throw new Error("終わらなかった");
}

interface Result {
  /** 組ごとのクリア率 */
  pairs: { a: StyleId; b: StyleId; rate: number }[];
  /** キャラごとのクリア率（そのキャラが入った組の平均） */
  styles: Record<string, number>;
  rate: number;
  /** クリアしたときのラウンドの数の平均 */
  rounds: number;
}

function run(choose: Chooser, games: number, seed: number): Result {
  const rng = seeded(seed);
  const pairs: Result["pairs"] = [];
  const per: Record<string, [number, number]> = {};
  let clears = 0;
  let total = 0;
  let rounds = 0;
  STYLE_IDS.forEach((a, i) =>
    STYLE_IDS.slice(i).forEach((b) => {
      let c = 0;
      for (let g = 0; g < games; g++) {
        const s = g % 2 === 0 ? play(a, b, choose, rng) : play(b, a, choose, rng);
        const st = raid.status(s);
        if (st.kind === "finished" && st.coop === "cleared") {
          c++;
          rounds += s.history.length;
        }
      }
      pairs.push({ a, b, rate: c / games });
      for (const x of a === b ? [a] : [a, b]) {
        const p = (per[x] ??= [0, 0]);
        p[0] += c;
        p[1] += games;
      }
      clears += c;
      total += games;
    }),
  );
  const styles = Object.fromEntries(Object.entries(per).map(([k, [c, n]]) => [k, c / n]));
  return { pairs, styles, rate: clears / total, rounds: rounds / Math.max(1, clears) };
}

describe("raid", () => {
  describe("バランス", () => {
    it(
      "それらしく戦えば、どの組み合わせでもほどほどにクリアできる（極端に勝てない・負けない組はない）",
      () => {
        const r = run(smart, GAMES, 1);
        // 全体のクリア率は 6〜8 割
        expect(r.rate).toBeGreaterThan(0.6);
        expect(r.rate).toBeLessThan(0.82);
        // クリアまでのラウンドは、数日で遊べる長さ
        expect(r.rounds).toBeGreaterThan(10);
        expect(r.rounds).toBeLessThan(25);
        // キャラごと（どの相棒と組んでも）の平均は 55〜90%
        for (const [style, rate] of Object.entries(r.styles)) {
          expect(rate, style).toBeGreaterThan(0.55);
          expect(rate, style).toBeLessThan(0.9);
        }
        // 組ごと：局数が少なく運でぶれるので幅は広めに。それでも 1 割に届かない組や、どの組も必ず勝てるほどではない
        const sorted = [...r.pairs].sort((x, y) => x.rate - y.rate);
        const worst = sorted[0]!;
        expect(worst.rate, `${worst.a}+${worst.b}`).toBeGreaterThanOrEqual(0.1);
        const p5 = sorted[Math.floor(sorted.length * 0.05)]!.rate;
        const p95 = sorted[Math.floor(sorted.length * 0.95)]!.rate;
        expect(p5).toBeGreaterThanOrEqual(0.35);
        expect(p95).toBeLessThanOrEqual(1);
        expect(sorted.filter((p) => p.rate === 1).length / sorted.length).toBeLessThan(0.1);
      },
      SLOW,
    );

    it(
      "でたらめに選ぶと、かなり負ける",
      () => {
        const r = run(random, 4, 2);
        expect(r.rate).toBeLessThan(0.25);
      },
      SLOW,
    );
  });
});
