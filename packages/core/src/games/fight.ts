import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * バックボーン・ファイト：2 人が格闘技（バックボーン）を 1 つ選び、攻撃・防御・すばやさ・スタミナに
 * 合計 20 ポイント（それぞれ 1〜8）を振り分けてキャラを作る。先に決めた人のキャラは、相手が決めるまで伏せる。
 * そのあとは攻防のくり返し。毎回 2 人がこっそり技を 1 つ選び（先に選んだ人の技は伏せる）、そろったら同時に出す。
 *
 * 技は「打撃」「組み」「守り」の 3 種類で、じゃんけんのように回っている。
 * - 打撃は組みに強い（組みに来たところに当たる）。守りには受けられる
 * - 組みは守りに強い（守って止まっている相手をつかまえる）。打撃には止められる
 * - 守りは打撃に強い（受けて返す）。組みにはつかまる
 * 守りには、ブロック（受けて小さく返す）・かわす（すばやさが相手以上なら無傷）・カウンター（大きく返すが組みにとても弱い）
 * ・返し（組み技を返すが、打撃はまともにくらう）がある。
 * 打撃どうしは打ち合いで、速い方が先に当てる。組みどうしは組み合いで、力の強い方だけが決まる。守りどうしは何も起きない。
 *
 * 位置関係（立ち・組み合い・寝技）は 2 人で 1 つ。組み技で組み合い・寝技になり、押し離す技・かわし・
 * 組み合いや寝技で 2 人とも守ったとき（ブレイク）に立ちに戻る。位置で使える技と、バックボーンの得意さが変わる
 * （打撃系は立ちで強く、柔術・レスリングは寝技で強い）。
 *
 * パラメータは、攻撃が与えるダメージ、防御が受けるダメージ（組み技には半分だけ効く）、すばやさが打ち合いで先に当てる・
 * かわす・打撃をもらいにくい、スタミナが後半の疲れにくさと組みどうしの粘りに効く。どれに振っても 1 ポイントの値打ちが
 * だいたい同じになるようにしてある。
 *
 * 体力 100 を 0 にすれば KO 勝ち。8 回の攻防で決まらなければ体力の多い方の判定勝ち、同じなら引き分け。
 * 運（打ち合い・組み合いの競り、ダメージの小さなゆらぎ）は initialState で先に作っておく
 */

export const STYLE_IDS = [
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
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const STAT_KEYS = ["power", "guard", "speed", "stamina"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** 攻撃・防御・すばやさ・スタミナ（それぞれ 1〜8、合計 20） */
export type FighterStats = Record<StatKey, number>;
export const STAT_MIN = 1;
export const STAT_MAX = 8;
export const STAT_TOTAL = 20;

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
  | "counter";

/** 技の種類（3 すくみ）。打撃は組みに、組みは守りに、守りは打撃に強い */
export type MoveClass = "strike" | "grab" | "guard";

/**
 * 守りの種類。
 * block = 打撃を受けて小さく返す。dodge = 打撃をかわす（すばやさが相手以上なら無傷で、立ちに戻る）。
 * counter = 打撃を大きく返す（大技ほど痛い）が、組み技にはとても弱い。
 * catch = 組み技を返す（スプロール・返し技など）が、打撃はまともにくらう
 */
export type GuardKind = "block" | "dodge" | "counter" | "catch";

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
}

export interface StyleDef {
  /** 位置ごとの得意さ。与えるダメージの倍率になり、組み合いの強さにも効く */
  aff: Record<Position, number>;
  /** 組みどうしになったときの組みの強さ（力・スタミナに足す）。組み技が得意なバックボーンほど大きい */
  grip: number;
  /** おすすめの振り分け（キャラ作りで選んだときのはじめの値・コンピュータの目安） */
  build: FighterStats;
  moves: readonly Technique[];
}

const POS = { S: "standing", C: "clinch", G: "ground" } as const satisfies Record<string, Position>;
type PosCode = keyof typeof POS;
const where = (codes: string): Position[] => [...codes].map((c) => POS[c as PosCode]);

/** 技を短く書くための道具。where は "SCG"（立ち・組み合い・寝技）の組み合わせ、to は 1 文字 */
const strike = (id: string, kind: ActionKind, power: number, quick: number, at: string, to?: PosCode): Technique => ({
  id,
  kind,
  cls: "strike",
  power,
  quick,
  where: where(at),
  ...(to && { to: POS[to] }),
});
const grab = (id: string, kind: ActionKind, power: number, quick: number, at: string, to?: PosCode): Technique => ({
  id,
  kind,
  cls: "grab",
  power,
  quick,
  where: where(at),
  ...(to && { to: POS[to] }),
});
const guard = (
  id: string,
  kind: ActionKind,
  type: GuardKind,
  power: number,
  quick: number,
  at: string,
  to?: PosCode,
): Technique => ({ id, kind, cls: "guard", guard: type, power, quick, where: where(at), ...(to && { to: POS[to] }) });

const stats = (power: number, guardValue: number, speed: number, stamina: number): FighterStats => ({
  power,
  guard: guardValue,
  speed,
  stamina,
});

/**
 * バックボーンごとの得意さと技。技の名前（文言）は画面側の i18n/games/fight.ts にある。
 * 打撃系（ボクシング・空手・テコンドー・カポエラ）は立ちで強く、組み系（ムエタイの首相撲・柔道・相撲）は組み合いで、
 * 寝技系（柔術・レスリング）は寝技で強い。総合格闘技はどこでも平均的
 */
export const STYLES: Record<StyleId, StyleDef> = {
  karate: {
    aff: { standing: 1.06, clinch: 1.02, ground: 0.94 },
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
    aff: { standing: 1.28, clinch: 1.08, ground: 0.75 },
    grip: 0,
    build: stats(5, 4, 7, 4),
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
    aff: { standing: 1.0, clinch: 1.38, ground: 1.23 },
    grip: 3,
    build: stats(6, 6, 3, 5),
    moves: [
      grab("seoi", "throw", 17, 0, "SC", "G"),
      grab("osoto", "throw", 15, 1, "C", "G"),
      grab("kumite", "clinch", 5, 1, "S", "C"),
      strike("tsukihanashi", "push", 8, 1, "SCG", "S"),
      grab("kesa", "submission", 15, 0, "G"),
      guard("kaeshi", "throw", "catch", 7, 0, "SCG", "G"),
      guard("taisabaki", "block", "block", 4, 0, "SCG"),
    ],
  },
  bjj: {
    aff: { standing: 1.0, clinch: 1.0, ground: 1.55 },
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
    aff: { standing: 1.2, clinch: 0.93, ground: 1.05 },
    grip: 0.5,
    build: stats(5, 3, 7, 5),
    moves: [
      strike("meialua", "spin_kick", 20, -2, "S"),
      strike("armada", "kick_high", 16, -1, "S"),
      strike("martelo", "kick_mid", 12, 1, "SC"),
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
    aff: { standing: 1.08, clinch: 1.25, ground: 1.3 },
    grip: 3,
    build: stats(6, 4, 4, 6),
    moves: [
      grab("tackle", "takedown", 12, 0, "SC", "G"),
      grab("suplex", "throw", 17, -1, "C", "G"),
      guard("sprawl", "counter", "catch", 5, 0, "SC", "S"),
      grab("pin", "submission", 14, 0, "G"),
      strike("pound", "hook", 12, 0, "CG"),
      guard("block", "block", "block", 4, 0, "SCG"),
    ],
  },
  sumo: {
    aff: { standing: 1.1, clinch: 1.33, ground: 0.8 },
    grip: 3,
    build: stats(7, 6, 3, 4),
    moves: [
      strike("tsuppari", "push", 10, 1, "SCG", "S"),
      strike("butchikamashi", "push", 14, 0, "S", "C"),
      grab("gappuri", "clinch", 6, 0, "S", "C"),
      grab("yorikiri", "push", 16, 0, "C", "S"),
      grab("uwatenage", "throw", 17, -1, "C", "G"),
      guard("ottsuke", "block", "block", 4, 0, "SCG"),
      guard("utchari", "throw", "catch", 8, -1, "C", "G"),
    ],
  },
};

/** バックボーンの技を名前で引く。なければ null */
export function techniqueOf(style: StyleId, id: string): Technique | null {
  return STYLES[style].moves.find((m) => m.id === id) ?? null;
}

/** その位置で使える技 */
export function usableMoves(style: StyleId, position: Position): Technique[] {
  return STYLES[style].moves.filter((m) => m.where.includes(position));
}

/** 攻防で先に技を選ぶ人。キャラを後から作った後手から始めて、交互にする（後に選んだ人が、そのまま次を先に選ぶ） */
export const firstPicker = (exchange: number): Seat => (exchange % 2 === 0 ? 1 : 0);

export type StrikeResult = "hit" | "blocked" | "dodged" | "countered" | "whiff";

/**
 * 1 回の攻防のうち、1 人の技とその結果。
 * 打撃・組み：hit = 当たった・決まった、blocked = ブロックされた（少しだけ当たる）、dodged = かわされた、
 * countered = 止められた・返された、whiff = 出せなかった（先に倒れた）。
 * 守り：hit = 受け・かわし・返しが決まった（damage は返したダメージ）、whiff = 何もできなかった（相手も守った・組まれた・間に合わなかった）
 */
export interface Strike {
  by: Seat;
  /** 技の名前 */
  act: string;
  kind: ActionKind;
  result: StrikeResult;
  /** 相手に与えたダメージ */
  damage: number;
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
}

export type FightMove = { type: "build"; style: StyleId; stats: FighterStats } | { type: "act"; act: string };

export interface FightState {
  /** 2 人のキャラ。まだなら null。先に決めた人のキャラは、相手が決めるまで伏せる */
  fighters: [Fighter | null, Fighter | null];
  hp: [number, number];
  position: Position;
  /** 今の攻防で選んだ技。まだなら null。先に選んだ人の技は相手に見せない */
  picks: [string | null, string | null];
  /** 終わった攻防。今の攻防は history.length 回目（0 から数える） */
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
}

/* ---------- 数の決まり ---------- */

/** ダメージ全体の倍率（技の威力 × これ が、ふつうのキャラどうしで当たったときのダメージ） */
const DAMAGE = 1.5;
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
/** 受け・かわし・返しが決まったとき、相手の技の威力の何割を上乗せして返すか（相手の勢いを使うので、大技ほど返されると痛い） */
const RIPOSTE: Record<GuardKind, number> = { block: 0.4, dodge: 0.3, counter: 0.8, catch: 0.5 };
/** 組み技をくらうときの、守りの種類ごとの倍率（カウンターで待っていると大きくくらう） */
const OPEN: Record<Exclude<GuardKind, "catch">, number> = { block: 1.25, dodge: 1.35, counter: 1.6 };
/** 組み合いで競り勝った組み技の倍率 */
const SCRAMBLE = 0.8;
/** 組み合いの強さに、位置の得意さをどれだけ効かせるか */
const GRIP_AFF = 4;
/** 運の大きさ（打ち合いの速さ、組み合いの強さ、ダメージのゆらぎ） */
const SPEED_LUCK = 2.5;
const GRIP_LUCK = 2;
const WOBBLE = 0.08;
/** 1 回の攻防で使う運の数 */
const LUCK_PER_EXCHANGE = 6;

/** スタミナと攻防の回数から、疲れの残り（1 = 元気） */
export const freshness = (stamina: number, exchange: number) =>
  Math.max(0.3, 1 - exchange * (FATIGUE_BASE - FATIGUE_STEP * stamina));

const powerMul = (power: number) => 1 + (power - 5) * POWER_STEP;
const takenMul = (def: FighterStats, exchange: number, isGrab: boolean) =>
  (1 - (def.guard - 5) * GUARD_STEP * (isGrab ? 0.5 : 1)) *
  (isGrab ? 1 : 1 - (def.speed - 5) * EVADE_STEP) *
  (1 + TIRED_TAKEN * (1 - freshness(def.stamina, exchange)));

/** 1 回の攻防を決めるのに要るもの */
export interface Bout {
  fighters: [Fighter, Fighter];
  hp: [number, number];
  position: Position;
  /** 何回目の攻防か（0 から数える）。疲れに効く */
  exchange: number;
}

/** 運のない攻防（コンピュータの見積もりに使う） */
export const NO_LUCK: readonly number[] = Array(LUCK_PER_EXCHANGE).fill(0.5);

/**
 * 2 人の技から 1 回の攻防の結果を出す。acts は [先手の技, 後手の技]（今の位置で使える技であること）。
 * tie は速さ・組み合いがまったく同じときに先になる人
 */
export function resolve(b: Bout, acts: [string, string], luck: readonly number[], tie: Seat): Exchange {
  const techs = [techniqueOf(b.fighters[0].style, acts[0])!, techniqueOf(b.fighters[1].style, acts[1])!] as const;
  const pos = b.position;
  const t = b.exchange;
  const hp: [number, number] = [...b.hp];
  const strikes: Strike[] = [];
  let ko: Seat | null = null;
  let moved: Position | null = null;

  const fresh = (s: Seat) => freshness(b.fighters[s].stats.stamina, t);
  const speedOf = (s: Seat) => b.fighters[s].stats.speed * fresh(s) + techs[s].quick + SPEED_LUCK * (luck[s]! - 0.5);
  const gripOf = (s: Seat) => {
    const f = b.fighters[s];
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
    const att = b.fighters[by];
    const def = b.fighters[other(by)];
    const raw =
      power *
      DAMAGE * powerMul(att.stats.power) *
      STYLES[att.style].aff[pos] *
      fresh(by) *
      takenMul(def.stats, t, isGrab) *
      mul *
      (1 + WOBBLE * (2 * luck[4 + by]! - 1));
    return Math.max(1, Math.round(raw));
  };
  /** 結果を記録して、ダメージを与える。もう倒れた人がいれば何も起きない。当たったら true */
  const record = (by: Seat, result: StrikeResult, damage = 0): boolean => {
    const tech = techs[by];
    if (ko !== null) {
      strikes.push({ by, act: tech.id, kind: tech.kind, result: "whiff", damage: 0 });
      return false;
    }
    const target = other(by);
    const dealt = Math.min(damage, hp[target]);
    hp[target] -= dealt;
    if (hp[target] <= 0) ko = target;
    strikes.push({ by, act: tech.id, kind: tech.kind, result, damage: dealt });
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
    const power = tech.power + RIPOSTE[tech.guard!] * against.power;
    if (record(by, "hit", damageOf(by, power, 1, isGrab)) && tech.to && moved === null) moved = tech.to;
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
    // 守りどうし：何も起きない
    record(tie, "whiff");
    record(other(tie), "whiff");
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
          record(att, "blocked", damageOf(att, a.power, CHIP, false));
          answer(def, a, false);
          break;
        case "dodge":
          if (speedOf(def) >= speedOf(att)) {
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
      }
    } else if (d.guard === "catch") {
      // 組み技を返す
      record(att, "countered");
      answer(def, a, true);
    } else {
      // 守っているところを組む
      land(att, OPEN[d.guard as Exclude<GuardKind, "catch">]);
      record(def, "whiff");
    }
  }

  // 組み合い・寝技で何も起きなければ、離れて立ちに戻る（ブレイク）
  const nothing = strikes.every((x) => x.result === "whiff");
  const brk = nothing && pos !== "standing";
  const position: Position = moved ?? (brk ? "standing" : pos);
  return { acts, from: pos, position, strikes, hp, ko, brk };
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
 * 技を選ぶ。まず 1 回の攻防を「2 人が同時に選ぶ読み合い」とみて、自分の得（与えたダメージ − 受けたダメージ
 * ＋ 得意な位置に持ち込めたか ＋ KO）を全部の組み合わせで出し、つり合いの割合を求める。
 * そのうえで、相手がこれまでに出した技の種類（同じ位置での記録）に合わせて、勝ちやすい技へ少し寄せる
 */
function botPick(v: FightView, seat: Seat, rng: Rng): string {
  const opp = other(seat);
  const fighters = v.fighters as [Fighter, Fighter];
  const bout: Bout = { fighters, hp: v.hp, position: v.position, exchange: v.exchange };
  const aff = (s: Seat, pos: Position) => STYLES[fighters[s].style].aff[pos];
  const edge = (pos: Position) => aff(seat, pos) - aff(opp, pos);
  // 残りの攻防が少ないほど、位置の値打ちは小さい
  const left = Math.min(1, (EXCHANGES - 1 - v.exchange) / 3);
  const lastOne = v.exchange === EXCHANGES - 1;
  const lead = (hp: [number, number]) => Math.sign(hp[seat] - hp[opp]);
  const mine = usableMoves(fighters[seat].style, v.position);
  const theirs = usableMoves(fighters[opp].style, v.position);

  const payoff = mine.map((m) =>
    theirs.map((o) => {
      const acts: [string, string] = seat === 0 ? [m.id, o.id] : [o.id, m.id];
      const ex = resolve(bout, acts, NO_LUCK, firstPicker(v.exchange));
      const dealt = v.hp[opp] - ex.hp[opp];
      const lost = v.hp[seat] - ex.hp[seat];
      let value = dealt - lost + BOT_POSITION * left * (edge(ex.position) - edge(v.position));
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
  for (const ex of v.history) {
    if (ex.from !== v.position) continue;
    const tech = techniqueOf(fighters[opp].style, ex.acts[opp]);
    if (tech) {
      counts[tech.cls]++;
      seen++;
    }
  }
  let choice = plan;
  if (seen > 0) {
    const perClass = (cls: MoveClass) => theirs.filter((o) => o.cls === cls).length;
    const habit = normalize(theirs.map((o) => counts[o.cls] / perClass(o.cls)));
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
    const picks: FightState["picks"] = [...state.picks];
    picks[seat] = tech.id;
    if (picks[0] === null || picks[1] === null) return { ...state, picks };

    // 2 人そろったので見せ合う
    const n = state.history.length;
    const ex = resolve(
      { fighters: state.fighters as [Fighter, Fighter], hp: state.hp, position: state.position, exchange: n },
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
