import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  CANDIDATES,
  CANVAS,
  CLEAR_SCORE,
  COLORS,
  currentIndex,
  DRAW_MS,
  drawerOf,
  GENRES,
  genreOf,
  MAX_POINTS,
  MAX_STROKES,
  oekaki,
  OPTIONS,
  pointCount,
  QUESTIONS,
  scoreOf,
  thinStrokes,
  TOPICS,
  turnOf,
  WIDTHS,
  type OekakiMove,
  type OekakiState,
  type OekakiView,
  type Point,
  type Stroke,
} from "./oekaki.ts";

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

// ---------- テスト用の絵と手 ----------

/** (100, 100) から右下へ進む線（n 点。キャンバスの端まで来たら折り返す）。t0〜t1 ミリ秒に描いたことにする */
function line(n = 10, { color = 0, width = 0, t0 = 0, t1 = 500 } = {}): Stroke {
  const points = Array.from({ length: n }, (_, i) => [100 + (i % 800), 100 + ((i * 3) % 800)] as Point);
  return { color, width, t0, t1, points };
}

const draw = (topic: string, strokes: Stroke[] = [line()]): OekakiMove => ({ kind: "draw", topic, strokes });
const guess = (topic: string): OekakiMove => ({ kind: "guess", guess: topic });

/** 今の問題の描く人が 1 つ目の候補を描く */
function drawFirst(s: OekakiState, strokes?: Stroke[]): OekakiState {
  const i = currentIndex(s.questions);
  const q = s.questions[i]!;
  return oekaki.applyMove(s, draw(q.candidates[0]!, strokes), q.drawer);
}

/** 今の問題を当てる人が答える。right なら正解、そうでなければ正解でない選択肢 */
function answer(s: OekakiState, right: boolean): OekakiState {
  const i = currentIndex(s.questions);
  const q = s.questions[i]!;
  const view = oekaki.viewState!(s, q.drawer, false) as OekakiView;
  const options = view.questions[i]!.options!;
  const pick = right ? q.topic! : options.find((o) => o !== q.topic)!;
  return oekaki.applyMove(s, guess(pick), drawerOf(i) === 0 ? 1 : 0);
}

/** 正解・不正解の並びどおりに最後まで（または途中まで）進める */
function playThrough(results: boolean[], rng: Rng = seeded(1)): OekakiState {
  let s = oekaki.initialState(rng);
  for (const right of results) s = answer(drawFirst(s), right);
  return s;
}

const view = (s: OekakiState, viewer: Seat | null, revealAll = false) => oekaki.viewState!(s, viewer, revealAll) as OekakiView;

const expectIllegal = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(IllegalMoveError);
    expect((e as IllegalMoveError).code).toBe(code);
    return;
  }
  throw new Error(`${code} が投げられなかった`);
};

describe("oekaki", () => {
  describe("お題の一覧", () => {
    it("ジャンルごとに 8〜12 個、合わせて 80 個くらい。ID はすべてちがう", () => {
      const all = GENRES.flatMap((g) => TOPICS[g]);
      for (const g of GENRES) {
        expect(TOPICS[g].length, g).toBeGreaterThanOrEqual(8);
        expect(TOPICS[g].length, g).toBeLessThanOrEqual(12);
      }
      expect(all.length).toBeGreaterThanOrEqual(75);
      expect(all.length).toBeLessThanOrEqual(100);
      expect(new Set(all).size).toBe(all.length);
      for (const g of GENRES) for (const t of TOPICS[g]) expect(genreOf(t)).toBe(g);
      expect(genreOf("nope")).toBeNull();
    });
  });

  describe("問題の作り方", () => {
    it("6 問。描く人は 1 問目が先手で、1 問ごとに交代する", () => {
      const s = oekaki.initialState(seeded(3));
      expect(s.questions).toHaveLength(QUESTIONS);
      expect(s.questions.map((q) => q.drawer)).toEqual([0, 1, 0, 1, 0, 1]);
      for (const q of s.questions) expect(q).toMatchObject({ topic: null, strokes: null, guess: null });
    });

    it("候補は 3 つで、ジャンルが重ならない。1 局の中で同じお題は候補に 2 度出ない", () => {
      for (let seed = 0; seed < 200; seed++) {
        const s = oekaki.initialState(seeded(seed));
        const seen = new Set<string>();
        for (const q of s.questions) {
          expect(q.candidates).toHaveLength(CANDIDATES);
          const genres = q.candidates.map(genreOf);
          expect(new Set(genres).size).toBe(CANDIDATES);
          for (const c of q.candidates) {
            expect(seen.has(c)).toBe(false);
            seen.add(c);
          }
        }
      }
    });

    it("1 局で、どのジャンルも候補にちょうど 2 回ずつ出る（かたよらない）", () => {
      for (let seed = 0; seed < 50; seed++) {
        const s = oekaki.initialState(seeded(seed));
        const count = new Map<string, number>();
        for (const q of s.questions) for (const c of q.candidates) count.set(genreOf(c)!, (count.get(genreOf(c)!) ?? 0) + 1);
        expect([...count.values()]).toEqual(GENRES.map(() => 2));
      }
    });

    it("当てる人の選択肢は、候補ごとに 4 つ：その候補と、同じジャンルのほかのお題 3 つ", () => {
      for (let seed = 0; seed < 100; seed++) {
        const s = oekaki.initialState(seeded(seed));
        for (const q of s.questions) {
          expect(q.choiceSets).toHaveLength(CANDIDATES);
          q.choiceSets.forEach((set, k) => {
            expect(set).toHaveLength(OPTIONS);
            expect(new Set(set).size).toBe(OPTIONS);
            expect(set).toContain(q.candidates[k]);
            for (const o of set) expect(genreOf(o)).toBe(genreOf(q.candidates[k]!));
          });
        }
      }
    });

    it("候補と選択肢は rng で決まる（同じ種なら同じ、ちがう種ならたいていちがう）", () => {
      expect(oekaki.initialState(seeded(7))).toEqual(oekaki.initialState(seeded(7)));
      expect(oekaki.initialState(seeded(7))).not.toEqual(oekaki.initialState(seeded(8)));
      // いつも 0 を返す rng でも作れる（ジャンルもお題も一覧の並びから決まる）
      const fixed = oekaki.initialState(() => 0);
      for (const q of fixed.questions) expect(new Set(q.candidates.map(genreOf)).size).toBe(CANDIDATES);
      // 正解の場所も rng で変わる（いつも同じ場所にならない）
      const places = new Set<number>();
      for (let seed = 0; seed < 30; seed++) {
        const q = oekaki.initialState(seeded(seed)).questions[0]!;
        places.add(q.choiceSets[0]!.indexOf(q.candidates[0]!));
      }
      expect(places.size).toBeGreaterThan(1);
    });
  });

  describe("手番と交代", () => {
    it("描く → 当てる を 1 問ずつ。描く人と当てる人は 1 問ごとに入れかわる", () => {
      let s = oekaki.initialState(seeded(2));
      const turns: Seat[] = [];
      for (let i = 0; i < QUESTIONS; i++) {
        let st = oekaki.status(s);
        expect(st.kind).toBe("playing");
        if (st.kind === "playing") turns.push(st.turn);
        s = drawFirst(s);
        st = oekaki.status(s);
        if (st.kind === "playing") turns.push(st.turn);
        s = answer(s, true);
      }
      // 先手が描く → 後手が当てる → 後手が描く → 先手が当てる …
      expect(turns).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
      expect(oekaki.status(s).kind).toBe("finished");
      expect(turnOf(s.questions)).toBeNull();
    });

    it("手番でない人は描けない・答えられない", () => {
      const s = oekaki.initialState(seeded(4));
      const q = s.questions[0]!;
      expectIllegal(() => oekaki.applyMove(s, draw(q.candidates[0]!), 1), "not_your_turn");
      const drawn = drawFirst(s);
      expectIllegal(() => oekaki.applyMove(drawn, guess(q.candidates[0]!), 0), "not_your_turn");
    });

    it("描く番に答えようとしたり、当てる番に描こうとしたりはできない", () => {
      const s = oekaki.initialState(seeded(4));
      const q = s.questions[0]!;
      expectIllegal(() => oekaki.applyMove(s, guess(q.candidates[0]!), 0), "oekaki_draw_first");
      const drawn = drawFirst(s);
      expectIllegal(() => oekaki.applyMove(drawn, draw(q.candidates[0]!), 1), "oekaki_guess_first");
    });

    it("お題は 3 つの候補からしか選べない。答えは 4 つの選択肢からしか選べない", () => {
      const s = oekaki.initialState(seeded(5));
      const q = s.questions[0]!;
      const notCandidate = GENRES.flatMap((g) => TOPICS[g]).find((t) => !q.candidates.includes(t))!;
      expectIllegal(() => oekaki.applyMove(s, draw(notCandidate), 0), "oekaki_topic");
      const drawn = oekaki.applyMove(s, draw(q.candidates[1]!), 0);
      expect(drawn.questions[0]!.topic).toBe(q.candidates[1]);
      const options = q.choiceSets[1]!;
      const outside = GENRES.flatMap((g) => TOPICS[g]).find((t) => !options.includes(t))!;
      expectIllegal(() => oekaki.applyMove(drawn, guess(outside), 1), "oekaki_choice");
    });

    it("終わったあとは指せない", () => {
      const s = playThrough([true, true, true, true, true, true]);
      expectIllegal(() => oekaki.applyMove(s, guess("titanic"), 0), "game_over");
    });

    it("元の状態は書きかえない", () => {
      const s = oekaki.initialState(seeded(6));
      const before = JSON.stringify(s);
      answer(drawFirst(s), true);
      expect(JSON.stringify(s)).toBe(before);
    });
  });

  describe("点数とクリア", () => {
    it("当たれば 1 点", () => {
      const s = playThrough([true, false, true]);
      expect(scoreOf(s.questions)).toBe(2);
      expect(s.questions[0]!.guess).toBe(s.questions[0]!.topic);
      expect(s.questions[1]!.guess).not.toBe(s.questions[1]!.topic);
    });

    it("6 問中 4 点以上ならクリア（勝ち負けはなし）", () => {
      expect(oekaki.status(playThrough([true, false, true, false, true, true]))).toEqual({
        kind: "finished",
        winner: null,
        coop: "cleared",
      });
      expect(oekaki.status(playThrough([true, true, true, true, true, true]))).toMatchObject({ coop: "cleared" });
      expect(CLEAR_SCORE).toBe(4);
    });

    it("3 点以下なら失敗。途中で 4 点に届かなくなっても 6 問目まで遊ぶ", () => {
      const s = playThrough([false, false, false]);
      expect(oekaki.status(s)).toEqual({ kind: "playing", turn: 1 });
      expect(oekaki.status(playThrough([true, true, true, false, false, false]))).toEqual({
        kind: "finished",
        winner: null,
        coop: "failed",
      });
      expect(oekaki.status(playThrough([false, false, false, false, false, false]))).toMatchObject({ coop: "failed" });
    });
  });

  describe("伏せる情報", () => {
    it("描く番：候補 3 つは描く人だけに見える。当てる人・観戦者には候補も選択肢も見えない", () => {
      const s = oekaki.initialState(seeded(9));
      const mine = view(s, 0).questions[0]!;
      expect(mine.candidates).toEqual(s.questions[0]!.candidates);
      expect(mine.options).toBeNull();
      for (const viewer of [1, null] as const) {
        const theirs = view(s, viewer).questions[0]!;
        expect(theirs).toEqual({ drawer: 0, candidates: null, options: null, topic: null, strokes: null, guess: null });
      }
    });

    it("当てる番：当てる人には絵と 4 つの選択肢だけ。正解と候補は描く人にだけ見える", () => {
      const s = drawFirst(oekaki.initialState(seeded(9)));
      const q = s.questions[0]!;
      const drawer = view(s, 0).questions[0]!;
      expect(drawer.topic).toBe(q.topic);
      expect(drawer.candidates).toEqual(q.candidates);
      expect(drawer.options).toEqual(q.choiceSets[0]);
      for (const viewer of [1, null] as const) {
        const v = view(s, viewer).questions[0]!;
        expect(v.topic).toBeNull();
        expect(v.candidates).toBeNull();
        expect(v.options).toEqual(q.choiceSets[0]);
        expect(v.strokes).toEqual(q.strokes);
        // 選択肢の外にお題が漏れていない（候補の残り 2 つも、ほかの候補の選択肢も届かない）
        const json = JSON.stringify(view(s, viewer));
        for (const c of q.candidates.slice(1)) expect(json).not.toContain(`"${c}"`);
      }
    });

    it("答えたら、正解と候補が 2 人に見える", () => {
      const s = answer(drawFirst(oekaki.initialState(seeded(9))), false);
      const q = s.questions[0]!;
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer).questions[0]!;
        expect(v.topic).toBe(q.topic);
        expect(v.guess).toBe(q.guess);
        expect(v.candidates).toEqual(q.candidates);
      }
    });

    it("まだ始まっていない問題は誰にも見せない", () => {
      const s = oekaki.initialState(seeded(10));
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).questions).toHaveLength(1);
      const later = answer(drawFirst(s), true);
      expect(view(later, 0).questions).toHaveLength(2);
      // 2 問目は後手が描く。先手には 2 問目の候補が見えない
      expect(view(later, 0).questions[1]!.candidates).toBeNull();
      expect(view(later, 1).questions[1]!.candidates).toEqual(later.questions[1]!.candidates);
    });

    it("終わったら（revealAll）全部見せる", () => {
      const s = playThrough([true, false, true, false, true, false]);
      const v = view(s, null, true);
      expect(v.questions).toHaveLength(QUESTIONS);
      v.questions.forEach((q, i) => {
        expect(q.topic).toBe(s.questions[i]!.topic);
        expect(q.candidates).toEqual(s.questions[i]!.candidates);
      });
    });

    it("手の記録では、描いた人以外にはお題を伏せる", () => {
      const move = draw("titanic");
      expect(oekaki.viewMove!(move, 0, 0)).toEqual(move);
      expect(oekaki.viewMove!(move, 0, 1)).toMatchObject({ kind: "draw", topic: null });
      expect(oekaki.viewMove!(move, 0, null)).toMatchObject({ topic: null });
      expect(oekaki.viewMove!(guess("titanic"), 1, 0)).toEqual(guess("titanic"));
    });
  });

  describe("描いたデータの検証", () => {
    const start = () => oekaki.initialState(seeded(11));
    const tryDraw = (strokes: Stroke[]) => {
      const s = start();
      return () => oekaki.applyMove(s, draw(s.questions[0]!.candidates[0]!, strokes), 0);
    };

    it("ふつうの絵は通る。何も描かずに時間切れ（線が 0 本）でも送れる", () => {
      expect(() => tryDraw([line(), line(5, { color: 3, width: 1, t0: 600, t1: 900 })])()).not.toThrow();
      expect(() => tryDraw([])()).not.toThrow();
      // 点が 1 つだけの線（ちょんと置いた点）も通る
      expect(() => tryDraw([line(1, { t0: 0, t1: 0 })])()).not.toThrow();
    });

    it("点の数が 1 問の上限を超える絵は断る", () => {
      const half = Math.ceil(MAX_POINTS / 2);
      expect(() => tryDraw([line(MAX_POINTS)])()).not.toThrow();
      expectIllegal(tryDraw([line(MAX_POINTS + 1)]), "oekaki_too_big");
      expectIllegal(tryDraw([line(half), line(half + 1, { t0: 600, t1: 900 })]), "oekaki_too_big");
    });

    it("線の数が上限を超える絵は断る", () => {
      const many = (n: number) => Array.from({ length: n }, (_, i) => line(2, { t0: i * 10, t1: i * 10 + 5 }));
      expect(() => tryDraw(many(MAX_STROKES))()).not.toThrow();
      expectIllegal(tryDraw(many(MAX_STROKES + 1)), "oekaki_too_big");
    });

    it("キャンバスの外の点・整数でない点は断る", () => {
      expectIllegal(tryDraw([{ ...line(), points: [[0, 0], [CANVAS + 1, 10]] }]), "oekaki_coords");
      expectIllegal(tryDraw([{ ...line(), points: [[-1, 0]] }]), "oekaki_coords");
      expectIllegal(tryDraw([{ ...line(), points: [[1.5, 0]] }]), "oekaki_coords");
      expect(() => tryDraw([{ ...line(), points: [[0, 0], [CANVAS, CANVAS]] }])()).not.toThrow();
    });

    it("色・太さが一覧にない線、点のない線は断る", () => {
      expectIllegal(tryDraw([line(5, { color: COLORS })]), "oekaki_stroke");
      expectIllegal(tryDraw([line(5, { color: -1 })]), "oekaki_stroke");
      expectIllegal(tryDraw([line(5, { width: WIDTHS })]), "oekaki_stroke");
      expectIllegal(tryDraw([{ ...line(), points: [] }]), "oekaki_stroke");
    });

    it("描いた時刻は 0〜40 秒で、線の順に並んでいなければならない", () => {
      expectIllegal(tryDraw([line(5, { t0: 500, t1: 100 })]), "oekaki_time");
      expectIllegal(tryDraw([line(5, { t0: 0, t1: DRAW_MS + 1 })]), "oekaki_time");
      expectIllegal(tryDraw([line(5, { t0: -1, t1: 10 })]), "oekaki_time");
      expectIllegal(tryDraw([line(5, { t0: 0, t1: 500 }), line(5, { t0: 400, t1: 800 })]), "oekaki_time");
      expect(() => tryDraw([line(5, { t0: 0, t1: DRAW_MS })])()).not.toThrow();
    });

    it("送った絵は写しを持つ（あとから元の配列を書きかえても変わらない）", () => {
      const s = start();
      const strokes = [line(3)];
      const next = oekaki.applyMove(s, draw(s.questions[0]!.candidates[0]!, strokes), 0);
      strokes[0]!.points[0]![0] = 999;
      expect(next.questions[0]!.strokes![0]!.points[0]).toEqual([100, 100]);
    });
  });

  describe("thinStrokes（画面が送る前に間引く）", () => {
    /** ゆれながら進む長い線（細かい点がたくさん） */
    const wiggle = (n: number, t0: number): Stroke => ({
      color: 1,
      width: 1,
      t0,
      t1: t0 + 1000,
      points: Array.from({ length: n }, (_, i) => [50 + (i * 900) / n + 0.4, 500 + 200 * Math.sin(i / 30) + 0.3] as Point),
    });

    it("点を上限以下に減らし、線の数・色・太さ・始点と終点は残す", () => {
      const raw = Array.from({ length: 8 }, (_, i) => wiggle(1500, i * 2000));
      const thin = thinStrokes(raw);
      expect(pointCount(thin)).toBeLessThanOrEqual(MAX_POINTS);
      expect(thin).toHaveLength(raw.length);
      thin.forEach((s, i) => {
        expect(s.color).toBe(1);
        expect(s.width).toBe(1);
        expect(s.points[0]).toEqual([50, 500]);
        expect(s.points.at(-1)).toEqual(raw[i]!.points.at(-1)!.map(Math.round));
      });
      // 間引いた絵はそのまま送れる
      const s = oekaki.initialState(seeded(12));
      expect(() => oekaki.applyMove(s, draw(s.questions[0]!.candidates[0]!, thin), 0)).not.toThrow();
    });

    it("上限がきびしくても、上限以下にする", () => {
      const thin = thinStrokes([wiggle(3000, 0), wiggle(3000, 1500)], 40);
      expect(pointCount(thin)).toBeLessThanOrEqual(40);
    });

    it("整数にしてキャンバスにおさめ、同じ点の続きは 1 つにする。時刻も 0〜40 秒の順に直す", () => {
      const thin = thinStrokes([
        { color: 0, width: 0, t0: -50, t1: 300.4, points: [[-20, 10.2], [-20, 10.4], [1200, 3000]] },
        { color: 0, width: 0, t0: 200, t1: 99_999, points: [[5, 5]] },
      ]);
      expect(thin[0]).toEqual({ color: 0, width: 0, t0: 0, t1: 300, points: [[0, 10], [CANVAS, CANVAS]] });
      expect(thin[1]).toEqual({ color: 0, width: 0, t0: 300, t1: DRAW_MS, points: [[5, 5]] });
    });

    it("線の数が多すぎれば上限までにし、点のない線は捨てる", () => {
      const raw = Array.from({ length: MAX_STROKES + 5 }, (_, i) => line(2, { t0: i * 10, t1: i * 10 + 5 }));
      expect(thinStrokes(raw)).toHaveLength(MAX_STROKES);
      expect(thinStrokes([{ ...line(), points: [] }, line(2)])).toHaveLength(1);
    });
  });

  describe("parseMove", () => {
    it("描く手と答える手を読む（余分な項目は捨てる）", () => {
      const stroke = { color: 2, width: 1, t0: 0, t1: 30, points: [[1, 2], [3, 4]], extra: 1 };
      expect(oekaki.parseMove({ kind: "draw", topic: "sushi", strokes: [stroke], foo: "bar" })).toEqual({
        kind: "draw",
        topic: "sushi",
        strokes: [{ color: 2, width: 1, t0: 0, t1: 30, points: [[1, 2], [3, 4]] }],
      });
      expect(oekaki.parseMove({ kind: "guess", guess: "sushi" })).toEqual({ kind: "guess", guess: "sushi" });
      expect(oekaki.parseMove({ kind: "draw", topic: "sushi", strokes: [] })).toEqual({ kind: "draw", topic: "sushi", strokes: [] });
    });

    it("形のちがうものは null", () => {
      const ok = { color: 0, width: 0, t0: 0, t1: 1, points: [[1, 2]] };
      for (const raw of [
        null,
        undefined,
        "draw",
        42,
        [],
        {},
        { kind: "erase" },
        { kind: "guess" },
        { kind: "guess", guess: 3 },
        { kind: "draw", strokes: [ok] },
        { kind: "draw", topic: 1, strokes: [ok] },
        { kind: "draw", topic: "sushi" },
        { kind: "draw", topic: "sushi", strokes: "x" },
        { kind: "draw", topic: "sushi", strokes: [null] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, points: "x" }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, points: [[1]] }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, points: [[1, 2, 3]] }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, points: [[1, "2"]] }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, points: [[1.5, 2]] }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, color: "red" }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, width: 0.5 }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, t0: undefined }] },
        { kind: "draw", topic: "sushi", strokes: [{ ...ok, t1: "1" }] },
      ]) {
        expect(oekaki.parseMove(raw), JSON.stringify(raw)).toBeNull();
      }
    });
  });

  describe("コンピュータ（お試し用の簡単なもの）", () => {
    it("描く番は候補から選んで簡単な図形を、当てる番は選択肢から 1 つを返し、最後まで遊べる", () => {
      for (let seed = 0; seed < 20; seed++) {
        const rng = seeded(seed);
        let s = oekaki.initialState(rng);
        for (let ply = 0; ply < QUESTIONS * 2; ply++) {
          const st = oekaki.status(s);
          if (st.kind !== "playing") throw new Error("早く終わった");
          const move = botMove(oekaki, s, st.turn, rng);
          expect(move).not.toBeNull();
          s = oekaki.applyMove(s, move!, st.turn);
        }
        expect(oekaki.status(s).kind).toBe("finished");
      }
    });

    it("手番でなければ null", () => {
      const s = oekaki.initialState(seeded(1));
      expect(botMove(oekaki, s, 1, seeded(2))).toBeNull();
    });
  });
});
