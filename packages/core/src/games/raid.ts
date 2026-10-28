import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";
import { STYLE_IDS, STYLES, type StyleId } from "./fight.ts";

/**
 * ふたりのボス戦（協力ゲーム）：バックボーン・ファイトのキャラで 2 人が組み、ありふれた日常のボス 3 体に順に挑む。
 *
 * - はじめに 1 人ずつキャラを選ぶ（先手 → 後手。先に選んだキャラは見える）。キャラの持ち味はバックボーン・ファイトの
 *   おすすめの振り分けから決まる：攻撃 → 与えるダメージ、防御 → 受けるダメージ、スタミナ → 体力、すばやさ → 必殺技の待ち時間。
 *   そのうえでキャラごとに必殺技が 1 つある（攻め・守り・回復・支えのどれかの役）
 * - 毎ラウンド、ボスは次にすることを先に見せる（予告）。2 人はそれを見て、行動を 1 つずつ選ぶ（先に選んだ人の行動は、
 *   もう 1 人が選ぶまで伏せる）。そろったら同時に解決する。先に選ぶ人はラウンドごとに交代し、後に選んだ人が
 *   そのまま次のラウンドを先に選ぶ（以心伝心と同じ。キャラを後に選んだ後手から始める）
 * - 行動は 攻める・守る・かばう・ためる・必殺技。倒れている人は「おうえん」だけ（相棒が少し回復し、攻撃が強くなる）
 * - 解決の順：回復 → 2 人の攻撃 → （ボスが残っていれば）ボスの行動 → 返し技。ボスを倒せば、そのラウンドのボスの行動は来ない
 * - ボスを倒すと次のボスへ。倒れていた人は起き上がり、2 人とも少し回復する。3 体とも倒せばクリア。
 *   2 人とも倒れるか、MAX_ROUNDS ラウンドで倒しきれなければ失敗
 *
 * ボスの予告は initialState で決めた種（seed）とラウンドの数から決まる（同じ対局なら同じ）。種は画面に渡さない
 */

/* ---------- 数の決まり ---------- */

/** ボスの数 */
export const BOSS_COUNT = 3;
/** このラウンド数で倒しきれなければ失敗（日が暮れる） */
export const MAX_ROUNDS = 32;

/** 攻める：与えるダメージのもと（攻撃 5 のキャラ） */
const ATK_BASE = 10;
/** 攻撃 1 ごとに与えるダメージが何割増えるか */
const ATK_STEP = 0.08;
/** 体力 = HP_BASE + スタミナ × HP_STAMINA + 防御 × HP_GUARD */
const HP_BASE = 60;
const HP_STAMINA = 6;
const HP_GUARD = 2.4;
/** 防御 1 ごとに受けるダメージが何割減るか（5 が 1 倍） */
const GUARD_STEP = 0.05;

/** ためたあとの攻撃・必殺技のダメージの倍率 */
export const CHARGE_MUL = 2;
/** 守る：受けるダメージの倍率 */
export const GUARD_MUL = 0.35;
/** かばう：相棒をねらった攻撃も引き受ける。引き受けた分と自分の分を、この倍率で受ける */
export const COVER_MUL = 0.5;
/** 倒れた人の「おうえん」：相棒の回復と、相棒の攻撃の倍率 */
export const CHEER_HEAL = 5;
export const CHEER_MUL = 1.3;

/** ボスが守りを固めているとき・ためているときに受けるダメージの倍率 */
export const BOSS_GUARD_MUL = 0.3;
export const BOSS_CHARGE_MUL = 1.5;
/** ボスがひと休みで回復する量（最大の体力の割合）と、それを止めるのに要る 2 人のダメージの合計（ステージ 1 の値） */
export const REST_HEAL = 0.15;
const REST_BREAK = 18;

/** ボスを倒したとき：倒れていた人が起き上がる体力（最大の割合）と、立っている人の回復（最大の割合） */
export const REVIVE = 0.4;
export const BREATHER = 0.15;

/** 強化・弱体の続くラウンド数（使ったラウンドを含む） */
export const EFFECT_ROUNDS = 3;
/** 弱らせる：ボスの攻撃の倍率。崩す：ボスが受けるダメージの倍率。盛り上げる：2 人の攻撃の倍率 */
export const WEAKEN_MUL = 0.45;
export const BREAK_MUL = 1.5;
export const HYPE_MUL = 1.5;
/** 続いているうちにもう一度使うと（2 段目）、効き目が強くなる */
export const EFFECT_MUL: Record<"weaken" | "break" | "hype", readonly [number, number]> = {
  weaken: [WEAKEN_MUL, 0.3],
  break: [BREAK_MUL, 1.8],
  hype: [HYPE_MUL, 1.8],
};

/* ---------- キャラ ---------- */

/**
 * 必殺技の種類。
 * blast = 大技（攻撃の何倍ものダメージ）。evade = かわして打つ（このラウンドは何も受けず、攻撃する）。
 * counter = 返し技（自分をねらった攻撃を小さく受け、受けた勢いを返す）。wall = 2 人分の攻撃をまとめて引き受けて小さく受ける。
 * shield = 2 人とも受けるダメージを小さくする。rescue = 相棒を回復して、相棒をかばう。
 * heal = 相棒を大きく・自分を少し回復する。healAll = 2 人とも回復する。selfheal = 自分を大きく回復する。
 * hype = 2 人の攻撃をしばらく強くする。break = ボスが受けるダメージをしばらく増やす。weaken = ボスの攻撃をしばらく弱くする。
 * interrupt = ボスのこのラウンドの行動を止める（ためていれば、ためもなくなる）。
 * 回復の技は、倒れている相棒を起こせる
 */
export type SpecialKind =
  | "blast"
  | "evade"
  | "counter"
  | "wall"
  | "shield"
  | "rescue"
  | "heal"
  | "healAll"
  | "selfheal"
  | "hype"
  | "break"
  | "weaken"
  | "interrupt";

/** 役（画面で見せる目安）：攻め・守り・回復・支え */
export type Role = "attack" | "tank" | "healer" | "support";

export const ROLE_OF: Record<SpecialKind, Role> = {
  blast: "attack",
  evade: "attack",
  counter: "tank",
  wall: "tank",
  shield: "tank",
  rescue: "healer",
  heal: "healer",
  healAll: "healer",
  selfheal: "tank",
  hype: "support",
  break: "support",
  weaken: "support",
  interrupt: "support",
};

/**
 * 必殺技で、そのラウンドにボスへ当てるダメージ（攻撃の何倍か。0 は当てない）。
 * 大技がいちばん大きく、支えの技は効き目といっしょに少し当てる
 */
export const SPECIAL_HIT: Record<SpecialKind, number> = {
  blast: 2.6,
  evade: 1.3,
  counter: 0,
  wall: 0.8,
  shield: 0.8,
  rescue: 0.8,
  heal: 0,
  healAll: 0,
  selfheal: 0,
  hype: 1.3,
  break: 1.3,
  weaken: 1.3,
  interrupt: 0.4,
};

/** 必殺技を使ったあと、また使えるまでのラウンド数のもと（すばやさ 7 以上は 1 短く、3 以下は 1 長い） */
export const SPECIAL_COOLDOWN: Record<SpecialKind, number> = {
  blast: 3,
  evade: 3,
  counter: 3,
  wall: 2,
  shield: 2,
  rescue: 2,
  heal: 2,
  healAll: 2,
  selfheal: 2,
  hype: 3,
  break: 3,
  weaken: 3,
  interrupt: 3,
};

/** 必殺技の数（倍率・回復量） */
export const SPECIAL = {
  /** 返し技：受ける倍率と、受けたダメージ（防ぐ前）の何倍を返すか（返すときは攻撃も足す） */
  counterTaken: 0.3,
  counterReflect: 0.3,
  /** まとめて引き受ける：受ける倍率 */
  wall: 0.28,
  /** 2 人とも小さくする：受ける倍率 */
  shield: 0.25,
  /** 相棒を回復してかばう：回復量と、受ける倍率 */
  rescueHeal: 36,
  rescue: 0.35,
  /** 相棒を大きく・自分を少し */
  healPal: 54,
  healSelf: 18,
  /** 2 人とも */
  healAll: 35,
  /** 自分を大きく */
  selfheal: 66,
} as const;

export interface HeroDef {
  style: StyleId;
  /** 必殺技の種類と、名前に使うバックボーン・ファイトの技（画面は game.fight.move.<style>.<act> を使う） */
  special: SpecialKind;
  act: string;
  maxHp: number;
  /** 攻める ときのダメージ */
  atk: number;
  /** 受けるダメージの倍率 */
  taken: number;
  /** 必殺技を使ったあと、また使えるまでのラウンド数 */
  cooldown: number;
}

/** キャラごとの必殺技（バックボーン・ファイトの技から、ボス戦に合うものを 1 つ） */
const SPECIAL_OF: Record<StyleId, [SpecialKind, string]> = {
  karate: ["blast", "mawashi"],
  muaythai: ["blast", "elbow"],
  boxing: ["blast", "hook"],
  mma: ["blast", "highkick"],
  judo: ["counter", "kaeshi"],
  bjj: ["interrupt", "sankaku"],
  capoeira: ["evade", "ginga"],
  taekwondo: ["blast", "dwihuryo"],
  wrestling: ["counter", "sprawl"],
  sumo: ["wall", "gappuri"],
  kickboxing: ["blast", "high"],
  taichi: ["shield", "unshu"],
  kendo: ["blast", "men"],
  luchador: ["hype", "crowd"],
  gamer: ["interrupt", "yomi"],
  magician: ["break", "dove"],
  nurse: ["heal", "teate"],
  swimmer: ["evade", "turn"],
  idol: ["weaken", "pose"],
  rapper: ["break", "dis"],
  chef: ["healAll", "ajimi"],
  robot: ["selfheal", "reboot"],
  ninja: ["evade", "bunshin"],
  tuktuk: ["interrupt", "horn"],
  stuntman: ["blast", "senpu"],
  salaryman: ["break", "nemawashi"],
  bubbletea: ["healAll", "milktea"],
  firefighter: ["rescue", "hinan"],
  dj: ["hype", "floor"],
  investor: ["weaken", "karauri"],
  dino: ["wall", "mofu"],
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/** キャラの持ち味。バックボーン・ファイトのおすすめの振り分けと、受けるダメージの特性から決める */
export function heroOf(style: StyleId): HeroDef {
  const def = STYLES[style];
  const { power, guard, speed, stamina } = def.build;
  const [special, act] = SPECIAL_OF[style];
  return {
    style,
    special,
    act,
    maxHp: Math.round(HP_BASE + stamina * HP_STAMINA + guard * HP_GUARD),
    atk: round1(ATK_BASE * (1 + (power - 5) * ATK_STEP)),
    taken: round1((1 - (guard - 5) * GUARD_STEP) * (def.taken?.strike ?? 1) * 100) / 100,
    cooldown: Math.max(1, SPECIAL_COOLDOWN[special] + (speed >= 7 ? -1 : speed <= 3 ? 1 : 0)),
  };
}

/* ---------- ボス ---------- */

export const BOSS_IDS = ["monday", "rain", "traffic", "deadline", "mosquito"] as const;
export type BossId = (typeof BOSS_IDS)[number];

/**
 * ボスの予告の種類。
 * hit = 1 人をたたく。smash = 1 人に大技。sweep = 2 人まとめて。guard = 守りを固める（攻撃が通りにくい）。
 * charge = 力をためる（無防備。次のラウンドは必ず nova）。nova = ためた力を 2 人まとめてぶつける。
 * rest = ひと休みで回復する（2 人のダメージの合計が一定以上なら止められる）
 */
export type IntentKind = "hit" | "smash" | "sweep" | "guard" | "charge" | "nova" | "rest";
export const INTENT_KINDS: readonly IntentKind[] = ["hit", "smash", "sweep", "guard", "charge", "nova", "rest"];

/** ボスの攻撃の倍率（ボスのダメージのもとに掛ける） */
export const INTENT_POWER: Record<IntentKind, number> = { hit: 1, smash: 2, sweep: 0.7, guard: 0, charge: 0, nova: 1.6, rest: 0 };

export interface BossDef {
  hp: number;
  /** ダメージのもと */
  power: number;
  /** 予告の選ばれやすさ（nova は charge のあとに必ず来るので持たない） */
  weights: Partial<Record<IntentKind, number>>;
  /** 同じボスと戦ったラウンド 1 回ごとに、攻撃が何割強くなるか（長引くほど痛い） */
  enrage: number;
  /** 与えたダメージのこの割合だけ回復する（夜中の蚊） */
  drain?: number;
}

/**
 * ボスたち。どれも日本とタイのどちらでもよくある「困ったこと」をコミカルにしたもの。
 * 月曜日の朝はひと休み（二度寝）が多く、大雨の雲は 2 人まとめての攻撃とためが多く、渋滞モンスターは守りが固く、
 * 締め切り魔人は大技が多くて長引くほど強くなり、夜中の蚊は攻撃で血を吸って回復する
 */
export const BOSSES: Record<BossId, BossDef> = {
  monday: { hp: 92, power: 49.5, weights: { hit: 3, smash: 2, sweep: 2, guard: 1, charge: 1, rest: 3 }, enrage: 0.03 },
  rain: { hp: 95, power: 45, weights: { hit: 2, smash: 2, sweep: 3, guard: 1, charge: 2, rest: 1 }, enrage: 0.03 },
  traffic: { hp: 99, power: 49.5, weights: { hit: 3, smash: 2, sweep: 2, guard: 3, charge: 1, rest: 1 }, enrage: 0.03 },
  deadline: { hp: 97, power: 45, weights: { hit: 2, smash: 3, sweep: 2, guard: 1, charge: 2, rest: 1 }, enrage: 0.05 },
  mosquito: { hp: 81, power: 45, weights: { hit: 4, smash: 2, sweep: 2, guard: 2, charge: 1, rest: 1 }, enrage: 0.03, drain: 0.8 },
};

/** 何体目か（0 から）での、体力と攻撃の倍率（あとのボスほど強い） */
export const STAGE_HP = [0.8, 1, 1.25] as const;
export const STAGE_POWER = [0.85, 1, 1.15] as const;

export const bossMaxHp = (boss: BossId, stage: number) => Math.round(BOSSES[boss].hp * (STAGE_HP[stage] ?? 1));
/** ひと休みを止めるのに要るダメージの合計 */
export const restBreakOf = (stage: number) => Math.round(REST_BREAK * (STAGE_HP[stage] ?? 1));

/* ---------- 状態 ---------- */

export interface Hero {
  style: StyleId;
  hp: number;
  /** ためている（次の攻撃・必殺技が強い） */
  charged: boolean;
  /** 必殺技がまた使えるまでのラウンド数（0 なら使える） */
  cooldown: number;
}

export interface Intent {
  kind: IntentKind;
  /** 1 人をねらう予告（hit・smash）の相手 */
  target?: Seat;
}

/** 続いている強化・弱体。weaken・break はボスに、hype は 2 人に付く。left は残りのラウンド数（このラウンドを含む） */
export interface Effect {
  kind: "weaken" | "break" | "hype";
  left: number;
  /** 1 段目か 2 段目か（続いているうちにもう一度使うと 2 段目） */
  level: 1 | 2;
}

export type Act = "attack" | "guard" | "cover" | "charge" | "special" | "cheer";
export const ACTS: readonly Act[] = ["attack", "guard", "cover", "charge", "special", "cheer"];

export type RaidMove = { type: "pick"; style: StyleId } | { type: "act"; act: Act };

/** 1 ラウンドの結果 */
export interface RoundLog {
  /** 何ラウンド目か（0 から） */
  round: number;
  /** 何体目のボスか（0 から） */
  stage: number;
  boss: BossId;
  intent: Intent;
  acts: [Act, Act];
  /** 必殺技を使った人は、その種類 */
  specials: [SpecialKind | null, SpecialKind | null];
  /** ボスに与えたダメージ（返し技の分も含む） */
  dealt: [number, number];
  /** 受けたダメージ */
  taken: [number, number];
  /** 回復した体力 */
  healed: [number, number];
  /** ボスの行動を止めた */
  interrupted: boolean;
  /** ボスの回復（ひと休み・血を吸う） */
  bossHeal: number;
  /** ひと休みを 2 人のダメージで止めた */
  restStopped: boolean;
  /** このラウンドで新しく付いた強化・弱体 */
  added: Effect["kind"][];
  /** ラウンドのあとの体力 */
  hp: [number, number];
  /** ボスの体力（倒したなら 0） */
  bossHp: number;
  /** このラウンドで倒れた人 */
  downed: [boolean, boolean];
  /** このラウンドでボスを倒した */
  defeated: boolean;
  /** ボスを倒して、倒れていた人が起き上がった */
  revived: [boolean, boolean];
}

export interface RaidState {
  heroes: [Hero | null, Hero | null];
  /** 今回戦う 3 体（この順） */
  bosses: BossId[];
  /** 今戦っているボス（0 から）。全部倒したら BOSS_COUNT */
  stage: number;
  bossHp: number;
  /** 今のボスと戦ったラウンドの数 */
  bossRounds: number;
  /** 今のラウンドの予告。キャラがそろうまでは null */
  intent: Intent | null;
  effects: Effect[];
  /** 今のラウンドで選んだ行動。先に選んだ人の行動は相手に見せない */
  picks: [Act | null, Act | null];
  history: RoundLog[];
  /** 予告を決める種。だれにも見せない */
  seed: number;
}

/** 画面に渡す形。相手の今のラウンドの行動は「選んだか」だけ。種は渡さない */
export interface RaidView {
  phase: "pick" | "battle" | "over";
  heroes: [Hero | null, Hero | null];
  bosses: BossId[];
  stage: number;
  bossHp: number;
  bossMaxHp: number;
  bossRounds: number;
  intent: Intent | null;
  effects: Effect[];
  /** 自分の行動は名前、相手の行動は選んだかどうか */
  picks: [Act | boolean | null, Act | boolean | null];
  /** 選ぶ番の人。終局後は null */
  turn: Seat | null;
  /** 今のラウンド（0 から）。終局後は終わったラウンドの数 */
  round: number;
  history: RoundLog[];
  cleared: boolean;
}

/* ---------- 決まりの道具 ---------- */

/** ラウンドで先に選ぶ人。キャラを後に選んだ後手から始めて、交互にする（後に選んだ人が、そのまま次を先に選ぶ） */
export const firstPicker = (round: number): Seat => (round % 2 === 0 ? 1 : 0);

const alive = (h: Hero | null): h is Hero => !!h && h.hp > 0;
/** 続いている強化・弱体の倍率（なければ 1） */
export function effectMul(effects: readonly Effect[], kind: Effect["kind"]): number {
  const e = effects.find((x) => x.kind === kind && x.left > 0);
  return e ? EFFECT_MUL[kind][(e.level ?? 1) - 1]! : 1;
}

/** ボスの今のダメージのもと（何体目か・長引いた分・弱らせた分を含む） */
export function bossPower(boss: BossId, stage: number, bossRounds: number, effects: readonly Effect[]): number {
  const b = BOSSES[boss];
  return b.power * (STAGE_POWER[stage] ?? 1) * (1 + b.enrage * bossRounds) * effectMul(effects, "weaken");
}

/** 予告どおりに来たとき、seat が何も防がずに受けるダメージ（画面の目安） */
export function intentDamage(v: Pick<RaidView, "bosses" | "stage" | "bossRounds" | "effects" | "intent" | "heroes">, seat: Seat): number {
  const intent = v.intent;
  const hero = v.heroes[seat];
  if (!intent || !alive(hero)) return 0;
  const single = intent.kind === "hit" || intent.kind === "smash";
  if (single && intent.target !== seat) return 0;
  const power = bossPower(v.bosses[v.stage]!, v.stage, v.bossRounds, v.effects) * INTENT_POWER[intent.kind];
  return Math.round(power * heroOf(hero.style).taken);
}

/** 0 以上 1 未満の、種・ラウンド・用途から決まる数 */
function hashRand(seed: number, round: number, salt: number): number {
  let h = (seed ^ Math.imul(round + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * 次のラウンドの予告を決める。ためた次は必ず nova。ボスとの最初のラウンドは hit か sweep。
 * hit・smash の相手は、前のラウンドでボスに多くダメージを与えた人を 6 割でねらう（あとはでたらめ）。立っている人だけをねらう。
 * 直前と同じ種類（hit を除く）は続けない。体力が多いうちはひと休みしない
 */
export function nextIntent(
  s: Pick<RaidState, "bosses" | "stage" | "bossHp" | "bossRounds" | "heroes" | "seed">,
  round: number,
  prev: Intent | null,
  lastDealt: [number, number] | null,
): Intent {
  const boss = s.bosses[s.stage]!;
  if (prev?.kind === "charge" && s.bossRounds > 0) return { kind: "nova" };
  const def = BOSSES[boss];
  let kinds: IntentKind[];
  if (s.bossRounds === 0) kinds = ["hit", "sweep"];
  else {
    const full = s.bossHp >= bossMaxHp(boss, s.stage) * 0.85;
    kinds = (Object.keys(def.weights) as IntentKind[]).filter(
      (k) => !(k === prev?.kind && k !== "hit") && !(k === "rest" && full),
    );
  }
  const weight = (k: IntentKind) => (s.bossRounds === 0 ? 1 : (def.weights[k] ?? 0));
  const total = kinds.reduce((a, k) => a + weight(k), 0);
  let r = hashRand(s.seed, round, 1) * total;
  let kind = kinds.at(-1)!;
  for (const k of kinds) {
    r -= weight(k);
    if (r < 0) {
      kind = k;
      break;
    }
  }
  if (kind !== "hit" && kind !== "smash") return { kind };
  const standing = ([0, 1] as Seat[]).filter((seat) => alive(s.heroes[seat]));
  if (standing.length === 1) return { kind, target: standing[0]! };
  let target: Seat = hashRand(s.seed, round, 2) < 0.5 ? 0 : 1;
  if (lastDealt && lastDealt[0] !== lastDealt[1] && hashRand(s.seed, round, 3) < 0.6) target = lastDealt[0] > lastDealt[1] ? 0 : 1;
  return { kind, target };
}

/** seat がこのラウンドに選べる行動 */
export function actsFor(heroes: RaidState["heroes"], seat: Seat): Act[] {
  const h = heroes[seat];
  if (!h) return [];
  if (h.hp <= 0) return ["cheer"];
  const pal = heroes[other(seat)];
  const list: Act[] = ["attack", "guard"];
  if (alive(pal)) list.push("cover");
  list.push("charge");
  if (h.cooldown === 0) list.push("special");
  return list;
}

/** 1 ラウンドを解決するのに要るもの */
export type Battle = Pick<RaidState, "heroes" | "bosses" | "stage" | "bossHp" | "bossRounds" | "intent" | "effects">;

/**
 * 2 人の行動から 1 ラウンドを解決する（予告は決め直さない）。acts は [先手の行動, 後手の行動]（選べる行動であること）。
 * 返すのは、記録と、ラウンドのあとの状態（次のボスに進んだ分も含む）
 */
export function resolve(b: Battle, acts: [Act, Act], round: number): { log: RoundLog; next: Battle } {
  const intent = b.intent!;
  const boss = b.bosses[b.stage]!;
  const bossDef = BOSSES[boss];
  const defs = b.heroes.map((h) => (h ? heroOf(h.style) : null)) as [HeroDef | null, HeroDef | null];
  const heroes = b.heroes.map((h) => (h ? { ...h } : null)) as [Hero | null, Hero | null];
  const up = [alive(heroes[0]), alive(heroes[1])] as [boolean, boolean];
  const specials = ([0, 1] as Seat[]).map((seat) => (acts[seat] === "special" ? defs[seat]!.special : null)) as [
    SpecialKind | null,
    SpecialKind | null,
  ];
  const usedSpecial = (seat: Seat, ...kinds: SpecialKind[]) => specials[seat] !== null && kinds.includes(specials[seat]!);

  // 必殺技の強化・弱体（使ったラウンドから効く）
  let effects = b.effects.map((e) => ({ ...e }));
  const added: Effect["kind"][] = [];
  for (const seat of [0, 1] as Seat[]) {
    const sp = specials[seat];
    if (sp === "weaken" || sp === "break" || sp === "hype") {
      const level = effects.some((e) => e.kind === sp) ? 2 : 1;
      effects = [...effects.filter((e) => e.kind !== sp), { kind: sp, left: EFFECT_ROUNDS, level }];
      added.push(sp);
    }
  }
  const interrupted = usedSpecial(0, "interrupt") || usedSpecial(1, "interrupt");
  const bossActs = interrupted ? "none" : intent.kind;

  // 回復（先に効く。倒れている相棒は起き上がる）
  const healed: [number, number] = [0, 0];
  const heal = (seat: Seat, amount: number) => {
    const h = heroes[seat];
    if (!h || amount <= 0) return;
    const max = defs[seat]!.maxHp;
    const gain = Math.max(0, Math.min(max, h.hp + amount) - h.hp);
    h.hp += gain;
    healed[seat] += gain;
  };
  for (const seat of [0, 1] as Seat[]) {
    const pal = other(seat);
    switch (specials[seat]) {
      case "heal":
        heal(pal, SPECIAL.healPal);
        heal(seat, SPECIAL.healSelf);
        if (heroes[pal] && heroes[pal]!.hp > 0) heroes[pal]!.charged = true;
        break;
      case "healAll":
        heal(pal, SPECIAL.healAll);
        heal(seat, SPECIAL.healAll);
        if (heroes[pal] && heroes[pal]!.hp > 0) heroes[pal]!.charged = true;
        break;
      case "selfheal":
        heal(seat, SPECIAL.selfheal);
        heroes[seat]!.charged = true;
        break;
      case "rescue":
        heal(pal, SPECIAL.rescueHeal);
        break;
    }
    if (acts[seat] === "cheer" && up[pal]) heal(pal, CHEER_HEAL);
  }

  // 2 人の攻撃
  const bossTakes =
    (bossActs === "guard" ? BOSS_GUARD_MUL : bossActs === "charge" ? BOSS_CHARGE_MUL : 1) * effectMul(effects, "break");
  const heroMul = (seat: Seat) =>
    effectMul(effects, "hype") * (acts[other(seat)] === "cheer" ? CHEER_MUL : 1) * bossTakes;
  const dealt: [number, number] = [0, 0];
  for (const seat of [0, 1] as Seat[]) {
    if (!up[seat]) continue;
    const def = defs[seat]!;
    const h = heroes[seat]!;
    let base = 0;
    if (acts[seat] === "attack") base = def.atk;
    else if (specials[seat]) base = def.atk * SPECIAL_HIT[specials[seat]!];
    if (base > 0) {
      dealt[seat] = Math.round(base * heroMul(seat) * (h.charged ? CHARGE_MUL : 1));
      h.charged = false;
    }
    if (acts[seat] === "charge") h.charged = true;
  }
  let bossHp = Math.max(0, b.bossHp - dealt[0] - dealt[1]);
  let defeated = bossHp === 0;

  // ボスの行動
  const taken: [number, number] = [0, 0];
  let bossHeal = 0;
  let restStopped = false;
  if (!defeated) {
    const power = bossPower(boss, b.stage, b.bossRounds, effects) * INTENT_POWER[intent.kind];
    /** 防ぐ前に、だれに何が来るか */
    const raw: [number, number] = [0, 0];
    if (bossActs === "hit" || bossActs === "smash") raw[intent.target ?? 0] = up[intent.target ?? 0] ? power : 0;
    else if (bossActs === "sweep" || bossActs === "nova") for (const seat of [0, 1] as Seat[]) raw[seat] = up[seat] ? power : 0;
    else if (bossActs === "rest") {
      if (dealt[0] + dealt[1] >= restBreakOf(b.stage)) restStopped = true;
      else bossHeal += Math.round(bossMaxHp(boss, b.stage) * REST_HEAL);
    }

    // かばう・まとめて引き受ける：相棒の分を自分に移す（2 人ともかばい合ったら、移さない）
    const coversPal = (seat: Seat) =>
      up[seat] && up[other(seat)] && (acts[seat] === "cover" || usedSpecial(seat, "wall", "rescue"));
    const incoming: [number, number] = [raw[0], raw[1]];
    for (const seat of [0, 1] as Seat[]) {
      const pal = other(seat);
      if (coversPal(seat) && !coversPal(pal)) {
        incoming[seat] += incoming[pal];
        incoming[pal] = 0;
      }
    }
    const shield = usedSpecial(0, "shield") || usedSpecial(1, "shield") ? SPECIAL.shield : 1;
    for (const seat of [0, 1] as Seat[]) {
      if (!up[seat] || incoming[seat] <= 0) continue;
      let mul = 1;
      if (acts[seat] === "guard") mul = GUARD_MUL;
      else if (acts[seat] === "cover") mul = COVER_MUL;
      else if (usedSpecial(seat, "wall")) mul = SPECIAL.wall;
      else if (usedSpecial(seat, "rescue")) mul = SPECIAL.rescue;
      else if (usedSpecial(seat, "evade")) mul = 0;
      else if (usedSpecial(seat, "counter")) mul = SPECIAL.counterTaken;
      const dmg = Math.round(incoming[seat] * mul * shield * defs[seat]!.taken);
      taken[seat] = Math.min(heroes[seat]!.hp, dmg);
      heroes[seat]!.hp -= taken[seat];
      // 返し技：受けた勢い（防ぐ前）に攻撃を足して返す
      if (usedSpecial(seat, "counter")) {
        const h = heroes[seat]!;
        const back = Math.round(
          (incoming[seat] * SPECIAL.counterReflect + defs[seat]!.atk) * heroMul(seat) * (h.charged ? CHARGE_MUL : 1),
        );
        dealt[seat] += back;
        h.charged = false;
        bossHp = Math.max(0, bossHp - back);
      }
    }
    if (bossDef.drain && bossHp > 0) bossHeal += Math.round((taken[0] + taken[1]) * bossDef.drain);
    if (bossHp > 0) bossHp = Math.min(bossMaxHp(boss, b.stage), bossHp + bossHeal);
    else bossHeal = 0;
    defeated = bossHp === 0;
  }

  const downed: [boolean, boolean] = [up[0] && heroes[0]!.hp <= 0, up[1] && heroes[1]!.hp <= 0];

  // 必殺技の待ち時間・強化と弱体の残り
  for (const seat of [0, 1] as Seat[]) {
    const h = heroes[seat];
    if (!h) continue;
    h.cooldown = specials[seat] ? defs[seat]!.cooldown : Math.max(0, h.cooldown - 1);
  }
  effects = effects.map((e) => ({ ...e, left: e.left - 1 })).filter((e) => e.left > 0);

  // ボスを倒したら次のボスへ。倒れていた人は起き上がり、2 人とも少し回復する（2 人とも倒れていたら、そこで終わり）
  const revived: [boolean, boolean] = [false, false];
  let stage = b.stage;
  let bossRounds = b.bossRounds + 1;
  const someoneUp = alive(heroes[0]) || alive(heroes[1]);
  if (defeated && someoneUp) {
    for (const seat of [0, 1] as Seat[]) {
      const h = heroes[seat]!;
      const max = defs[seat]!.maxHp;
      if (h.hp <= 0) {
        h.hp = Math.round(max * REVIVE);
        revived[seat] = true;
      } else h.hp = Math.min(max, h.hp + Math.round(max * BREATHER));
    }
    stage++;
    bossRounds = 0;
    effects = [];
    if (stage < BOSS_COUNT) bossHp = bossMaxHp(b.bosses[stage]!, stage);
  }

  const log: RoundLog = {
    round,
    stage: b.stage,
    boss,
    intent,
    acts,
    specials,
    dealt,
    taken,
    healed,
    interrupted,
    bossHeal,
    restStopped,
    added,
    hp: [heroes[0]?.hp ?? 0, heroes[1]?.hp ?? 0],
    bossHp: defeated ? 0 : bossHp,
    downed,
    defeated,
    revived,
  };
  return { log, next: { heroes, bosses: b.bosses, stage, bossHp, bossRounds, intent, effects } };
}

/* ---------- ルール ---------- */

const isStyle = (x: unknown): x is StyleId => STYLE_IDS.includes(x as StyleId);
const isAct = (x: unknown): x is Act => ACTS.includes(x as Act);
const bothPicked = (s: Pick<RaidState, "heroes">) => s.heroes[0] !== null && s.heroes[1] !== null;

function isOver(s: RaidState): boolean {
  if (s.stage >= BOSS_COUNT) return true;
  if (bothPicked(s) && !alive(s.heroes[0]) && !alive(s.heroes[1])) return true;
  return s.history.length >= MAX_ROUNDS;
}

function turnOf(s: RaidState): Seat {
  if (s.heroes[0] === null) return 0;
  if (s.heroes[1] === null) return 1;
  const first = firstPicker(s.history.length);
  return s.picks[first] === null ? first : other(first);
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const newHero = (style: StyleId): Hero => ({ style, hp: heroOf(style).maxHp, charged: false, cooldown: 0 });

export const raid: GameDefinition<RaidState, RaidMove> = {
  id: "raid",

  initialState(rng) {
    const bosses = shuffle(BOSS_IDS, rng).slice(0, BOSS_COUNT);
    return {
      heroes: [null, null],
      bosses,
      stage: 0,
      bossHp: bossMaxHp(bosses[0]!, 0),
      bossRounds: 0,
      intent: null,
      effects: [],
      picks: [null, null],
      history: [],
      seed: Math.floor(rng() * 2 ** 31),
    };
  },

  status(state): GameStatus {
    if (!isOver(state)) return { kind: "playing", turn: turnOf(state) };
    return { kind: "finished", winner: null, coop: state.stage >= BOSS_COUNT ? "cleared" : "failed" };
  },

  applyMove(state, move, seat) {
    if (isOver(state)) throw new IllegalMoveError("game_over");
    if (seat !== turnOf(state)) throw new IllegalMoveError("not_your_turn");

    if (move.type === "pick") {
      if (state.heroes[seat] !== null) throw new IllegalMoveError("raid_already_picked");
      if (!isStyle(move.style)) throw new IllegalMoveError("raid_bad_style");
      const heroes: RaidState["heroes"] = [...state.heroes];
      heroes[seat] = newHero(move.style);
      const next = { ...state, heroes };
      return bothPicked(next) ? { ...next, intent: nextIntent(next, 0, null, null) } : next;
    }

    if (!bothPicked(state)) throw new IllegalMoveError("raid_pick_first");
    if (!actsFor(state.heroes, seat).includes(move.act)) {
      throw new IllegalMoveError(move.act === "special" ? "raid_not_ready" : "raid_cannot_act");
    }
    const picks: RaidState["picks"] = [...state.picks];
    picks[seat] = move.act;
    if (picks[0] === null || picks[1] === null) return { ...state, picks };

    // 2 人そろったので解決する
    const round = state.history.length;
    const { log, next } = resolve(state, [picks[0], picks[1]], round);
    const after: RaidState = { ...state, ...next, picks: [null, null], history: [...state.history, log] };
    if (isOver(after)) return { ...after, intent: null };
    // 倒したら次のボスは新しく始める。ためを止めたら、次の nova は来ない
    const prev = log.defeated || (log.interrupted && log.intent.kind === "charge") ? null : log.intent;
    return { ...after, intent: nextIntent(after, round + 1, prev, log.defeated ? null : log.dealt) };
  },

  parseMove(raw) {
    const m = raw as { type?: unknown; style?: unknown; act?: unknown } | null;
    if (m?.type === "pick") return typeof m.style === "string" ? { type: "pick", style: m.style as StyleId } : null;
    if (m?.type === "act") return isAct(m.act) ? { type: "act", act: m.act } : null;
    return null;
  },

  viewState(state, viewer, revealAll): RaidView {
    const pick = (s: Seat) => (revealAll || s === viewer ? state.picks[s] : state.picks[s] !== null);
    const over = isOver(state);
    const stage = Math.min(state.stage, BOSS_COUNT - 1);
    return {
      phase: over ? "over" : bothPicked(state) ? "battle" : "pick",
      heroes: state.heroes,
      bosses: state.bosses,
      stage: state.stage,
      bossHp: state.stage >= BOSS_COUNT ? 0 : state.bossHp,
      bossMaxHp: bossMaxHp(state.bosses[stage]!, stage),
      bossRounds: state.bossRounds,
      intent: state.intent,
      effects: state.effects,
      picks: [pick(0), pick(1)],
      turn: over ? null : turnOf(state),
      round: state.history.length,
      history: state.history,
      cleared: state.stage >= BOSS_COUNT,
    };
  },

  viewMove(move, mover, viewer) {
    // キャラは選んだときに状態で見える。行動はそろったら記録（history）で公開される
    if (move.type === "pick" || mover === viewer) return move;
    return { type: "act" };
  },

  botMove(view, seat, rng) {
    const v = view as RaidView;
    if (v.phase === "over" || v.turn !== seat) return null;
    if (!v.heroes[seat]) return { type: "pick", style: botStyle(v, seat, rng) };
    if (v.picks[seat] !== null && v.picks[seat] !== false) return null;
    return { type: "act", act: botAct(v, seat, rng) };
  },
};

/* ---------- コンピュータ ---------- */

/** コンピュータのキャラ選び：相棒がいれば、相棒と違う役のキャラから選ぶ（いなければ、でたらめ） */
export function botStyle(v: Pick<RaidView, "heroes">, seat: Seat, rng: Rng): StyleId {
  const pal = v.heroes[other(seat)];
  const palRole = pal ? ROLE_OF[heroOf(pal.style).special] : null;
  const pool = palRole ? STYLE_IDS.filter((s) => ROLE_OF[heroOf(s).special] !== palRole) : [...STYLE_IDS];
  return pool[Math.floor(rng() * pool.length)]!;
}

/** 体力 1 の値打ち（ボスに与えるダメージ 1 に比べて） */
const BOT_HP = 5 / 3;
/** コンピュータが良さそうな組を選ぶとき、いちばん良い組からどれだけ離れた組まで選びうるか（点の差） */
const BOT_SLACK = 4;
/** ときどき（この割合で）2 番目以降の良さの組を選ぶ（人らしいまちがい） */
const BOT_WOBBLE = 0.15;

/**
 * 1 ラウンドの見込みの点。ボスに与えたダメージ − 受けたダメージ（体力が少ない人ほど重い）＋ 回復（同じ重み）
 * ＋ ためた分・強化と弱体の見込み − 必殺技を使った分（待ち時間）。倒れる・ボスを倒すは大きく数える
 */
function scoreOf(before: Battle, log: RoundLog, next: Battle): number {
  const boss = before.bosses[before.stage]!;
  let score = log.dealt[0] + log.dealt[1];
  if (log.defeated) score += 25;
  score -= log.bossHeal;
  for (const seat of [0, 1] as Seat[]) {
    const h = before.heroes[seat]!;
    const def = heroOf(h.style);
    const ratio = h.hp / def.maxHp;
    const weight = 1 + 2.2 * (1 - ratio) ** 2;
    score -= log.taken[seat] * weight * BOT_HP;
    score += log.healed[seat] * weight * BOT_HP * (h.hp <= 0 ? 1.6 : 0.85);
    if (log.downed[seat]) score -= 75;
    const after = next.heroes[seat]!;
    if (after.charged && !h.charged) score += def.atk * 0.9;
    if (log.specials[seat]) score -= 3 + def.cooldown * 1.2;
  }
  const power = bossPower(boss, before.stage, before.bossRounds, []);
  for (const kind of log.added) {
    if (kind === "weaken") score += power * 0.4 * 1.6 * BOT_HP;
    if (kind === "break") score += 10;
    if (kind === "hype") score += 8;
  }
  return score;
}

/**
 * 行動を選ぶ。2 人の行動の組すべてを解決してみて、点のいちばん良い組の自分の分を出す（相棒も同じように考えるとみる。
 * トークで相談して合わせるのに近い）。ときどき少し良さの劣る組を選ぶ
 */
function botAct(v: RaidView, seat: Seat, rng: Rng): Act {
  const heroes = v.heroes as [Hero, Hero];
  const mine = actsFor(heroes, seat);
  const theirs = actsFor(heroes, other(seat));
  const battle: Battle = {
    heroes,
    bosses: v.bosses,
    stage: v.stage,
    bossHp: v.bossHp,
    bossRounds: v.bossRounds,
    intent: v.intent,
    effects: v.effects,
  };
  const plans: { act: Act; score: number }[] = [];
  for (const m of mine) {
    for (const o of theirs) {
      const acts: [Act, Act] = seat === 0 ? [m, o] : [o, m];
      const { log, next } = resolve(battle, acts, v.round);
      plans.push({ act: m, score: scoreOf(battle, log, next) });
    }
  }
  plans.sort((a, b) => b.score - a.score);
  const best = plans[0]!.score;
  if (rng() < BOT_WOBBLE) {
    const near = plans.filter((p) => p.score >= best - BOT_SLACK);
    return near[Math.floor(rng() * near.length)]!.act;
  }
  return plans[0]!.act;
}

/** でたらめに選ぶコンピュータ（バランスを確かめるのに使う） */
export function randomAct(v: RaidView, seat: Seat, rng: Rng): Act {
  const list = actsFor(v.heroes, seat);
  return list[Math.floor(rng() * list.length)]!;
}
