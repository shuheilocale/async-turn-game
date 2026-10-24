import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  CHOICES,
  CLEAR_SCORE,
  GENRES,
  ishin,
  MAX_PER_GENRE,
  MAX_SCORE,
  percentOf,
  pickQuestions,
  QUESTIONS,
  questionOf,
  ROUNDS,
  firstOf,
  scoreOf,
  tierOf,
  type IshinMove,
  type IshinState,
  type IshinView,
} from "./ishin.ts";

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

const view = (s: IshinState, viewer: Seat | null, revealAll = false) => ishin.viewState!(s, viewer, revealAll) as IshinView;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

/** 手番どおりに答えていく。moves は手番の人の答えと予想を順に並べたもの */
function play(moves: IshinMove[], s: IshinState = ishin.initialState(seeded(1))): IshinState {
  for (const move of moves) {
    const st = ishin.status(s);
    if (st.kind !== "playing") throw new Error("終わっている");
    s = ishin.applyMove(s, move, st.turn);
  }
  return s;
}

const m = (answer: number, guess: number): IshinMove => ({ answer, guess });

/** 1 問ぶん（先に答える人 → もう 1 人）。hits の数だけ予想を当てる（0・1・2） */
function round(hits: 0 | 1 | 2): IshinMove[] {
  // 先の人は 0 と答え、後の人は 1 と答える。当てる予想はその答え、外す予想は 3
  return [m(0, hits >= 2 ? 1 : 3), m(1, hits >= 1 ? 0 : 3)];
}

describe("ishin", () => {
  describe("質問", () => {
    it("質問は 40〜60 問あって、どれも 4 択。ID は重ならない", () => {
      expect(QUESTIONS.length).toBeGreaterThanOrEqual(40);
      expect(QUESTIONS.length).toBeLessThanOrEqual(60);
      expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
      for (const q of QUESTIONS) {
        expect(q.choices).toBe(CHOICES);
        expect(GENRES).toContain(q.genre);
        expect(q.id.startsWith(`${q.genre}.`)).toBe(true);
        expect(questionOf(q.id)).toBe(q);
      }
      expect(CHOICES).toBe(4);
    });

    it("どのジャンルも、1 局で使う上限より十分多く用意してある", () => {
      for (const genre of GENRES) expect(QUESTIONS.filter((q) => q.genre === genre).length).toBeGreaterThanOrEqual(6);
    });

    it("毎局 rng で 6 問選ぶ。同じジャンルは続かず、1 局で 2 問まで。「どっちが？」は必ず入る", () => {
      for (let seed = 1; seed <= 300; seed++) {
        const ids = pickQuestions(seeded(seed));
        expect(ids).toHaveLength(ROUNDS);
        expect(new Set(ids).size).toBe(ROUNDS);
        const genres = ids.map((id) => questionOf(id)!.genre);
        for (let i = 1; i < genres.length; i++) expect(genres[i], `seed ${seed}`).not.toBe(genres[i - 1]);
        for (const g of GENRES) expect(genres.filter((x) => x === g).length).toBeLessThanOrEqual(MAX_PER_GENRE);
        expect(genres).toContain("who");
      }
    });

    it("同じ種なら同じ 6 問、種が変われば別の 6 問になる", () => {
      expect(pickQuestions(seeded(7))).toEqual(pickQuestions(seeded(7)));
      const sets = new Set(Array.from({ length: 30 }, (_, i) => pickQuestions(seeded(i + 1)).join(",")));
      expect(sets.size).toBeGreaterThan(25);
      // 30 局遊べば、ほとんどの質問が一度は出てくる
      const seen = new Set(Array.from({ length: 30 }, (_, i) => pickQuestions(seeded(i + 1))).flat());
      expect(seen.size).toBeGreaterThan(QUESTIONS.length * 0.75);
    });

    it("はじまりは、選んだ 6 問・答えなし・結果なし", () => {
      const s = ishin.initialState(seeded(3));
      expect(s).toEqual({ questions: pickQuestions(seeded(3)), picks: [null, null], history: [] });
      expect(ishin.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("手番", () => {
    it("先に答える人は毎問交代する（1 問目は先手）", () => {
      expect([0, 1, 2, 3, 4, 5].map(firstOf)).toEqual([0, 1, 0, 1, 0, 1]);
    });

    it("先の人 → もう 1 人 の順。2 問目の先の人は、1 問目で後に答えた人なので続けて答える", () => {
      const turns: Seat[] = [];
      let s = ishin.initialState(seeded(2));
      for (let i = 0; i < ROUNDS * 2; i++) {
        const st = ishin.status(s);
        if (st.kind !== "playing") throw new Error("早く終わった");
        turns.push(st.turn);
        s = ishin.applyMove(s, m(0, 0), st.turn);
      }
      expect(turns).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
      expect(ishin.status(s).kind).toBe("finished");
    });

    it("手番でない人は答えられない。同じ問題に 2 回は答えられない", () => {
      const s = ishin.initialState(seeded(2));
      expect(codeOf(() => ishin.applyMove(s, m(0, 0), 1))).toBe("not_your_turn");
      const answered = play([m(2, 1)], s);
      expect(codeOf(() => ishin.applyMove(answered, m(1, 1), 0))).toBe("not_your_turn");
    });

    it("ない選択肢は選べない（自分の答えも予想も）", () => {
      const s = ishin.initialState(seeded(2));
      for (const bad of [-1, 4, 1.5, NaN, Infinity]) {
        expect(codeOf(() => ishin.applyMove(s, m(bad, 0), 0))).toBe("ishin_no_such_choice");
        expect(codeOf(() => ishin.applyMove(s, m(0, bad), 0))).toBe("ishin_no_such_choice");
      }
      const answered = play([m(0, 0)], s);
      expect(codeOf(() => ishin.applyMove(answered, m(4, 0), 1))).toBe("ishin_no_such_choice");
    });

    it("6 問終わったら、もう答えられない", () => {
      const s = play(Array.from({ length: ROUNDS }, () => round(2)).flat());
      expect(codeOf(() => ishin.applyMove(s, m(0, 0), 0))).toBe("game_over");
      expect(codeOf(() => ishin.applyMove(s, m(0, 0), 1))).toBe("game_over");
    });
  });

  describe("伏せる・見せ合う", () => {
    it("先に出した答えと予想は、もう 1 人と観戦者には伏せる（出したかどうかは分かる）", () => {
      const s = play([m(2, 1)]);
      expect(s.picks).toEqual([m(2, 1), null]);
      expect(view(s, 0)).toMatchObject({ round: 0, first: 0, turn: 1, picks: [m(2, 1), null], answered: [true, false] });
      expect(view(s, 1)).toMatchObject({ round: 0, first: 0, turn: 1, picks: [null, null], answered: [true, false] });
      expect(view(s, null)).toMatchObject({ picks: [null, null], answered: [true, false] });
      // 伏せた答えがどこかに残っていないか、形ごと確かめる
      expect(Object.keys(view(s, 1)).sort()).toEqual(["answered", "first", "history", "picks", "questions", "round", "score", "turn"]);
      expect(JSON.stringify(view(s, 1).history)).toBe("[]");
    });

    it("2 人とも出したら見せ合う：答えと予想を 2 人とも見られ、次の問題に進む", () => {
      const s = play([m(2, 1), m(1, 3)]);
      const shown = { question: s.questions[0], first: 0, picks: [m(2, 1), m(1, 3)], hits: [true, false] };
      expect(s.history).toEqual([shown]);
      expect(s.picks).toEqual([null, null]);
      for (const viewer of [0, 1, null] as const) {
        expect(view(s, viewer).history).toEqual([shown]);
        expect(view(s, viewer)).toMatchObject({ round: 1, first: 1, turn: 1, picks: [null, null], answered: [false, false] });
      }
    });

    it("次の問題で先に出した答えも、また伏せる", () => {
      const s = play([m(2, 1), m(1, 3), m(0, 0)]);
      expect(view(s, 1).picks).toEqual([null, m(0, 0)]);
      expect(view(s, 0).picks).toEqual([null, null]);
      expect(view(s, 0).answered).toEqual([false, true]);
    });

    it("これからの質問は、その問題になるまで見せない（終局後は全部）", () => {
      const s0 = ishin.initialState(seeded(4));
      expect(view(s0, 0).questions).toEqual(s0.questions.slice(0, 1));
      const s1 = play([m(0, 0), m(0, 0)], s0);
      expect(view(s1, 1).questions).toEqual(s0.questions.slice(0, 2));
      expect(view(s1, 1, true).questions).toEqual(s0.questions);
    });

    it("revealAll（終局後）なら伏せない", () => {
      const s = play([m(3, 2)]);
      expect(view(s, 1, true).picks).toEqual([m(3, 2), null]);
      expect(view(s, null, true).picks).toEqual([m(3, 2), null]);
      const end = play(Array.from({ length: ROUNDS }, () => round(1)).flat());
      const all = view(end, 1, true);
      expect(all.round).toBe(ROUNDS);
      expect(all.turn).toBeNull();
      expect(all.questions).toEqual(end.questions);
      expect(all.history).toHaveLength(ROUNDS);
    });

    it("手の記録では、相手の手は伏せる（答えは見せ合いで公開される）", () => {
      expect(ishin.viewMove!(m(2, 1), 0, 0)).toEqual(m(2, 1));
      expect(ishin.viewMove!(m(2, 1), 0, 1)).toEqual({ answer: null, guess: null });
      expect(ishin.viewMove!(m(2, 1), 1, null)).toEqual({ answer: null, guess: null });
    });
  });

  describe("予想の当たりと点", () => {
    it("相手の答えを当てたら 1 点。1 問で 2 人合わせて最大 2 点", () => {
      expect(play(round(2)).history[0]!.hits).toEqual([true, true]);
      expect(play(round(1)).history[0]!.hits).toEqual([false, true]);
      expect(play(round(0)).history[0]!.hits).toEqual([false, false]);
      expect(scoreOf(play(round(2)).history)).toBe(2);
      expect(scoreOf(play(round(1)).history)).toBe(1);
      expect(scoreOf(play(round(0)).history)).toBe(0);
    });

    it("自分の答えと予想が同じでも、相手の答えと比べる", () => {
      // 先の人：答え 1・予想 1、後の人：答え 1・予想 2 → 先の人だけ当たり
      const s = play([m(1, 1), m(1, 2)]);
      expect(s.history[0]!.hits).toEqual([true, false]);
    });

    it("2 問目は後手が先に答えるので、当たりは席ごとに数える", () => {
      // 2 問目：後手（先の人）が 3 と答えて 0 と予想、先手が 0 と答えて 2 と予想
      const s = play([...round(0), m(3, 0), m(0, 2)]);
      expect(s.history[1]).toMatchObject({ first: 1, picks: [m(0, 2), m(3, 0)], hits: [false, true] });
      expect(view(s, 0).score).toBe(1);
    });

    it("点は 6 問の当たりの合計で、最大 12 点", () => {
      expect(MAX_SCORE).toBe(12);
      const s = play([...round(2), ...round(1), ...round(0), ...round(2), ...round(1), ...round(2)]);
      expect(scoreOf(s.history)).toBe(8);
      expect(view(s, 0, true).score).toBe(8);
    });
  });

  describe("相性と終局", () => {
    it("点を 12 点満点の％にする（四捨五入）", () => {
      expect([0, 1, 6, 7, 8, 9, 10, 11, 12].map(percentOf)).toEqual([0, 8, 50, 58, 67, 75, 83, 92, 100]);
    });

    it("相性の言葉は ％ で決まる（80% 以上は「ぴったり」）", () => {
      expect(tierOf(100)).toBe("perfect");
      expect(tierOf(92)).toBe("great");
      expect(tierOf(80)).toBe("great");
      expect(tierOf(75)).toBe("good");
      expect(tierOf(60)).toBe("good");
      expect(tierOf(58)).toBe("warm");
      expect(tierOf(40)).toBe("warm");
      expect(tierOf(33)).toBe("fresh");
      expect(tierOf(0)).toBe("fresh");
    });

    it("6 問で終わる。勝ち負けはなく、8 点以上なら 2 人でクリア", () => {
      expect(CLEAR_SCORE).toBe(8);
      const eight = play([...round(2), ...round(2), ...round(2), ...round(2), ...round(0), ...round(0)]);
      expect(ishin.status(eight)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
      const all = play(Array.from({ length: ROUNDS }, () => round(2)).flat());
      expect(scoreOf(all.history)).toBe(12);
      expect(ishin.status(all)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    });

    it("7 点以下なら failed", () => {
      const seven = play([...round(2), ...round(2), ...round(2), ...round(1), ...round(0), ...round(0)]);
      expect(scoreOf(seven.history)).toBe(7);
      expect(ishin.status(seven)).toEqual({ kind: "finished", winner: null, coop: "failed" });
      const none = play(Array.from({ length: ROUNDS }, () => round(0)).flat());
      expect(ishin.status(none)).toEqual({ kind: "finished", winner: null, coop: "failed" });
    });

    it("5 問目までと、6 問目で 1 人しか答えていないうちは終わらない", () => {
      let s = play(Array.from({ length: ROUNDS - 1 }, () => round(2)).flat());
      expect(ishin.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play([m(0, 0)], s);
      expect(ishin.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  it("parseMove は 0〜3 の整数の答えと予想だけ受け付ける", () => {
    for (let a = 0; a < CHOICES; a++) {
      for (let g = 0; g < CHOICES; g++) expect(ishin.parseMove({ answer: a, guess: g })).toEqual(m(a, g));
    }
    // 余分な項目は捨てる
    expect(ishin.parseMove({ answer: 1, guess: 2, extra: "x" })).toEqual(m(1, 2));
    for (const raw of [
      { answer: 4, guess: 0 },
      { answer: 0, guess: -1 },
      { answer: 1.5, guess: 0 },
      { answer: "1", guess: 0 },
      { answer: 1 },
      { guess: 1 },
      {},
      null,
      1,
      "answer",
    ]) {
      expect(ishin.parseMove(raw)).toBeNull();
    }
  });
});
