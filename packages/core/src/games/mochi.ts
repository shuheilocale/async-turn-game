import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * ふたりのもち（協力ゲーム）：卵からかえる小さな生きもの「もち」を、2 人でお世話して育てる放置ゲーム。
 * - 順番はない。2 人ともいつでもお世話を 1 つ選べる（ごはん・あそぶ・なでる・おしゃべり・ねかしつける・おでかけ）。
 *   同じ人が続けてもよいが、前のお世話からすぐに続けても速くは育たない（BONUS_HOURS）
 * - お世話のあいだも本物の時計で時間が進む。おなか・きげんはゆっくり減り、ねむけは増える。
 *   ねむけが 100 になると自分で眠り、眠るとねむけが減って起きる。どれだけ放っておいても死なない・弱らない
 * - 育つのは、お世話のあと GROW_HOURS 時間のあいだ。具合がよいほど速い。ほしがっているお世話をするとおまけで育つ
 * - 卵 → 赤ちゃん → こども → おとな。おとなになったら 2 人でクリア（育てられないことはないので失敗はない）
 * - おとなの姿は、どのお世話が多かったかの偏りで 7 種類に分かれる。体の色は 2 人のお世話の量で混ざる
 * - 留守のあいだに小さなできごとが 1 つ起きる（拾いもの・夢・ひとこま）。拾ったものは「たからもの」になる
 *
 * applyMove は時計を読めないので、時刻はサーバが stampMove で手に書き込む。お世話のあいだの具合は
 * conditionAt で計算する（盤の表示もこれを使う）。できごとの乱数は initialState で作った種から決める。
 * 放っておいたときに知らせる時刻（おなかがすいた・目がさめた など）は nextAlarm で出す
 */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const CARES = ["feed", "play", "pet", "talk", "sleep", "walk"] as const;
export type Care = (typeof CARES)[number];
/** きげんをよくするお世話。きげんが足りないときは、このうちどれか 1 つをほしがる */
export const JOY_CARES: readonly Care[] = ["play", "pet", "talk", "walk"];

export const STAGES = ["egg", "baby", "child", "adult"] as const;
export type Stage = (typeof STAGES)[number];

/** 育った量がこれ以上になると、卵がかえる・こどもになる・おとなになる */
export const HATCH = 8;
export const CHILD = 52;
export const ADULT = 130;

/** 1 時間あたりの具合の変わり方。眠っているあいだはおなかの減りがゆっくりで、きげんは減らない */
export const RATES = { tummy: 2.5, joy: 3.5, sleepyUp: 4, sleepyDown: 12.5, tummyAsleep: 1.25, joyAsleep: 0 };
/** お世話のあと、この時間だけ育つ（それより放っておくと、育つのをひと休みする） */
export const GROW_HOURS = 12;
/** 1 時間に育つ量は GROW_MIN〜1。具合がいちばん悪くても GROW_MIN、いちばんよければ 1 */
export const GROW_MIN = 0.55;
/** お世話のおまけ（育つ量）。ほしがっているお世話なら CARE_MATCH */
export const CARE_BASE = 0.5;
export const CARE_MATCH = 2.5;
/** 前のお世話からこの時間たっていないと、おまけは少ない（すぐに続けても速くは育たない） */
export const BONUS_HOURS = 3;
/** 足りない量（おなか・きげんは 100 からの差、ねむけはそのまま）がこれ以上のものをほしがる */
export const WANT_AT = 35;

export interface Needs {
  /** おなか（100 = いっぱい） */
  tummy: number;
  /** きげん（100 = ごきげん） */
  joy: number;
  /** ねむけ（0 = ぱっちり、100 = 眠ってしまう） */
  sleepy: number;
}

/** 卵がかえったときの具合（卵のあいだは変わらない） */
export const START_NEEDS: Needs = { tummy: 80, joy: 80, sleepy: 0 };

/** お世話の効き方（具合に足す量）。ねかしつけると眠る。なでても眠ったまま。ほかのお世話では起きる */
export const EFFECTS: Record<Care, Partial<Needs>> = {
  feed: { tummy: 55, joy: 5 },
  play: { joy: 35, tummy: -8, sleepy: 10 },
  pet: { joy: 22 },
  talk: { joy: 28, sleepy: -5 },
  sleep: { sleepy: -10 },
  walk: { joy: 30, tummy: -8, sleepy: 10 },
};

// ---------- やること（お世話の中の選択肢） ----------

/**
 * お世話ごとの「やること」。お世話を選ぶと、その中から 1 つ選ぶ（おでかけなら行き先、あそぶなら何をして遊ぶか）。
 * - base：はじめから選べる。child：こどもになったら選べる
 * - item：そのたからものを持っていたら選べる（拾ったものを使う）
 * - after：直前のお世話（だれのものでも）が after のどれかで、FOLLOW_HOURS 時間たっていなければ選べる「つづき」
 *   （おでかけのあとに足をふく など）。woke なら、前のお世話のあと眠って起きたときだけ
 * 効き方（effect）はお世話のものの代わりに使う。wake なら、なでる仲間でも眠っているのを起こす。
 * 卵のあいだは選ばず、お世話ごとの最初のやること（DEFAULT_ACT）にする。やることのない手（LINE のボタン・前からの対局）も同じ
 */
export const PLACES = ["park", "market", "sea", "festival"] as const;
export type Place = (typeof PLACES)[number];

export interface ActDef {
  care: Care;
  unlock: "base" | "child" | { item: Item } | { after: readonly Care[]; woke?: boolean };
  effect: Partial<Needs>;
  wake?: boolean;
  /** おでかけの行き先 */
  place?: Place;
}

export const ACT_DEFS = {
  // ごはん
  onigiri: { care: "feed", unlock: "base", effect: { tummy: 55, joy: 5 } },
  soup: { care: "feed", unlock: "base", effect: { tummy: 45, joy: 5, sleepy: 8 } },
  fruit: { care: "feed", unlock: "base", effect: { tummy: 35, joy: 15 } },
  mango: { care: "feed", unlock: { item: "mango" }, effect: { tummy: 40, joy: 20 } },
  tapioca: { care: "feed", unlock: { item: "tapioca" }, effect: { tummy: 35, joy: 22 } },
  coconut: { care: "feed", unlock: { item: "coconut" }, effect: { tummy: 30, joy: 12, sleepy: -10 } },
  // あそぶ
  ball: { care: "play", unlock: "base", effect: { joy: 35, tummy: -8, sleepy: 10 } },
  hide: { care: "play", unlock: "base", effect: { joy: 38, tummy: -10, sleepy: 14 } },
  draw: { care: "play", unlock: "child", effect: { joy: 28, tummy: -4, sleepy: 4 } },
  dance: { care: "play", unlock: "child", effect: { joy: 40, tummy: -12, sleepy: 14 } },
  marble: { care: "play", unlock: { item: "marble" }, effect: { joy: 32, tummy: -6, sleepy: 6 } },
  origami: { care: "play", unlock: { item: "crane" }, effect: { joy: 30, tummy: -4, sleepy: 4 } },
  // なでる
  head: { care: "pet", unlock: "base", effect: { joy: 22 } },
  hug: { care: "pet", unlock: "base", effect: { joy: 24, sleepy: 6 } },
  tickle: { care: "pet", unlock: "child", effect: { joy: 26, sleepy: -6 }, wake: true },
  jasmine: { care: "pet", unlock: { item: "jasmine" }, effect: { joy: 22, sleepy: 8 } },
  brush: { care: "pet", unlock: { after: ["feed"] }, effect: { joy: 18 } },
  bath: { care: "pet", unlock: { after: ["play", "walk"] }, effect: { joy: 24, sleepy: 8 } },
  wipe: { care: "pet", unlock: { after: ["walk"] }, effect: { joy: 20 } },
  // おしゃべり
  today: { care: "talk", unlock: "base", effect: { joy: 28, sleepy: -5 } },
  song: { care: "talk", unlock: "base", effect: { joy: 26, sleepy: -2 } },
  book: { care: "talk", unlock: "child", effect: { joy: 24, sleepy: 6 } },
  riddle: { care: "talk", unlock: "child", effect: { joy: 30, sleepy: -8 } },
  souvenir: { care: "talk", unlock: { after: ["walk"] }, effect: { joy: 32, sleepy: -4 } },
  dreamtalk: { care: "talk", unlock: { after: CARES, woke: true }, effect: { joy: 30, sleepy: -5 } },
  // ねかしつける
  lullaby: { care: "sleep", unlock: "base", effect: { sleepy: -10 } },
  blanket: { care: "sleep", unlock: "base", effect: { sleepy: -10, joy: 3 } },
  furin: { care: "sleep", unlock: { item: "furin" }, effect: { sleepy: -14, joy: 5 } },
  charm: { care: "sleep", unlock: { item: "elephant" }, effect: { sleepy: -12, joy: 6 } },
  // おでかけ（行き先で、拾ってくるものが変わる）
  park: { care: "walk", unlock: "base", effect: { joy: 30, tummy: -8, sleepy: 10 }, place: "park" },
  market: { care: "walk", unlock: "base", effect: { joy: 30, tummy: -4, sleepy: 8 }, place: "market" },
  sea: { care: "walk", unlock: "child", effect: { joy: 34, tummy: -10, sleepy: 14 }, place: "sea" },
  festival: { care: "walk", unlock: "child", effect: { joy: 36, tummy: -8, sleepy: 12 }, place: "festival" },
} as const satisfies Record<string, ActDef>;
export type Act = keyof typeof ACT_DEFS;
export const ACTS = Object.keys(ACT_DEFS) as Act[];
const defOf = (act: Act): ActDef => ACT_DEFS[act];

/** やることを選ばなかったときの、お世話ごとのやること */
export const DEFAULT_ACT: Record<Care, Act> = { feed: "onigiri", play: "ball", pet: "head", talk: "today", sleep: "lullaby", walk: "park" };

/**
 * 前のお世話からこの時間のあいだだけ「つづき」を選べる（相手が次に開いたときにも残っているように半日ほど。
 * お試しは 1 回ごとに 12 時間すすむので、それより少し長く）
 */
export const FOLLOW_HOURS = 14;

/** おでかけの行き先ごとに、見つけてくるもの */
export const PLACE_ITEMS: Record<Place, readonly Item[]> = {
  park: ["acorn", "momiji", "clover", "sakura"],
  market: ["mango", "tapioca", "jasmine", "elephant"],
  sea: ["shell", "coconut", "plumeria", "krathong"],
  festival: ["bell", "furin", "crane", "marble"],
};

/** 「つづき」か（直前のお世話のあとだけ選べるもの） */
export const isFollowUp = (act: Act) => {
  const u = defOf(act).unlock;
  return typeof u === "object" && "after" in u;
};

/**
 * そのとき選べるやること（ACTS の順）。卵のあいだと、おとなになったあとは空。
 * c は now のようす（conditionAt）
 */
export function actsAt(s: MochiState, c: Condition, care?: Care): Act[] {
  if (c.stage === "egg" || s.form !== null) return [];
  const have = new Set(s.treasures.map((t) => t.item));
  const grown = c.stage !== "baby";
  const recent = s.last !== null && c.at - s.last.at <= FOLLOW_HOURS * HOUR;
  return ACTS.filter((act) => {
    const d = defOf(act);
    if (care && d.care !== care) return false;
    const u = d.unlock;
    if (u === "base") return true;
    if (u === "child") return grown;
    if ("item" in u) return have.has(u.item);
    if (u.woke) return c.slept && !c.asleep;
    return recent && u.after.includes(s.last!.care);
  });
}

// ---------- このもちの好み ----------

/** 好きになったり苦手になったりするやること（はじめから・こどもになってから選べるもの） */
const LIKE_POOL = ACTS.filter((a) => defOf(a).unlock === "base" || defOf(a).unlock === "child");
/** 好きなやることをすると、きげんがこれだけよけいによくなる。苦手なやることは、きげんの効きが半分 */
export const LIKE_JOY = 12;

/**
 * このもちの好み。好きなやることが 3 つ（ちがうお世話から）、苦手なやることが 1 つ（好きなものとはちがうお世話から）。
 * 種で決まり、ずっと変わらない。遊んでいるうちに分かっていく（known）
 */
export function likesOf(seed: number): { likes: Act[]; dislike: Act } {
  const order = LIKE_POOL.map((a, i) => ({ a, r: hash(seed, i, 11) })).sort((x, y) => x.r - y.r).map((x) => x.a);
  const likes: Act[] = [];
  for (const a of order) if (likes.length < 3 && !likes.some((l) => defOf(l).care === defOf(a).care)) likes.push(a);
  const dislike = order.find((a) => !likes.some((l) => defOf(l).care === defOf(a).care))!;
  return { likes, dislike };
}

/** 好きか苦手か（どちらでもなければ null） */
export function feelingOf(seed: number, act: Act): "like" | "dislike" | null {
  const { likes, dislike } = likesOf(seed);
  return likes.includes(act) ? "like" : act === dislike ? "dislike" : null;
}

// ---------- おとなの小物 ----------

/** おとなになったとき、いちばんよくしたやることで身に着ける小物 */
export const ACCESSORIES = ["strawHat", "garland", "leafPin", "uchiwa", "paint", "ribbon", "glasses", "towel", "nightcap"] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const ACCESSORY_OF: Partial<Record<Act, Accessory>> = {
  sea: "strawHat",
  market: "garland",
  park: "leafPin",
  festival: "uchiwa",
  draw: "paint",
  dance: "ribbon",
  book: "glasses",
  bath: "towel",
  blanket: "nightcap",
};
/** 小物を身に着けるのに要る回数 */
export const ACCESSORY_MIN = 3;

/** 小物：ACCESSORY_OF にあるやることのうち、いちばん多くしたもの（同じなら ACTS の順で先）。ACCESSORY_MIN 回に届かなければ null */
export function accessoryOf(acts: Partial<Record<Act, number>>): Accessory | null {
  let best: Act | null = null;
  for (const act of ACTS) {
    if (!ACCESSORY_OF[act]) continue;
    if ((acts[act] ?? 0) > (best ? (acts[best] ?? 0) : 0)) best = act;
  }
  return best && (acts[best] ?? 0) >= ACCESSORY_MIN ? ACCESSORY_OF[best]! : null;
}

// ---------- できごと ----------

/** 前のお世話からこの時間たつと、できごとが 1 つ起きる */
export const EVENT_MIN_HOURS = 1;
/** おでかけのあと以外で、何かを拾ってくる確率 */
export const FIND_CHANCE = 0.4;

/** 拾ってくるもの（日本とタイの身近なもの）。画面では game.mochi.item.<名前> */
export const ITEMS = [
  "mango",
  "tapioca",
  "sakura",
  "jasmine",
  "bell",
  "plumeria",
  "coconut",
  "acorn",
  "momiji",
  "marble",
  "crane",
  "shell",
  "furin",
  "elephant",
  "krathong",
  "clover",
] as const;
export type Item = (typeof ITEMS)[number];
/** 眠っていたときに見る夢 */
export const DREAMS = ["sky", "mango", "sea", "snow", "stars", "elephant", "sakura", "together"] as const;
/** 起きていたときのひとこま */
export const MOMENTS = ["sunbath", "rain", "hum", "roll", "clouds", "shadow", "door", "tidy"] as const;
/** 卵のあいだのできごと */
export const EGG_MOMENTS = ["wobble", "warm", "knock", "hum"] as const;

export type Happening =
  | { kind: "egg"; topic: (typeof EGG_MOMENTS)[number] }
  | { kind: "hatched" }
  | { kind: "grew" }
  | { kind: "found"; item: Item; walk: boolean; place?: Place }
  | { kind: "dream"; topic: (typeof DREAMS)[number] }
  | { kind: "moment"; topic: (typeof MOMENTS)[number] };

/** 日記の 1 行。お世話をしたとき、その前の留守のあいだのできごとを、戻ってきた人（seat）の名前で残す */
export interface DiaryEntry {
  at: number;
  seat: Seat;
  happening: Happening;
}

export interface Treasure {
  item: Item;
  /** 見つけた（日記に残した）時刻 */
  at: number;
}

// ---------- おとなの姿 ----------

export const FORMS = ["round", "hop", "fluffy", "ears", "dreamy", "explorer", "harmony"] as const;
export type Form = (typeof FORMS)[number];
/** いちばん偏ったお世話で決まる姿。よく食べるとまんまる、よく遊ぶと身軽、おしゃべりが多いと耳が長い など */
export const FORM_OF: Record<Care, Form> = {
  feed: "round",
  play: "hop",
  pet: "fluffy",
  talk: "ears",
  sleep: "dreamy",
  walk: "explorer",
};
/**
 * その姿になる、お世話の割合のめやす。ほしがるものにだいたい合わせて遊ぶと、ごはんは 3 割ほど、ねかしつけるは 2 割ほど、
 * ほかは 1 割ちょっとになる（テストの遊び方で数えた）。そうして遊んだ 2 人のうち、多い方から 1 割ほどが届くくらいにしてある。
 * ごはんはもともと多いので、ほかより高い
 */
export const FORM_AT: Record<Care, number> = {
  feed: 0.31,
  play: 0.21,
  pet: 0.21,
  talk: 0.21,
  sleep: 0.27,
  walk: 0.21,
};

/**
 * 2 人の色（青 #2b59f0・オレンジ #f27a12）をやわらかくした、体の色（色相・あざやかさ・明るさ）。
 * 青は色相 226 度、オレンジは 27 度
 */
const SOFT_HSL = [
  [226, 0.8, 0.82],
  [27, 0.85, 0.79],
] as const;

// ---------- 状態 ----------

export interface MochiMove {
  care: Care;
  /** お世話の中のやること。なければ DEFAULT_ACT（卵のあいだは選ばない） */
  act?: Act;
  /** サーバが受け取った時刻（stampMove が書き込む）。なければ前のお世話と同じ時刻 */
  at?: number;
}

export interface LastCare {
  care: Care;
  /** やること。やることができる前の対局にはない */
  act?: Act;
  seat: Seat;
  at: number;
  /** そのときほしがっていたもの */
  want: Care | null;
  /** ほしがっていたお世話だったか */
  matched: boolean;
}

/** 席ごとの、さいごにしたお世話 */
export interface SeatCare {
  care: Care;
  act?: Act;
  at: number;
}

export interface MochiState {
  /** できごとを決める種（initialState で作る） */
  seed: number;
  /** はじめてお世話した時刻（卵をあずかった時刻）。まだなら null */
  bornAt: number | null;
  /** 最後のお世話の時刻。まだなら null */
  at: number | null;
  /** 最後のお世話の直後の具合 */
  needs: Needs;
  asleep: boolean;
  /** 最後のお世話の直後の、育った量 */
  growth: number;
  /** お世話の種類ごとの回数 */
  cares: Record<Care, number>;
  /** 席ごとのお世話の回数 */
  bySeat: [number, number];
  /**
   * 順番はないので、次にお世話するとよさそうな人の目安（直前にお世話していない人）。表示にだけ使い、applyMove は見ない。
   * 前は手番だった（そのころの対局も、そのまま続けられる）
   */
  turn: Seat;
  last: LastCare | null;
  /** 席ごとの、さいごにしたお世話。順番がなかったころの対局にはない（lastCareOf で読む） */
  lastOf?: [SeatCare | null, SeatCare | null];
  /** 拾ったもの（拾った順） */
  treasures: Treasure[];
  /** 留守のあいだのできごと（古い順。DIARY_MAX まで） */
  diary: DiaryEntry[];
  /** おとなになった時刻と姿。なるまでは null */
  adultAt: number | null;
  form: Form | null;
  /** やることごとの回数（卵のあいだは数えない）。やることができる前の対局にはない */
  acts?: Partial<Record<Act, number>>;
  /** 分かった好み（好き・苦手なやること。分かった順） */
  known?: Act[];
  /** おとなになったときに身に着けた小物 */
  accessory?: Accessory | null;
}

const DIARY_MAX = 60;

/** その席が、さいごにしたお世話。lastOf がない前からの対局では、最後のお世話だけ分かる */
export function lastCareOf(s: MochiState, seat: Seat): SeatCare | null {
  if (s.lastOf) return s.lastOf[seat];
  return s.last?.seat === seat ? { care: s.last.care, at: s.last.at } : null;
}

/** ある時刻のようす。conditionAt で計算する */
export interface Condition {
  at: number;
  needs: Needs;
  asleep: boolean;
  growth: number;
  /** 最後のお世話からこの時刻までに、眠っていた時間があったか */
  slept: boolean;
  /** 見た目の段階。おとなになるのはお世話をしたときなので、それまではこどもで待つ */
  stage: Stage;
}

export const stageOf = (growth: number): Stage =>
  growth >= ADULT ? "adult" : growth >= CHILD ? "child" : growth >= HATCH ? "baby" : "egg";

const BOUNDS = [0, HATCH, CHILD, ADULT];

/** 今の段階の中で、次の段階までどこまで来たか（0〜1）。おとななら 1 */
export function stageProgress(growth: number): number {
  const i = STAGES.indexOf(stageOf(growth));
  if (i >= STAGES.length - 1) return 1;
  return Math.min(1, Math.max(0, (growth - BOUNDS[i]!) / (BOUNDS[i + 1]! - BOUNDS[i]!)));
}

/** 表示に使う「今」。端末の時計と、最後のお世話の時刻の遅い方 */
export const nowOf = (s: MochiState, clock: number) => Math.max(clock, s.at ?? clock);

/** 卵をあずかった日を 1 日目として、何日目か */
export const dayOf = (s: MochiState, now: number) =>
  s.bornAt === null ? 1 : Math.floor(Math.max(0, now - s.bornAt) / DAY) + 1;

const clamp = (v: number) => Math.min(100, Math.max(0, v));
/** 計算のずれで 0 や 100 のすぐ近くになった値を、ちょうどにする */
const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(v - 100) < 1e-9 ? 100 : clamp(v));

/** 具合のよさ（0〜1）。眠っているあいだは、ねむけの分はいちばんよいとみなす（寝る子は育つ） */
const wellness = (n: Needs, asleep: boolean) => (n.tummy + n.joy + (asleep ? 100 : 100 - n.sleepy)) / 300;
const rateOf = (w: number) => GROW_MIN + (1 - GROW_MIN) * w;

/**
 * 最後のお世話から now までの時間を進めた、now のようす。純粋関数で、盤の表示とルールの両方で使う。
 * 具合は区切り（眠る・起きる・おなかやきげんが 0 になる・育つ時間が終わる・卵がかえる）ごとに直線で変わるので、
 * 区切りまでをまとめて進める。育つ量は区切りの中で具合のよさの平均（はじめと終わりの平均）を使う
 */
export function conditionAt(s: MochiState, now: number): Condition {
  let needs = { ...s.needs };
  let asleep = s.asleep;
  let growth = s.growth;
  let slept = false;
  const start = s.at;
  const total = start === null ? 0 : Math.max(0, now - start) / HOUR;
  let t = 0;
  // 区切りの数は、眠って起きる 1 回り（およそ 1 日）ごとに数個。何年たっても終わるように上限を置く
  for (let guard = 0; t < total && guard < 100_000; guard++) {
    const growing = t < GROW_HOURS;
    let dt = total - t;
    if (growing) dt = Math.min(dt, GROW_HOURS - t);

    if (growth < HATCH) {
      // 卵のあいだは具合が変わらない。育つ時間が終わっていれば、もう何も変わらない
      if (!growing) break;
      dt = Math.min(dt, HATCH - growth);
      growth = dt === HATCH - growth ? HATCH : growth + dt;
      t += dt;
      continue;
    }

    const dTummy = -(asleep ? RATES.tummyAsleep : RATES.tummy);
    const dJoy = -(asleep ? RATES.joyAsleep : RATES.joy);
    const dSleepy = asleep ? -RATES.sleepyDown : RATES.sleepyUp;
    // 眠る・起きる区切り
    const toggle = asleep ? needs.sleepy / RATES.sleepyDown : (100 - needs.sleepy) / RATES.sleepyUp;
    if (toggle <= 0) {
      asleep = !asleep;
      continue;
    }
    dt = Math.min(dt, toggle);
    if (needs.tummy > 0 && dTummy < 0) dt = Math.min(dt, needs.tummy / -dTummy);
    if (needs.joy > 0 && dJoy < 0) dt = Math.min(dt, needs.joy / -dJoy);

    const next: Needs = {
      tummy: snap(needs.tummy + dTummy * dt),
      joy: snap(needs.joy + dJoy * dt),
      sleepy: snap(needs.sleepy + dSleepy * dt),
    };
    if (growing) growth += dt * rateOf((wellness(needs, asleep) + wellness(next, asleep)) / 2);
    if (asleep) slept = true;
    needs = next;
    t += dt;
    if (!asleep && needs.sleepy >= 100) asleep = true;
    else if (asleep && needs.sleepy <= 0) asleep = false;
  }
  const stage = stageOf(growth);
  return {
    at: start === null ? now : Math.max(now, start),
    needs,
    asleep,
    growth,
    slept,
    stage: s.form !== null ? "adult" : stage === "adult" ? "child" : stage,
  };
}

/**
 * 0 以上 1 未満の決まった数。種・何回目のお世話か（k）・使いみち（salt）が同じなら、いつ計算しても同じ
 * （applyMove では乱数を使えないので、initialState で作った種から作る）
 */
function hash(seed: number, k: number, salt: number): number {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;
const movesOf = (s: MochiState) => s.bySeat[0] + s.bySeat[1];

/**
 * 今ほしがっているお世話。卵のあいだ・眠っているあいだ・具合がよいときは null（何をしてもうれしい）。
 * 起きていれば、いちばん足りないもの（同じなら おなか → ねむけ → きげん の順）。
 * きげんが足りないときに何で遊んでほしいかは、お世話ごとに種から決める（次のお世話までは変わらない）
 */
export function wantOf(s: MochiState, c: Condition): Care | null {
  if (c.stage === "egg" || s.form !== null) return null;
  if (c.asleep) return null;
  const lack = { feed: 100 - c.needs.tummy, sleep: c.needs.sleepy, joy: 100 - c.needs.joy };
  const most = Math.max(lack.feed, lack.sleep, lack.joy);
  if (most < WANT_AT) return null;
  if (lack.feed === most) return "feed";
  if (lack.sleep === most) return "sleep";
  return pick(JOY_CARES, hash(s.seed, movesOf(s), 7));
}

/** 見た目のようす */
export type Mood = "egg" | "asleep" | "sleepy" | "hungry" | "sad" | "happy" | "calm";

export function moodOf(c: Condition): Mood {
  if (c.stage === "egg") return "egg";
  if (c.asleep) return "asleep";
  const { tummy, joy, sleepy } = c.needs;
  if (sleepy >= 75) return "sleepy";
  if (tummy < 25) return "hungry";
  if (joy < 30) return "sad";
  if (tummy >= 50 && joy >= 60 && sleepy < 60) return "happy";
  return "calm";
}

/**
 * 最後のお世話から now までの留守のあいだに起きた、小さなできごと。EVENT_MIN_HOURS たっていなければ null。
 * 決まり方：卵のあいだは卵のできごと → かえった・こどもになった → おでかけのあとはかならず拾いもの →
 * FIND_CHANCE で拾いもの → 眠っていれば夢 → ひとこま。拾うものは、まだ持っていないものから選ぶ。
 * 種と何回目のお世話かで決まるので、同じ留守のあいだなら何度開いても同じ（お世話した時刻で日記に残す）
 */
export function happeningOf(s: MochiState, now: number, c: Condition = conditionAt(s, now)): Happening | null {
  if (s.at === null || s.form !== null) return null;
  if ((now - s.at) / HOUR < EVENT_MIN_HOURS) return null;
  const k = movesOf(s);
  const before = stageOf(s.growth);
  if (c.stage === "egg") return { kind: "egg", topic: pick(EGG_MOMENTS, hash(s.seed, k, 1)) };
  if (before === "egg") return { kind: "hatched" };
  if (before === "baby" && c.stage === "child") return { kind: "grew" };
  const walk = s.last?.care === "walk";
  if (walk || hash(s.seed, k, 2) < FIND_CHANCE) {
    const have = new Set(s.treasures.map((t) => t.item));
    // おでかけのあとは、行き先で見つかるもののうち、まだ持っていないもの（全部持っていれば、ほかのまだ持っていないもの）
    const place = walk && s.last?.act ? defOf(s.last.act).place : undefined;
    const near = place ? PLACE_ITEMS[place].filter((i) => !have.has(i)) : [];
    const fresh = near.length > 0 ? near : ITEMS.filter((i) => !have.has(i));
    const item = pick(fresh.length > 0 ? fresh : ITEMS, hash(s.seed, k, 3));
    return place ? { kind: "found", item, walk, place } : { kind: "found", item, walk };
  }
  if (c.slept) return { kind: "dream", topic: pick(DREAMS, hash(s.seed, k, 4)) };
  return { kind: "moment", topic: pick(MOMENTS, hash(s.seed, k, 5)) };
}

/**
 * おとなの姿。お世話の割合がめやす（FORM_AT）にいちばん大きな割合で届いたお世話の姿にする。
 * どれも届かなければ、まんべんなくお世話したので、なかよしの姿（同じなら CARES の順で先のもの）
 */
export function formOf(cares: Record<Care, number>): Form {
  const total = CARES.reduce((sum, c) => sum + cares[c], 0);
  if (total === 0) return "harmony";
  let top: Care = CARES[0];
  let best = -1;
  for (const c of CARES) {
    const ratio = cares[c] / total / FORM_AT[c];
    if (ratio > best) [top, best] = [c, ratio];
  }
  return best >= 1 ? FORM_OF[top] : "harmony";
}

/** 色相（度）・あざやかさ・明るさ（0〜1）から #rrggbb */
function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** 青だけ・オレンジだけのときの体の色 */
export const SOFT = [hslHex(...SOFT_HSL[0]), hslHex(...SOFT_HSL[1])] as const;

/**
 * 体の色。2 人のやわらかい色を、お世話の回数の割合で混ぜる（まだ誰もお世話していなければ半々）。
 * 青とオレンジをそのまま混ぜると灰色ににごるので、色相を 青 → ラベンダー → さくら色 → もも色 → オレンジ と回して混ぜ、
 * 半々に近いほどあざやかさを少し落として明るくする（さくらもちのような色になる）
 */
export function bodyColor(bySeat: readonly [number, number]): string {
  const total = bySeat[0] + bySeat[1];
  const share = total === 0 ? 0.5 : bySeat[1] / total;
  if (share <= 0) return SOFT[0];
  if (share >= 1) return SOFT[1];
  const [[h0, s0, l0], [h1, s1, l1]] = SOFT_HSL;
  const mid = 4 * share * (1 - share);
  return hslHex(h0 + (h1 + 360 - h0) * share, s0 + (s1 - s0) * share - 0.27 * mid, l0 + (l1 - l0) * share + 0.03 * mid);
}

/**
 * お世話を 1 つした直後の具合。卵のあいだは変わらない。act があれば、その効き方を使う。
 * 好きなやることはきげんがよけいによくなり、苦手なやることはきげんの効きが半分
 */
function afterCare(c: Condition, care: Care, act?: Act, feeling: "like" | "dislike" | null = null): { needs: Needs; asleep: boolean } {
  if (c.stage === "egg") return { needs: c.needs, asleep: false };
  const def = act ? defOf(act) : null;
  const e = def?.effect ?? EFFECTS[care];
  let joy = e.joy ?? 0;
  if (feeling === "like") joy += LIKE_JOY;
  else if (feeling === "dislike") joy = Math.round(joy / 2);
  return {
    needs: {
      tummy: clamp(c.needs.tummy + (e.tummy ?? 0)),
      joy: clamp(c.needs.joy + joy),
      sleepy: clamp(c.needs.sleepy + (e.sleepy ?? 0)),
    },
    asleep: care === "sleep" ? true : care === "pet" && !def?.wake ? c.asleep : false,
  };
}

// ---------- 知らせる時刻 ----------

/** だれもお世話しないまま、この時間たったら「しばらくだれも来ていない」と知らせる */
export const LONELY_HOURS = 12;
/** お世話のすぐあと（この時間より前）に起きることは知らせない（お世話した人が見ているし、相手にはお世話の知らせが届く） */
export const ALARM_MIN_HOURS = 1;

/**
 * 知らせの種類。同じ時刻なら、この順で先のものにする。
 * grown：おとなになれるくらい育った（お世話するとおとなになる）／hatched：卵がかえった／
 * hungry：おなかがすいて、ごはんをほしがるくらいになった（眠っていたら、目がさめたとき）／
 * wake：眠っていたのが目をさました／lonely：しばらくだれも来ていない
 */
export const ALARMS = ["grown", "hatched", "hungry", "wake", "lonely"] as const;
export type AlarmKind = (typeof ALARMS)[number];
export interface Alarm {
  at: number;
  kind: AlarmKind;
}

/** lo（ミリ秒）では ok でなく、hi では ok のとき、はじめて ok になる時刻（ミリ秒）。ok は lo〜hi で一度だけ変わること */
function firstWhen(lo: number, hi: number, ok: (t: number) => boolean): number | null {
  if (!ok(hi)) return null;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * だれもお世話しないまま時間がたったとき、次に知らせるとよい時刻と種類。はじめてのお世話の前と、おとなになったあとは null。
 * さいごのお世話から LONELY_HOURS 時間までのあいだで、いちばん早いものを 1 つだけ返す（お世話するまで、知らせは 1 回）。
 * どれも「変わり目」の時刻で、お世話のときにもうそうなっていたもの（おなかがすいていた など）は知らせない。
 * 具合はおなか・育った量が時間とともに一方にしか動かないので、conditionAt を使って変わり目をはさみうちで探す（ミリ秒まで）
 */
export function nextAlarm(s: MochiState): Alarm | null {
  if (s.at === null || s.form !== null) return null;
  const start = s.at;
  const end = start + LONELY_HOURS * HOUR;
  const at = (t: number) => conditionAt(s, t);
  const found: Alarm[] = [{ at: end, kind: "lonely" }];
  const add = (kind: AlarmKind, t: number | null) => {
    if (t !== null && t - start >= ALARM_MIN_HOURS * HOUR && t <= end) found.push({ at: t, kind });
  };

  // 育った量は減らない。卵がかえる・おとなになれるくらい育つ
  add("hatched", s.growth < HATCH ? firstWhen(start, end, (t) => at(t).growth >= HATCH) : null);
  add("grown", firstWhen(start, end, (t) => at(t).growth >= ADULT));

  // 眠ったあとに目がさめる。LONELY_HOURS のあいだに目がさめるのは多くても 1 回なので、一度だけ変わる
  add("wake", firstWhen(start, end, (t) => {
    const c = at(t);
    return c.slept && !c.asleep;
  }));

  // おなかは減るだけ。ほしがるくらいになった時刻に眠っていたら、目がさめたときにする
  const hungry = (t: number) => at(t).needs.tummy <= 100 - WANT_AT;
  let fed = hungry(start) ? null : firstWhen(start, end, hungry);
  if (fed !== null && at(fed).asleep) {
    // 眠っているのは長くても 100 / sleepyDown 時間
    const from = fed;
    fed = firstWhen(from, from + Math.ceil((100 / RATES.sleepyDown) * HOUR) + 1, (t) => !at(t).asleep);
  }
  add("hungry", fed);

  return found.reduce((a, b) => (b.at < a.at || (b.at === a.at && ALARMS.indexOf(b.kind) < ALARMS.indexOf(a.kind)) ? b : a));
}

const isCare = (v: unknown): v is Care => typeof v === "string" && (CARES as readonly string[]).includes(v);
const isAct = (v: unknown): v is Act => typeof v === "string" && Object.hasOwn(ACT_DEFS, v);

export const mochi: GameDefinition<MochiState, MochiMove> = {
  id: "mochi",

  initialState(rng) {
    return {
      seed: Math.floor(rng() * 4294967296) >>> 0,
      bornAt: null,
      at: null,
      needs: { ...START_NEEDS },
      asleep: false,
      growth: 0,
      cares: Object.fromEntries(CARES.map((c) => [c, 0])) as Record<Care, number>,
      bySeat: [0, 0],
      turn: 0,
      last: null,
      lastOf: [null, null],
      treasures: [],
      diary: [],
      adultAt: null,
      form: null,
    };
  },

  status(state): GameStatus {
    // 協力ゲームなので勝ち負けはない。おとなになったら 2 人でクリア（失敗はない）
    if (state.form !== null) return { kind: "finished", winner: null, coop: "cleared" };
    // 順番はない（2 人ともいつでもお世話できる）。turn は次にお世話するとよさそうな人の目安
    return { kind: "playing", turn: state.turn, free: true };
  },

  applyMove(state, move, seat) {
    if (state.form !== null) throw new IllegalMoveError("game_over");
    // 順番はないので、手番は見ない（同じ人が続けてもよい）
    if (!isCare(move.care)) throw new IllegalMoveError("mochi_no_such_care");
    if (move.act !== undefined && (!isAct(move.act) || defOf(move.act).care !== move.care)) throw new IllegalMoveError("mochi_no_such_act");

    // 時刻は前のお世話より戻さない。時刻のない手は前のお世話と同じ時刻
    const stamped = typeof move.at === "number" && Number.isFinite(move.at) ? move.at : (state.at ?? 0);
    const t = state.at === null ? stamped : Math.max(stamped, state.at);
    const c = conditionAt(state, t);
    // 卵のあいだはやることを選ばない。選べないやることは受け付けない
    let act: Act | undefined;
    if (c.stage !== "egg") {
      act = move.act ?? DEFAULT_ACT[move.care];
      if (move.act !== undefined && !actsAt(state, c, move.care).includes(act)) throw new IllegalMoveError("mochi_act_locked");
    }
    const happening = happeningOf(state, t, c);
    const want = wantOf(state, c);
    const matched = want === move.care;
    const since = state.at === null ? Infinity : (t - state.at) / HOUR;
    const growth = c.growth + (matched ? CARE_MATCH : CARE_BASE) * Math.min(1, since / BONUS_HOURS);
    const feeling = act ? feelingOf(state.seed, act) : null;
    const { needs, asleep } = afterCare(c, move.care, act, feeling);

    const cares = { ...state.cares, [move.care]: state.cares[move.care] + 1 };
    const acts = act ? { ...state.acts, [act]: (state.acts?.[act] ?? 0) + 1 } : state.acts;
    const known = act && feeling && !(state.known ?? []).includes(act) ? [...(state.known ?? []), act] : state.known;
    const bySeat: [number, number] = [...state.bySeat];
    bySeat[seat]++;
    const lastOf: [SeatCare | null, SeatCare | null] = [lastCareOf(state, 0), lastCareOf(state, 1)];
    lastOf[seat] = act ? { care: move.care, act, at: t } : { care: move.care, at: t };
    const grown = growth >= ADULT;
    return {
      ...state,
      bornAt: state.bornAt ?? t,
      at: t,
      needs,
      asleep,
      growth,
      cares,
      bySeat,
      turn: other(seat),
      last: act ? { care: move.care, act, seat, at: t, want, matched } : { care: move.care, seat, at: t, want, matched },
      lastOf,
      ...(acts ? { acts } : {}),
      ...(known ? { known } : {}),
      treasures: happening?.kind === "found" ? [...state.treasures, { item: happening.item, at: t }] : state.treasures,
      diary: happening ? [...state.diary, { at: t, seat, happening }].slice(-DIARY_MAX) : state.diary,
      adultAt: grown ? t : null,
      form: grown ? formOf(cares) : null,
      ...(grown ? { accessory: accessoryOf(acts ?? {}) } : {}),
    };
  },

  parseMove(raw) {
    // 時刻は送られてきても使わない（サーバが stampMove で書き込む）
    const { care, act } = (raw ?? {}) as { care?: unknown; act?: unknown };
    if (!isCare(care)) return null;
    if (act === undefined) return { care };
    return isAct(act) && defOf(act).care === care ? { care, act } : null;
  },

  stampMove(move, now) {
    return move.act ? { care: move.care, act: move.act, at: now } : { care: move.care, at: now };
  },

  nextAlarm,
};
