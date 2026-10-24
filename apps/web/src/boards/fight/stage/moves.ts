import { armLength, legLength, type BodyDims } from "./body.ts";
import { add, clamp, dist as distance, easings, type EaseName, type V3 } from "./math.ts";
import { chestFrame, edit, headCenter, lerpPose, P, pack, pelvisFrame, shoulderLocal, unpack, type Pose, type PoseDesc } from "./pose.ts";
import { apply3 } from "./math.ts";
import { clinchPose, downPose, groundBottomPose, groundTopPose, handRoot, stanceOf, withHands } from "./stances.ts";
import type { ActionKind, StageEvent, StageStrike, StyleId } from "./types.ts";

/**
 * 技の動き（キーフレーム）と、1 回の攻防（StageEvent）を再生する段取り。
 * 動きはどれも左足が前の構えで、その人の足もと（+Z が相手）から見た位置で作る。
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
interface KeyEdit {
  d: PoseDesc;
  /** 手首を、足もとから見た位置に置く（胸がどう動いたあとでも、そこへ届く） */
  hand(i: 0 | 1, at: V3): void;
}

class TrackBuilder {
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

function editKey(from: Pose, dims: BodyDims, edit: (k: KeyEdit) => void): Pose {
  const d = unpack(from);
  const hands: [V3 | null, V3 | null] = [null, null];
  // 書きかえる前の手首の位置（足もとから見て）。hand で決めなかった手は、胸についてくる
  edit({ d, hand: (i, at) => (hands[i] = at) });
  const pose = pack(d);
  return hands[0] || hands[1] ? withHands(pose, dims, hands) : pose;
}

// ---- 位置・姿勢をずらす道具 ----

/** 腰と両足を前（+Z）へ dz、横へ dx ずらす（踏み込み・下がる） */
function shift(d: PoseDesc, dz: number, dx = 0, feet: 0 | 1 | 2 = 2) {
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
function reachHand(k: KeyEdit, dims: BodyDims, i: 0 | 1, target: V3, slack = 0.97) {
  const pose = pack(k.d);
  const f = chestFrame(pose, dims);
  const sh = add(f.o, apply3(f.r, shoulderLocal(dims, i)));
  const short = distance(sh, target) - armLength(dims) * slack;
  if (short > 0) shift(k.d, Math.min(short, 0.45), 0, 0);
  k.hand(i, target);
}

/** 足首が target に届くよう、届かない分だけ軸足ごと踏み込む */
function reachFoot(d: PoseDesc, dims: BodyDims, i: 0 | 1, target: V3, slack = 0.98) {
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
function targetsOf(def: Side, dist: number) {
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

/** 技の当たる場所 */
export function zoneOf(kind: ActionKind): Zone {
  switch (kind) {
    case "kick_mid":
    case "knee":
    case "push":
      return "body";
    case "kick_low":
      return "legs";
    case "clinch":
    case "takedown":
    case "throw":
    case "submission":
      return "grab";
    default:
      return "head";
  }
}

const isDefense = (k: ActionKind) => k === "block" || k === "dodge";
/** 当たると位置関係が変わる技 */
const isGrapple = (k: ActionKind) => k === "clinch" || k === "takedown" || k === "throw" || k === "submission";

export interface Built {
  track: Track;
  /** 当たる（または防がれる）瞬間 */
  impact: number;
}

type Result = StageStrike["result"];

interface AttackCtx {
  att: Side;
  def: Side;
  dist: number;
  position: "standing" | "clinch" | "ground";
  /** 寝技のとき、攻める人が上か */
  onTop: boolean;
  result: Result;
  /** 位置関係が変わるときの、この技のあとの姿勢（攻める人・守る人）。いまの足もとから見た位置に直してある */
  after: { att: Pose; def: Pose } | null;
}

// ---- 攻める人の動き ----

/** 外したときは相手の頭の横を通す。防がれたときはガードの手前で止める */
function aim(t: V3, result: Result, side: number): V3 {
  if (result === "whiff") return add(t, [side * 0.2, 0.06, 0.02]);
  if (result === "blocked") return add(t, [0, 0, -0.1]);
  return t;
}

/** 立って打つ技 */
function standingAttack(kind: ActionKind, c: AttackCtx): Built {
  const { att, def, dist, result } = c;
  const dims = att.d;
  const tb = new TrackBuilder(att.base, dims);
  const T = targetsOf(def, dist);
  const sp = 1 - 0.08 * dims.speed; // すばやいほど少し速く
  const t = (v: number) => v * sp;
  const guard = (k: KeyEdit) => face(k.d, 0.12);

  switch (kind) {
    case "jab": {
      tb.at(t(0.07), 1, (k) => {
        shift(k.d, -0.02);
        k.d.hip[1] -= 0.012;
        k.d.hipRot[1] += 0.06;
      });
      const hit = tb.at(t(0.16), 1, (k) => {
        shift(k.d, 0.06, 0, 0);
        k.d.hipRot[1] -= 0.18;
        k.d.chest[1] -= 0.1;
        k.d.elbow[0] = [0.7, 0.5, -0.1];
        k.d.fist[0] = [0.1, -1.4, 0];
        guard(k);
        reachHand(k, dims, 0, aim(T.head, result, 1));
      }, "snap");
      tb.pose(t(0.25), 1, hit, "linear");
      tb.at(t(0.43), 1, (k) => shift(k.d, 0.02), "inOut");
      tb.at(t(0.58), 0);
      return { track: tb.build(), impact: t(0.16) };
    }
    case "straight":
    case "counter": {
      const slip = kind === "counter";
      if (slip)
        tb.at(t(0.1), 1, (k) => {
          k.d.hip[0] += 0.07;
          k.d.hip[1] -= 0.04;
          k.d.spine[2] -= 0.18;
          k.d.neck[2] += 0.1;
        });
      else
        tb.at(t(0.08), 1, (k) => {
          k.d.hip[1] -= 0.015;
          k.d.footRot[1][0] += 0.15;
        });
      const at = slip ? 0.26 : 0.22;
      const hit = tb.at(t(at), 1, (k) => {
        shift(k.d, 0.08, slip ? 0.05 : 0, 0);
        k.d.hipRot[1] += 0.55;
        k.d.chest[1] += 0.15;
        k.d.spine[0] += 0.06;
        k.d.footRot[1] = [0.55, k.d.footRot[1][1] + 0.55, 0];
        k.d.foot[1][1] += 0.03;
        k.d.elbow[1] = [-0.7, 0.5, -0.1];
        k.d.fist[1] = [0.1, 1.4, 0];
        if (slip) k.d.spine[2] -= 0.1;
        guard(k);
        reachHand(k, dims, 1, aim(T.head, result, -1));
      }, "snap");
      tb.pose(t(at + 0.09), 1, hit, "linear");
      tb.at(t(at + 0.3), 1, (k) => shift(k.d, 0.02));
      tb.at(t(at + 0.45), 0);
      return { track: tb.build(), impact: t(at) };
    }
    case "hook": {
      tb.at(t(0.1), 1, (k) => {
        k.d.hipRot[1] += 0.18;
        k.d.hip[1] -= 0.025;
        k.d.elbow[0] = [1, 0.5, -0.3];
      });
      tb.at(t(0.19), 1, (k) => {
        shift(k.d, 0.04, 0, 0);
        k.d.hipRot[1] -= 0.2;
        k.d.elbow[0] = [1, 0.9, 0];
        k.hand(0, add(T.head, [0.34, 0.0, -0.2]));
      }, "in");
      const hit = tb.at(t(0.27), 1, (k) => {
        shift(k.d, 0.05, 0, 0);
        k.d.hipRot[1] -= 0.55;
        k.d.chest[1] -= 0.2;
        k.d.footRot[0] = [0.35, k.d.footRot[0][1] - 0.5, 0];
        k.d.elbow[0] = [0.6, 1, 0.1];
        k.d.fist[0] = [0, -1.5, 0.3];
        guard(k);
        reachHand(k, dims, 0, aim(add(T.head, [0.08, 0, -0.03]), result, -1), 0.72);
      }, "snap");
      tb.pose(t(0.36), 1, hit, "linear");
      tb.at(t(0.58), 1, (k) => shift(k.d, 0.02));
      tb.at(t(0.72), 0);
      return { track: tb.build(), impact: t(0.27) };
    }
    case "uppercut": {
      tb.at(t(0.13), 1, (k) => {
        k.d.hip[1] -= 0.07;
        k.d.hipRot[1] -= 0.12;
        k.d.spine[2] += 0.12;
        k.d.spine[0] += 0.08;
        k.d.elbow[1] = [-0.3, -1, 0.2];
        k.hand(1, [-0.12, k.d.hip[1] + 0.25, 0.22]);
      });
      const hit = tb.at(t(0.27), 1, (k) => {
        shift(k.d, 0.08, 0, 0);
        k.d.hip[1] += 0.015;
        k.d.hipRot[1] += 0.45;
        k.d.chest[0] -= 0.12;
        k.d.chest[1] += 0.1;
        k.d.footRot[1] = [0.5, k.d.footRot[1][1] + 0.4, 0];
        k.d.elbow[1] = [-0.4, -1, -0.3];
        k.d.fist[1] = [-0.3, 0.3, 0];
        reachHand(k, dims, 1, aim(add(T.chin, [0, -0.04, -0.03]), result, -1), 0.85);
      }, "snap");
      tb.pose(t(0.35), 1, hit, "linear");
      tb.at(t(0.56), 1);
      tb.at(t(0.7), 0);
      return { track: tb.build(), impact: t(0.27) };
    }
    case "kick_high":
    case "kick_mid":
    case "kick_low": {
      // 後ろ足の回し蹴り。軸足を外へ返し、腰を左へ回して、すね・足の甲を横から当てる
      const target = kind === "kick_high" ? T.head : kind === "kick_mid" ? T.body : T.legs;
      const high = kind === "kick_high" ? 1 : kind === "kick_mid" ? 0.6 : 0.2;
      const end = aim(add(target, [0.12, 0, -0.04]), result, -1);
      tb.at(t(0.1), 1, (k) => {
        shift(k.d, 0.04, 0.03, 1);
        k.d.hip[1] -= 0.02;
        k.d.hipRot[1] += 0.25;
        k.hand(1, [-0.28, k.d.hip[1] + 0.2, -0.15]);
        face(k.d);
      });
      tb.at(t(0.21), 1, (k) => {
        shift(k.d, 0.07, 0.04, 1);
        k.d.hipRot = [0.05, 0.75 + 0.3 * high, -0.25 - 0.3 * high];
        k.d.spine[2] += 0.12 * high;
        k.d.chest[0] -= 0.08 * high;
        k.d.footRot[0] = [0.45, 1.0, 0];
        k.d.foot[0][1] += 0.04;
        k.d.foot[1] = [-0.22, 0.3 + 0.45 * high, 0.08];
        k.d.knee[1] = [0.3, 0.3, 1];
        k.d.footRot[1] = [0.9, 0.4, -0.6];
        k.hand(1, [-0.42, k.d.hip[1] + 0.25, -0.2]);
        face(k.d);
      }, "out");
      const hit = tb.at(t(0.32), 1, (k) => {
        shift(k.d, 0.08, 0.04, 1);
        k.d.hipRot = [0.08, 1.15 + 0.3 * high, -0.35 - 0.5 * high];
        k.d.spine[2] += 0.18 * high;
        k.d.chest[0] -= 0.14 * high;
        k.d.footRot[0] = [0.5, 1.45, 0];
        k.d.foot[0][1] += 0.05;
        k.d.knee[1] = [0.5, 0.6, 0.4];
        k.d.footRot[1] = [0.1, 0.5, -1.4];
        k.hand(1, [-0.48, k.d.hip[1] + 0.12, -0.3]);
        reachFoot(k.d, dims, 1, end);
        face(k.d);
      }, "snap");
      tb.pose(t(0.42), 1, hit, "linear");
      tb.at(t(0.6), 1, (k) => {
        shift(k.d, 0.04, 0.02, 1);
        k.d.hipRot = [0.05, 0.6, -0.2];
        k.d.foot[1] = [-0.15, 0.25 + 0.3 * high, 0.05];
        k.d.knee[1] = [0.3, 0.3, 1];
        k.d.footRot[0] = [0.3, 0.6, 0];
        face(k.d);
      });
      tb.at(t(0.78), 1, (k) => shift(k.d, 0.02));
      tb.at(t(0.92), 0);
      return { track: tb.build(), impact: t(0.32) };
    }
    case "spin_kick": {
      // 後ろ回し蹴り。背中を向けて回りながら、後ろ足のかかとを当てて、ひと回りして構えに戻る
      const end = aim(add(T.head, [0, -0.05, -0.08]), result, 1);
      const y0 = att.base[P.hipRot + 1]!;
      tb.at(t(0.12), 1, (k) => {
        k.d.hipRot[1] = y0 - 1.3;
        k.d.chest[1] -= 0.3;
        k.d.neck[1] += 0.9;
        k.d.footRot[0][1] -= 1.3;
        k.d.hip[1] -= 0.03;
      });
      tb.at(t(0.24), 1, (k) => {
        k.d.hipRot = [0.25, y0 - 2.7, 0.1];
        k.d.chest[1] -= 0.2;
        k.d.neck = [-0.2, 1.4, 0];
        k.d.footRot[0] = [0.3, k.d.footRot[0][1] - 2.4, 0];
        k.d.foot[1] = [0.05, 0.55, 0.15];
        k.d.knee[1] = [0, -0.3, 1];
        k.d.footRot[1] = [0.9, y0 - 2.6, 0];
      }, "in");
      const hit = tb.at(t(0.38), 1, (k) => {
        shift(k.d, 0.05, 0, 1);
        k.d.hipRot = [0.55, y0 - 3.1, 0.25];
        k.d.chest[1] -= 0.15;
        k.d.neck = [-0.45, 1.3, 0];
        k.d.footRot[0] = [0.3, k.d.footRot[0][1] - 2.6, 0];
        k.d.knee[1] = [0, -1, 0];
        k.d.footRot[1] = [0.2, y0 - 3.1, 0];
        reachFoot(k.d, dims, 1, end);
      }, "snap");
      tb.pose(t(0.48), 1, hit, "linear");
      tb.at(t(0.68), 1, (k) => {
        k.d.hipRot[1] = y0 - 4.6;
        k.d.chest[1] -= 0.1;
        k.d.neck[1] -= 0.4;
        k.d.footRot[0][1] -= 4.0;
        k.d.footRot[1][1] -= 4.6;
        k.d.foot[1] = [0.1, 0.35, -0.1];
      });
      // ひと回り（-2π）して、見た目は構えと同じ向きに戻る
      tb.at(t(0.92), 1, (k) => {
        k.d.hipRot[1] -= 2 * Math.PI;
        k.d.footRot[0][1] -= 2 * Math.PI;
        k.d.footRot[1][1] -= 2 * Math.PI;
      });
      return { track: tb.build(), impact: t(0.38) };
    }
    case "knee": {
      // 両手で相手の頭を引き寄せ、後ろ足のひざを胴へ突き上げる
      const body = aim(T.body, result, -1);
      // ひざが届く近さまで踏み込む
      const closeIn = Math.max(0, dist - 0.62);
      tb.at(t(0.12), 1, (k) => {
        shift(k.d, closeIn * 0.6);
        k.d.elbow = [
          [0.5, -1, -0.2],
          [-0.5, -1, -0.2],
        ];
        reachHand(k, dims, 0, add(T.neck, [0.06, 0, -0.06]), 0.95);
        reachHand(k, dims, 1, add(T.neck, [-0.06, 0, -0.06]), 0.95);
      });
      const hit = tb.at(t(0.26), 1, (k) => {
        shift(k.d, closeIn, 0, 0);
        k.d.hipRot[0] -= 0.25;
        k.d.hipRot[1] += 0.25;
        k.d.spine[0] += 0.05;
        k.d.footRot[0][0] += 0.4;
        k.d.foot[0][1] += 0.03;
        const knee: V3 = [body[0], body[1] - 0.03, body[2] - 0.05];
        k.d.foot[1] = [knee[0] - 0.02, knee[1] - dims.shin * 0.75, knee[2] - dims.shin * 0.55];
        k.d.knee[1] = [0, 0.4, 1];
        k.d.footRot[1] = [1.2, 0, 0];
        k.hand(0, add(T.neck, [0.06, -0.12, -0.12]));
        k.hand(1, add(T.neck, [-0.06, -0.12, -0.12]));
      }, "snap");
      tb.pose(t(0.36), 1, hit, "linear");
      tb.at(t(0.56), 1, (k) => shift(k.d, 0.03));
      tb.at(t(0.7), 0);
      return { track: tb.build(), impact: t(0.26) };
    }
    case "elbow": {
      // 前の手のひじを、横から振り抜く
      tb.at(t(0.1), 1, (k) => {
        k.d.hipRot[1] += 0.2;
        k.d.elbow[0] = [1, 0.4, 0.2];
        k.hand(0, add(chestPoint(k.d, dims, [0.16, dims.shoulderY + 0.14, 0.04]), [0, 0, 0]));
      });
      const hit = tb.at(t(0.21), 1, (k) => {
        shift(k.d, 0.12, 0, 0);
        k.d.hipRot[1] -= 0.55;
        k.d.chest[1] -= 0.25;
        k.d.footRot[0] = [0.3, k.d.footRot[0][1] - 0.4, 0];
        k.d.elbow[0] = [0.3, 0.5, 1];
        k.d.fist[0] = [0.4, -1, 0];
        const tgt = aim(T.head, result, -1);
        // ひじが当たるように、手首は相手の頭の手前・内側を通す
        k.hand(0, add(tgt, [-0.2, 0.03, -dims.forearm * 0.9]));
        reachHand(k, dims, 0, add(tgt, [-0.2, 0.03, -dims.forearm * 0.9]), 0.75);
      }, "snap");
      tb.pose(t(0.3), 1, hit, "linear");
      tb.at(t(0.52), 1);
      tb.at(t(0.66), 0);
      return { track: tb.build(), impact: t(0.21) };
    }
    case "push": {
      tb.at(t(0.12), 1, (k) => {
        k.d.hip[1] -= 0.03;
        k.hand(0, add(chestPoint(k.d, dims, [0.12, 0.12, 0.2]), [0, 0, 0]));
        k.hand(1, add(chestPoint(k.d, dims, [-0.12, 0.12, 0.2]), [0, 0, 0]));
      });
      const hit = tb.at(t(0.26), 1, (k) => {
        shift(k.d, 0.18);
        k.d.foot[0][2] += 0.1;
        k.d.hipRot[1] *= 0.5;
        k.d.spine[0] += 0.12;
        k.d.elbow = [
          [0.5, -1, -0.4],
          [-0.5, -1, -0.4],
        ];
        reachHand(k, dims, 0, add(T.body, [0.13, 0.12, -0.04]));
        k.hand(1, add(T.body, [-0.13, 0.12, -0.04]));
      }, "snap");
      tb.pose(t(0.36), 1, hit, "linear");
      tb.at(t(0.6), 1, (k) => shift(k.d, 0.05));
      tb.at(t(0.72), 0);
      return { track: tb.build(), impact: t(0.26) };
    }
    case "clinch": {
      // 踏み込んで、両手を相手の首にかける
      tb.at(t(0.14), 1, (k) => {
        shift(k.d, 0.12);
        k.d.hip[1] -= 0.03;
      });
      const grab = tb.at(t(0.3), 1, (k) => {
        shift(k.d, 0.3);
        k.d.spine[0] += 0.12;
        k.d.elbow = [
          [0.3, -1, -0.1],
          [-0.3, -1, -0.1],
        ];
        reachHand(k, dims, 0, add(T.neck, [0.07, 0.02, -0.02]), 0.85);
        k.hand(1, add(T.neck, [-0.1, -0.1, -0.05]));
      }, "out");
      if (c.after && result === "hit") {
        tb.pose(t(0.55), 1, c.after.att);
        return { track: tb.build(), impact: t(0.3) };
      }
      tb.pose(t(0.4), 1, grab, "linear");
      tb.at(t(0.7), 1, (k) => shift(k.d, -0.02));
      tb.at(t(0.85), 0);
      return { track: tb.build(), impact: t(0.3) };
    }
    case "takedown": {
      // 腰を落とし、深く踏み込んで相手の太ももを抱え、押し倒す
      tb.at(t(0.15), 1, (k) => {
        k.d.hip[1] -= 0.25;
        k.d.hipRot[0] += 0.45;
        k.d.neck[0] -= 0.35;
        shift(k.d, 0.05);
        k.hand(0, [0.15, k.d.hip[1] + 0.35, 0.35]);
        k.hand(1, [-0.15, k.d.hip[1] + 0.35, 0.35]);
      });
      const shoot = tb.at(t(0.34), 1, (k) => {
        k.d.hip[1] = legLength(dims) * 0.55;
        k.d.hipRot = [0.85, -0.15, 0];
        k.d.spine[0] += 0.2;
        k.d.neck[0] = -0.7;
        shift(k.d, 0.42, 0, 0);
        k.d.foot[0][2] += 0.15;
        k.d.foot[1] = [k.d.foot[1][0], 0.07, k.d.foot[1][2] + 0.25];
        k.d.footRot[1] = [1.2, -0.3, 0];
        k.d.knee[1] = [-0.2, -0.6, 1];
        k.d.elbow = [
          [0.6, -1, 0.2],
          [-0.6, -1, 0.2],
        ];
        k.hand(0, [0.16, 0.55, dist - 0.02]);
        k.hand(1, [-0.16, 0.5, dist - 0.02]);
      }, "out");
      if (c.after && result === "hit") {
        tb.at(t(0.58), 1, (k) => {
          shift(k.d, 0.2);
          k.d.hip[1] = 0.6;
          k.d.hipRot[0] = 0.9;
        }, "inOut", shoot);
        tb.pose(t(0.9), 1, c.after.att, "out");
        return { track: tb.build(), impact: t(0.34) };
      }
      tb.pose(t(0.5), 1, shoot, "linear");
      tb.at(t(0.85), 1, (k) => {
        k.d.hip[1] -= 0.08;
        shift(k.d, -0.05);
      });
      tb.at(t(1.05), 0);
      return { track: tb.build(), impact: t(0.34) };
    }
    case "throw": {
      // 襟と袖を取って崩し、足を払って投げる（大外刈りのように）
      tb.at(t(0.14), 1, (k) => {
        shift(k.d, 0.12);
        reachHand(k, dims, 0, add(T.neck, [0.05, -0.15, -0.08]), 0.9);
        k.hand(1, add(T.body, [-0.2, 0.05, -0.1]));
      });
      const kuzushi = tb.at(t(0.32), 1, (k) => {
        shift(k.d, 0.38, 0.1, 0);
        k.d.hipRot[1] += 0.3;
        k.d.spine[0] += 0.15;
        k.d.foot[1] = [-0.1, 0.25, 0.1];
        k.d.knee[1] = [0, 0, 1];
        reachHand(k, dims, 0, add(T.neck, [0.03, -0.2, -0.15]), 0.85);
        k.hand(1, add(T.body, [-0.25, 0.02, -0.2]));
      });
      const reap = tb.at(t(0.46), 1, (k) => {
        k.d.hipRot[0] += 0.55;
        k.d.spine[0] += 0.25;
        k.d.foot[1] = [-0.05, 0.55, -0.35];
        k.d.footRot[1] = [1.1, 0, 0];
        k.d.knee[1] = [0, -0.5, 1];
      }, "snap", kuzushi);
      if (c.after && result === "hit") {
        tb.pose(t(0.85), 1, c.after.att, "inOut");
        return { track: tb.build(), impact: t(0.72) };
      }
      tb.pose(t(0.56), 1, reap, "linear");
      tb.at(t(0.85), 1, (k) => shift(k.d, 0.05));
      tb.at(t(1.0), 0);
      return { track: tb.build(), impact: t(0.46) };
    }
    case "submission": {
      // 立ったまま首を抱えて絞める（ギロチン）
      tb.at(t(0.15), 1, (k) => {
        shift(k.d, 0.2);
        reachHand(k, dims, 0, add(T.neck, [-0.1, -0.1, 0.05]), 0.9);
        k.hand(1, add(T.neck, [-0.05, -0.18, -0.05]));
      });
      const lock = tb.at(t(0.4), 1, (k) => {
        shift(k.d, 0.24);
        k.d.hipRot[0] -= 0.2;
        k.d.spine[0] -= 0.1;
        k.d.shrug = [0.03, 0.03];
        k.d.elbow = [
          [0.8, 0.2, -0.5],
          [-0.8, -0.4, -0.5],
        ];
        k.hand(0, add(T.neck, [-0.12, -0.25, 0.05]));
        k.hand(1, add(T.neck, [-0.02, -0.32, -0.08]));
      }, "out");
      // 締める
      for (let i = 0; i < 3; i++) {
        tb.at(t(0.5 + i * 0.18), 1, (k) => {
          k.d.shrug = [0.04, 0.04];
          k.d.hipRot[0] -= 0.05;
        }, "inOut", lock);
        tb.pose(t(0.59 + i * 0.18), 1, lock);
      }
      tb.at(t(1.3), 0);
      return { track: tb.build(), impact: t(0.5) };
    }
    case "block": {
      tb.at(t(0.12), 1, (k) => blockHigh(k, k.d, dims), "out");
      tb.at(t(0.55), 1, (k) => blockHigh(k, k.d, dims));
      tb.at(t(0.75), 0);
      return { track: tb.build(), impact: t(0.12) };
    }
    case "dodge":
    default: {
      tb.at(t(0.14), 1, (k) => slip(k.d, 1), "out");
      tb.at(t(0.45), 1, (k) => slip(k.d, 0.9));
      tb.at(t(0.65), 0);
      return { track: tb.build(), impact: t(0.14) };
    }
  }
}

/** 胸から見た位置を、足もとから見た位置にする（キーを書いている途中の姿勢で） */
function chestPoint(d: PoseDesc, dims: BodyDims, v: V3): V3 {
  const f = chestFrame(pack(d), dims);
  return add(f.o, apply3(f.r, v));
}

/** 両腕を上げて頭を守る */
function blockHigh(k: KeyEdit, d: PoseDesc, dims: BodyDims) {
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

/** 頭を横へ振り、ひざを沈めてかわす。前かがみの構えでも頭が前へ出ないよう、腰を少し引く */
function slip(d: PoseDesc, k: number) {
  d.hip[0] -= 0.08 * k;
  d.hip[1] -= 0.09 * k;
  d.hip[2] -= 0.08 * k;
  d.foot[1][2] -= 0.05 * k;
  d.spine[2] += 0.24 * k;
  d.spine[0] += 0.06 * k;
  d.neck[2] -= 0.1 * k;
}

/** 腰や胸をどうひねっても、顔は相手（+Z）へ向ける */
function face(d: PoseDesc, pitch = 0.05) {
  const yaw = d.hipRot[1] + d.spine[1] + d.chest[1];
  const tilt = d.hipRot[0] + d.spine[0] + d.chest[0];
  const roll = d.hipRot[2] + d.spine[2] + d.chest[2];
  d.neck = [-tilt * 0.85 + pitch, -yaw * 0.9, -roll * 0.6];
}

/** 寝技で打つ・極める */
function groundAttack(kind: ActionKind, c: AttackCtx): Built {
  const { att, def, dist, result, onTop } = c;
  const dims = att.d;
  const tb = new TrackBuilder(att.base, dims);
  if (onTop) {
    // 下の人の頭は、こちらの足もとから dist 先・その奥
    const head: V3 = [0, 0.16, dist + legLength(def.d) * 0.12 + def.d.pelvisUp + def.d.abdomen + def.d.chestH + 0.1];
    if (kind === "submission") {
      // 上から肩で首を固めて絞める
      tb.at(0.2, 1, (k) => {
        k.d.hipRot[0] += 0.4;
        k.d.hip[2] += 0.15;
        k.d.hip[1] -= 0.08;
        k.hand(0, add(head, [0.12, 0.05, 0.05]));
        k.hand(1, add(head, [-0.1, 0.05, -0.05]));
      });
      const lock = tb.at(0.45, 1, (k) => {
        k.d.hipRot[0] += 0.55;
        k.d.hip[2] += 0.25;
        k.d.hip[1] -= 0.12;
        k.d.shrug = [0.04, 0.04];
        k.hand(0, add(head, [0.0, 0.08, 0.12]));
        k.hand(1, add(head, [-0.12, 0.06, 0.0]));
      }, "out");
      for (let i = 0; i < 3; i++) {
        tb.at(0.56 + i * 0.18, 1, (k) => (k.d.hip[1] -= 0.02), "inOut", lock);
        tb.pose(0.65 + i * 0.18, 1, lock);
      }
      tb.at(1.35, 0);
      return { track: tb.build(), impact: 0.56 };
    }
    // 上から打ち下ろす
    const i: 0 | 1 = kind === "jab" || kind === "hook" || kind === "elbow" ? 0 : 1;
    tb.at(0.14, 1, (k) => {
      k.d.hipRot[0] -= 0.15;
      k.d.hip[1] += 0.05;
      k.hand(i, add(chestPoint(k.d, dims, [i === 0 ? 0.2 : -0.2, dims.shoulderY + 0.12, -0.05]), [0, 0, 0]));
    });
    const hit = tb.at(0.26, 1, (k) => {
      k.d.hipRot[0] += 0.15;
      k.d.spine[0] += 0.1;
      k.d.hip[2] += 0.06;
      k.d.elbow[i] = [i === 0 ? 0.6 : -0.6, 0.4, 0];
      reachHand(k, dims, i, aim(head, result, i === 0 ? 1 : -1));
    }, "snap");
    tb.pose(0.34, 1, hit, "linear");
    tb.at(0.55, 1);
    tb.at(0.68, 0);
    return { track: tb.build(), impact: 0.26 };
  }
  // 下から：極め技は脚を上げて相手の首と腕をはさむ。打撃は下から突き上げる
  const topHead: V3 = [0, 0.95, dist - 0.05];
  if (kind === "submission" || kind === "throw" || kind === "takedown") {
    tb.at(0.2, 1, (k) => {
      k.d.hipRot[0] -= 0.25;
      k.d.hip[1] += 0.06;
      k.hand(0, add(topHead, [0.15, -0.3, -0.1]));
      k.hand(1, add(topHead, [0.1, -0.35, -0.15]));
    });
    const lock = tb.at(0.48, 1, (k) => {
      k.d.hipRot[0] -= 0.45;
      k.d.hip[1] += 0.1;
      k.d.foot[0] = [0.25, 0.95, dist + 0.05];
      k.d.foot[1] = [-0.2, 1.0, dist - 0.05];
      k.d.knee = [
        [1, 0.3, 0],
        [-1, 0.3, 0],
      ];
      k.hand(0, add(topHead, [0.1, -0.35, -0.2]));
      k.hand(1, add(topHead, [0.02, -0.38, -0.2]));
    }, "out");
    for (let i = 0; i < 2; i++) {
      tb.at(0.62 + i * 0.2, 1, (k) => (k.d.hipRot[0] -= 0.08), "inOut", lock);
      tb.pose(0.72 + i * 0.2, 1, lock);
    }
    tb.at(1.3, 0);
    return { track: tb.build(), impact: 0.62 };
  }
  const kick = kind.startsWith("kick") || kind === "spin_kick" || kind === "knee";
  if (kick) {
    // 下から蹴り上げる
    const hit = tb.at(0.24, 1, (k) => {
      k.d.hipRot[0] -= 0.2;
      k.d.foot[1] = aim([0, 0.95, dist - 0.1], result, -1);
      k.d.knee[1] = [0, 1, 0];
      k.d.footRot[1] = [-0.6, 0, 0];
    }, "snap");
    tb.pose(0.34, 1, hit, "linear");
    tb.at(0.58, 0);
    return { track: tb.build(), impact: 0.24 };
  }
  const i: 0 | 1 = kind === "jab" || kind === "hook" ? 0 : 1;
  const hit = tb.at(0.22, 1, (k) => {
    k.d.chest[0] += 0.25;
    k.d.neck[0] += 0.2;
    k.d.elbow[i] = [i === 0 ? 0.6 : -0.6, 0.3, 0];
    reachHand(k, dims, i, aim(topHead, result, i === 0 ? 1 : -1));
  }, "snap");
  tb.pose(0.3, 1, hit, "linear");
  tb.at(0.5, 1);
  tb.at(0.62, 0);
  return { track: tb.build(), impact: 0.22 };
}

/** 組み合いの中で打つ。打撃は短く、組み技はそのまま */
function clinchAttack(kind: ActionKind, c: AttackCtx): Built {
  if (kind === "jab" || kind === "straight" || kind === "counter") return standingAttack("uppercut", c);
  if (kind.startsWith("kick") || kind === "spin_kick") return standingAttack("knee", c);
  return standingAttack(kind, c);
}

export function attackTrack(kind: ActionKind, c: AttackCtx): Built {
  if (c.position === "ground") return groundAttack(kind, c);
  if (c.position === "clinch") return clinchAttack(kind, c);
  return standingAttack(kind, c);
}

// ---- 受ける人の動き ----

interface ReactCtx {
  me: Side;
  /** 攻めた技 */
  kind: ActionKind;
  zone: Zone;
  result: Result;
  /** 当たりの強さ（ダメージから。0.5〜1.5） */
  power: number;
  position: "standing" | "clinch" | "ground";
  onTop: boolean;
  after: Pose | null;
  /** 攻める人が技を出しはじめてから当たるまで */
  lead: number;
}

/**
 * 受ける人の動き。返す track の 0 秒が、技が当たる瞬間（lead 秒前から構えはじめる）
 */
export function reactionTrack(c: ReactCtx): { track: Track; offset: number } {
  const { me, zone, result, power: k, kind } = c;
  const dims = me.d;
  const tb = new TrackBuilder(me.base, dims);
  const lead = c.lead;
  const T = (v: number) => lead + v;
  const lying = c.position === "ground" && !c.onTop;

  if (result === "whiff") {
    // 空振り：少しだけ身を引く
    tb.at(T(-0.05), 0);
    tb.at(T(0.1), 0.6, (d) => shift(d.d, -0.03));
    tb.at(T(0.4), 0);
    return { track: tb.build(), offset: 0 };
  }
  if (result === "blocked") {
    // 防ぐ：上はガード、胴はひじで、下はすねで受ける
    tb.at(T(-0.14), 0);
    const block = (kk: KeyEdit) => {
      if (lying) {
        blockHigh(kk, kk.d, dims);
        return;
      }
      if (zone === "legs" || (zone === "body" && kind.startsWith("kick"))) {
        kk.d.foot[0] = [kk.d.foot[0][0] + 0.08, 0.32, kk.d.foot[0][2] + 0.05];
        kk.d.knee[0] = [1, 0.3, 1];
        kk.d.footRot[0] = [0.6, 0.4, 0];
        kk.d.hip[2] -= 0.04;
        kk.d.hip[0] -= 0.04;
        kk.d.elbow[0] = [0.1, -1, 0.2];
      } else if (zone === "body") {
        kk.d.spine[0] += 0.12;
        kk.d.elbow = [
          [0.1, -1, 0.3],
          [-0.1, -1, 0.3],
        ];
      } else if (zone === "grab") {
        // タックルや投げをこらえる（脚を引いて腰を落とす）
        shift(kk.d, -0.18, 0, 1);
        kk.d.hip[1] -= 0.12;
        kk.d.hipRot[0] += 0.5;
        kk.d.foot[1][2] -= 0.2;
      } else blockHigh(kk, kk.d, dims);
    };
    tb.at(T(0), 1, block, "out");
    tb.at(T(0.08), 1, (kk) => {
      block(kk);
      shift(kk.d, -0.05 * k);
    }, "out");
    tb.at(T(0.36), 1, block);
    tb.at(T(0.55), 0);
    return { track: tb.build(), offset: 0 };
  }
  if (result === "dodged") {
    tb.at(T(-0.16), 0);
    const away = (kk: KeyEdit) => {
      if (lying) {
        kk.d.hipRot[2] += 0.35;
        kk.d.neck[1] += 0.6;
        kk.d.hip[0] += 0.1;
        return;
      }
      if (zone === "head") slip(kk.d, 1);
      else {
        shift(kk.d, -0.26);
        kk.d.chest[0] -= 0.12;
        kk.d.hip[1] += 0.01;
      }
    };
    tb.at(T(0.02), 1, away, "out");
    tb.at(T(0.32), 1, away);
    tb.at(T(0.55), 0);
    return { track: tb.build(), offset: 0 };
  }
  // 当たった（hit）・返された（countered は攻めた人の側で使う）
  if (c.after && (kind === "takedown" || kind === "throw")) {
    // 倒される：浮いて、あお向けに落ちる
    tb.at(T(-0.05), 0);
    tb.at(T(0.08), 1, (kk) => {
      kk.d.hip[2] -= 0.06;
      kk.d.spine[0] -= 0.1;
      kk.d.neck[0] += 0.2;
      kk.d.hand = [
        [kk.d.hand[0][0] + 0.06, kk.d.hand[0][1] + 0.08, kk.d.hand[0][2]],
        [kk.d.hand[1][0] - 0.06, kk.d.hand[1][1] + 0.08, kk.d.hand[1][2]],
      ];
    }, "out");
    const air = tb.at(T(kind === "throw" ? 0.3 : 0.24), 1, (kk) => {
      kk.d.hip = [kk.d.hip[0], kk.d.hip[1] * (kind === "throw" ? 1.0 : 0.85), kk.d.hip[2] - 0.2];
      kk.d.hipRot = [-0.9, kk.d.hipRot[1] * 0.4, 0.1];
      kk.d.spine[0] = 0.1;
      kk.d.neck[0] = 0.5;
      kk.d.foot[0] = [0.15, 0.45, 0.25];
      kk.d.foot[1] = [-0.15, kind === "throw" ? 0.7 : 0.3, 0.35];
      kk.d.knee = [
        [0.3, 1, 0.5],
        [-0.3, 1, 0.5],
      ];
    }, "inOut");
    void air;
    tb.pose(T(kind === "throw" ? 0.5 : 0.5), 1, c.after, "in");
    // 落ちた反動
    tb.at(T(0.62), 1, (kk) => {
      kk.d.hip[1] += 0.03;
      kk.d.neck[0] -= 0.25;
    }, "out", c.after);
    tb.pose(T(0.8), 1, c.after);
    return { track: tb.build(), offset: 0 };
  }
  if (zone === "grab" || kind === "submission") {
    // 組まれた・極められた：もがいて、極まったら相手をたたいて参ったをする
    tb.at(T(-0.1), 0);
    const struggle = (kk: KeyEdit, s: number) => {
      if (lying) {
        kk.d.hipRot[2] += 0.12 * s;
        kk.d.foot[0][1] += 0.12 * Math.max(0, s);
        kk.d.foot[1][1] += 0.12 * Math.max(0, -s);
      } else {
        kk.d.spine[0] += 0.4;
        kk.d.hipRot[0] += 0.2;
        kk.d.neck[0] += 0.2;
        kk.d.hip[0] += 0.03 * s;
      }
    };
    tb.at(T(0.1), 1, (kk) => struggle(kk, 1), "out");
    tb.at(T(0.3), 1, (kk) => struggle(kk, -1));
    if (kind === "submission") {
      // 3 回たたく
      for (let i = 0; i < 3; i++) {
        tb.at(T(0.45 + i * 0.16), 1, (kk) => {
          struggle(kk, 0.3);
          kk.d.elbow[0] = [1, 0.4, 0];
          kk.d.fist[0] = [1.2, 0, 0];
        }, "out");
        tb.at(T(0.53 + i * 0.16), 1, (kk) => {
          struggle(kk, 0.3);
          kk.d.elbow[0] = [1, -0.3, 0];
          const h = kk.d.hand[0];
          kk.d.hand[0] = [h[0] + 0.12, h[1] - 0.12, h[2]];
        }, "in");
      }
      tb.at(T(1.15), 0);
    } else if (c.after) {
      tb.pose(T(0.4), 1, c.after);
    } else tb.at(T(0.55), 0);
    return { track: tb.build(), offset: 0 };
  }
  // 打撃が当たった：頭はのけぞり、胴は体を折り、脚はひざが崩れる
  tb.at(T(-0.03), 0);
  if (zone === "head") {
    const hook = kind === "hook" || kind === "kick_high" || kind === "spin_kick" || kind === "elbow";
    const upper = kind === "uppercut" || kind === "knee";
    tb.at(T(0.05), 1, (kk) => {
      kk.d.neck[0] -= (upper ? 0.55 : 0.4) * k;
      kk.d.neck[1] += hook ? 0.55 * k : 0;
      kk.d.neck[2] += hook ? 0.15 * k : 0;
      kk.d.chest[0] -= 0.2 * k;
      kk.d.spine[0] -= 0.12 * k;
      kk.d.chest[1] += hook ? 0.15 * k : 0;
      kk.d.shrug = [0.02, 0.02];
      if (!lying) shift(kk.d, -0.05 * k, 0, 2);
      else kk.d.neck[1] += 0.5 * k;
    }, "snap");
    tb.at(T(0.24), 1, (kk) => {
      kk.d.neck[0] -= 0.12 * k;
      kk.d.neck[1] += hook ? 0.25 * k : 0;
      kk.d.chest[0] -= 0.1 * k;
      if (!lying) {
        shift(kk.d, -0.14 * k);
        kk.d.foot[1][2] -= 0.08 * k;
        kk.d.hip[1] -= 0.03 * k;
      }
    }, "out");
  } else if (zone === "body") {
    tb.at(T(0.05), 1, (kk) => {
      kk.d.spine[0] += 0.4 * k;
      kk.d.chest[0] += 0.18 * k;
      kk.d.neck[0] += 0.1 * k;
      kk.d.hip[1] -= 0.04 * k;
      kk.d.hipRot[0] -= 0.12 * k;
      if (!lying) shift(kk.d, -0.08 * k);
      kk.d.elbow = [
        [0.2, -1, 0.4],
        [-0.2, -1, 0.4],
      ];
    }, "snap");
    tb.at(T(0.26), 1, (kk) => {
      kk.d.spine[0] += 0.3 * k;
      kk.d.chest[0] += 0.1 * k;
      if (!lying) shift(kk.d, -0.15 * k);
      kk.d.hip[1] -= 0.05 * k;
      const hip = kk.d.hip;
      kk.hand(0, [hip[0] + 0.07, hip[1] + 0.22, hip[2] + 0.18]);
      kk.hand(1, [hip[0] - 0.05, hip[1] + 0.25, hip[2] + 0.2]);
    }, "out");
  } else {
    // 脚：前足のひざが内へ崩れる
    tb.at(T(0.05), 1, (kk) => {
      kk.d.foot[0] = [kk.d.foot[0][0] - 0.05, kk.d.foot[0][1] + 0.06, kk.d.foot[0][2] - 0.04];
      kk.d.knee[0] = [-0.6, 0, 1];
      kk.d.hip[1] -= 0.07 * k;
      kk.d.hipRot[2] += 0.12 * k;
      kk.d.spine[2] -= 0.1 * k;
      kk.d.neck[0] += 0.1;
    }, "snap");
    tb.at(T(0.28), 1, (kk) => {
      kk.d.hip[1] -= 0.05 * k;
      kk.d.hipRot[2] += 0.06 * k;
      shift(kk.d, -0.08, 0, 1);
    }, "out");
  }
  tb.at(T(0.62), 1, (kk) => shift(kk.d, -0.02));
  tb.at(T(0.82), 0);
  return { track: tb.build(), offset: 0 };
}

/** 倒れる（KO）。ひざが抜け、後ろへ崩れて、あお向けに倒れる */
export function fallTrack(me: Side, down: Pose): Track {
  const dims = me.d;
  const tb = new TrackBuilder(me.base, dims);
  const lying = me.base[P.hip + 1]! < 0.35;
  if (!lying) {
    tb.at(0.14, 1, (k) => {
      k.d.hip[1] -= 0.16;
      k.d.spine[0] += 0.2;
      k.d.neck[0] += 0.35;
      k.d.elbow = [
        [0.4, -1, 0],
        [-0.4, -1, 0],
      ];
      const hip = k.d.hip;
      k.hand(0, [hip[0] + 0.2, hip[1] + 0.1, hip[2] + 0.1]);
      k.hand(1, [hip[0] - 0.2, hip[1] + 0.1, hip[2] + 0.05]);
    }, "out");
    tb.at(0.46, 1, (k) => {
      k.d.hip = [0, legLength(dims) * 0.55, -0.25];
      k.d.hipRot = [-0.75, 0, 0.1];
      k.d.spine[0] = 0;
      k.d.neck = [0.3, 0.3, 0];
      k.d.foot[0] = [0.15, 0.1, 0.35];
      k.d.knee = [
        [0.3, 1, 1],
        [-0.3, 1, 1],
      ];
      const hip = k.d.hip;
      k.hand(0, [hip[0] + 0.35, hip[1] + 0.35, hip[2] - 0.1]);
      k.hand(1, [hip[0] - 0.35, hip[1] + 0.4, hip[2] - 0.15]);
    }, "inOut");
    tb.pose(0.78, 1, down, "in");
    tb.at(0.9, 1, (k) => {
      k.d.hip[1] += 0.025;
      k.d.neck[0] -= 0.2;
      k.d.chest[0] -= 0.06;
    }, "out", down);
    tb.pose(1.08, 1, down, "inOut");
  } else {
    tb.pose(0.6, 1, down, "inOut");
  }
  return tb.build();
}

/** 勝った人：少し下がって、こぶしを上げる */
export function victoryTrack(me: Side, length: number): Track {
  const dims = me.d;
  const tb = new TrackBuilder(me.base, dims);
  const lying = me.base[P.hip + 1]! < 0.65;
  if (lying) {
    tb.at(0.5, 0);
    tb.at(length, 0);
    return tb.build();
  }
  const up = (k: KeyEdit) => {
    shift(k.d, -0.2);
    k.d.hip[1] += 0.03;
    k.d.spine[0] -= 0.05;
    k.d.chest[0] -= 0.12;
    k.d.neck[0] -= 0.15;
    k.d.elbow[1] = [-1, 0.2, -0.3];
    k.d.fist[1] = [0.3, -0.6, 0];
    const h = headCenter(pack(k.d), dims);
    k.hand(1, add(h, [-0.18, 0.38, 0.0]));
    k.hand(0, handRoot(me.base, dims, 0));
  };
  tb.at(0.35, 0);
  tb.at(0.9, 1, up, "inOut");
  tb.at(length, 1, up, "linear");
  return tb.build();
}

/** 位置関係が変わるときの、ゆっくりした移り変わり（立つ・組む・寝る）。最後は to の姿勢で w = 1 */
export function transitionTrack(me: Side, to: Pose, length = 0.7): Track {
  const tb = new TrackBuilder(me.base, me.d);
  const fromLow = me.base[P.hip + 1]! < 0.65;
  const toLow = to[P.hip + 1]! < 0.65;
  if (fromLow !== toLow) {
    // 立ち上がる・しゃがむ途中で、しゃがんだ姿勢を通る（あお向けからは、まず起き上がる）
    const low = fromLow ? me.base : to;
    const lying = low[P.hipRot]! < -0.6;
    const z = low[P.hip + 2]!;
    const crouch = crouchPose(me.d, z);
    if (lying && fromLow) {
      const sit = edit(me.base, (d) => {
        d.hip = [0, 0.2, z];
        d.hipRot = [-0.55, 0, 0];
        d.spine = [0.25, 0, 0];
        d.chest = [0.15, 0, 0];
        d.neck = [0.2, 0, 0];
        d.foot = [
          [0.16, me.d.ankleH, z + 0.42],
          [-0.16, me.d.ankleH, z + 0.36],
        ];
        d.footRot = [
          [0, 0.2, 0],
          [0, -0.2, 0],
        ];
        d.knee = [
          [0.3, 1, 0.5],
          [-0.3, 1, 0.5],
        ];
      });
      tb.pose(length * 0.35, 1, sit, "out");
    }
    tb.pose(length * (fromLow ? 0.68 : 0.45), 1, crouch, "inOut");
    if (!fromLow && lying) {
      const sit = edit(to, (d) => {
        d.hip = [0, 0.22, z];
        d.hipRot = [-0.5, 0, 0];
        d.spine = [0.25, 0, 0];
      });
      tb.pose(length * 0.75, 1, sit, "inOut");
    }
  }
  tb.pose(length, 1, to, "inOut");
  return tb.build();
}

/** しゃがんだ姿勢（立ち上がる・倒れる途中に通る） */
function crouchPose(d: BodyDims, z: number): Pose {
  const desc: PoseDesc = {
    hip: [0, legLength(d) * 0.52, z],
    hipRot: [0.55, 0, 0],
    spine: [0.15, 0, 0],
    chest: [0.05, 0, 0],
    neck: [-0.6, 0, 0],
    shrug: [0, 0],
    hand: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    elbow: [
      [0.4, -1, -0.2],
      [-0.4, -1, -0.2],
    ],
    fist: [
      [0.3, 0.6, 0],
      [0.3, -0.6, 0],
    ],
    foot: [
      [0.17, d.ankleH, z + 0.12],
      [-0.17, d.ankleH, z - 0.08],
    ],
    footRot: [
      [0, 0.15, 0],
      [0.3, -0.3, 0],
    ],
    knee: [
      [0.3, 0, 1],
      [-0.3, 0, 1],
    ],
    breath: 0,
  };
  const p = pack(desc);
  return withHands(p, d, [
    [0.2, legLength(d) * 0.55, z + 0.28],
    [-0.2, legLength(d) * 0.55, z + 0.22],
  ]);
}

// ---- 1 回の攻防の段取り ----

export type Position = StageEvent["position"];

export interface ExchangeCtx {
  sides: [Side, Side];
  position: Position;
  /** 寝技のとき上にいる人 */
  top: 0 | 1;
  /** 2 人の足もとの間 */
  dist: number;
}

export interface Clip {
  who: 0 | 1;
  start: number;
  track: Track;
  /** 技を出す手足（左足前の向きで 0 = 左、1 = 右）と、軌跡を見せる時刻（start からの秒） */
  limb?: Limb;
}

export interface Limb {
  part: "hand" | "foot";
  side: 0 | 1;
  from: number;
  to: number;
}

/** 技を出す手足。軌跡（残像）を見せるのに使う。組み技・守りの技はなし */
export function limbOf(kind: ActionKind, position: Position, impact: number): Limb | null {
  const at = (part: Limb["part"], side: 0 | 1, lead = 0.16): Limb => ({ part, side, from: Math.max(0, impact - lead), to: impact + 0.06 });
  if (position === "ground") return kind === "submission" || kind === "throw" || kind === "takedown" || isDefense(kind) ? null : at("hand", 1, 0.12);
  switch (kind) {
    case "jab":
    case "hook":
      return at("hand", 0);
    case "straight":
    case "counter":
      return at("hand", 1);
    case "uppercut":
      return at("hand", 1, 0.14);
    case "elbow":
      return null;
    case "kick_high":
    case "kick_mid":
    case "kick_low":
      return at("foot", 1, 0.14);
    case "spin_kick":
      return at("foot", 1, 0.18);
    default:
      return null;
  }
}

export interface Impact {
  at: number;
  /** 当たった（受けた）人 */
  target: 0 | 1;
  by: 0 | 1;
  zone: Zone;
  result: Result;
  damage: number;
  kind: ActionKind;
}

export interface Exchange {
  clips: Clip[];
  impacts: Impact[];
  /** 位置関係を切りかえる時刻（新しい構えになる） */
  switchAt: number;
  position: Position;
  top: 0 | 1;
  dist: number;
  /** 倒れる人と、倒れ終わる時刻 */
  ko: { who: 0 | 1; at: number; downAt: number } | null;
  end: number;
}

/** 位置関係ごとの、2 人の足もとの間 */
export function distOf(position: Position, sides?: [Side, Side]): number {
  if (position === "clinch") return 0.6;
  if (position === "ground") return 0.62;
  // 腕の長い人どうしは少し離れる。構えで手を前へ出す人どうしでも、手が重ならないようにする
  const reach = sides ? (armLength(sides[0].d) + armLength(sides[1].d)) / 2 : 0.56;
  const base = 1.12 + (reach - 0.56) * 1.2;
  if (!sides) return base;
  const front = (s: Side) => Math.max(handRoot(s.base, s.d, 0)[2], handRoot(s.base, s.d, 1)[2], 0);
  return Math.max(base, front(sides[0]) + front(sides[1]) + 0.14);
}

/** 位置関係ごとの構え（左足前の向き、その人の足もとから見て） */
export function basePoseOf(side: Side, position: Position, role: "top" | "bottom" | null, dist: number, downed = false): Pose {
  if (downed) return downPose(side.d);
  if (position === "clinch") return clinchPose(side.style, side.d, dist, side.mirror);
  if (position === "ground") return role === "top" ? groundTopPose(side.d, dist) : groundBottomPose(side.d, dist);
  return stanceOf(side.style, side.d);
}

/** ダメージから、当たりの強さ（0.6〜1.4） */
export const powerOf = (damage: number) => clamp(0.6 + damage / 25, 0.6, 1.4);

/** 守りの技（block / dodge）のうち、となりの技の結果ですでに見せられるものを省く */
export function mergeStrikes(strikes: StageStrike[]): StageStrike[] {
  return strikes.filter((s, i) => {
    if (!isDefense(s.kind)) return true;
    const near = [strikes[i - 1], strikes[i + 1]].filter((x): x is StageStrike => !!x && x.by !== s.by && !isDefense(x.kind));
    return !near.some((x) => (s.kind === "block" ? x.result === "blocked" : x.result === "dodged"));
  });
}

/**
 * 1 回の攻防の段取りを作る。技を順に出し、受ける人の動き・当たる瞬間・位置関係の切りかえ・KO を並べる
 */
export function buildExchange(ev: StageEvent, ctx: ExchangeCtx): Exchange {
  const clips: Clip[] = [];
  const impacts: Impact[] = [];
  const strikes = mergeStrikes(ev.strikes);
  let t = 0.15;
  let position = ctx.position;
  let top = ctx.top;
  let dist = ctx.dist;
  const sides: [Side, Side] = [ctx.sides[0], ctx.sides[1]];
  let switched = false;
  let switchAt = -1;

  const roleOf = (who: 0 | 1, pos: Position, tp: 0 | 1) => (pos === "ground" ? (who === tp ? "top" : "bottom") : null);

  strikes.forEach((s, i) => {
    const a = s.by;
    const d: 0 | 1 = a === 0 ? 1 : 0;
    const zone = zoneOf(s.kind);
    // 当たると位置関係が変わる組み技（このあとの位置へ、技の流れのまま移る）
    let after: { att: Pose; def: Pose } | null = null;
    let nextPos: Position | null = null;
    let nextTop = top;
    if (!switched && s.result === "hit" && isGrapple(s.kind) && ev.position !== position) {
      nextPos = ev.position;
      nextTop = ev.position === "ground" && (s.kind === "takedown" || s.kind === "throw") ? a : top;
      const nd = distOf(nextPos, sides);
      const dz = (dist - nd) / 2;
      const att = basePoseOf(sides[a], nextPos, roleOf(a, nextPos, nextTop), nd);
      const def = basePoseOf(sides[d], nextPos, roleOf(d, nextPos, nextTop), nd);
      after = { att: shiftPose(att, dz), def: shiftPose(def, dz) };
    }
    const built = attackTrack(s.kind, {
      att: sides[a],
      def: sides[d],
      dist,
      position,
      onTop: position === "ground" && top === a,
      result: s.result,
      after,
    });
    // 組み合いの中では、突きは短いアッパーに、蹴りはひざになる（clinchAttack と同じ置きかえ）
    const eff: ActionKind =
      position !== "clinch" ? s.kind : s.kind === "jab" || s.kind === "straight" || s.kind === "counter" ? "uppercut" : s.kind.startsWith("kick") || s.kind === "spin_kick" ? "knee" : s.kind;
    const limb = limbOf(eff, position, built.impact);
    clips.push({ who: a, start: t, track: built.track, ...(limb ? { limb } : {}) });
    const impactAt = t + built.impact;
    let next = t + Math.max(built.impact + 0.45, built.track.end - 0.1);

    if (!isDefense(s.kind)) {
      const following = strikes[i + 1];
      if (s.result === "countered") {
        const stuffed = following && following.by === d;
        // 技を返される：受けた人がかわし、そのまま返す。次の技が返し技なら、それに任せる
        const dodge = reactionTrack({
          me: sides[d],
          kind: s.kind,
          zone,
          result: "dodged",
          power: 1,
          position,
          onTop: position === "ground" && top === d,
          after: null,
          lead: 0.16,
        });
        clips.push({ who: d, start: impactAt - 0.16, track: dodge.track });
        if (stuffed) next = impactAt + 0.05;
        else {
          const counter = attackTrack(position === "ground" ? "straight" : "counter", {
            att: sides[d],
            def: sides[a],
            dist,
            position,
            onTop: position === "ground" && top === d,
            result: "hit",
            after: null,
          });
          const cStart = impactAt - counter.impact + 0.12;
          const cl = limbOf(position === "ground" ? "straight" : "counter", position, counter.impact);
          clips.push({ who: d, start: cStart, track: counter.track, ...(cl ? { limb: cl } : {}) });
          const back = reactionTrack({
            me: sides[a],
            kind: "counter",
            zone: "head",
            result: "hit",
            power: powerOf(s.damage),
            position,
            onTop: position === "ground" && top === a,
            after: null,
            lead: 0.1,
          });
          clips.push({ who: a, start: cStart + counter.impact - 0.1, track: back.track });
          impacts.push({ at: cStart + counter.impact, target: a, by: d, zone: "head", result: "hit", damage: s.damage, kind: "counter" });
          next = Math.max(next, cStart + counter.track.end - 0.1);
        }
      } else {
        const lead = s.result === "hit" ? 0.03 : 0.16;
        const re = reactionTrack({
          me: sides[d],
          kind: s.kind,
          zone,
          result: s.result,
          power: powerOf(s.damage),
          position,
          onTop: position === "ground" && top === d,
          after: after?.def ?? null,
          lead,
        });
        clips.push({ who: d, start: impactAt - lead, track: re.track });
        next = Math.max(next, impactAt - lead + re.track.end - 0.15);
        impacts.push({ at: impactAt, target: d, by: a, zone, result: s.result, damage: s.damage, kind: s.kind });
      }
    }
    if (after && nextPos) {
      // 組み技の最後で、新しい位置関係の構えに切りかえる
      const ends = clips.filter((c) => c.start + c.track.end > 0).map((c) => c.start + c.track.end);
      switchAt = Math.max(t + built.track.end, ...ends.slice(-2));
      position = nextPos;
      top = nextTop;
      dist = distOf(position, sides);
      sides[0] = { ...sides[0], base: basePoseOf(sides[0], position, roleOf(0, position, top), dist) };
      sides[1] = { ...sides[1], base: basePoseOf(sides[1], position, roleOf(1, position, top), dist) };
      switched = true;
      next = Math.max(next, switchAt);
    }
    t = next;
  });

  // 技で移らなかったときは、最後にゆっくり位置関係を移す
  if (ev.position !== position) {
    const nextTop: 0 | 1 = ev.position === "ground" && position !== "ground" ? (strikes[strikes.length - 1]?.by ?? 0) : top;
    const nd = distOf(ev.position, sides);
    const dz = (dist - nd) / 2;
    for (const who of [0, 1] as const) {
      const to = basePoseOf(sides[who], ev.position, roleOf(who, ev.position, nextTop), nd);
      clips.push({ who, start: t, track: transitionTrack(sides[who], shiftPose(to, dz), 0.75) });
    }
    t += 0.75;
    switchAt = t;
    position = ev.position;
    top = nextTop;
    dist = nd;
    for (const who of [0, 1] as const) sides[who] = { ...sides[who], base: basePoseOf(sides[who], position, roleOf(who, position, top), dist) };
  }
  if (switchAt < 0) switchAt = t;

  let ko: Exchange["ko"] = null;
  if (ev.ko !== null) {
    const who = ev.ko;
    const fall = fallTrack(sides[who], downPose(sides[who].d));
    const start = Math.max(0.2, t - 0.25);
    clips.push({ who, start, track: fall });
    const winner: 0 | 1 = who === 0 ? 1 : 0;
    clips.push({ who: winner, start: start + 0.3, track: victoryTrack(sides[winner], 1.9) });
    ko = { who, at: start, downAt: start + fall.end };
    t = start + Math.max(fall.end, 2.2) + 0.1;
  } else t += 0.35;

  // 受ける人が技より先に構えはじめる分、0 秒より前に始まるものがあれば、全体を後ろへずらす
  const early = Math.min(0, ...clips.map((c) => c.start));
  if (early < 0) {
    const by = 0.02 - early;
    for (const c of clips) c.start += by;
    for (const i of impacts) i.at += by;
    if (ko) {
      ko.at += by;
      ko.downAt += by;
    }
    switchAt += by;
    t += by;
  }
  return { clips, impacts, switchAt, position, top, dist, ko, end: t };
}
