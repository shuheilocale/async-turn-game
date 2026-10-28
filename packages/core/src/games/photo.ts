import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * きょうのおだい写真（協力ゲーム）：日本とタイに住む 2 人が、同じお題で写真を撮って見せ合う。勝ち負けはない。
 * - お題が 1 つ出る。2 人とも、いつでも写真を 1 枚（とひとこと。なくてもよい）出せる。順番はない（free）
 * - 相手が出すまで、相手の写真とひとことは見えない（出したかどうかだけ見える）。自分の分は、相手が出す前なら出しなおせる
 * - 2 人そろったら、2 枚を並べて見せる（アルバムの 1 ページになる）。どちらかが「次のお題へ」を押すと次のお題になる
 * - お題が気に入らなければ、まだどちらも出していないうちは引き直せる（1 冊で REDRAWS 回まで）
 * - ROUNDS ページ（1 週間ぶん）そろうと 1 冊のアルバムができて、2 人でクリア。続けるときは次のアルバム（もう一局）
 *
 * 写真そのものはサーバの写真の表にあり、手には写真の ID だけを載せる。applyMove は写真が本物か見られないので、
 * サーバが photosOfMove で手の写真を取り出し、「その対局・その席の人がアップロードした写真か」を確かめてから渡す。
 * だれが写真を見てよいかは canSeePhoto（そろったページの写真はだれでも、まだそろっていない写真は出した本人だけ）。
 * 時刻はサーバが stampMove で手に書き込む（アルバムに撮った日を出すため）。時刻の知らせ（nextAlarm）は持たない
 */

/** 1 冊のページ数（お題の数） */
export const ROUNDS = 7;
/** 1 冊でお題を引き直せる回数 */
export const REDRAWS = 3;
/** ひとことの長さ（文字） */
export const NOTE_MAX = 40;

/**
 * お題。日本とタイのどちらでも撮れて、見比べると楽しいもの。顔・家の外観・住所など、人や場所が特定されやすいものは入れない。
 * 文は画面側（apps/web の i18n/games/photo.ts の game.photo.topic.<ID>）にある
 */
export const TOPICS = [
  "lunch",
  "breakfast",
  "dinner",
  "snack",
  "drink",
  "fruit",
  "sweet",
  "spicy",
  "seasoning",
  "konbini",
  "sky",
  "weather",
  "window",
  "sign",
  "animal",
  "plant",
  "tree",
  "water",
  "road",
  "night",
  "clock",
  "feet",
  "shadow",
  "shoes",
  "cup",
  "pen",
  "bag",
  "favorite",
  "coin",
  "red",
  "green",
  "yellow",
  "blue",
  "round",
  "small",
  "cold",
  "warm",
  "vehicle",
  "letters",
  "relax",
] as const;
export type Topic = (typeof TOPICS)[number];

/** 写真の ID の形（サーバが作る推測できない長い文字列。お試しでは端末の中だけの ID） */
const PHOTO_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** 出した写真 1 枚 */
export interface Entry {
  photo: string;
  /** ひとこと（なければ空文字） */
  note: string;
  /** サーバが受け取った時刻（ミリ秒） */
  at: number;
}

/** 2 人そろったお題（アルバムの 1 ページ） */
export interface Page {
  topic: Topic;
  /** 席ごとの写真 */
  entries: [Entry, Entry];
  /** そろった時刻 */
  at: number;
}

export type PhotoMove =
  | { kind: "photo"; photo: string; note: string; at?: number }
  | { kind: "redraw"; at?: number }
  | { kind: "next"; at?: number };

export interface PhotoState {
  /** お題の順番（initialState で種から決める）。次に出すお題は order[drawn] */
  order: Topic[];
  /** order から取り出したお題の数 */
  drawn: number;
  /** 今のお題。2 人そろって「次のお題へ」を待っているあいだは null */
  topic: Topic | null;
  /** 今のお題に出した写真。2 人そろうと pages に移して空にする */
  entries: [Entry | null, Entry | null];
  pages: Page[];
  /** 引き直した回数 */
  redraws: number;
  /** 次に出すとよさそうな人の目安（直前に指していない人）。表示にだけ使い、applyMove は見ない */
  turn: Seat;
}

/** 画面に渡す形。今のお題で相手が出した写真とひとことは、そろうまで伏せる */
export interface PhotoView {
  topic: Topic | null;
  /** 今のお題は何ページ目か（0 から数える）。そろって待っているあいだは、そろったページ */
  round: number;
  /** 自分の分（と終局後）は中身、相手の分は出したかどうかだけ（"hidden"）。まだなら null */
  entries: [Entry | "hidden" | null, Entry | "hidden" | null];
  pages: Page[];
  redrawsLeft: number;
  /** 2 人そろって「次のお題へ」を待っている */
  waiting: boolean;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 次のお題を取り出す。お題は ROUNDS + REDRAWS より多く用意してあるので、1 冊で同じお題は出ない */
function draw(s: PhotoState): { topic: Topic; drawn: number } {
  return { topic: s.order[s.drawn % s.order.length]!, drawn: s.drawn + 1 };
}

const finished = (s: PhotoState) => s.pages.length >= ROUNDS;

/** 写真の ID として使えるか */
export const isPhotoId = (v: unknown): v is string => typeof v === "string" && PHOTO_ID.test(v);

/** ひとことを整える（前後の空白と改行をとり、NOTE_MAX 文字まで） */
export const cleanNote = (v: unknown): string =>
  typeof v === "string" ? [...v.replace(/\s+/g, " ").trim()].slice(0, NOTE_MAX).join("") : "";

/** state の中で使っている写真の ID（ページと、今のお題に出したもの） */
export function photosIn(s: PhotoState): string[] {
  return [
    ...s.pages.flatMap((p) => p.entries.map((e) => e.photo)),
    ...s.entries.flatMap((e) => (e ? [e.photo] : [])),
  ];
}

const stamp = (move: PhotoMove) => (typeof move.at === "number" && Number.isFinite(move.at) ? move.at : 0);

export const photo: GameDefinition<PhotoState, PhotoMove> = {
  id: "photo",

  initialState(rng) {
    const order = shuffle(TOPICS, rng);
    return { order, drawn: 1, topic: order[0]!, entries: [null, null], pages: [], redraws: 0, turn: 0 };
  },

  status(state): GameStatus {
    // 協力ゲームなので勝ち負けはない。アルバムができたら 2 人でクリア（失敗はない）
    if (finished(state)) return { kind: "finished", winner: null, coop: "cleared" };
    return { kind: "playing", turn: state.turn, free: true };
  },

  applyMove(state, move, seat) {
    if (finished(state)) throw new IllegalMoveError("game_over");
    const at = stamp(move);

    if (move.kind === "next") {
      if (state.topic !== null) throw new IllegalMoveError("photo_not_ready");
      return { ...state, ...draw(state), turn: other(seat) };
    }

    if (state.topic === null) throw new IllegalMoveError("photo_press_next");

    if (move.kind === "redraw") {
      if (state.entries[0] || state.entries[1]) throw new IllegalMoveError("photo_redraw_after_photo");
      if (state.redraws >= REDRAWS) throw new IllegalMoveError("photo_no_redraw");
      return { ...state, ...draw(state), redraws: state.redraws + 1, turn: other(seat) };
    }

    if (!isPhotoId(move.photo)) throw new IllegalMoveError("photo_not_found");
    // 同じ写真を 2 つのお題には使えない（出しなおすときの、自分の今の写真は除く）
    const used = photosIn(state).filter((id) => id !== state.entries[seat]?.photo);
    if (used.includes(move.photo)) throw new IllegalMoveError("photo_used");

    const entries: PhotoState["entries"] = [...state.entries];
    entries[seat] = { photo: move.photo, note: cleanNote(move.note), at };
    const [e0, e1] = entries;
    if (!e0 || !e1) return { ...state, entries, turn: other(seat) };

    // 2 人そろったので、アルバムの 1 ページにする。次のお題は「次のお題へ」で出す
    const page: Page = { topic: state.topic, entries: [e0, e1], at };
    return { ...state, topic: null, entries: [null, null], pages: [...state.pages, page], turn: other(seat) };
  },

  parseMove(raw) {
    // 時刻は送られてきても使わない（サーバが stampMove で書き込む）
    const m = (raw ?? {}) as { kind?: unknown; photo?: unknown; note?: unknown };
    if (m.kind === "redraw" || m.kind === "next") return { kind: m.kind };
    if (m.kind === "photo" && isPhotoId(m.photo)) return { kind: "photo", photo: m.photo, note: cleanNote(m.note) };
    return null;
  },

  stampMove(move, now) {
    return { ...move, at: now };
  },

  viewState(state, viewer, revealAll): PhotoView {
    const visible = (seat: Seat) => {
      const e = state.entries[seat];
      if (!e) return null;
      return revealAll || seat === viewer ? e : "hidden";
    };
    return {
      topic: state.topic,
      round: state.topic === null ? Math.max(0, state.pages.length - 1) : state.pages.length,
      entries: [visible(0), visible(1)],
      pages: state.pages,
      redrawsLeft: Math.max(0, REDRAWS - state.redraws),
      waiting: state.topic === null && !finished(state),
    };
  },

  viewMove(move, mover, viewer) {
    // 写真とひとことは、そろったページ（pages）で公開される。手の記録では相手の分は伏せる
    if (move.kind !== "photo" || mover === viewer) return move;
    return { kind: "photo", photo: null, note: null, at: move.at };
  },

  photosOfMove(move) {
    return move.kind === "photo" ? [move.photo] : [];
  },

  canSeePhoto(state, photoId, viewer) {
    if (state.pages.some((p) => p.entries.some((e) => e.photo === photoId))) return true;
    return viewer !== null && state.entries[viewer]?.photo === photoId;
  },
};
