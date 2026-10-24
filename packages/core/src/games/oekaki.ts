import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * おえかきクイズ（協力ゲーム）：描く人が描いた絵を見て、当てる人がお題を 4 つの中から当てる。
 * 全部で 6 問。問題ごとに「描く人」と「当てる人」が交代する（1 問目は先手が描く）。
 * - 描く人には、ジャンルのちがうお題の候補が 3 つ出る。1 つ選んで 40 秒で描く（何筆でもよい。文字・数字はなし）
 * - 当てる人は、描いた順に再生される絵を見て、4 つの選択肢（正解と、同じジャンルのほかのお題 3 つ）から選ぶ
 * - 当たれば 1 点。6 問で 4 点以上なら 2 人でクリア、3 点以下なら失敗（途中で届かなくなっても 6 問目まで遊ぶ）
 * 正解（描く人が選んだお題）と候補は、当てる人が答えるまで描く人にしか見せない。
 *
 * 候補と選択肢は、applyMove で乱数を使えないので、initialState で 6 問分を先に決めておく。
 * お題は ID だけを持つ。名前（日本語・英語・タイ語）は画面の文言（apps/web/src/i18n/games/oekaki.ts）にある。
 * 描く時間（40 秒）は画面で数える。サーバは、描いた時刻が 0〜40 秒の中にあることだけを確かめる。
 */

export const QUESTIONS = 6;
/** これ以上当たればクリア */
export const CLEAR_SCORE = 4;
/** 描く人に出す候補の数 */
export const CANDIDATES = 3;
/** 当てる人に出す選択肢の数（正解を含む） */
export const OPTIONS = 4;
/** 描く時間（ミリ秒） */
export const DRAW_MS = 40_000;

/** 座標の範囲。キャンバスの左上が (0, 0)、右下が (CANVAS, CANVAS)。画面の大きさによらずこの範囲にそろえて送る */
export const CANVAS = 1000;
/** 色の数（0 = 墨、1 = 赤、2 = 青、3 = 緑。実際の色は画面が決める） */
export const COLORS = 4;
/** 太さの数（0 = 細い、1 = 太い） */
export const WIDTHS = 2;
/** 1 問で描ける線の数と、点の数の合計の上限。画面は点を間引いて（thinStrokes）これ以下にしてから送る */
export const MAX_STROKES = 60;
export const MAX_POINTS = 1200;

export const GENRES = ["movie", "drama", "rnb", "luxury", "thai", "tapioca", "money", "beauty", "japan"] as const;
export type Genre = (typeof GENRES)[number];

/**
 * ジャンルごとのお題の ID。名前は文言の game.oekaki.topic.<ID>、ジャンルの名前は game.oekaki.genre.<ジャンル>。
 * 作品名・歌手名・曲名は、だれでも知っている有名なものだけにしてある。ハイブランドは名前ではなく描ける「もの」
 */
export const TOPICS: Record<Genre, readonly string[]> = {
  movie: ["titanic", "jaws", "frozen", "toyStory", "harryPotter", "jurassicPark", "nemo", "lionKing", "up", "spiderMan"],
  drama: [
    "squidGame",
    "strangerThings",
    "wednesday",
    "moneyHeist",
    "theCrown",
    "crashLanding",
    "onePiece",
    "aliceBorderland",
    "emilyParis",
  ],
  rnb: [
    "blindingLights",
    "starboy",
    "killBill",
    "snooze",
    "saturn",
    "halo",
    "singleLadies",
    "umbrella",
    "girlOnFire",
    "allIWant",
  ],
  luxury: [
    "quiltedBag",
    "monogramTrunk",
    "perfume",
    "highHeels",
    "watch",
    "sunglasses",
    "diamondRing",
    "pearlNecklace",
    "shoppingBags",
  ],
  thai: [
    "thaiMassage",
    "tuktuk",
    "elephant",
    "somtam",
    "tomyum",
    "mangoStickyRice",
    "floatingMarket",
    "muayThai",
    "songkran",
    "loyKrathong",
  ],
  tapioca: [
    "milkTea",
    "brownSugar",
    "thaiTea",
    "matchaLatte",
    "cheeseFoam",
    "bigStraw",
    "longLine",
    "nataDeCoco",
    "pokeLid",
  ],
  money: ["piggyBank", "cashStack", "goldBar", "lottery", "creditCard", "wallet", "payday", "stocksUp", "splitBill"],
  beauty: [
    "beautyClinic",
    "nailArt",
    "lashExtensions",
    "sheetMask",
    "diet",
    "sunscreen",
    "lipstick",
    "hairSalon",
    "selfie",
  ],
  japan: ["sushi", "mtFuji", "ramen", "sakura", "shinkansen", "manekiNeko", "onsen", "torii", "onigiri", "vendingMachine"],
};

const GENRE_OF = new Map<string, Genre>(GENRES.flatMap((g) => TOPICS[g].map((t) => [t, g] as const)));

/** お題のジャンル。一覧にないお題なら null */
export const genreOf = (topic: string): Genre | null => GENRE_OF.get(topic) ?? null;

/** [x, y]。送るときは 0〜CANVAS の整数 */
export type Point = [number, number];

/** 1 筆（指を置いてから離すまで）。t0・t1 は描き始めてからのミリ秒（指を置いた時・離した時） */
export interface Stroke {
  color: number;
  width: number;
  t0: number;
  t1: number;
  points: Point[];
}

export type OekakiMove =
  /** 描く人：候補から選んだお題と、描いた絵（線が 0 本でもよい。時間切れで何も描けなかったとき） */
  | { kind: "draw"; topic: string; strokes: Stroke[] }
  /** 当てる人：選択肢から選んだお題 */
  | { kind: "guess"; guess: string };

export interface Question {
  drawer: Seat;
  /** 描く人に出す候補（ジャンルはすべてちがう） */
  candidates: string[];
  /** candidates[k] を描いたときに、当てる人に出す選択肢（正解と同じジャンルの 3 つ。並びも rng で決めてある） */
  choiceSets: string[][];
  /** 描く人が選んだお題。まだ描いていなければ null */
  topic: string | null;
  strokes: Stroke[] | null;
  /** 当てる人が選んだお題。まだ答えていなければ null */
  guess: string | null;
}

export interface OekakiState {
  /** 6 問分。はじめに全部決めてある */
  questions: Question[];
}

/**
 * 画面に渡す 1 問分。見てはいけないものは null にする。
 * candidates と topic は描く人だけ（答えたあとは 2 人に）見える。options は描いたあと 2 人に見える
 */
export interface QuestionView {
  drawer: Seat;
  candidates: string[] | null;
  options: string[] | null;
  topic: string | null;
  strokes: Stroke[] | null;
  guess: string | null;
}

/** 画面に渡す形。まだ始まっていない問題は入れない（今の問題まで） */
export interface OekakiView {
  questions: QuestionView[];
}

type AnyQuestion = Question | QuestionView;

/** その問題の描く人（1 問目は先手、あとは交代） */
export const drawerOf = (index: number): Seat => (index % 2 === 0 ? 0 : 1);

/** 今の問題の番号（0 から）。全部答えていれば QUESTIONS */
export function currentIndex(questions: readonly AnyQuestion[]): number {
  const i = questions.findIndex((q) => q.guess === null);
  return i === -1 ? QUESTIONS : i;
}

/** 描く番・当てる番・答えた */
export const phaseOf = (q: AnyQuestion): "draw" | "guess" | "done" =>
  q.strokes === null ? "draw" : q.guess === null ? "guess" : "done";

/** 今指す人。終わっていれば null */
export function turnOf(questions: readonly AnyQuestion[]): Seat | null {
  const q = questions[currentIndex(questions)];
  if (!q) return null;
  return phaseOf(q) === "draw" ? q.drawer : other(q.drawer);
}

/** 当たった問題か（答えるまでは false） */
export const isCorrect = (q: AnyQuestion) => q.guess !== null && q.guess === q.topic;

/** 2 人の点数（当たった問題の数） */
export const scoreOf = (questions: readonly AnyQuestion[]) => questions.filter(isCorrect).length;

/** 点の数の合計 */
export const pointCount = (strokes: readonly Stroke[]) => strokes.reduce((n, s) => n + s.points.length, 0);

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

/**
 * 6 問分の候補と選択肢を作る。ジャンルは、9 つを並べかえた列を 2 回つなげて 3 つずつ区切る
 * （1 問の 3 つはジャンルがちがい、1 局でどのジャンルも 2 回ずつ出る）。お題は 1 局で同じものを候補に出さない
 */
function makeQuestions(rng: Rng): Question[] {
  const genres: Genre[] = [];
  while (genres.length < QUESTIONS * CANDIDATES) genres.push(...shuffle(GENRES, rng));
  const used = new Set<string>();
  return Array.from({ length: QUESTIONS }, (_, i) => {
    const gs = genres.slice(i * CANDIDATES, (i + 1) * CANDIDATES);
    const candidates = gs.map((g) => {
      const topic = pick(
        TOPICS[g].filter((t) => !used.has(t)),
        rng,
      );
      used.add(topic);
      return topic;
    });
    const choiceSets = candidates.map((c, k) => {
      const others = shuffle(
        TOPICS[gs[k]!].filter((t) => t !== c),
        rng,
      ).slice(0, OPTIONS - 1);
      return shuffle([c, ...others], rng);
    });
    return { drawer: drawerOf(i), candidates, choiceSets, topic: null, strokes: null, guess: null };
  });
}

/** 当てる人に出す選択肢（描いたあとだけ） */
const optionsOf = (q: Question) => (q.topic === null ? null : q.choiceSets[q.candidates.indexOf(q.topic)]!);

const isInt = (v: unknown): v is number => Number.isInteger(v);

/** 描いた絵を確かめる。大きすぎる絵（線や点が多すぎる）は断る */
function checkStrokes(strokes: readonly Stroke[]) {
  if (strokes.length > MAX_STROKES || pointCount(strokes) > MAX_POINTS) throw new IllegalMoveError("oekaki_too_big");
  let last = 0;
  for (const s of strokes) {
    if (!isInt(s.color) || s.color < 0 || s.color >= COLORS) throw new IllegalMoveError("oekaki_stroke");
    if (!isInt(s.width) || s.width < 0 || s.width >= WIDTHS) throw new IllegalMoveError("oekaki_stroke");
    if (s.points.length === 0) throw new IllegalMoveError("oekaki_stroke");
    // 指は 1 本ずつなので、線は描いた順に並び、前の線を描き終えてから次を描き始める
    if (!isInt(s.t0) || !isInt(s.t1) || s.t0 < last || s.t1 < s.t0 || s.t1 > DRAW_MS) {
      throw new IllegalMoveError("oekaki_time");
    }
    for (const [x, y] of s.points) {
      if (!isInt(x) || !isInt(y) || x < 0 || y < 0 || x > CANVAS || y > CANVAS) throw new IllegalMoveError("oekaki_coords");
    }
    last = s.t1;
  }
}

// ---------- 間引き ----------

/** 点 p から線分 ab までの距離 */
function segmentDist(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/**
 * 折れ線を、形をなるべく変えずに点を減らす（Ramer–Douglas–Peucker）。
 * 始点と終点を結ぶ線から eps より離れた点がなくなるまで、いちばん離れた点で分けていく。始点と終点は残る
 */
function simplify(points: readonly Point[], eps: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let far = -1;
    let farDist = eps;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDist(points[i]!, points[from]!, points[to]!);
      if (d > farDist) {
        farDist = d;
        far = i;
      }
    }
    if (far === -1) continue;
    keep[far] = 1;
    stack.push([from, far], [far, to]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** 間引くときの、形のずれの許し（キャンバスの大きさを 1000 として）。はじめはほとんど見分けがつかない幅で、足りなければ広げる */
const THIN_EPS = 1.5;
const THIN_GROW = 1.6;

/**
 * 画面で描いた線を、送れる形にする：座標を 0〜CANVAS の整数に、時刻を 0〜DRAW_MS の整数で線の順に並ぶようにし、
 * 同じ点が続いたら 1 つにする。点のない線は捨て、線は MAX_STROKES 本まで。
 * そのうえで形を保ったまま点を減らし、合計が max 以下になるまで、ずれの許しを広げて減らし直す
 */
export function thinStrokes(raw: readonly Stroke[], max = MAX_POINTS): Stroke[] {
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, Math.round(v)));
  let last = 0;
  const strokes: Stroke[] = [];
  for (const s of raw) {
    if (strokes.length >= MAX_STROKES) break;
    const snapped = s.points.map(([x, y]) => [clamp(x, CANVAS), clamp(y, CANVAS)] as Point);
    const points = snapped.filter((p, i) => i === 0 || p[0] !== snapped[i - 1]![0] || p[1] !== snapped[i - 1]![1]);
    if (points.length === 0) continue;
    const t0 = Math.max(last, clamp(s.t0, DRAW_MS));
    const t1 = Math.max(t0, clamp(s.t1, DRAW_MS));
    last = t1;
    strokes.push({ color: s.color, width: s.width, t0, t1, points });
  }
  let eps = THIN_EPS;
  let out = strokes.map((s) => ({ ...s, points: simplify(s.points, eps) }));
  // 許しを広げると、どの線もいずれ始点と終点だけになる（それでも多ければ、線の数がそもそも多すぎる）
  while (pointCount(out) > max && eps < CANVAS * 2) {
    eps *= THIN_GROW;
    out = strokes.map((s) => ({ ...s, points: simplify(s.points, eps) }));
  }
  return out;
}

// ---------- コンピュータ（お試し用。協力ゲームのお試しはひとりで 2 人分を動かすので、ふだんは使わない） ----------

/** お題の代わりに描く簡単な図形：まん中の円 */
function circleStroke(): Stroke {
  const points = Array.from({ length: 25 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 24;
    return [Math.round(500 + 250 * Math.cos(a)), Math.round(500 + 250 * Math.sin(a))] as Point;
  });
  return { color: 0, width: 1, t0: 0, t1: 1500, points };
}

export const oekaki: GameDefinition<OekakiState, OekakiMove> = {
  id: "oekaki",

  initialState(rng) {
    return { questions: makeQuestions(rng) };
  },

  status(state): GameStatus {
    const turn = turnOf(state.questions);
    if (turn !== null) return { kind: "playing", turn };
    return { kind: "finished", winner: null, coop: scoreOf(state.questions) >= CLEAR_SCORE ? "cleared" : "failed" };
  },

  applyMove(state, move, seat) {
    const turn = turnOf(state.questions);
    if (turn === null) throw new IllegalMoveError("game_over");
    if (seat !== turn) throw new IllegalMoveError("not_your_turn");
    const index = currentIndex(state.questions);
    const q = state.questions[index]!;
    let next: Question;

    if (phaseOf(q) === "draw") {
      if (move.kind !== "draw") throw new IllegalMoveError("oekaki_draw_first");
      if (!q.candidates.includes(move.topic)) throw new IllegalMoveError("oekaki_topic");
      checkStrokes(move.strokes);
      const strokes = move.strokes.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x, y] as Point) }));
      next = { ...q, topic: move.topic, strokes };
    } else {
      if (move.kind !== "guess") throw new IllegalMoveError("oekaki_guess_first");
      if (!optionsOf(q)!.includes(move.guess)) throw new IllegalMoveError("oekaki_choice");
      next = { ...q, guess: move.guess };
    }
    return { questions: state.questions.map((old, i) => (i === index ? next : old)) };
  },

  parseMove(raw) {
    if (raw === null || typeof raw !== "object") return null;
    const r = raw as { kind?: unknown; topic?: unknown; guess?: unknown; strokes?: unknown };
    if (r.kind === "guess") return typeof r.guess === "string" ? { kind: "guess", guess: r.guess } : null;
    if (r.kind !== "draw" || typeof r.topic !== "string" || !Array.isArray(r.strokes)) return null;
    const strokes: Stroke[] = [];
    for (const s of r.strokes as unknown[]) {
      if (s === null || typeof s !== "object") return null;
      const { color, width, t0, t1, points } = s as Record<string, unknown>;
      if (!isInt(color) || !isInt(width) || !isInt(t0) || !isInt(t1) || !Array.isArray(points)) return null;
      const list: Point[] = [];
      for (const p of points as unknown[]) {
        if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0]) || !isInt(p[1])) return null;
        list.push([p[0], p[1]]);
      }
      strokes.push({ color, width, t0, t1, points: list });
    }
    return { kind: "draw", topic: r.topic, strokes };
  },

  viewState(state, viewer, revealAll): OekakiView {
    // 今の問題まで。その先の候補は（描く人になる人にも）まだ見せない
    const reached = state.questions.slice(0, Math.min(currentIndex(state.questions) + 1, QUESTIONS));
    return {
      questions: reached.map((q) => {
        // 描く人と、答えたあとの問題は全部見える。当てる人と観戦者には、答えるまで正解と候補を伏せる
        const open = revealAll || q.guess !== null || viewer === q.drawer;
        return {
          drawer: q.drawer,
          candidates: open ? q.candidates : null,
          options: optionsOf(q),
          topic: open ? q.topic : null,
          strokes: q.strokes,
          guess: q.guess,
        };
      }),
    };
  },

  viewMove(move, mover, viewer) {
    // 手の記録には答えたかどうかが分からないので、描いた手のお題は、描いた本人以外には（終わるまで）ずっと伏せる
    return move.kind === "draw" && mover !== viewer ? { ...move, topic: null } : move;
  },

  botMove(view, seat, rng) {
    const v = view as OekakiView;
    if (turnOf(v.questions) !== seat) return null;
    const q = v.questions[currentIndex(v.questions)]!;
    if (phaseOf(q) === "draw") return { kind: "draw", topic: pick(q.candidates!, rng), strokes: [circleStroke()] };
    return { kind: "guess", guess: pick(q.options!, rng) };
  },
};
