import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * ふたりの以心伝心（協力ゲーム）：6 問の質問に、2 人とも「自分の答え」と
 * 「相手はこう答えると思う」という予想を出す。選択肢はどれも 4 つ。
 * - 毎問、先に答える人が答えと予想を出す（相手には伏せる）→ もう 1 人が出す → 見せ合う
 * - 先に答える人は毎問交代する（1 問目は先手）。後に答えた人がそのまま次の問題で先に答えるので、
 *   手番は 先手 → 後手・後手 → 先手・先手 → … と続く
 * - 予想が相手の答えと同じなら 1 点（1 問で 2 人合わせて最大 2 点、6 問で 12 点）
 * 勝ち負けはなく、12 点満点を「相性 ◯%」にする。8 点以上なら 2 人でクリア。
 *
 * 質問の文と選択肢の言葉は画面側（apps/web の i18n/games/ishin.ts）に置き、ここには
 * 質問の ID とジャンル、選択肢の数だけを持つ。「どっちが？」の質問の選択肢は
 * 0 = 先手・1 = 後手・2 = ふたりとも・3 = どっちも違う で、画面では見る人から見た「わたし／あなた」にする
 */

export const ROUNDS = 6;
export const CHOICES = 4;
/** 1 問で 2 人とも当てれば 2 点 */
export const MAX_SCORE = ROUNDS * 2;
/** この点以上なら 2 人でクリア */
export const CLEAR_SCORE = 8;
/** 1 局で同じジャンルから出す質問の上限（いろいろな種類が混ざるように） */
export const MAX_PER_GENRE = 2;

/**
 * 質問のジャンル。who は「どっちが言いそう・しそう？」で、ほかは好みを聞く質問。
 * 1 局の中で同じジャンルは続けて出さない
 */
export const GENRES = ["who", "food", "outing", "home", "fun", "shop"] as const;
export type Genre = (typeof GENRES)[number];

export interface Question {
  /** 「ジャンル.名前」の形。画面の文言のキーにも使う */
  id: string;
  genre: Genre;
  /** 選択肢の数 */
  choices: number;
}

/** ジャンルごとの質問の名前。文と選択肢は画面側の文言にある */
const BANK: Record<Genre, string[]> = {
  who: ["sleep", "late", "lost", "cry", "snack", "photo", "spicy", "plan", "wake", "forget", "laugh", "dance"],
  food: ["tapioca", "noodle", "dessert", "spicy", "breakfast", "konbini", "cafe", "dinner", "fruit"],
  outing: ["holiday", "trip", "go", "rain", "night", "season", "ride", "zoo", "beach"],
  home: ["massage", "relax", "morning", "pet", "room", "weather", "bath", "aircon", "bedtime"],
  fun: ["netflix", "cinema", "karaoke", "music", "play", "sport", "festival", "power"],
  shop: ["brand", "gift", "souvenir", "where", "color", "case", "bag"],
};

export const QUESTIONS: readonly Question[] = GENRES.flatMap((genre) =>
  BANK[genre].map((name) => ({ id: `${genre}.${name}`, genre, choices: CHOICES })),
);

export const questionOf = (id: string): Question | undefined => QUESTIONS.find((q) => q.id === id);

export interface IshinMove {
  /** 自分の答え（選択肢の番号） */
  answer: number;
  /** 相手の答えの予想（選択肢の番号） */
  guess: number;
}

export interface RoundResult {
  question: string;
  /** 先に答えた人 */
  first: Seat;
  /** 席ごとの答えと予想 */
  picks: [IshinMove, IshinMove];
  /** 席ごとに、予想が相手の答えと同じだったか */
  hits: [boolean, boolean];
}

export interface IshinState {
  /** この局で出す 6 問（質問の ID） */
  questions: string[];
  /** 今の問題で出した答えと予想。まだなら null。相手には見せない */
  picks: [IshinMove | null, IshinMove | null];
  /** 見せ合いが終わった問題。今の問題は history.length（0 から数える） */
  history: RoundResult[];
}

/** 画面に渡す形。今の問題で相手が出した答えと予想は伏せる */
export interface IshinView {
  /** ここまでの質問（今の問題まで。これからの質問は伏せる。終局後は全部） */
  questions: string[];
  /** 今の問題（0 から数える）。終局後は ROUNDS */
  round: number;
  /** 今の問題で先に答える人（終局後も firstOf(ROUNDS)） */
  first: Seat;
  /** 答える番の人。終局後は null */
  turn: Seat | null;
  /** 自分の分だけ見える。相手の分・まだ出していない分は null */
  picks: [IshinMove | null, IshinMove | null];
  /** 今の問題で、もう出したか */
  answered: [boolean, boolean];
  /** 見せ合いが終わった問題は、2 人の答えも予想も 2 人に見せる */
  history: RoundResult[];
  /** ここまでの点（当たった予想の数） */
  score: number;
}

/** 各問題で先に答える人。公平になるよう交互にする */
export const firstOf = (round: number): Seat => (round % 2 === 0 ? 0 : 1);

/** 当たった予想の数 */
export const scoreOf = (history: RoundResult[]) =>
  history.reduce((sum, r) => sum + r.hits.filter(Boolean).length, 0);

/** 点を 12 点満点の相性（%）にする */
export const percentOf = (score: number) => Math.round((score / MAX_SCORE) * 100);

/**
 * 相性の段階。画面ではやさしい言葉にする（perfect = 以心伝心、great = ぴったり、good = なかよし、
 * warm = これから、fresh = 新しい発見）
 */
export type Tier = "perfect" | "great" | "good" | "warm" | "fresh";
export const tierOf = (percent: number): Tier =>
  percent >= 100 ? "perfect" : percent >= 80 ? "great" : percent >= 60 ? "good" : percent >= 40 ? "warm" : "fresh";

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 1 局の 6 問を選ぶ。質問をまぜて、前から順に「直前と同じジャンルでない・そのジャンルが 2 問未満」の
 * ものを取っていく。「どっちが？」が 1 問も入らなければ、最後の 1 問はそこから選ぶ
 */
export function pickQuestions(rng: Rng): string[] {
  const pool = shuffle(QUESTIONS, rng);
  const picked: Question[] = [];
  while (picked.length < ROUNDS) {
    const prev = picked.at(-1)?.genre;
    const count = (g: Genre) => picked.filter((q) => q.genre === g).length;
    const needWho = picked.length === ROUNDS - 1 && count("who") === 0;
    // どのジャンルも上限より多く用意してあるので、必ず見つかる
    const i = pool.findIndex((q) => q.genre !== prev && count(q.genre) < MAX_PER_GENRE && (!needWho || q.genre === "who"));
    picked.push(pool.splice(i, 1)[0]!);
  }
  return picked.map((q) => q.id);
}

const turnOf = (s: IshinState): Seat => {
  const first = firstOf(s.history.length);
  return s.picks[first] === null ? first : other(first);
};

const isChoice = (n: unknown, choices = CHOICES): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < choices;

export const ishin: GameDefinition<IshinState, IshinMove> = {
  id: "ishin",

  initialState(rng) {
    return { questions: pickQuestions(rng), picks: [null, null], history: [] };
  },

  status(state): GameStatus {
    if (state.history.length < ROUNDS) return { kind: "playing", turn: turnOf(state) };
    return { kind: "finished", winner: null, coop: scoreOf(state.history) >= CLEAR_SCORE ? "cleared" : "failed" };
  },

  applyMove(state, { answer, guess }, seat) {
    const round = state.history.length;
    if (round >= ROUNDS) throw new IllegalMoveError("game_over");
    if (seat !== turnOf(state)) throw new IllegalMoveError("not_your_turn");
    const question = state.questions[round]!;
    const choices = questionOf(question)?.choices ?? CHOICES;
    if (!isChoice(answer, choices) || !isChoice(guess, choices)) throw new IllegalMoveError("ishin_no_such_choice");

    const picks: IshinState["picks"] = [...state.picks];
    picks[seat] = { answer, guess };
    const [p0, p1] = picks;
    if (!p0 || !p1) return { ...state, picks };

    // 2 人とも出したので見せ合う
    const result: RoundResult = {
      question,
      first: firstOf(round),
      picks: [p0, p1],
      hits: [p0.guess === p1.answer, p1.guess === p0.answer],
    };
    return { ...state, picks: [null, null], history: [...state.history, result] };
  },

  parseMove(raw) {
    const { answer, guess } = (raw ?? {}) as { answer?: unknown; guess?: unknown };
    return isChoice(answer) && isChoice(guess) ? { answer, guess } : null;
  },

  viewState(state, viewer, revealAll): IshinView {
    const round = state.history.length;
    const finished = round >= ROUNDS;
    const visible = (seat: Seat) => (revealAll || seat === viewer ? state.picks[seat] : null);
    return {
      questions: revealAll || finished ? state.questions : state.questions.slice(0, round + 1),
      round,
      first: firstOf(round),
      turn: finished ? null : turnOf(state),
      picks: [visible(0), visible(1)],
      answered: [state.picks[0] !== null, state.picks[1] !== null],
      history: state.history,
      score: scoreOf(state.history),
    };
  },

  viewMove(move, mover, viewer) {
    // 答えと予想は見せ合い（history）で公開される。手の記録では相手の分は伏せる
    return mover === viewer ? move : { answer: null, guess: null };
  },
};
