import { describe, expect, it } from "vitest";
import { Oekaki } from "@atg/core";
import messages from "../../i18n/games/oekaki.ts";
import { planPlayback, PLAY_MAX_MS, PLAY_MIN_MS, visibleAt } from "./playback.ts";

type Stroke = Oekaki.Stroke;

/** 横にまっすぐな線（x を 100 から 100 ずつ、n 点） */
const across = (t0: number, t1: number, n = 3): Stroke => ({
  color: 0,
  width: 0,
  t0,
  t1,
  points: Array.from({ length: n }, (_, i) => [100 + i * 100, 500] as Oekaki.Point),
});

describe("おえかきクイズの絵の再生", () => {
  it("描いた時間が短ければ、そのままの速さで再生する", () => {
    const plan = planPlayback([across(0, 1000), across(1200, 2000)]);
    expect(plan.duration).toBe(2000);
    expect(plan.strokes.map((s) => [s.from, s.to])).toEqual([
      [0, 1000],
      [1200, 2000],
    ]);
  });

  it("長く描いた絵は 5〜8 秒に縮める。線のあいだの長い待ち時間も縮める", () => {
    const long = Array.from({ length: 20 }, (_, i) => across(i * 2000, i * 2000 + 1500));
    const plan = planPlayback(long);
    expect(plan.duration).toBeGreaterThanOrEqual(PLAY_MIN_MS);
    expect(plan.duration).toBeLessThanOrEqual(PLAY_MAX_MS);
    // 1 筆目を描き始めるまで考えていた時間は待たない。10 秒考えてから描いた線も、すぐ始まる
    const waited = planPlayback([across(10_000, 11_000), across(30_000, 31_000)]);
    expect(waited.strokes[0]!.from).toBe(0);
    expect(waited.duration).toBeLessThan(3000);
  });

  it("再生の途中では、描いた順に、描いた長さの割合まで見える", () => {
    const plan = planPlayback([across(0, 1000), across(1000, 2000)]);
    expect(visibleAt(plan, -1)).toEqual([]);
    const half = visibleAt(plan, 500);
    expect(half).toHaveLength(1);
    expect(half[0]!.points).toEqual([
      [100, 500],
      [200, 500],
    ]);
    const quarter = visibleAt(plan, 250);
    expect(quarter[0]!.points.at(-1)).toEqual([150, 500]);
    const all = visibleAt(plan, plan.duration);
    expect(all.map((v) => v.points)).toEqual([across(0, 0).points, across(0, 0).points]);
  });

  it("線がなければ長さ 0。点 1 つの線も見える", () => {
    expect(planPlayback([]).duration).toBe(0);
    const dot = { ...across(0, 0), points: [[500, 500]] as Oekaki.Point[] };
    const plan = planPlayback([dot]);
    expect(plan.duration).toBeGreaterThan(0);
    expect(visibleAt(plan, 0)[0]!.points).toEqual([[500, 500]]);
  });
});

describe("おえかきクイズの文言", () => {
  const topics = Oekaki.GENRES.flatMap((g) => Oekaki.TOPICS[g]);

  it("お題とジャンルの名前が、日本語・英語・タイ語のすべてにある", () => {
    for (const lang of ["ja", "en", "th"] as const) {
      const dict = messages[lang] as Record<string, string>;
      for (const topic of topics) expect(dict[`game.oekaki.topic.${topic}`], `${lang} ${topic}`).toBeTruthy();
      for (const genre of Oekaki.GENRES) expect(dict[`game.oekaki.genre.${genre}`], `${lang} ${genre}`).toBeTruthy();
    }
  });

  it("3 つの言語でキーがそろっていて、一覧にないお題の名前は置かない", () => {
    const keys = (lang: "ja" | "en" | "th") => Object.keys(messages[lang]).sort();
    expect(keys("en")).toEqual(keys("ja"));
    expect(keys("th")).toEqual(keys("ja"));
    const named = keys("ja").filter((k) => k.startsWith("game.oekaki.topic."));
    expect(named.length).toBe(topics.length);
  });

  it("ゲームのエラーコードの文がある", () => {
    for (const code of ["topic", "choice", "too_big", "coords", "stroke", "time", "draw_first", "guess_first"]) {
      expect((messages.ja as Record<string, string>)[`error.oekaki_${code}`]).toBeTruthy();
    }
  });
});
