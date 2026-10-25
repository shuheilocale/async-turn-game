import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * バックボーン・ファイト：2 人がバックボーン（格闘技、または異種格闘技の職業など）を 1 つ選び、攻撃・防御・すばやさ・スタミナに
 * 合計 20 ポイント（それぞれ 1〜8）を振り分けてキャラを作る。先に決めた人のキャラは、相手が決めるまで伏せる。
 * そのあとは攻防のくり返し。毎回 2 人がこっそり技を 1 つ選び（先に選んだ人の技は伏せる）、そろったら同時に出す。
 *
 * 技は「打撃」「組み」「守り」の 3 種類で、じゃんけんのように回っている。
 * - 打撃は組みに強い（組みに来たところに当たる）。守りには受けられる
 * - 組みは守りに強い（守って止まっている相手をつかまえる）。打撃には止められる
 * - 守りは打撃に強い（受けて返す）。組みにはつかまる
 * 守りには、ブロック（受けて小さく返す）・かわす（すばやさが相手以上なら無傷）・カウンター（大きく返すが組みにとても弱い）
 * ・返し（組み技を返すが、打撃はまともにくらう）・ため（回復や強化・弱体。打撃を少しくらいながらでも決まり、組まれると決まらない）
 * ・消える（打撃も組みもかわす。回数に限りがある）がある。
 * バックボーンによっては、受けるダメージの倍率や疲れ方などの特性もある。
 * 打撃どうしは打ち合いで、速い方が先に当てる。組みどうしは組み合いで、力の強い方だけが決まる。守りどうしは何も起きない（ためは決まる）。
 *
 * 位置関係（立ち・組み合い・寝技）は 2 人で 1 つ。組み技で組み合い・寝技になり、押し離す技・かわし・
 * 組み合いや寝技で 2 人とも守ったとき（ブレイク）に立ちに戻る。位置で使える技と、バックボーンの得意さが変わる
 * （打撃系は立ちで強く、柔術・レスリングは寝技で強い）。
 *
 * パラメータは、攻撃が与えるダメージ、防御が受けるダメージ（組み技には半分だけ効く）、すばやさが打ち合いで先に当てる・
 * かわす・打撃をもらいにくい、スタミナが後半の疲れにくさと組みどうしの粘りに効く。どれに振っても 1 ポイントの値打ちが
 * だいたい同じになるようにしてある。ための技の強化・弱体は、パラメータを何攻防かのあいだ上げ下げする。
 *
 * 体力 100 を 0 にすれば KO 勝ち。8 回の攻防で決まらなければ体力の多い方の判定勝ち、同じなら引き分け。
 * 運（打ち合い・組み合いの競り、ダメージの小さなゆらぎ）は initialState で先に作っておく
 */

/** 格闘技のバックボーン */
export const MARTIAL_STYLES = [
  "karate",
  "muaythai",
  "boxing",
  "mma",
  "judo",
  "bjj",
  "capoeira",
  "taekwondo",
  "wrestling",
  "sumo",
  "kickboxing",
  "taichi",
  "kendo",
  "luchador",
] as const;
/** 異種格闘技のバックボーン（格闘家ではない人たち） */
export const CROSSOVER_STYLES = [
  "gamer",
  "magician",
  "nurse",
  "swimmer",
  "idol",
  "rapper",
  "chef",
  "robot",
  "ninja",
  "tuktuk",
  "stuntman",
  "salaryman",
  "bubbletea",
  "firefighter",
  "dj",
  "investor",
  "dino",
] as const;
export const STYLE_IDS = [...MARTIAL_STYLES, ...CROSSOVER_STYLES] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const STAT_KEYS = ["power", "guard", "speed", "stamina"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** 攻撃・防御・すばやさ・スタミナ（それぞれ 1〜8、合計 20） */
export type FighterStats = Record<StatKey, number>;
export const STAT_MIN = 1;
export const STAT_MAX = 8;
export const STAT_TOTAL = 20;
/** 強化・弱体で上がり下がりできる幅（パラメータは 1〜10 の中にとどめる） */
export const BOOSTED_MAX = 10;

export interface Fighter {
  style: StyleId;
  stats: FighterStats;
}

export const MAX_HP = 100;
/** 攻防の数。ここまでで KO がなければ判定 */
export const EXCHANGES = 8;

export const POSITIONS = ["standing", "clinch", "ground"] as const;
export type Position = (typeof POSITIONS)[number];

/** 技の動きの種類（3D の舞台が動きを決めるのに使う） */
export type ActionKind =
  | "jab"
  | "straight"
  | "hook"
  | "uppercut"
  | "kick_high"
  | "kick_mid"
  | "kick_low"
  | "spin_kick"
  | "knee"
  | "elbow"
  | "push"
  | "clinch"
  | "takedown"
  | "throw"
  | "submission"
  | "block"
  | "dodge"
  | "counter"
  | "projectile"
  | "swing"
  | "perform"
  | "heal"
  | "vanish";

/** 技の種類（3 すくみ）。打撃は組みに、組みは守りに、守りは打撃に強い */
export type MoveClass = "strike" | "grab" | "guard";

/**
 * 守りの種類。
 * block = 打撃を受けて小さく返す。dodge = 打撃をかわす（すばやさが相手以上なら無傷で、立ちに戻る）。
 * counter = 打撃を大きく返す（大技ほど痛い）が、組み技にはとても弱い。
 * catch = 組み技を返す（スプロール・返し技など）が、打撃はまともにくらう。
 * focus = ため（回復・強化・弱体）。打撃を少しくらいながらでも決まり、組まれると決まらない。
 * vanish = 消える。打撃も組みもかわして立ちに戻る（回数に限りがある）
 */
export type GuardKind = "block" | "dodge" | "counter" | "catch" | "focus" | "vanish";

/**
 * 技が決まったときに付く強化・弱体。to = self は自分、foe は相手。turns は続く攻防の数（次の攻防から数える）。
 * stack = 続いているうちに重ねると、残りが延びて少しずつ大きくなる（投資家の積み立て。上限あり）
 */
export interface FxSpec {
  to: "self" | "foe";
  stat: StatKey;
  amount: number;
  turns: number;
  stack?: boolean;
}

/** 続いている強化・弱体。amount が正なら強化、負なら弱体。left は残りの攻防の数 */
export interface Effect {
  who: Seat;
  stat: StatKey;
  amount: number;
  left: number;
}

export interface Technique {
  id: string;
  kind: ActionKind;
  cls: MoveClass;
  /** 守りの種類（守りの技だけ） */
  guard?: GuardKind;
  /** 威力。打撃・組みは当たったときのダメージのもと、守りは返すときのダメージのもと */
  power: number;
  /** 出の速さ。打ち合い・かわし・組み合いで、すばやさに足す（ジャブは +2、大技はマイナス） */
  quick: number;
  /** 使える位置 */
  where: readonly Position[];
  /** 決まったあとの位置。省くと変わらない */
  to?: Position;
  /** 決まったときに回復する体力（体力の上限まで） */
  heal?: number;
  /** 1 局で使える回数。省くと何回でも */
  uses?: number;
  /** 決まったときに付く強化・弱体 */
  fx?: readonly FxSpec[];
  /**
   * 続けるほど強い。same = この技を前の攻防から続けて出した回数、hit = 前の攻防から続けて当てた回数。
   * 1 回ごとに威力 per、max 回ぶんまで
   */
  chain?: { per: number; max: number; by: "same" | "hit" };
  /** 威力が運で大きく変わる（0.4〜1.6 倍） */
  wild?: boolean;
  /** 体力が少ないほど強い（体力 0 に近いほど 2 倍に近づく） */
  encore?: boolean;
  /** 相手の強化と自分の弱体を入れ替える */
  swap?: boolean;
  /** 相手の直前の技の種類に強い形になる（打撃 → カウンター、組み → 打撃、守り → 組み。はじめはブロック） */
  read?: boolean;
  /** かわしが、すばやさに関係なく決まる（忍者の分身） */
  sure?: boolean;
  /** 前の攻防で自分が守りの技を出していたら（身を隠していたら）、威力 +ambush（忍者の忍び足） */
  ambush?: number;
  /** 前の攻防で自分の見せ技（perform）が決まっていたら、威力 +drop（DJ のビートドロップ） */
  drop?: number;
  /** ブロックの上から当たる分（省くと CHIP）。小さいほど固い（消防士の防火服） */
  chip?: number;
}

export interface StyleDef {
  /** 位置ごとの得意さ。与えるダメージの倍率になり、組み合いの強さにも効く */
  aff: Record<Position, number>;
  /** 組みどうしになったときの組みの強さ（力・スタミナに足す）。組み技が得意なバックボーンほど大きい */
  grip: number;
  /**
   * 受けるダメージの倍率（省くと 1）。ロボットは打撃にかたいが組みに弱く、水泳選手は組まれてもぬるっと抜け、
   * スタントマンは受け身で投げのダメージを減らす。消防士はどちらにもかたく、恐竜の着ぐるみは厚い着ぐるみで打撃に強い。
   * guarding は守りの技を出しているときに受ける分（トゥクトゥク運転手は止まると弱い）
   */
  taken?: { strike?: number; grab?: number; guarding?: number };
  /** 疲れの倍率（省くと 1）。サラリーマンは残業で鍛えたので、消防士は訓練で疲れにくく、恐竜の着ぐるみは暑くて疲れやすい */
  fatigue?: number;
  /** おすすめの振り分け（キャラ作りで選んだときのはじめの値・コンピュータの目安） */
  build: FighterStats;
  moves: readonly Technique[];
}

const POS = { S: "standing", C: "clinch", G: "ground" } as const satisfies Record<string, Position>;
type PosCode = keyof typeof POS;
const where = (codes: string): Position[] => [...codes].map((c) => POS[c as PosCode]);
type Extra = Partial<
  Pick<Technique, "heal" | "uses" | "fx" | "chain" | "wild" | "encore" | "swap" | "read" | "sure" | "ambush" | "drop" | "chip">
>;

/** 技を短く書くための道具。where は "SCG"（立ち・組み合い・寝技）の組み合わせ、to は 1 文字。extra は特別な効果 */
const strike = (
  id: string,
  kind: ActionKind,
  power: number,
  quick: number,
  at: string,
  to?: PosCode,
  extra: Extra = {},
): Technique => ({ id, kind, cls: "strike", power, quick, where: where(at), ...(to && { to: POS[to] }), ...extra });
const grab = (
  id: string,
  kind: ActionKind,
  power: number,
  quick: number,
  at: string,
  to?: PosCode,
  extra: Extra = {},
): Technique => ({ id, kind, cls: "grab", power, quick, where: where(at), ...(to && { to: POS[to] }), ...extra });
const guard = (
  id: string,
  kind: ActionKind,
  type: GuardKind,
  power: number,
  quick: number,
  at: string,
  to?: PosCode,
  extra: Extra = {},
): Technique => ({ id, kind, cls: "guard", guard: type, power, quick, where: where(at), ...(to && { to: POS[to] }), ...extra });
/** ため（回復・強化・弱体）の技。どの位置でも使える */
const focus = (id: string, kind: ActionKind, extra: Extra): Technique => guard(id, kind, "focus", 0, 0, "SCG", undefined, extra);
const self = (stat: StatKey, amount: number, turns: number, stack = false): FxSpec => ({
  to: "self",
  stat,
  amount,
  turns,
  ...(stack && { stack }),
});
const foe = (stat: StatKey, amount: number, turns: number): FxSpec => ({ to: "foe", stat, amount, turns });

const stats = (power: number, guardValue: number, speed: number, stamina: number): FighterStats => ({
  power,
  guard: guardValue,
  speed,
  stamina,
});

/**
 * バックボーンごとの得意さと技。技の名前（文言）は画面側の i18n/games/fight.ts にある。
 * 打撃系（ボクシング・空手・テコンドー・カポエラ・キックボクシング・剣道）は立ちで強く、組み系（ムエタイの首相撲・柔道・相撲・太極拳・
 * ルチャ・リブレ）は組み合いで、寝技系（柔術・レスリング）は寝技で強い。総合格闘技はどこでも平均的。
 * 異種格闘技の人たちは、格闘技の技の代わりに職業の道具や得意なことで戦う（回復・強化・弱体・読み・消える など）
 */
export const STYLES: Record<StyleId, StyleDef> = {
  karate: {
    aff: { standing: 1.08, clinch: 1.02, ground: 0.94 },
    grip: 0,
    build: stats(5, 5, 6, 4),
    moves: [
      strike("kizami", "jab", 8, 2, "SC"),
      strike("seiken", "straight", 14, 0, "SCG"),
      strike("mawashi", "kick_high", 17, -1, "S"),
      strike("maegeri", "kick_mid", 10, 1, "SCG", "S"),
      grab("ashibarai", "kick_low", 9, 1, "SC"),
      guard("uke", "block", "block", 4, 0, "SCG"),
      guard("gonosen", "counter", "counter", 4, 0, "SC"),
    ],
  },
  muaythai: {
    aff: { standing: 1.21, clinch: 1.43, ground: 0.72 },
    grip: 1.5,
    build: stats(6, 4, 4, 6),
    moves: [
      strike("teep", "kick_mid", 9, 1, "SCG", "S"),
      strike("middle", "kick_mid", 14, 0, "S"),
      strike("low", "kick_low", 11, 1, "S"),
      strike("knee", "knee", 15, 0, "SC"),
      strike("elbow", "elbow", 17, -1, "SCG"),
      grab("plum", "clinch", 6, 0, "SC", "C"),
      guard("guard", "block", "block", 4, 0, "SCG"),
    ],
  },
  boxing: {
    aff: { standing: 1.35, clinch: 1.08, ground: 0.75 },
    grip: 0,
    build: stats(5, 5, 6, 4),
    moves: [
      strike("jab", "jab", 8, 2, "SC"),
      strike("straight", "straight", 12, 1, "S"),
      strike("hook", "hook", 16, -1, "SCG"),
      strike("uppercut", "uppercut", 14, 0, "C"),
      guard("duck", "dodge", "dodge", 4, 1, "SC", "S"),
      guard("block", "block", "block", 4, 0, "SCG"),
      grab("clinch", "clinch", 5, 0, "SCG", "S"),
    ],
  },
  mma: {
    aff: { standing: 1.08, clinch: 1.05, ground: 0.97 },
    grip: 1.5,
    build: stats(5, 5, 5, 5),
    moves: [
      strike("jab", "jab", 8, 2, "SC"),
      strike("straight", "straight", 13, 0, "S"),
      strike("highkick", "kick_high", 16, -1, "S"),
      grab("tackle", "takedown", 11, 0, "SC", "G"),
      strike("pound", "hook", 14, 0, "G"),
      grab("choke", "submission", 18, -1, "G"),
      guard("guard", "block", "block", 4, 0, "SCG"),
    ],
  },
  judo: {
    aff: { standing: 1.08, clinch: 1.38, ground: 1.23 },
    grip: 3,
    build: stats(6, 6, 3, 5),
    moves: [
      grab("seoi", "throw", 17, 0, "SC", "G"),
      grab("osoto", "throw", 16, 1, "C", "G"),
      grab("kumite", "clinch", 5, 1, "S", "C"),
      strike("tsukihanashi", "push", 7, 1, "SCG", "S"),
      grab("kesa", "submission", 15, 0, "G"),
      guard("kaeshi", "throw", "catch", 7, 0, "SCG", "G"),
      guard("taisabaki", "block", "block", 4, 0, "SCG"),
    ],
  },
  bjj: {
    aff: { standing: 1.03, clinch: 1.0, ground: 1.55 },
    grip: 2.5,
    build: stats(4, 6, 3, 7),
    moves: [
      grab("hikikomi", "takedown", 6, 3, "SC", "G"),
      grab("sankaku", "submission", 20, -1, "G"),
      grab("juji", "submission", 18, 0, "G"),
      strike("upkick", "kick_mid", 8, 1, "SG"),
      guard("closedguard", "block", "block", 4, 0, "SCG"),
      guard("sweep", "throw", "catch", 6, 0, "CG", "G"),
    ],
  },
  capoeira: {
    aff: { standing: 1.17, clinch: 0.93, ground: 1.05 },
    grip: 0.5,
    build: stats(5, 3, 7, 5),
    moves: [
      strike("meialua", "spin_kick", 19, -2, "S"),
      strike("armada", "kick_high", 15, -1, "S"),
      strike("martelo", "kick_mid", 11, 2, "SC"),
      strike("cabecada", "push", 11, 0, "CG", "S"),
      grab("rasteira", "kick_low", 10, 1, "SCG", "G"),
      guard("ginga", "dodge", "dodge", 5, 1, "SCG", "S"),
    ],
  },
  taekwondo: {
    aff: { standing: 1.12, clinch: 0.88, ground: 0.6 },
    grip: 0,
    build: stats(5, 3, 7, 5),
    moves: [
      strike("apchagi", "kick_mid", 10, 1, "SCG", "S"),
      strike("dollyo", "kick_mid", 13, 1, "S"),
      strike("naeryo", "kick_high", 18, -1, "S"),
      strike("dwihuryo", "spin_kick", 21, -2, "S"),
      guard("step", "dodge", "dodge", 4, 1, "SC", "S"),
      guard("makki", "block", "block", 4, 0, "SCG"),
      grab("push", "push", 9, 0, "SC", "S"),
    ],
  },
  wrestling: {
    aff: { standing: 1.12, clinch: 1.25, ground: 1.3 },
    grip: 3.5,
    build: stats(6, 4, 4, 6),
    moves: [
      grab("tackle", "takedown", 13, 0, "SC", "G"),
      grab("suplex", "throw", 17, -1, "C", "G"),
      guard("sprawl", "counter", "catch", 8, 0, "SC", "S"),
      grab("pin", "submission", 14, 0, "G"),
      strike("pound", "hook", 12, 0, "CG"),
      guard("block", "block", "block", 4, 0, "SCG"),
    ],
  },
  sumo: {
    aff: { standing: 1.12, clinch: 1.24, ground: 0.8 },
    grip: 3,
    build: stats(7, 6, 3, 4),
    moves: [
      strike("tsuppari", "push", 10, 1, "SCG", "S"),
      strike("butchikamashi", "push", 14, 0, "S", "C"),
      grab("gappuri", "clinch", 6, 0, "S", "C"),
      grab("yorikiri", "push", 15, 0, "C", "S"),
      grab("uwatenage", "throw", 17, -1, "C", "G"),
      guard("ottsuke", "block", "block", 4, 0, "SCG"),
      guard("utchari", "throw", "catch", 8, -1, "C", "G"),
    ],
  },
  // パンチと蹴りのコンビネーション。ムエタイと違って首相撲・ひじはなく、パンチが当たった次のローキックが重い
  kickboxing: {
    aff: { standing: 1.3, clinch: 1.0, ground: 0.72 },
    grip: 0.5,
    build: stats(6, 4, 6, 4),
    moves: [
      strike("onetwo", "straight", 13, 1, "SCG"),
      strike("low", "kick_low", 10, 1, "S", undefined, { chain: { per: 6, max: 1, by: "hit" } }),
      strike("middle", "kick_mid", 14, 0, "S"),
      strike("high", "kick_high", 18, -1, "S"),
      grab("clinch", "clinch", 5, 0, "SCG", "S"),
      guard("block", "block", "block", 4, 0, "SCG"),
      guard("sway", "dodge", "dodge", 4, 1, "SC", "S"),
    ],
  },
  // やわらかく受け流して返す。受け（雲手）と返し（推手）が強く、組み合いの発勁が大きい
  taichi: {
    aff: { standing: 1.17, clinch: 1.35, ground: 0.95 },
    grip: 2,
    build: stats(4, 6, 4, 6),
    moves: [
      grab("ranjakubi", "clinch", 6, 1, "S", "C"),
      strike("tanben", "straight", 14, 0, "SC"),
      strike("hakkei", "push", 18, -1, "SC", "S"),
      guard("suishu", "counter", "catch", 9, 0, "SCG"),
      guard("unshu", "block", "block", 6, 0, "SCG"),
      guard("kinkei", "dodge", "dodge", 5, 1, "SC", "S"),
    ],
  },
  // 竹刀の間合い。立ちの打ちが速く強いが、寝技では突きしか届かない。打ったあとの残心で次の打ちを強くする
  kendo: {
    aff: { standing: 1.27, clinch: 1.12, ground: 0.78 },
    grip: 1,
    build: stats(6, 4, 6, 4),
    moves: [
      strike("men", "swing", 18, -1, "S"),
      strike("kote", "swing", 9, 2, "SC"),
      strike("do", "swing", 14, 0, "SC"),
      strike("tsuki", "straight", 13, 1, "SCG", "S"),
      grab("tsubazeriai", "clinch", 6, 0, "SC", "C"),
      guard("shinaiuke", "block", "block", 5, 0, "SCG"),
      focus("zanshin", "perform", { fx: [self("power", 3, 3)] }),
    ],
  },
  // 派手な空中技と、組みの強さ。ロープワークで速くかわし、観客をあおって攻撃を上げる
  luchador: {
    aff: { standing: 1.15, clinch: 1.1, ground: 0.92 },
    grip: 3,
    build: stats(5, 4, 6, 5),
    moves: [
      strike("chop", "hook", 13, 0, "SCG"),
      strike("dropkick", "kick_high", 17, -1, "S"),
      grab("tope", "takedown", 13, 1, "S", "G"),
      grab("huracanrana", "throw", 16, 0, "SC", "G"),
      guard("ropework", "dodge", "dodge", 2, 3, "SCG", "S"),
      focus("crowd", "perform", { fx: [self("power", 4, 2)] }),
    ],
  },
  // 読みと反応の速さ。読みは相手の直前の技に強い形になり、コンボは当て続けるほど重い
  gamer: {
    aff: { standing: 1.08, clinch: 1.0, ground: 0.95 },
    grip: 1,
    build: stats(5, 5, 6, 4),
    moves: [
      guard("yomi", "perform", "block", 4, 0, "SCG", undefined, { read: true }),
      strike("combo", "jab", 9, 1, "SCG", undefined, { chain: { per: 4, max: 2, by: "hit" } }),
      strike("hissatsu", "projectile", 17, -1, "S"),
      grab("nage", "throw", 12, 1, "SC", "G"),
      guard("justguard", "block", "dodge", 5, 1, "SCG"),
      focus("aori", "perform", { fx: [foe("speed", -3, 3)] }),
    ],
  },
  // まどわし。消える（2 回まで）は打撃も組みもかわし、すり替えは相手の強化と自分の弱体を入れ替える
  magician: {
    aff: { standing: 1.11, clinch: 0.92, ground: 0.8 },
    grip: 0.5,
    build: stats(5, 4, 7, 4),
    moves: [
      strike("cards", "projectile", 10, 2, "SC"),
      strike("stick", "swing", 14, 0, "SCG"),
      grab("levitate", "throw", 13, 0, "SC", "G"),
      guard("vanish", "vanish", "vanish", 4, 1, "SCG", "S", { uses: 1 }),
      guard("hat", "block", "block", 4, 0, "SCG"),
      focus("dove", "perform", { fx: [foe("guard", -3, 3)] }),
      focus("swap", "perform", { swap: true, fx: [self("speed", 2, 2)] }),
    ],
  },
  // 回復と、人を動かす力。応急手当（2 回まで）で体力を戻し、体位変換で転がして寝技で押さえ込む
  nurse: {
    aff: { standing: 1.05, clinch: 1.08, ground: 1.05 },
    grip: 1.5,
    build: stats(4, 5, 5, 6),
    moves: [
      strike("oshimodoshi", "push", 10, 1, "SCG", "S"),
      grab("taii", "throw", 14, 0, "SC", "G"),
      grab("yokusei", "submission", 15, 0, "G"),
      guard("uketome", "block", "block", 5, 0, "SCG"),
      focus("teate", "heal", { heal: 15, uses: 2 }),
      focus("taping", "heal", { fx: [self("guard", 3, 3)] }),
    ],
  },
  // スタミナと、組まれてもぬるっと抜ける体（組み技のダメージが少ない）。息継ぎで息を整える
  swimmer: {
    aff: { standing: 1.08, clinch: 1.0, ground: 1.0 },
    grip: 1,
    taken: { grab: 0.8 },
    build: stats(5, 4, 5, 6),
    moves: [
      strike("crawl", "jab", 8, 2, "SC"),
      strike("butterfly", "hook", 15, -1, "SC"),
      strike("dolphin", "kick_mid", 11, 0, "SCG"),
      grab("dive", "takedown", 12, 1, "SC", "G"),
      guard("turn", "dodge", "dodge", 4, 1, "SCG", "S"),
      guard("streamline", "block", "block", 4, 0, "SCG"),
      focus("breath", "heal", { heal: 8, uses: 2, fx: [self("stamina", 3, 3)] }),
    ],
  },
  // ファンの応援と、きらめき。見せ技で相手を弱らせ、体力が少ないほどアンコールが強い
  idol: {
    aff: { standing: 1.22, clinch: 1.3, ground: 1.05 },
    grip: 2.5,
    build: stats(5, 4, 6, 5),
    moves: [
      strike("hightouch", "straight", 13, 1, "SC"),
      strike("encore", "swing", 12, 0, "SCG", undefined, { encore: true }),
      grab("akushu", "clinch", 7, 2, "S", "C"),
      guard("step", "dodge", "dodge", 4, 1, "SCG", "S"),
      guard("smile", "block", "block", 5, 0, "SCG"),
      focus("wink", "perform", { fx: [foe("speed", -2, 3)] }),
      focus("pose", "perform", { fx: [foe("power", -3, 3)] }),
    ],
  },
  // 言葉とリズム。ビートに乗るほど連打が重く、フリースタイルは威力に幅がある。ディスで相手を崩す
  rapper: {
    aff: { standing: 1.24, clinch: 1.25, ground: 1.05 },
    grip: 3,
    build: stats(5, 4, 6, 5),
    moves: [
      strike("beat", "jab", 9, 1, "SC", undefined, { chain: { per: 4, max: 3, by: "same" } }),
      strike("freestyle", "hook", 16, 0, "SCG", undefined, { wild: true }),
      grab("katagumi", "clinch", 7, 2, "S", "C"),
      guard("rhythm", "dodge", "dodge", 4, 1, "SCG", "S"),
      guard("crossarm", "block", "block", 4, 0, "SCG"),
      focus("dis", "perform", { fx: [foe("guard", -2, 3), foe("speed", -2, 3)] }),
      focus("mic", "perform", { fx: [self("power", 3, 3)] }),
    ],
  },
  // 道具と下ごしらえ。フライパンと強火の一撃が重く、下ごしらえで次の攻撃を強くし、味見で少し回復する
  chef: {
    aff: { standing: 1.06, clinch: 1.1, ground: 0.9 },
    grip: 1.5,
    build: stats(6, 4, 5, 5),
    moves: [
      strike("sengiri", "jab", 7, 2, "SC"),
      strike("pan", "swing", 15, 0, "SCG"),
      strike("tsuyobi", "swing", 20, -2, "S"),
      grab("flip", "throw", 13, 0, "SC", "G"),
      guard("nabebuta", "block", "block", 4, 0, "SCG"),
      focus("shitagoshirae", "perform", { fx: [self("power", 4, 2)] }),
      focus("ajimi", "heal", { heal: 12, uses: 2 }),
    ],
  },
  // かたいが重い。打撃のダメージは少なく、組み技は多くくらう。ロケットパンチはどこからでも届き、再起動（1 回）で大きく回復する
  robot: {
    aff: { standing: 1.08, clinch: 0.92, ground: 0.8 },
    grip: 0,
    taken: { strike: 0.95, grab: 1.2 },
    build: stats(6, 7, 2, 5),
    moves: [
      strike("rocket", "projectile", 13, 1, "SCG"),
      strike("laser", "perform", 18, -2, "S"),
      grab("clamp", "clinch", 8, -1, "SC", "C"),
      grab("press", "submission", 14, -1, "G"),
      guard("armor", "block", "block", 4, 0, "SCG"),
      focus("reboot", "heal", { heal: 25, uses: 1 }),
    ],
  },
  // 速くて打たれ弱い。分身（2 回）は遅くても打撃を必ずかわし、煙玉（1 回）は組みもかわす。守って身を隠した次の忍び足が重い
  ninja: {
    aff: { standing: 1.08, clinch: 0.95, ground: 0.9 },
    grip: 1,
    build: stats(5, 3, 8, 4),
    moves: [
      strike("shuriken", "projectile", 8, 2, "SC"),
      strike("shuto", "hook", 13, 1, "SCG"),
      strike("shinobi", "kick_high", 14, 0, "S", undefined, { ambush: 6 }),
      grab("kumifuse", "throw", 11, 1, "SC", "G"),
      guard("mikiri", "dodge", "dodge", 4, 0, "SCG", "S"),
      guard("bunshin", "dodge", "dodge", 5, 1, "SC", "S", { sure: true, uses: 2 }),
      guard("kemuridama", "vanish", "vanish", 4, 1, "SCG", "S", { uses: 1 }),
    ],
  },
  // 突進が強い。体当たりは当て続けるほど重く、クラクションで相手をひるませる。ブロックがなく、守りに回ると多くくらう（止まると弱い）
  tuktuk: {
    aff: { standing: 1.25, clinch: 1.0, ground: 0.8 },
    grip: 1.5,
    taken: { guarding: 1.08 },
    build: stats(6, 5, 5, 4),
    moves: [
      strike("kyuhasshin", "jab", 9, 2, "SCG"),
      strike("taiatari", "push", 15, 0, "S", undefined, { chain: { per: 4, max: 2, by: "hit" } }),
      grab("tsukkomi", "takedown", 11, 1, "SC", "G"),
      guard("brake", "dodge", "dodge", 4, 2, "SCG", "S"),
      guard("handle", "counter", "catch", 5, 0, "SCG", "S"),
      focus("horn", "perform", { fx: [foe("speed", -3, 3)] }),
    ],
  },
  // 受け身がうまく、投げ・倒されたときのダメージが少ない。派手な飛び蹴りと、段取りで次の大技を強くする
  stuntman: {
    aff: { standing: 1.1, clinch: 0.95, ground: 0.95 },
    grip: 1,
    taken: { grab: 0.9 },
    build: stats(5, 4, 6, 5),
    moves: [
      strike("punch", "straight", 13, 1, "SCG"),
      strike("tobigeri", "kick_high", 17, -1, "S"),
      strike("senpu", "spin_kick", 21, -2, "S"),
      grab("dive", "takedown", 10, 0, "SC", "G"),
      guard("wire", "dodge", "dodge", 5, 3, "SCG", "S"),
      guard("ukemi", "counter", "catch", 6, 0, "SCG", "S"),
      focus("dandori", "perform", { fx: [self("power", 4, 2)] }),
    ],
  },
  // 残業で鍛えたスタミナ（疲れにくい）と、満員電車で鍛えた押し合い。名刺を飛ばし、カバンで受け、品よくお辞儀でかわす
  salaryman: {
    aff: { standing: 1.05, clinch: 1.12, ground: 1.0 },
    grip: 2,
    fatigue: 0.65,
    build: stats(5, 5, 4, 6),
    moves: [
      strike("meishi", "projectile", 9, 2, "SC"),
      strike("teiji", "straight", 12, 0, "SCG", undefined, { encore: true }),
      grab("mankin", "clinch", 7, 1, "S", "C"),
      grab("oshiai", "push", 15, 0, "C", "S"),
      guard("kaban", "block", "block", 5, 0, "SCG"),
      guard("ojigi", "dodge", "dodge", 4, 1, "SC", "S"),
      focus("nemawashi", "perform", { fx: [foe("guard", -3, 3)] }),
    ],
  },
  // タピオカ弾と太いストロー。氷多めが当たると相手が冷えて遅くなる。シェイカーを振って攻撃を上げ、ミルクティー（2 回）で一息つく
  bubbletea: {
    aff: { standing: 1.1, clinch: 1.0, ground: 0.95 },
    grip: 1,
    build: stats(5, 4, 6, 5),
    moves: [
      strike("tapioca", "projectile", 8, 2, "SC"),
      strike("straw", "swing", 14, 0, "SCG"),
      strike("koori", "projectile", 9, 1, "SC", undefined, { fx: [foe("speed", -2, 2)] }),
      grab("takeout", "throw", 12, 0, "SC", "G"),
      guard("tray", "block", "block", 4, 0, "SCG"),
      focus("milktea", "heal", { heal: 12, uses: 2 }),
      focus("shaker", "perform", { fx: [self("power", 3, 3)] }),
    ],
  },
  // 鍛えた体と防火服。打撃にも組み技にもかたく、疲れにくい。防火服の上からはほとんど通らない。放水で相手の足を止め、ひと息（2 回）で整える
  firefighter: {
    aff: { standing: 1.05, clinch: 1.08, ground: 1.0 },
    grip: 2,
    taken: { strike: 0.95, grab: 0.95 },
    fatigue: 0.9,
    build: stats(5, 5, 4, 6),
    moves: [
      strike("housui", "projectile", 9, 1, "SC", undefined, { fx: [foe("speed", -2, 2)] }),
      strike("kyujo", "push", 12, 0, "SCG", "S"),
      grab("carry", "throw", 15, -1, "SC", "G"),
      grab("hinan", "push", 13, 0, "C", "S"),
      guard("boukafuku", "block", "block", 4, 0, "SCG", undefined, { chip: 0.08 }),
      focus("hitoiki", "heal", { heal: 14, uses: 2 }),
    ],
  },
  // 音で場を動かす。スクラッチで相手を遅くし、フロアを沸かして攻撃を上げ、見せ技を決めた次のビートドロップが重い
  dj: {
    aff: { standing: 1.2, clinch: 1.05, ground: 0.9 },
    grip: 1,
    build: stats(5, 4, 6, 5),
    moves: [
      strike("fader", "jab", 8, 2, "SC"),
      strike("beatdrop", "straight", 14, 0, "SCG", undefined, { drop: 9 }),
      grab("hightouch", "jab", 9, 1, "SC"),
      guard("step", "dodge", "dodge", 4, 1, "SCG", "S"),
      guard("headphone", "block", "block", 4, 0, "SCG"),
      focus("scratch", "perform", { fx: [foe("speed", -3, 2)] }),
      focus("floor", "perform", { fx: [self("power", 3, 3)] }),
    ],
  },
  // こつこつ型。積み立ては重ねるほど防御が長く続いて大きくなり、空売りで相手の攻撃を下げ、配当（2 回）で回復する。
  // 電卓で守りのすきを計算して崩す（組みの仲間）
  investor: {
    aff: { standing: 1.15, clinch: 1.0, ground: 0.95 },
    grip: 1,
    build: stats(5, 4, 6, 5),
    moves: [
      strike("coin", "projectile", 12, 1, "SCG"),
      grab("dentaku", "swing", 12, 0, "SC"),
      guard("sonkiri", "dodge", "dodge", 4, 3, "SCG", "S"),
      focus("tsumitate", "perform", { fx: [self("guard", 2, 3, true)] }),
      focus("karauri", "perform", { fx: [foe("power", -3, 3)] }),
      focus("haitou", "heal", { heal: 12, uses: 2 }),
    ],
  },
  // 厚い着ぐるみで打撃に強いが、暑くて疲れやすい。しっぽの大振りと、のしかかり。ガオーで相手をひるませる
  dino: {
    aff: { standing: 1.0, clinch: 1.15, ground: 1.1 },
    grip: 2,
    taken: { strike: 0.92 },
    fatigue: 1.5,
    build: stats(6, 5, 3, 6),
    moves: [
      strike("shippo", "swing", 18, -2, "SC"),
      strike("pesh", "swing", 9, 1, "SCG"),
      grab("kapu", "clinch", 7, 0, "SC", "C"),
      grab("noshikakari", "takedown", 14, -1, "SCG", "G"),
      guard("mofu", "block", "block", 5, 0, "SCG"),
      focus("gao", "perform", { fx: [foe("power", -3, 3)] }),
    ],
  },
};

/** バックボーンの技を名前で引く。なければ null */
export function techniqueOf(style: StyleId, id: string): Technique | null {
  return STYLES[style]?.moves.find((m) => m.id === id) ?? null;
}

/** その位置で使える技（回数を使い切った技も含む） */
export function usableMoves(style: StyleId, position: Position): Technique[] {
  return STYLES[style].moves.filter((m) => m.where.includes(position));
}

/** seat がこれまでに id の技を出した回数。古い記録や、形の足りない記録も数えられるようにする */
export function timesUsed(history: readonly Exchange[], seat: Seat, id: string): number {
  return history.reduce((n, ex) => n + (ex?.acts?.[seat] === id ? 1 : 0), 0);
}

/** 技の残りの回数。回数に限りがなければ null */
export function usesLeft(tech: Technique, history: readonly Exchange[], seat: Seat): number | null {
  return tech.uses === undefined ? null : Math.max(0, tech.uses - timesUsed(history, seat, tech.id));
}

/** 今の位置で、まだ出せる技（回数を使い切った技は除く） */
export function availableMoves(style: StyleId, position: Position, history: readonly Exchange[], seat: Seat): Technique[] {
  return usableMoves(style, position).filter((m) => usesLeft(m, history, seat) !== 0);
}

/** 今続いている強化・弱体（直前の攻防のあとの分）。古い記録にはないので、なければなし */
export function activeEffects(history: readonly Exchange[]): Effect[] {
  return history.at(-1)?.fx ?? [];
}

/** 強化・弱体を足したパラメータ（1〜10 にとどめる） */
export function boostedStats(base: FighterStats, fx: readonly Effect[], seat: Seat): FighterStats {
  const out = { ...base };
  for (const e of fx) if (e.who === seat) out[e.stat] += e.amount;
  for (const k of STAT_KEYS) out[k] = Math.min(BOOSTED_MAX, Math.max(STAT_MIN, out[k]));
  return out;
}

/** 読みの形。相手の直前の技の種類ごとに、それに強い形になる（直前がなければブロック） */
const READ_FORMS: Record<MoveClass | "none", Pick<Technique, "cls" | "kind" | "power" | "quick"> & { guard?: GuardKind }> = {
  strike: { cls: "guard", guard: "counter", kind: "counter", power: 4, quick: 0 },
  grab: { cls: "strike", kind: "straight", power: 11, quick: 1 },
  guard: { cls: "grab", kind: "throw", power: 12, quick: 1 },
  none: { cls: "guard", guard: "block", kind: "block", power: 4, quick: 0 },
};

/** 記録の 1 人分（その人が出した技の結果）。古い記録には cls がないので、技の表から引く */
function classIn(ex: Exchange | undefined, fighters: readonly (Fighter | null)[], seat: Seat): MoveClass | null {
  if (!ex?.acts) return null;
  const s = ex.strikes?.find((x) => x.by === seat);
  if (s?.cls) return s.cls;
  const f = fighters[seat];
  return f ? (techniqueOf(f.style, ex.acts[seat])?.cls ?? null) : null;
}

/** 読みの技が今どの形になるか。相手の直前の技の種類（なければ none） */
export function readFormOf(history: readonly Exchange[], fighters: readonly (Fighter | null)[], seat: Seat): MoveClass | "none" {
  return classIn(history.at(-1), fighters, other(seat)) ?? "none";
}

/** 今の場面での技の形（読みは形を変える）。威力の上がり下がり（続けるほど強い など）は resolve で足す */
export function techniqueNow(
  fighters: readonly (Fighter | null)[],
  history: readonly Exchange[],
  seat: Seat,
  id: string,
): Technique | null {
  const f = fighters[seat];
  const base = f ? techniqueOf(f.style, id) : null;
  if (!base?.read) return base;
  const form = READ_FORMS[readFormOf(history, fighters, seat)];
  const { guard: _, ...rest } = base;
  return { ...rest, ...form };
}

/** 身を隠してからの技（忍び足）の、今の上乗せ。前の攻防で自分が守りの技を出していたら ambush、でなければ 0 */
export function ambushBonus(tech: Technique, history: readonly Exchange[], fighters: readonly (Fighter | null)[], seat: Seat): number {
  return tech.ambush && classIn(history.at(-1), fighters, seat) === "guard" ? tech.ambush : 0;
}

/** 見せ技の次の技（ビートドロップ）の、今の上乗せ。前の攻防で自分の見せ技（perform）が決まっていたら drop、でなければ 0 */
export function dropBonus(tech: Technique, history: readonly Exchange[], seat: Seat): number {
  if (!tech.drop) return 0;
  return history.at(-1)?.strikes?.some((x) => x.by === seat && x.kind === "perform" && x.result === "hit") ? tech.drop : 0;
}

/** 続けるほど強い技の、今の回数（前の攻防から数える） */
export function chainCount(tech: Technique, history: readonly Exchange[], seat: Seat): number {
  if (!tech.chain) return 0;
  let n = 0;
  for (let i = history.length - 1; i >= 0 && n < tech.chain.max; i--) {
    const ex = history[i];
    const ok =
      tech.chain.by === "same"
        ? ex?.acts?.[seat] === tech.id
        : !!ex?.strikes?.some((x) => x.by === seat && x.result === "hit" && x.damage > 0);
    if (!ok) break;
    n++;
  }
  return n;
}

/** 攻防で先に技を選ぶ人。キャラを後から作った後手から始めて、交互にする（後に選んだ人が、そのまま次を先に選ぶ） */
export const firstPicker = (exchange: number): Seat => (exchange % 2 === 0 ? 1 : 0);

export type StrikeResult = "hit" | "blocked" | "dodged" | "countered" | "whiff";

/**
 * 1 回の攻防のうち、1 人の技とその結果。
 * 打撃・組み：hit = 当たった・決まった、blocked = ブロックされた（少しだけ当たる）、dodged = かわされた、
 * countered = 止められた・返された、whiff = 出せなかった（先に倒れた）。
 * 守り：hit = 受け・かわし・返し・ためが決まった（damage は返したダメージ）、whiff = 何もできなかった（相手も守った・組まれた・間に合わなかった）
 */
export interface Strike {
  by: Seat;
  /** 技の名前 */
  act: string;
  kind: ActionKind;
  /** 出したときの技の種類（読みは形を変えるので記録する）。古い記録にはない */
  cls?: MoveClass;
  result: StrikeResult;
  /** 相手に与えたダメージ */
  damage: number;
  /** 回復した体力。なければ 0 */
  heal?: number;
  /** この技で付いた・移った強化と弱体（amount が正なら強化）。なければなし */
  effects?: { who: Seat; stat: StatKey; amount: number }[];
}

/** 1 回の攻防の結果。2 人に見せる */
export interface Exchange {
  /** [先手の技, 後手の技] */
  acts: [string, string];
  /** 攻防の前の位置 */
  from: Position;
  /** 攻防のあとの位置 */
  position: Position;
  /** 2 人の技を、起きた順に（打ち合いは速い方から、受け・返しは仕掛けた方から） */
  strikes: Strike[];
  /** 攻防のあとの体力 */
  hp: [number, number];
  /** この攻防で倒れた人。いなければ null */
  ko: Seat | null;
  /** 組み合い・寝技で 2 人とも守り、離れて立ちに戻った */
  brk: boolean;
  /** この攻防のあとに続いている強化・弱体。古い記録にはないので、なければなし */
  fx?: Effect[];
}

export type FightMove = { type: "build"; style: StyleId; stats: FighterStats } | { type: "act"; act: string };

export interface FightState {
  /** 2 人のキャラ。まだなら null。先に決めた人のキャラは、相手が決めるまで伏せる */
  fighters: [Fighter | null, Fighter | null];
  hp: [number, number];
  position: Position;
  /** 今の攻防で選んだ技。まだなら null。先に選んだ人の技は相手に見せない */
  picks: [string | null, string | null];
  /** 終わった攻防。今の攻防は history.length 回目（0 から数える）。強化・弱体と技の回数も記録から求める */
  history: Exchange[];
  /** 攻防ごとの運（[打ち合い 2 人分, 組み合い 2 人分, ダメージのゆらぎ 2 人分]）。だれにも見せない */
  luck: number[][];
}

/** 画面に渡す形。伏せたキャラ・技は null（技は「選んだか」の true / false）。運の列は渡さない */
export interface FightView {
  phase: "build" | "fight" | "over";
  fighters: [Fighter | null, Fighter | null];
  /** キャラを決めたか（伏せていても分かる） */
  built: [boolean, boolean];
  hp: [number, number];
  position: Position;
  /** 自分の技は名前、相手の技は選んだかどうか。観戦者は 2 人とも true / false */
  picks: [string | boolean | null, string | boolean | null];
  turn: Seat;
  /** 今の攻防（0 から数える）。終局後は終わった攻防の数 */
  exchange: number;
  history: Exchange[];
  /** 今続いている強化・弱体 */
  fx: Effect[];
}

/* ---------- 数の決まり ---------- */

/** ダメージ全体の倍率（技の威力 × これ が、ふつうのキャラどうしで当たったときのダメージ） */
const DAMAGE = 1.6;
/** 攻撃 1 ごとに与えるダメージが何割増えるか（5 が 1 倍） */
const POWER_STEP = 0.05;
/** 防御 1 ごとに打撃から受けるダメージが何割減るか（5 が 1 倍）。組み技にはこの半分 */
const GUARD_STEP = 0.06;
/** すばやさ 1 ごとに打撃から受けるダメージが何割減るか（芯を外す。5 が 1 倍）。組み技には効かない */
const EVADE_STEP = 0.03;
/** 攻防 1 回ごとの疲れ。スタミナ 1 ごとに FATIGUE_STEP だけ疲れにくくなる */
const FATIGUE_BASE = 0.065;
const FATIGUE_STEP = 0.007;
/** 疲れると受けるダメージも増える（疲れの何割か） */
const TIRED_TAKEN = 0.5;
/** 打ち合いで、後から当たる打撃の倍率 */
const TRADE = 0.7;
/** 組みに来たところに当たる打撃の倍率 */
const INTERRUPT = 0.8;
/** ブロックの上から当たる分 */
const CHIP = 0.2;
/** かわしそこねたときに当たる分 */
const DODGE_MISS = 0.6;
/** ためている間に打撃をくらう分（受けないぶん、ブロックより多い） */
const FOCUS_TAKEN = 0.4;
/** 受け・かわし・返しが決まったとき、相手の技の威力の何割を上乗せして返すか（相手の勢いを使うので、大技ほど返されると痛い） */
const RIPOSTE: Record<Exclude<GuardKind, "vanish">, number> = { block: 0.4, dodge: 0.3, counter: 0.8, catch: 0.5, focus: 0 };
/** 組み技をくらうときの、守りの種類ごとの倍率（カウンターで待っていると大きくくらう） */
const OPEN: Record<"block" | "dodge" | "counter" | "focus", number> = { block: 1.25, dodge: 1.35, counter: 1.6, focus: 1.1 };
/** 組み合いで競り勝った組み技の倍率 */
const SCRAMBLE = 0.8;
/** 組み合いの強さに、位置の得意さをどれだけ効かせるか */
const GRIP_AFF = 4;
/** 運の大きさ（打ち合いの速さ、組み合いの強さ、ダメージのゆらぎ） */
const SPEED_LUCK = 2.5;
const GRIP_LUCK = 2;
const WOBBLE = 0.08;
/** 威力に幅のある技（フリースタイル）の倍率の幅 */
const WILD_MIN = 0.4;
const WILD_RANGE = 1.2;
/** 体力が少ないほど強い技（アンコール）の、体力 0 のときの上乗せ */
const ENCORE = 1;
/** 重ねると大きくなる強化（積み立て）の、大きさと残りの上限 */
const STACK_MAX = 4;
const STACK_TURNS = 5;
/** 1 回の攻防で使う運の数 */
const LUCK_PER_EXCHANGE = 6;

/** スタミナと攻防の回数から、疲れの残り（1 = 元気） */
export const freshness = (stamina: number, exchange: number) =>
  Math.max(0.3, 1 - exchange * (FATIGUE_BASE - FATIGUE_STEP * stamina));

const powerMul = (power: number) => 1 + (power - 5) * POWER_STEP;
/** 受けるダメージの倍率。fresh は受ける人の疲れの残り */
const takenMul = (def: FighterStats, fresh: number, isGrab: boolean) =>
  (1 - (def.guard - 5) * GUARD_STEP * (isGrab ? 0.5 : 1)) *
  (isGrab ? 1 : 1 - (def.speed - 5) * EVADE_STEP) *
  (1 + TIRED_TAKEN * (1 - fresh));

/**
 * 強化・弱体を 1 つ足す。同じ人・同じパラメータ・同じ向きは重ねず、大きい方・長い方にそろえる
 * （逆向きどうしは別々に続き、足し合わせて効く）。
 * stack なら（積み立て）、続いているうちに重ねると 1 ずつ大きくなり（STACK_MAX まで）、残りも足し合わせて延びる（STACK_TURNS まで）
 */
export function addEffect(list: Effect[], e: Effect, stack = false): Effect[] {
  const i = list.findIndex((x) => x.who === e.who && x.stat === e.stat && Math.sign(x.amount) === Math.sign(e.amount));
  if (i < 0) return [...list, e];
  const old = list[i]!;
  const sign = Math.sign(e.amount);
  const [amount, left] = stack
    ? [sign * Math.min(STACK_MAX, Math.max(Math.abs(old.amount) + 1, Math.abs(e.amount))), Math.min(STACK_TURNS, old.left + e.left)]
    : [sign * Math.max(Math.abs(old.amount), Math.abs(e.amount)), Math.max(old.left, e.left)];
  return list.map((x, j) => (j === i ? { ...x, amount, left } : x));
}

/** 1 回の攻防を決めるのに要るもの */
export interface Bout {
  fighters: [Fighter, Fighter];
  hp: [number, number];
  position: Position;
  /** 何回目の攻防か（0 から数える）。疲れに効く */
  exchange: number;
  /** これまでの攻防（強化・弱体、読み、続けるほど強い技に使う）。省くとなし */
  history?: readonly Exchange[];
}

/** 運のない攻防（コンピュータの見積もりに使う） */
export const NO_LUCK: readonly number[] = Array(LUCK_PER_EXCHANGE).fill(0.5);

/**
 * 2 人の技から 1 回の攻防の結果を出す。acts は [先手の技, 後手の技]（今の位置で使える技であること）。
 * tie は速さ・組み合いがまったく同じときに先になる人
 */
export function resolve(b: Bout, acts: [string, string], luck: readonly number[], tie: Seat): Exchange {
  const history = b.history ?? [];
  const fxBefore = activeEffects(history);
  // 強化・弱体を足したパラメータで戦う
  const fighters = ([0, 1] as const).map((s) => ({
    style: b.fighters[s].style,
    stats: boostedStats(b.fighters[s].stats, fxBefore, s),
  })) as [Fighter, Fighter];
  /** 今の場面での技。読みは形を変え、続けるほど強い技・身を隠した次の技・見せ技の次の技・威力に幅のある技・アンコールは威力を変える */
  const prepare = (s: Seat): Technique => {
    const t = techniqueNow(b.fighters, history, s, acts[s])!;
    let power =
      t.power +
      (t.chain ? t.chain.per * chainCount(t, history, s) : 0) +
      ambushBonus(t, history, b.fighters, s) +
      dropBonus(t, history, s);
    if (t.wild) power *= WILD_MIN + WILD_RANGE * luck[4 + s]!;
    if (t.encore) power *= 1 + ENCORE * (1 - b.hp[s] / MAX_HP);
    return power === t.power ? t : { ...t, power };
  };
  const techs = [prepare(0), prepare(1)] as const;
  const pos = b.position;
  const t = b.exchange;
  const hp: [number, number] = [...b.hp];
  const strikes: Strike[] = [];
  /** 技が決まったか（回復・強化・弱体はそのときだけ付く） */
  const ok: [boolean, boolean] = [false, false];
  let ko: Seat | null = null;
  let moved: Position | null = null;

  // 疲れにくいバックボーン（サラリーマン・消防士）は攻防の回数を少なく、疲れやすいバックボーン（恐竜の着ぐるみ）は多く数える
  const fresh = (s: Seat) => freshness(fighters[s].stats.stamina, t * (STYLES[fighters[s].style].fatigue ?? 1));
  const speedOf = (s: Seat) => fighters[s].stats.speed * fresh(s) + techs[s].quick + SPEED_LUCK * (luck[s]! - 0.5);
  const gripOf = (s: Seat) => {
    const f = fighters[s];
    const style = STYLES[f.style];
    return (
      ((f.stats.power + f.stats.stamina) / 2) * fresh(s) +
      style.grip +
      GRIP_AFF * (style.aff[pos] - 1) +
      techs[s].quick +
      GRIP_LUCK * (luck[2 + s]! - 0.5)
    );
  };
  /** by が power の技を当てたときのダメージ */
  const damageOf = (by: Seat, power: number, mul: number, isGrab: boolean) => {
    const att = fighters[by];
    const def = fighters[other(by)];
    const taken = STYLES[def.style].taken;
    const raw =
      power *
      DAMAGE * powerMul(att.stats.power) *
      STYLES[att.style].aff[pos] *
      fresh(by) *
      takenMul(def.stats, fresh(other(by)), isGrab) *
      (taken?.[isGrab ? "grab" : "strike"] ?? 1) *
      (techs[other(by)].cls === "guard" ? (taken?.guarding ?? 1) : 1) *
      mul *
      (1 + WOBBLE * (2 * luck[4 + by]! - 1));
    return Math.max(1, Math.round(raw));
  };
  /** 結果を記録して、ダメージを与える。もう倒れた人がいれば何も起きない。当たったら true */
  const record = (by: Seat, result: StrikeResult, damage = 0): boolean => {
    const tech = techs[by];
    if (ko !== null) {
      strikes.push({ by, act: acts[by], kind: tech.kind, cls: tech.cls, result: "whiff", damage: 0 });
      return false;
    }
    const target = other(by);
    const dealt = Math.min(damage, hp[target]);
    hp[target] -= dealt;
    if (hp[target] <= 0) ko = target;
    strikes.push({ by, act: acts[by], kind: tech.kind, cls: tech.cls, result, damage: dealt });
    if (result === "hit") ok[by] = true;
    return result === "hit" || result === "blocked";
  };
  /** 技が決まった。位置が変わる技なら、その位置へ（先に決まった方を優先） */
  const land = (by: Seat, mul: number) => {
    const tech = techs[by];
    if (record(by, "hit", damageOf(by, tech.power, mul, tech.cls === "grab")) && tech.to && moved === null) moved = tech.to;
  };
  /** by の守りが、相手の技 against を受けて返した。相手の勢いの分だけ上乗せする */
  const answer = (by: Seat, against: Technique, isGrab: boolean) => {
    const tech = techs[by];
    const power = tech.power + RIPOSTE[tech.guard as keyof typeof RIPOSTE] * against.power;
    if (record(by, "hit", damageOf(by, power, 1, isGrab)) && tech.to && moved === null) moved = tech.to;
  };
  /** ためが決まった（ダメージはない） */
  const charge = (by: Seat) => record(by, "hit", 0);
  /**
   * by が消えて、相手の技をかわした（返しはなく、離れて立ちに戻る）。舞台が 1 回の「消えてかわした」動きとして見せるよう、
   * かわされた相手の技のすぐあとに、消えた人の技を並べる
   */
  const vanish = (by: Seat) => {
    record(other(by), "dodged");
    if (record(by, "hit", 0) && techs[by].to && moved === null) moved = techs[by].to!;
  };
  const faster = (a: number, b2: number, first: Seat): Seat => (a > b2 ? 0 : b2 > a ? 1 : first);

  const [c0, c1] = [techs[0].cls, techs[1].cls];
  if (c0 === "strike" && c1 === "strike") {
    // 打ち合い：速い方が先に当てる。遅い方は弱まる（先に倒れたら出せない）
    const first = faster(speedOf(0), speedOf(1), tie);
    land(first, 1);
    land(other(first), TRADE);
  } else if (c0 === "grab" && c1 === "grab") {
    // 組み合い：強い方だけが決まる
    const win = faster(gripOf(0), gripOf(1), tie);
    record(other(win), "countered");
    land(win, SCRAMBLE);
  } else if (c0 === "guard" && c1 === "guard") {
    // 守りどうし：何も起きない（ためは決まる）
    for (const s of [tie, other(tie)]) {
      if (techs[s].guard === "focus") charge(s);
      else record(s, "whiff");
    }
  } else {
    // 種類が違う：仕掛けた方（打撃、なければ組み）と受ける方
    const att: Seat = c0 === "strike" || (c0 === "grab" && c1 === "guard") ? 0 : 1;
    const def = other(att);
    const a = techs[att];
    const d = techs[def];
    if (a.cls === "strike" && d.cls === "grab") {
      // 組みに来たところに打撃が当たる
      record(def, "countered");
      land(att, INTERRUPT);
    } else if (a.cls === "strike") {
      switch (d.guard!) {
        case "block":
          record(att, "blocked", damageOf(att, a.power, d.chip ?? CHIP, false));
          answer(def, a, false);
          break;
        case "dodge":
          // 分身は、すばやさに関係なくかわす
          if (d.sure || speedOf(def) >= speedOf(att)) {
            record(att, "dodged");
            answer(def, a, false);
          } else {
            land(att, DODGE_MISS);
            record(def, "whiff");
          }
          break;
        case "counter":
          record(att, "countered");
          answer(def, a, false);
          break;
        case "catch":
          land(att, 1);
          record(def, "whiff");
          break;
        case "focus":
          // 打撃を半分くらいながら、ためは決まる
          land(att, FOCUS_TAKEN);
          charge(def);
          break;
        case "vanish":
          vanish(def);
          break;
      }
    } else if (d.guard === "catch") {
      // 組み技を返す
      record(att, "countered");
      answer(def, a, true);
    } else if (d.guard === "vanish") {
      // 消えて、組み技もかわす
      vanish(def);
    } else {
      // 守っているところを組む（ためは決まらない）
      land(att, OPEN[d.guard as keyof typeof OPEN]);
      record(def, "whiff");
    }
  }

  // 回復と強化・弱体：決まった技の分だけ。倒れた人はもう何もできない
  let fx = fxBefore.map((e) => ({ ...e, left: e.left - 1 })).filter((e) => e.left > 0);
  if (ko === null) {
    for (const x of strikes) {
      const s = x.by;
      const tech = techs[s];
      if (!ok[s] || x.result !== "hit") continue;
      if (tech.heal) {
        const healed = Math.min(tech.heal, MAX_HP - hp[s]);
        hp[s] += healed;
        if (healed > 0) x.heal = healed;
      }
      const changed: NonNullable<Strike["effects"]> = [];
      if (tech.swap) {
        // 相手の強化と、自分の弱体を入れ替える
        const moving = fx.filter((e) => (e.who === other(s) && e.amount > 0) || (e.who === s && e.amount < 0));
        fx = fx.filter((e) => !moving.includes(e));
        for (const e of moving) {
          const who = other(e.who);
          fx = addEffect(fx, { ...e, who });
          changed.push({ who, stat: e.stat, amount: e.amount });
        }
      }
      for (const spec of tech.fx ?? []) {
        const who = spec.to === "self" ? s : other(s);
        fx = addEffect(fx, { who, stat: spec.stat, amount: spec.amount, left: spec.turns }, spec.stack);
        // 重ねて大きくなる強化は、重ねたあとの大きさを記録する
        const now = spec.stack ? fx.find((e) => e.who === who && e.stat === spec.stat && Math.sign(e.amount) === Math.sign(spec.amount)) : undefined;
        changed.push({ who, stat: spec.stat, amount: now?.amount ?? spec.amount });
      }
      if (changed.length > 0) x.effects = changed;
    }
  }

  // 組み合い・寝技で 2 人とも守れば、離れて立ちに戻る（ブレイク）
  const brk = c0 === "guard" && c1 === "guard" && pos !== "standing";
  const position: Position = moved ?? (brk ? "standing" : pos);
  return { acts, from: pos, position, strikes, hp, ko, brk, fx };
}

/* ---------- ルール ---------- */

const isStyle = (x: unknown): x is StyleId => STYLE_IDS.includes(x as StyleId);
const isStats = (s: FighterStats) =>
  STAT_KEYS.every((k) => Number.isInteger(s[k]) && s[k] >= STAT_MIN && s[k] <= STAT_MAX) &&
  STAT_KEYS.reduce((a, k) => a + s[k], 0) === STAT_TOTAL;

const bothBuilt = (s: FightState) => s.fighters[0] !== null && s.fighters[1] !== null;

function turnOf(s: FightState): Seat {
  if (s.fighters[0] === null) return 0;
  if (s.fighters[1] === null) return 1;
  const first = firstPicker(s.history.length);
  return s.picks[first] === null ? first : other(first);
}

function isOver(s: FightState): boolean {
  return s.history.at(-1)?.ko != null || s.history.length >= EXCHANGES;
}

/* ---------- コンピュータ ---------- */

/** コンピュータがおすすめの振り分けから何回ポイントを動かすか（ばらつき） */
const BOT_BUILD_SHUFFLE = 3;
/** 得意な位置に持ち込む値打ち（得意さの差 1 あたり、ダメージ何点ぶんか） */
const BOT_POSITION = 18;
/** KO できる・KO される見込み（最後の攻防では、判定で勝つ・負ける見込み）の重み */
const BOT_KO = 25;
/** 強化・弱体 1 ポイントが 1 攻防あたりダメージ何点ぶんか */
const BOT_FX: Record<StatKey, number> = { power: 0.6, guard: 0.6, speed: 0.7, stamina: 0.3 };
/** 見せ技を決めて、次の攻防の技（ビートドロップ）を重くしておく値打ち（上乗せの威力 1 あたり、ダメージ何点ぶんか） */
const BOT_DROP = 0.6;
/** 回数に限りのある技を使う重み（残りの攻防が多いほど、体力に余裕があるほど、取っておく値打ちがある） */
const BOT_SAVE = 6;
/** 1 回の攻防の読み合いを解くくり返しの数 */
const BOT_ITERATIONS = 200;
/** 相手の傾向を読む強さ。相手の記録 1 回あたり、つり合いの手からどれだけ寄せるか（上限 BOT_READ_MAX） */
const BOT_READ_STEP = 0.08;
const BOT_READ_MAX = 0.35;
/** 相手の傾向に合わせて選ぶとき、良さそうな技にどれだけ寄せるか（ダメージの差で見る。小さいほど一番良い技に寄る） */
const BOT_TEMPERATURE = 5;

/** コンピュータのキャラの振り分け。バックボーンのおすすめから、少しだけポイントを動かす */
export function botBuild(style: StyleId, rng: Rng): FighterStats {
  const s = { ...STYLES[style].build };
  for (let i = 0; i < BOT_BUILD_SHUFFLE; i++) {
    const from = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)]!;
    const to = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)]!;
    if (from !== to && s[from] > STAT_MIN && s[to] < STAT_MAX) {
      s[from]--;
      s[to]++;
    }
  }
  return s;
}

const normalize = (w: number[]) => {
  const total = w.reduce((a, x) => a + x, 0);
  return total > 0 ? w.map((x) => x / total) : w.map(() => 1 / w.length);
};

/**
 * 2 人で同時に選ぶ 1 回の読み合い（payoff[i][j] = 自分が i、相手が j を出したときの自分の得）の、
 * つり合いの選び方（どちらも読まれても損をしない割合）を、後悔の大きさで割合を決めるやり方（regret matching+）で近づける。
 * 返すのは [自分の割合, 相手の割合]
 */
export function equilibrium(payoff: number[][], iterations = BOT_ITERATIONS): [number[], number[]] {
  const n = payoff.length;
  const m = payoff[0]!.length;
  const rx = new Float64Array(n);
  const ry = new Float64Array(m);
  const sx = new Float64Array(n);
  const sy = new Float64Array(m);
  const x = new Float64Array(n);
  const y = new Float64Array(m);
  const ux = new Float64Array(n);
  const uy = new Float64Array(m);
  /** 後悔の正の部分に比例した割合（後悔がなければ等しく） */
  const fill = (r: Float64Array, out: Float64Array) => {
    let total = 0;
    for (let i = 0; i < r.length; i++) total += r[i]!;
    for (let i = 0; i < r.length; i++) out[i] = total > 0 ? r[i]! / total : 1 / r.length;
  };
  for (let it = 1; it <= iterations; it++) {
    fill(rx, x);
    fill(ry, y);
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < n; i++) {
      let u = 0;
      for (let j = 0; j < m; j++) u += payoff[i]![j]! * y[j]!;
      ux[i] = u;
      vx += u * x[i]!;
    }
    for (let j = 0; j < m; j++) {
      let u = 0;
      for (let i = 0; i < n; i++) u -= payoff[i]![j]! * x[i]!;
      uy[j] = u;
      vy += u * y[j]!;
    }
    // 後のくり返しほど重く数える（早く落ち着く）
    for (let i = 0; i < n; i++) {
      rx[i] = Math.max(0, rx[i]! + ux[i]! - vx);
      sx[i] = sx[i]! + x[i]! * it;
    }
    for (let j = 0; j < m; j++) {
      ry[j] = Math.max(0, ry[j]! + uy[j]! - vy);
      sy[j] = sy[j]! + y[j]! * it;
    }
  }
  return [normalize([...sx]), normalize([...sy])];
}

/**
 * 技を選ぶ。まず 1 回の攻防を「2 人が同時に選ぶ読み合い」とみて、自分の得（与えたダメージ − 受けたダメージ ＋ 回復
 * ＋ 得意な位置に持ち込めたか ＋ 強化・弱体 ＋ KO）を全部の組み合わせで出し、つり合いの割合を求める。
 * 回数に限りのある技（回復・消える）は、残りの攻防が多いほど取っておく。次の攻防の技を重くする見せ技（DJ）は、その分も見込む。
 * そのうえで、相手がこれまでに出した技の種類（同じ位置での記録）に合わせて、勝ちやすい技へ少し寄せる
 */
function botPick(v: FightView, seat: Seat, rng: Rng): string {
  const opp = other(seat);
  const fighters = v.fighters as [Fighter, Fighter];
  const history = v.history;
  const bout: Bout = { fighters, hp: v.hp, position: v.position, exchange: v.exchange, history };
  const aff = (s: Seat, pos: Position) => STYLES[fighters[s].style].aff[pos];
  const edge = (pos: Position) => aff(seat, pos) - aff(opp, pos);
  // 残りの攻防が少ないほど、位置の値打ちは小さい
  const left = Math.min(1, (EXCHANGES - 1 - v.exchange) / 3);
  const after = EXCHANGES - 1 - v.exchange;
  const lastOne = v.exchange === EXCHANGES - 1;
  const lead = (hp: [number, number]) => Math.sign(hp[seat] - hp[opp]);
  /** 強化・弱体の値打ち（自分に得なら正） */
  const fxWorth = (fx: readonly Effect[] = []) =>
    fx.reduce((a, e) => a + (e.who === seat ? 1 : -1) * e.amount * Math.min(e.left, after) * BOT_FX[e.stat], 0);
  /** 回数に限りのある技を使う重み */
  const save = (tech: Technique, s: Seat) =>
    tech.uses === undefined ? 0 : (BOT_SAVE * after * v.hp[s]) / ((EXCHANGES - 1) * MAX_HP);
  /** s の見せ技が決まり、次の攻防で重くなる技（ビートドロップ）を出せるなら、その上乗せの値打ち */
  const dropNext = (s: Seat, ex: Exchange) =>
    after > 0 && ex.strikes.some((x) => x.by === s && x.kind === "perform" && x.result === "hit")
      ? BOT_DROP * Math.max(0, ...usableMoves(fighters[s].style, ex.position).map((m) => m.drop ?? 0))
      : 0;
  const mine = availableMoves(fighters[seat].style, v.position, history, seat);
  const theirs = availableMoves(fighters[opp].style, v.position, history, opp);

  const payoff = mine.map((m) =>
    theirs.map((o) => {
      const acts: [string, string] = seat === 0 ? [m.id, o.id] : [o.id, m.id];
      const ex = resolve(bout, acts, NO_LUCK, firstPicker(v.exchange));
      const dealt = v.hp[opp] - ex.hp[opp];
      const lost = v.hp[seat] - ex.hp[seat];
      let value =
        dealt -
        lost +
        BOT_POSITION * left * (edge(ex.position) - edge(v.position)) +
        fxWorth(ex.fx) +
        dropNext(seat, ex) -
        dropNext(opp, ex) -
        save(m, seat) +
        save(o, opp);
      if (ex.ko === opp) value += BOT_KO;
      else if (ex.ko === seat) value -= BOT_KO;
      else if (lastOne) value += BOT_KO * (lead(ex.hp) - lead(v.hp));
      return value;
    }),
  );
  const [plan, theirPlan] = equilibrium(payoff);

  // 相手の傾向：この位置で相手が出した技の種類を数え、つり合いの見込みに足す
  const counts: Record<MoveClass, number> = { strike: 0, grab: 0, guard: 0 };
  let seen = 0;
  for (const ex of history) {
    if (ex?.from !== v.position) continue;
    const cls = classIn(ex, fighters, opp);
    if (cls) {
      counts[cls]++;
      seen++;
    }
  }
  let choice = plan;
  if (seen > 0) {
    const formOf = (o: Technique) => techniqueNow(fighters, history, opp, o.id)!.cls;
    const perClass = (cls: MoveClass) => theirs.filter((o) => formOf(o) === cls).length;
    const habit = normalize(theirs.map((o) => counts[formOf(o)] / perClass(formOf(o))));
    const guess = theirPlan.map((p, j) => (p + habit[j]!) / 2);
    const worth = payoff.map((row) => row.reduce((a, x, j) => a + x * guess[j]!, 0));
    const best = Math.max(...worth);
    const exploit = normalize(worth.map((w) => Math.exp((w - best) / BOT_TEMPERATURE)));
    const read = Math.min(BOT_READ_MAX, seen * BOT_READ_STEP);
    choice = plan.map((p, i) => (1 - read) * p + read * exploit[i]!);
  }

  let r = rng();
  for (let i = 0; i < mine.length; i++) {
    r -= choice[i]!;
    if (r < 0) return mine[i]!.id;
  }
  return mine.at(-1)!.id;
}

export const fight: GameDefinition<FightState, FightMove> = {
  id: "fight",

  initialState(rng) {
    return {
      fighters: [null, null],
      hp: [MAX_HP, MAX_HP],
      position: "standing",
      picks: [null, null],
      history: [],
      luck: Array.from({ length: EXCHANGES }, () => Array.from({ length: LUCK_PER_EXCHANGE }, () => Math.round(rng() * 1000) / 1000)),
    };
  },

  status(state): GameStatus {
    const ko = state.history.at(-1)?.ko;
    if (ko != null) return { kind: "finished", winner: other(ko) };
    if (state.history.length >= EXCHANGES) {
      const [a, b] = state.hp;
      return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
    }
    return { kind: "playing", turn: turnOf(state) };
  },

  applyMove(state, move, seat) {
    if (isOver(state)) throw new IllegalMoveError("game_over");
    if (seat !== turnOf(state)) throw new IllegalMoveError("not_your_turn");

    if (move.type === "build") {
      if (state.fighters[seat] !== null) throw new IllegalMoveError("fight_already_built");
      if (!isStyle(move.style)) throw new IllegalMoveError("fight_bad_style");
      if (!isStats(move.stats)) throw new IllegalMoveError("fight_bad_stats");
      const fighters: FightState["fighters"] = [...state.fighters];
      fighters[seat] = { style: move.style, stats: { ...move.stats } };
      return { ...state, fighters };
    }

    if (!bothBuilt(state)) throw new IllegalMoveError("fight_build_first");
    const me = state.fighters[seat]!;
    const tech = techniqueOf(me.style, move.act);
    if (!tech) throw new IllegalMoveError("fight_no_such_move");
    if (!tech.where.includes(state.position)) throw new IllegalMoveError("fight_not_here");
    if (usesLeft(tech, state.history, seat) === 0) throw new IllegalMoveError("fight_used_up");
    const picks: FightState["picks"] = [...state.picks];
    picks[seat] = tech.id;
    if (picks[0] === null || picks[1] === null) return { ...state, picks };

    // 2 人そろったので見せ合う
    const n = state.history.length;
    const ex = resolve(
      {
        fighters: state.fighters as [Fighter, Fighter],
        hp: state.hp,
        position: state.position,
        exchange: n,
        history: state.history,
      },
      [picks[0], picks[1]],
      state.luck[n] ?? NO_LUCK,
      firstPicker(n),
    );
    return { ...state, hp: ex.hp, position: ex.position, picks: [null, null], history: [...state.history, ex] };
  },

  parseMove(raw) {
    const m = raw as { type?: unknown; act?: unknown; style?: unknown; stats?: unknown } | null;
    if (m?.type === "act") return typeof m.act === "string" ? { type: "act", act: m.act } : null;
    if (m?.type !== "build" || typeof m.style !== "string") return null;
    const s = m.stats as Record<string, unknown> | null;
    if (typeof s !== "object" || s === null || !STAT_KEYS.every((k) => typeof s[k] === "number")) return null;
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, s[k] as number])) as FighterStats;
    return { type: "build", style: m.style as StyleId, stats };
  },

  viewState(state, viewer, revealAll): FightView {
    const both = bothBuilt(state);
    const fighter = (s: Seat) => (revealAll || both || s === viewer ? state.fighters[s] : null);
    const pick = (s: Seat) => (revealAll || s === viewer ? state.picks[s] : state.picks[s] !== null);
    return {
      phase: isOver(state) ? "over" : both ? "fight" : "build",
      fighters: [fighter(0), fighter(1)],
      built: [state.fighters[0] !== null, state.fighters[1] !== null],
      hp: state.hp,
      position: state.position,
      picks: [pick(0), pick(1)],
      turn: turnOf(state),
      exchange: state.history.length,
      history: state.history,
      fx: activeEffects(state.history),
    };
  },

  viewMove(move, mover, viewer) {
    // キャラも技も、そろったら状態（fighters・history）で公開される。手の記録では相手の分は伏せる
    return mover === viewer ? move : { type: move.type };
  },

  botMove(view, seat, rng) {
    const v = view as FightView;
    if (v.phase === "over" || v.turn !== seat) return null;
    if (!v.built[seat]) {
      const style = STYLE_IDS[Math.floor(rng() * STYLE_IDS.length)]!;
      return { type: "build", style, stats: botBuild(style, rng) };
    }
    if (v.picks[seat] !== null && v.picks[seat] !== false) return null;
    return { type: "act", act: botPick(v, seat, rng) };
  },
};
