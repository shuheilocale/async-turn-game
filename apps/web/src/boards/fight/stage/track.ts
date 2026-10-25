import { armLength, type BodyDims } from "./body.ts";
import { add, apply3, dist as distance, easings, norm, scale, sub, type EaseName, type V3 } from "./math.ts";
import { TWO_HAND_GAP } from "./outfit.ts";
import { chestFrame, headCenter, lerpPose, P, pack, pelvisFrame, shoulderLocal, unpack, type Pose, type PoseDesc } from "./pose.ts";
import { withHands } from "./stances.ts";
import type { StageStrike, StyleId } from "./types.ts";

/**
 * 技の動きを書く道具（キーフレーム・踏み込み・相手の体の場所）。moves.ts と special.ts で使う。
 * キーフレームは「構え（base）からどれだけ技の姿勢に寄せるか」の重み w を持ち、
 * 再生するときは、いまの構え（息づかいや待ちの動きを含む）と w で混ぜる
 */

export interface Key {
  t: number;
  pose: Pose;
  w: number;
  /** ひとつ前のキーからこのキーまでの動き方 */
  ease: EaseName;
}

export interface Track {
  keys: Key[];
  end: number;
}

/** track の時刻 t の姿勢を out に入れ、重み w を返す */
export function sampleTrack(track: Track, t: number, out: Pose): number {
  const keys = track.keys;
  const first = keys[0]!;
  if (t <= first.t) {
    out.set(first.pose);
    return first.w;
  }
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t < b.t) {
      const a = keys[i - 1]!;
      const u = easings[b.ease]((t - a.t) / (b.t - a.t));
      lerpPose(a.pose, b.pose, u, out);
      return a.w + (b.w - a.w) * u;
    }
  }
  const last = keys[keys.length - 1]!;
  out.set(last.pose);
  return last.w;
}

/** キーフレームを書くときの道具。d は姿勢、hand で手首の目標を足もとから見た位置で決める */
export interface KeyEdit {
  d: PoseDesc;
  /** 手首を、足もとから見た位置に置く（胸がどう動いたあとでも、そこへ届く） */
  hand(i: 0 | 1, at: V3): void;
}

export class TrackBuilder {
  readonly keys: Key[] = [];
  constructor(
    readonly base: Pose,
    readonly dims: BodyDims,
  ) {
    this.keys.push({ t: 0, pose: base, w: 0, ease: "linear" });
  }

  /** 構えを書きかえた姿勢を、時刻 t に置く */
  at(t: number, w: number, edit?: (k: KeyEdit) => void, ease: EaseName = "inOut", from: Pose = this.base): Pose {
    const pose = edit ? editKey(from, this.dims, edit) : from;
    return this.pose(t, w, pose, ease);
  }

  /** 決まった姿勢を、時刻 t に置く（ひとつ前のキーより前にはしない） */
  pose(t: number, w: number, pose: Pose, ease: EaseName = "inOut") {
    this.keys.push({ t: Math.max(t, this.keys[this.keys.length - 1]!.t), pose, w, ease });
    return pose;
  }

  build(): Track {
    return { keys: this.keys, end: this.keys[this.keys.length - 1]!.t };
  }
}

export function editKey(from: Pose, dims: BodyDims, edit: (k: KeyEdit) => void): Pose {
  const d = unpack(from);
  const hands: [V3 | null, V3 | null] = [null, null];
  // 書きかえる前の手首の位置（足もとから見て）。hand で決めなかった手は、胸についてくる
  edit({ d, hand: (i, at) => (hands[i] = at) });
  const pose = pack(d);
  return hands[0] || hands[1] ? withHands(pose, dims, hands) : pose;
}

// ---- 位置・姿勢をずらす道具 ----

/** 腰と両足を前（+Z）へ dz、横へ dx ずらす（踏み込み・下がる） */
export function shift(d: PoseDesc, dz: number, dx = 0, feet: 0 | 1 | 2 = 2) {
  d.hip[2] += dz;
  d.hip[0] += dx;
  for (const i of [0, 1] as const) {
    if (feet === 2 || feet === i) {
      d.foot[i][2] += dz;
      d.foot[i][0] += dx;
    }
  }
}

/** 姿勢ごと前へずらした写し（位置関係が変わる動きの、最後の姿勢を作るのに使う） */
export function shiftPose(p: Pose, dz: number): Pose {
  const out = Float64Array.from(p);
  out[P.hip + 2] = out[P.hip + 2]! + dz;
  out[P.foot + 2] = out[P.foot + 2]! + dz;
  out[P.foot + 5] = out[P.foot + 5]! + dz;
  return out;
}

/** 手首が target に届くよう、届かない分だけ前へ踏み込む */
export function reachHand(k: KeyEdit, dims: BodyDims, i: 0 | 1, target: V3, slack = 0.97) {
  const pose = pack(k.d);
  const f = chestFrame(pose, dims);
  const sh = add(f.o, apply3(f.r, shoulderLocal(dims, i)));
  const short = distance(sh, target) - armLength(dims) * slack;
  if (short > 0) shift(k.d, Math.min(short, 0.45), 0, 0);
  k.hand(i, target);
}

/** 足首が target に届くよう、届かない分だけ軸足ごと踏み込む */
export function reachFoot(d: PoseDesc, dims: BodyDims, i: 0 | 1, target: V3, slack = 0.98) {
  const pf = pelvisFrame(pack(d));
  const hipJoint = add(pf.o, apply3(pf.r, [(i === 0 ? 1 : -1) * dims.hipHalf, 0, 0]));
  const short = distance(hipJoint, target) - (dims.thigh + dims.shin) * slack;
  if (short > 0) shift(d, Math.min(short, 0.5), 0, i === 0 ? 1 : 0);
  d.foot[i] = target;
}

// ---- 相手の体の場所（攻める人の足もとから見て） ----

export type Zone = "head" | "body" | "legs" | "grab";

export interface Side {
  d: BodyDims;
  style: StyleId | null;
  /** いまの構え（左足前の向き） */
  base: Pose;
  /** 左右を入れかえて描く人（画面の右の人） */
  mirror?: boolean;
}

/** 相手の頭・あご・胴・脚の位置。相手は dist 先でこちらを向いて立っている */
export function targetsOf(def: Side, dist: number) {
  const h = headCenter(def.base, def.d);
  const at = (v: V3): V3 => [-v[0] * 0.3, v[1], dist - v[2]];
  const hip = def.base[P.hip + 1]!;
  return {
    head: at(add(h, [0, 0, def.d.headR * 0.7])),
    chin: at(add(h, [0, -def.d.headR * 0.6, def.d.headR * 0.6])),
    body: at([0, hip + def.d.pelvisUp + def.d.abdomen * 0.9, def.base[P.hip + 2]! + def.d.chestD + 0.02]),
    legs: at([0.06, hip * 0.6, def.base[P.foot + 2]! * 0.6 + 0.07]),
    neck: at(add(h, [0, -def.d.headR * 1.3, -0.02])),
  };
}

export interface Built {
  track: Track;
  /** 当たる（または防がれる）瞬間 */
  impact: number;
  /** 動きに合わせて出す効果（時刻は技の始まりから） */
  fx?: FxLocal[];
}

/** 飛ばすもの：トランプ / ロケットパンチ / 光の玉 / 手裏剣 / 名刺 / タピオカの粒 / 氷のかけら / 金色のコイン / 放水（飛ばさず、水の線を走らせる） */
export type ShotKind = "cards" | "rocket" | "orb" | "shuriken" | "meishi" | "pearls" | "ice" | "coins" | "water";

/**
 * 動きに合わせて出す効果。at から until まで続く（一度きりのものは at だけ見る）。
 * - shot：飛ぶもの（at に手を離れ、until に届く）。detach：手を外して見せない（ロケットパンチ）
 * - hide：体を消す（消えて現れる）。smoke：煙（一度きり）
 * - wink・hearts・notes・frame・palm・sparkle：見せる技（ウインク・ハート・音符・光の枠・手のひらの光・きらめき）
 * - heal：やわらかい緑の光。bandage：腕の包帯。spoon：味見のスプーン。reboot：再起動（目の光が消え、光の線が走る）。steam：湯気
 * - laser：目から相手へ走る光の線。horn：クラクションの音の波。shake：シェイカーのしぶき。wisp：手から立つ白い煙
 * - ghost：その場に残る半透明の残像（一度きり）。dust：足もとの土ぼこり
 * - form：持ち物の形を持ちかえる（form の番号）。held：持ち物を反対の手（side）に移す。tray：トレイを盾にする（side の腕）
 * - water：筒先から相手へ走る水の線としぶき。vinyl：手もとで光るレコード。chart：光るグラフ（dir = 1 で上向き、-1 で下向き）。
 *   coinrain：降ってきて光るコイン。lift：ヘルメットを持ち上げて汗をぬぐう。phones：ヘッドホンを耳に当てる。
 *   chomp：恐竜のフードの口でかむ。roar：ほえる声の波（口も開く）。fluff：もふっとした綿のような粒（一度きり）。
 *   zanshin：足もとに静かに広がる光の輪。tail：しっぽを持ち上げて伸ばす（恐竜のしっぽで払う技）
 */
export type FxType =
  | "shot"
  | "detach"
  | "hide"
  | "smoke"
  | "wink"
  | "hearts"
  | "notes"
  | "frame"
  | "palm"
  | "sparkle"
  | "heal"
  | "bandage"
  | "spoon"
  | "reboot"
  | "steam"
  | "laser"
  | "horn"
  | "shake"
  | "wisp"
  | "ghost"
  | "dust"
  | "form"
  | "held"
  | "tray"
  | "water"
  | "vinyl"
  | "chart"
  | "coinrain"
  | "lift"
  | "phones"
  | "chomp"
  | "roar"
  | "fluff"
  | "zanshin"
  | "tail";

export interface FxLocal {
  type: FxType;
  at: number;
  until: number;
  /** 手を使う効果の手（左足前の向きで 0 = 左、1 = 右） */
  side?: 0 | 1;
  shot?: ShotKind;
  /** 持ちかえる持ち物の形（form） */
  form?: 1 | 2;
  /** グラフの向き（chart。1 = 上向き、-1 = 下向き） */
  dir?: 1 | -1;
}

export interface Fx extends FxLocal {
  /** 効果を出す人（技を出した人） */
  who: 0 | 1;
  /** 飛ぶもの・見せる技の相手 */
  target: 0 | 1;
  result: StageStrike["result"];
}

export type Result = StageStrike["result"];

export interface AttackCtx {
  att: Side;
  def: Side;
  dist: number;
  position: "standing" | "clinch" | "ground";
  /** 寝技のとき、攻める人が上か */
  onTop: boolean;
  result: Result;
  /** 位置関係が変わるときの、この技のあとの姿勢（攻める人・守る人）。いまの足もとから見た位置に直してある */
  after: { att: Pose; def: Pose } | null;
  /**
   * 技の中身（強化・弱体の付き方とダメージ）。同じ種類の技が 2 つ以上あるバックボーンで、どの技かを見分けるのに使う。
   * 返し技など、攻防の記録にない動きでは省く
   */
  strike?: Pick<StageStrike, "by" | "damage" | "effects" | "result">;
}

// ---- 攻める人の動き ----

/** 外したときは相手の頭の横を通す。防がれたときはガードの手前で止める */
export function aim(t: V3, result: Result, side: number): V3 {
  if (result === "whiff") return add(t, [side * 0.2, 0.06, 0.02]);
  if (result === "blocked") return add(t, [0, 0, -0.1]);
  return t;
}

/** 胸から見た位置を、足もとから見た位置にする（キーを書いている途中の姿勢で） */
export function chestPoint(d: PoseDesc, dims: BodyDims, v: V3): V3 {
  const f = chestFrame(pack(d), dims);
  return add(f.o, apply3(f.r, v));
}

/** 両手で持つ持ち物（竹刀・筒先）を持つ：右手を grip に、左手をその後ろ（dir の逆へ TWO_HAND_GAP）に置く */
export function hold2(k: KeyEdit, grip: V3, dir: V3) {
  k.hand(1, grip);
  k.hand(0, sub(grip, scale(norm(dir), TWO_HAND_GAP)));
}

/** 両腕を上げて頭を守る */
export function blockHigh(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
  d.neck[0] += 0.15;
  d.spine[0] += 0.06;
  d.shrug = [0.02, 0.02];
  d.elbow = [
    [0.15, -1, 0.1],
    [-0.15, -1, 0.1],
  ];
  d.fist = [
    [0.6, 1.2, 0],
    [0.6, -1.2, 0],
  ];
  const head = headCenter(pack(d), dims);
  k.hand(0, add(head, [0.07, 0.04, 0.13]));
  k.hand(1, add(head, [-0.07, 0.03, 0.12]));
}

/**
 * カバンを盾にする（サラリーマン）。右手のカバンを顔の前に立て、左手で横から支える。
 * カバンは手の下に垂らして持つので、前腕を立てると手の上に来る
 */
export function bagShield(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
  d.neck[0] += 0.12;
  d.spine[0] += 0.05;
  d.shrug = [0.015, 0.015];
  d.elbow = [
    [0.6, -1, 0.2],
    [-0.1, -1, 0.3],
  ];
  // カバンの広い面を相手へ向ける
  d.fist = [
    [0.6, 1.2, 0],
    [0, 1.57, 0],
  ];
  const head = headCenter(pack(d), dims);
  // 前腕を立てると、カバンが手の上に来て顔を隠す
  k.hand(1, add(head, [-0.05, -0.3, 0.2]));
  k.hand(0, add(head, [0.13, -0.16, 0.22]));
}

/** 竹刀で受ける（剣道家）：左手を低く、右手を高く右へ出して、竹刀を顔の前に斜めに立てる */
export function shinaiGuard(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
  d.neck[0] += 0.06;
  d.spine[0] += 0.04;
  d.shrug = [0.015, 0.015];
  d.elbow = [
    [0.5, -1, -0.2],
    [-0.3, -1, -0.2],
  ];
  const head = headCenter(pack(d), dims);
  k.hand(0, add(head, [0.15, -0.14, 0.28]));
  k.hand(1, add(head, [-0.03, -0.02, 0.35]));
}

/** 防火服で受ける（消防士）：肩を相手へ向けて背を丸め、両腕を顔の前で重ねる */
export function coatGuard(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
  d.hipRot[1] -= 0.35;
  d.spine[0] += 0.16;
  d.chest[1] -= 0.2;
  d.neck[0] += 0.2;
  d.neck[1] += 0.3;
  d.shrug = [0.03, 0.03];
  d.elbow = [
    [0.3, -1, 0.4],
    [-0.3, -1, 0.4],
  ];
  d.fist = [
    [0.6, 1.2, 0],
    [0.6, -1.2, 0],
  ];
  const head = headCenter(pack(d), dims);
  k.hand(0, add(head, [0.0, -0.06, 0.16]));
  k.hand(1, add(head, [-0.06, 0.02, 0.18]));
}

/** ヘッドホンで受ける（DJ）：両手でヘッドホンを耳に押し当て、ひじを前に寄せてあごを引く */
export function phonesGuard(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
  d.neck[0] += 0.18;
  d.spine[0] += 0.08;
  d.shrug = [0.03, 0.03];
  d.elbow = [
    [0.2, -0.6, 1],
    [-0.2, -0.6, 1],
  ];
  d.fist = [
    [0.2, 1.4, 0],
    [0.2, -1.4, 0],
  ];
  const head = headCenter(pack(d), dims);
  k.hand(0, add(head, [0.12, -0.03, 0.03]));
  k.hand(1, add(head, [-0.12, -0.03, 0.03]));
}

/** もふっと受ける（恐竜の着ぐるみ）：おなかを突き出して受け止め、両手を横へ広げて大きくのけぞる */
export function fluffGuard(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
  d.hip[2] += 0.06;
  d.hip[1] -= 0.03;
  d.spine[0] -= 0.22;
  d.chest[0] -= 0.16;
  d.neck[0] += 0.3;
  d.elbow = [
    [1, -0.3, -0.3],
    [-1, -0.3, -0.3],
  ];
  const c = chestPoint(d, dims, [0, dims.shoulderY - 0.1, 0]);
  k.hand(0, add(c, [0.36, 0.02, 0.1]));
  k.hand(1, add(c, [-0.36, 0.02, 0.1]));
}

/** バックボーンごとの受け方（頭・胴への技）。決めていない人は両腕で頭を守る */
export function guardOf(style: StyleId | null): (k: KeyEdit, d: PoseDesc, dims: BodyDims) => void {
  switch (style) {
    case "salaryman":
      return bagShield;
    case "kendo":
      return shinaiGuard;
    case "firefighter":
      return coatGuard;
    case "dj":
      return phonesGuard;
    case "dino":
      return fluffGuard;
    default:
      return blockHigh;
  }
}

/** すっと身を引く（投資家の損切り）：背すじを伸ばしたまま、静かに大きく下がる */
export function withdraw(d: PoseDesc, k: number) {
  shift(d, -0.3 * k);
  d.hip[1] += 0.005 * k;
  d.spine[0] -= 0.06 * k;
  d.chest[0] -= 0.04 * k;
  d.neck[0] += 0.04 * k;
  d.footRot[0][0] += 0.25 * k;
}

/** バックボーンごとのかわし方。決めていない人は頭を振ってひざを沈める */
export function awayOf(style: StyleId | null): (d: PoseDesc, k: number) => void {
  switch (style) {
    case "salaryman":
      return bow;
    case "investor":
      return withdraw;
    default:
      return slip;
  }
}

/** お辞儀をするように、腰から上体を深く倒して頭を下げ、相手の技の下をくぐる（サラリーマンのかわし） */
export function bow(d: PoseDesc, k: number) {
  d.hip[2] -= 0.12 * k;
  d.hip[1] -= 0.03 * k;
  d.hipRot[0] += 0.55 * k;
  d.spine[0] += 0.35 * k;
  d.chest[0] += 0.1 * k;
  d.neck[0] += 0.15 * k;
}

/** 頭を横へ振り、ひざを沈めてかわす。前かがみの構えでも頭が前へ出ないよう、腰を少し引く */
export function slip(d: PoseDesc, k: number) {
  d.hip[0] -= 0.08 * k;
  d.hip[1] -= 0.09 * k;
  d.hip[2] -= 0.08 * k;
  d.foot[1][2] -= 0.05 * k;
  d.spine[2] += 0.24 * k;
  d.spine[0] += 0.06 * k;
  d.neck[2] -= 0.1 * k;
}

/** 腰や胸をどうひねっても、顔は相手（+Z）へ向ける */
export function face(d: PoseDesc, pitch = 0.05) {
  const yaw = d.hipRot[1] + d.spine[1] + d.chest[1];
  const tilt = d.hipRot[0] + d.spine[0] + d.chest[0];
  const roll = d.hipRot[2] + d.spine[2] + d.chest[2];
  d.neck = [-tilt * 0.85 + pitch, -yaw * 0.9, -roll * 0.6];
}
