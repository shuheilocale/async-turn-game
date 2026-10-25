import { expect, it } from "vitest";
import type { Rng, Seat } from "../types.ts";
import { botBuild, EXCHANGES, fight, STYLE_IDS, type Fighter, type FightState, type StyleId } from "./fight.ts";

/**
 * バックボーン・ファイトのバランスを確かめる道具（コンピュータ同士の対局を数える）。テストの fight.balance*.test.ts が使う。
 * 全部の組み合わせはたくさん対局して時間がかかるので、CHUNKS 個のテストのファイルに分けて並んで動かす
 */

/** 組み合わせを分けるファイルの数（fight.balance.test.ts と fight.balance2〜4.test.ts） */
export const CHUNKS = 4;
/** 1 組あたりの局数（31 × 31 の 465 組。テストの時間が長くなりすぎないように） */
const GAMES = 120;
/** 35〜65% から外れた組だけ、局数を足して確かめ直す（局数が少ないと運のぶれだけで外れることがあるため） */
const RECHECK = 600;
/** たくさん対局するので、ほかのテストと並んで動いても間に合うように長めに待つ */
export const SLOW = 120_000;

/** 同じ種から同じ並びを返す乱数（mulberry32） */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** コンピュータ同士で最後まで戦う。キャラは決めておく（コンピュータの技の選び方だけで戦う） */
export function botGame(a: Fighter, b: Fighter, rng: Rng): FightState {
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
export interface Tally {
  /** a 側の勝ち点（勝ち 1・引き分け 0.5）の割合 */
  rate: number;
  games: number;
  kos: number;
  draws: number;
  /** 攻防の数の合計 */
  exchanges: number;
}

/** a 側から見た勝率と、KO・引き分け・攻防の数。席の有利不利が出ないよう、半分は席を入れ替える */
export function tally(make: (rng: Rng) => [Fighter, Fighter], games: number, seed: number): Tally {
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

/** バックボーンの組み合わせ（a が b より前の組）すべて。i・j は STYLE_IDS での位置 */
export const PAIRS: readonly { a: StyleId; b: StyleId; i: number; j: number }[] = STYLE_IDS.flatMap((a, i) =>
  STYLE_IDS.slice(i + 1).map((b, k) => ({ a, b, i, j: i + 1 + k })),
);

/** 2 つのバックボーンの、それらしい振り分けどうしの対局 */
export const pairMaker =
  (a: StyleId, b: StyleId) =>
  (rng: Rng): [Fighter, Fighter] => [
    { style: a, stats: botBuild(a, rng) },
    { style: b, stats: botBuild(b, rng) },
  ];

/** 全部の組み合わせを n 個に分けたうちの k 個目（0 から数える）。重さがそろうよう、1 組ずつ順に配る */
export const pairChunk = (k: number, n: number) => PAIRS.filter((_, idx) => idx % n === k);

/** 勝率が 35〜65% から外れているか */
export const outside = (rate: number) => rate < 0.35 || rate > 0.65;

/**
 * 組み合わせの勝率を games 局ずつ数える。外れた組だけ recheck 局を足して確かめ直す（局数が少ないと運のぶれだけで外れることがあるため）。
 * 返すのは、確かめ直しても外れた組（「a vs b: 勝率%」）と、全部の対局の数え
 */
export function checkPairs(
  pairs: readonly { a: StyleId; b: StyleId; i: number; j: number }[],
  games: number,
  recheck: number,
): { out: string[]; all: Omit<Tally, "rate"> } {
  const out: string[] = [];
  const all = { games: 0, kos: 0, draws: 0, exchanges: 0 };
  for (const { a, b, i, j } of pairs) {
    const make = pairMaker(a, b);
    const t = tally(make, games, 7 + i * 31 + j);
    for (const k of ["games", "kos", "draws", "exchanges"] as const) all[k] += t[k];
    if (!outside(t.rate)) continue;
    const more = tally(make, recheck, 100_007 + i * 31 + j);
    const rate = (t.rate * t.games + more.rate * more.games) / (t.games + more.games);
    if (outside(rate)) out.push(`${a} vs ${b}: ${Math.round(rate * 100)}%`);
  }
  return { out, all };
}

/**
 * 組み合わせの k 個目の分け前を確かめるテスト。どの組も勝率は 35〜65% で、判定ばかり・引き分けばかりにならない
 * （KO が 3 割より多く、引き分けは 3% 未満、1 局の攻防は平均で 8 回より少ない）
 */
export function checkChunk(k: number) {
  it(`どのバックボーンどうしでも、勝率は 35〜65%（${k + 1} / ${CHUNKS}）。回復や強化・弱体があっても決着はつく（コンピュータ同士、振り分けはそれらしく）`, () => {
    const { out, all } = checkPairs(pairChunk(k, CHUNKS), GAMES, RECHECK);
    expect(out).toEqual([]);
    expect(all.kos / all.games).toBeGreaterThan(0.3);
    expect(all.draws / all.games).toBeLessThan(0.03);
    expect(all.exchanges / all.games).toBeLessThan(EXCHANGES);
  }, SLOW);
}
