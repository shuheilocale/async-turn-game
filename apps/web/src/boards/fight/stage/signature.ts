import { legLength, type BodyDims } from "./body.ts";
import { add, dist as distance, sub, type V3 } from "./math.ts";
import { PROP_LENGTH } from "./outfit.ts";
import { headCenter, P, pack } from "./pose.ts";
import { handRoot } from "./stances.ts";
import { aim, chestPoint, face, hold2, reachHand, shift, targetsOf, TrackBuilder, type AttackCtx, type Built, type FxLocal, type KeyEdit } from "./track.ts";
import type { ActionKind, StageStrike } from "./types.ts";

/**
 * バックボーンごとの決め技の動き（立ち技の間合いだけ）。剣道家の面・小手・胴・突き・鍔迫り合い、
 * ルチャドールのチョップ・ドロップキック・トペ・ウラカン・ラナ・ロープワーク、消防士のかつぎ・体当たり、
 * DJ のハイタッチ・ステップ、恐竜の着ぐるみのしっぽ・かぷっ・のしかかり。
 * 決めていない組み合わせは null を返し、ふつうの技の動き（moves.ts・special.ts）に任せる
 */

export function signatureTrack(kind: ActionKind, c: AttackCtx): Built | null {
  if (c.position !== "standing") return null;
  switch (c.att.style) {
    case "kendo":
      if (kind === "swing") return kendoCut(c);
      if (kind === "straight") return kendoThrust(c);
      if (kind === "clinch") return kendoBind(c);
      return null;
    case "luchador":
      if (kind === "hook") return chop(c);
      if (kind === "kick_high") return dropkick(c);
      if (kind === "takedown") return tope(c);
      if (kind === "throw") return rana(c);
      if (kind === "dodge") return ropes(c);
      return null;
    case "firefighter":
      if (kind === "throw") return carry(c);
      if (kind === "push") return charge(c);
      return null;
    case "dj":
      if (kind === "jab") return highFive(c);
      if (kind === "dodge") return djStep(c);
      return null;
    case "dino":
      if (kind === "swing") return tailSweep(c);
      if (kind === "clinch") return bite(c);
      if (kind === "takedown") return press(c);
      return null;
    default:
      return null;
  }
}

/**
 * 剣道家の振る技（面・小手・胴）はどれも swing で来る。強化・弱体の付き方で見分ける：
 * 相手の攻撃を下げる技を小手、守り・スタミナを下げる技を胴とみなし、それ以外（外れたときを含む）は面
 */
export function kendoCutOf(s?: Pick<StageStrike, "by" | "effects">): "men" | "kote" | "do" {
  const foe = (s?.effects ?? []).filter((e) => e.who !== s!.by && e.dir < 0);
  if (foe.some((e) => e.stat === "power")) return "kote";
  if (foe.some((e) => e.stat === "guard" || e.stat === "stamina")) return "do";
  return "men";
}

/** 速さ（すばやいほど少し速く） */
const pace = (d: BodyDims, k = 0.08) => (v: number) => v * (1 - k * d.speed);

/** 剣先を tip へ届かせる。右手は胸から見た grip に置き、届かない分だけ踏み込む */
function swordTo(k: KeyEdit, dims: BodyDims, grip: V3, tip: V3) {
  let at = chestPoint(k.d, dims, grip);
  const short = distance(at, tip) - PROP_LENGTH.shinai;
  if (short > 0) {
    shift(k.d, Math.min(short, 0.45));
    at = chestPoint(k.d, dims, grip);
  }
  hold2(k, at, sub(tip, at));
}

/** 相手の手首（攻める人の足もとから見て）。0 = 左、1 = 右 */
function foeWrist(c: AttackCtx, i: 0 | 1): V3 {
  const v = handRoot(c.def.base, c.def.d, i);
  return [-v[0] * 0.5, v[1], c.dist - v[2]];
}

/** 右足で踏み込む（剣道のすり足の踏み込み）。右足を前へ、左足は引きつける */
function fumikomi(k: KeyEdit, dz: number, dims: BodyDims) {
  shift(k.d, dz);
  k.d.foot[1][2] += 0.12;
  k.d.foot[1][1] = dims.ankleH;
  k.d.footRot[1][0] = 0;
  k.d.foot[0][2] -= 0.04;
}

// ---- 剣道家 ----

function kendoCut(c: AttackCtx): Built {
  const cut = kendoCutOf(c.strike);
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims);
  if (cut === "kote") {
    // 小手：小さく振り上げ、すばやく相手の手首を打つ
    tb.at(t(0.12), 1, (k) => {
      face(k.d, 0);
      hold2(k, chestPoint(k.d, dims, [0, dims.shoulderY + 0.1, 0.32]), [0, 0.85, 0.5]);
    }, "out");
    const tip = aim(add(foeWrist(c, 1), [0, 0.04, 0]), c.result, -1);
    const hit = tb.at(t(0.24), 1, (k) => {
      fumikomi(k, 0.12, dims);
      face(k.d, 0.02);
      swordTo(k, dims, [0, dims.shoulderY - 0.16, 0.42], tip);
    }, "snap");
    tb.pose(t(0.32), 1, hit, "linear");
    tb.at(t(0.5), 1, (k) => {
      shift(k.d, 0.1);
      hold2(k, chestPoint(k.d, dims, [0, dims.shoulderY - 0.3, 0.36]), [0, 0.45, 1]);
    });
    tb.at(t(0.72), 0);
    return { track: tb.build(), impact: t(0.24) };
  }
  if (cut === "do") {
    // 胴：振りかぶって、右前へ踏み込みながら相手の胴を横に払い、そのまま抜ける
    tb.at(t(0.18), 1, (k) => {
      face(k.d, 0);
      k.d.chest[0] -= 0.05;
      hold2(k, chestPoint(k.d, dims, [0, dims.shoulderY + 0.3, 0.16]), [-0.15, 0.6, -0.78]);
    }, "out");
    const tip = aim(add(T.body, [0.16, 0.0, -0.02]), c.result, -1);
    const hit = tb.at(t(0.36), 1, (k) => {
      fumikomi(k, 0.2, dims);
      shift(k.d, 0, -0.08);
      k.d.hipRot[1] -= 0.25;
      k.d.spine[0] += 0.08;
      face(k.d, 0);
      swordTo(k, dims, [0.04, dims.shoulderY - 0.3, 0.36], tip);
    }, "snap");
    tb.pose(t(0.43), 1, hit, "linear");
    tb.at(t(0.6), 1, (k) => {
      shift(k.d, 0.4, -0.24);
      k.d.hipRot[1] -= 0.3;
      face(k.d, 0);
      hold2(k, chestPoint(k.d, dims, [-0.14, dims.shoulderY - 0.34, 0.26]), [0.5, -0.05, 0.86]);
    }, "out");
    tb.at(t(0.95), 0);
    return { track: tb.build(), impact: t(0.36) };
  }
  // 面：竹刀を額の上へ大きく振りかぶり、右足で踏み込んで相手の頭のてっぺんを打ち、前へ打ち抜ける
  tb.at(t(0.2), 1, (k) => {
    k.d.hip[1] += 0.01;
    k.d.spine[0] -= 0.04;
    k.d.chest[0] -= 0.06;
    face(k.d, -0.02);
    k.d.elbow = [
      [0.6, -0.4, -0.3],
      [-0.6, -0.4, -0.3],
    ];
    hold2(k, chestPoint(k.d, dims, [0, dims.shoulderY + 0.42, 0.1]), [0, 0.55, -0.84]);
  }, "out");
  const tip = aim(add(T.head, [0, 0.07, -0.03]), c.result, -1);
  const hit = tb.at(t(0.34), 1, (k) => {
    fumikomi(k, 0.22, dims);
    k.d.spine[0] += 0.04;
    face(k.d, 0);
    k.d.elbow = [
      [0.4, -1, -0.2],
      [-0.4, -1, -0.2],
    ];
    swordTo(k, dims, [0, dims.shoulderY + 0.16, 0.46], tip);
  }, "snap");
  tb.pose(t(0.42), 1, hit, "linear");
  tb.at(t(0.62), 1, (k) => {
    shift(k.d, 0.34);
    face(k.d, 0);
    hold2(k, chestPoint(k.d, dims, [0, dims.shoulderY + 0.04, 0.45]), [0, 0.25, 1]);
  }, "out");
  tb.at(t(0.95), 0);
  return { track: tb.build(), impact: t(0.34) };
}

/** 突き：両手を伸ばして、竹刀の先で相手ののどを突く */
function kendoThrust(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims);
  const tip = aim(add(T.neck, [0, 0.05, 0]), c.result, -1);
  tb.at(t(0.1), 1, (k) => {
    k.d.hip[1] -= 0.02;
    face(k.d, 0.02);
    const at = chestPoint(k.d, dims, [0, dims.shoulderY - 0.38, 0.28]);
    hold2(k, at, sub(tip, at));
  });
  const hit = tb.at(t(0.24), 1, (k) => {
    fumikomi(k, 0.16, dims);
    k.d.spine[0] += 0.05;
    face(k.d, 0.02);
    k.d.elbow = [
      [0.3, -1, -0.1],
      [-0.3, -1, -0.1],
    ];
    swordTo(k, dims, [0, dims.shoulderY - 0.2, 0.55], tip);
  }, "snap");
  tb.pose(t(0.34), 1, hit, "linear");
  tb.at(t(0.55), 1, (k) => shift(k.d, 0.06));
  tb.at(t(0.72), 0);
  return { track: tb.build(), impact: t(0.24) };
}

/** 鍔迫り合い：間合いをつめ、竹刀を立てて両手を胸の前に寄せ、相手と押し合う */
function kendoBind(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const t = pace(dims);
  const bind = (k: KeyEdit, dz: number) => {
    shift(k.d, dz);
    k.d.spine[0] += 0.08;
    face(k.d, 0.05);
    hold2(k, chestPoint(k.d, dims, [0, 0.26, 0.26]), [0, 1, 0.14]);
  };
  tb.at(t(0.14), 1, (k) => bind(k, 0.12));
  const grab = tb.at(t(0.3), 1, (k) => bind(k, 0.3), "out");
  if (c.after && c.result === "hit") {
    tb.pose(t(0.55), 1, c.after.att);
    return { track: tb.build(), impact: t(0.3) };
  }
  tb.pose(t(0.42), 1, grab, "linear");
  tb.at(t(0.7), 1, (k) => bind(k, -0.02));
  tb.at(t(0.85), 0);
  return { track: tb.build(), impact: t(0.3) };
}

// ---- ルチャドール ----

/** チョップ：右手を頭の後ろへ大きく振りかぶり、手刀で相手の胸を打つ */
function chop(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims);
  tb.at(t(0.14), 1, (k) => {
    k.d.hipRot[1] -= 0.35;
    k.d.chest[1] -= 0.15;
    k.d.chest[0] -= 0.12;
    face(k.d);
    k.d.elbow[1] = [-1, 0.5, -0.4];
    k.d.fist[1] = [0, -1.4, 0.3];
    k.hand(1, chestPoint(k.d, dims, [-0.32, dims.shoulderY + 0.25, -0.1]));
  }, "out");
  const tgt = aim(add(T.body, [0.02, 0.2, 0]), c.result, -1);
  const hit = tb.at(t(0.26), 1, (k) => {
    shift(k.d, 0.06, 0, 0);
    k.d.hipRot[1] += 0.45;
    k.d.chest[1] += 0.12;
    face(k.d);
    k.d.elbow[1] = [-0.6, 0.3, 0];
    k.d.fist[1] = [0, -1.5, 0];
    reachHand(k, dims, 1, tgt, 0.9);
  }, "snap");
  tb.pose(t(0.33), 1, hit, "linear");
  tb.at(t(0.48), 1, (k) => {
    shift(k.d, 0.06, 0, 0);
    k.d.hipRot[1] += 0.55;
    face(k.d);
    k.hand(1, chestPoint(k.d, dims, [0.12, -0.04, 0.3]));
  }, "out");
  tb.at(t(0.72), 0);
  return { track: tb.build(), impact: t(0.26) };
}

/** しゃがんで両腕を後ろへ引く（跳ぶ前のため） */
function crouchBack(k: KeyEdit, low: number) {
  k.d.hip[1] -= low;
  k.d.hipRot[0] += 0.4;
  k.d.spine[0] += 0.12;
  face(k.d);
  const hip = k.d.hip;
  k.hand(0, [hip[0] + 0.22, hip[1] + 0.18, hip[2] - 0.22]);
  k.hand(1, [hip[0] - 0.22, hip[1] + 0.18, hip[2] - 0.22]);
}

/** あお向けに倒れた形（跳んだあとに落ちる）。z は腰の前後の位置 */
function landOnBack(k: KeyEdit, z: number) {
  k.d.hip = [0, 0.16, z];
  k.d.hipRot = [-1.5, 0, 0];
  k.d.spine = [0.1, 0, 0];
  k.d.chest = [0.05, 0, 0];
  k.d.neck = [0.6, 0, 0];
  k.d.foot = [
    [0.13, 0.32, z + 0.72],
    [-0.13, 0.28, z + 0.7],
  ];
  k.d.footRot = [
    [-0.8, 0.2, 0],
    [-0.8, -0.2, 0],
  ];
  k.d.knee = [
    [0.3, 1, 0.3],
    [-0.3, 1, 0.3],
  ];
  k.d.elbow = [
    [0.3, 0.2, -1],
    [-0.3, 0.2, -1],
  ];
  k.hand(0, [0.38, 0.05, z - 0.12]);
  k.hand(1, [-0.38, 0.05, z - 0.12]);
}

/** しゃがんだ形（倒れたところから起き上がる途中） */
function squat(k: KeyEdit, dims: BodyDims, z: number) {
  k.d.hip = [0, legLength(dims) * 0.52, z];
  k.d.hipRot = [0.5, 0, 0];
  k.d.spine = [0.15, 0, 0];
  k.d.chest = [0.05, 0, 0];
  k.d.neck = [-0.5, 0, 0];
  k.d.foot = [
    [0.16, dims.ankleH, z + 0.12],
    [-0.16, dims.ankleH, z - 0.08],
  ];
  k.d.footRot = [
    [0, 0.15, 0],
    [0.3, -0.3, 0],
  ];
  k.d.knee = [
    [0.3, 0, 1],
    [-0.3, 0, 1],
  ];
  k.hand(0, [0.2, legLength(dims) * 0.55, z + 0.28]);
  k.hand(1, [-0.2, legLength(dims) * 0.55, z + 0.22]);
}

/** ドロップキック：しゃがんで高く跳び、体を後ろへ倒しながら両足をそろえて相手の胸を蹴る。背中から落ちて起き上がる */
function dropkick(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims, 0.06);
  const end = aim(add(T.body, [0, 0.2, -0.04]), c.result, -1);
  const hz = Math.max(0.15, end[2] - (dims.thigh + dims.shin) * 0.92);
  tb.at(t(0.14), 1, (k) => crouchBack(k, 0.12), "out");
  const kick = (k: KeyEdit, rise: number) => {
    k.d.hip = [0, end[1] - 0.06 - 0.12 * (1 - rise), hz - 0.1 * (1 - rise)];
    k.d.hipRot = [-1.2 * rise - 0.3, 0.25, 0];
    k.d.spine = [0.25, 0, 0];
    k.d.chest = [0.15, 0, 0];
    k.d.neck = [0.55, -0.2, 0];
    k.d.foot = [
      [0.07, end[1] + 0.03 - 0.25 * (1 - rise), end[2] - 0.2 * (1 - rise)],
      [-0.07, end[1] - 0.03 - 0.25 * (1 - rise), end[2] - 0.2 * (1 - rise)],
    ];
    k.d.footRot = [
      [-1.35, 0, 0],
      [-1.35, 0, 0],
    ];
    k.d.knee = [
      [0.2, 1, 0],
      [-0.2, 1, 0],
    ];
    k.d.elbow = [
      [0.6, -1, 0],
      [-0.6, -1, 0],
    ];
    k.hand(0, [0.32, end[1] - 0.2, hz - 0.16]);
    k.hand(1, [-0.32, end[1] - 0.2, hz - 0.16]);
  };
  tb.at(t(0.26), 1, (k) => kick(k, 0.5), "out");
  const hit = tb.at(t(0.34), 1, (k) => kick(k, 1), "linear");
  tb.pose(t(0.4), 1, hit, "linear");
  tb.at(t(0.6), 1, (k) => landOnBack(k, hz), "in");
  tb.at(t(0.72), 1, (k) => landOnBack(k, hz));
  tb.at(t(0.95), 1, (k) => squat(k, dims, hz * 0.6), "inOut");
  tb.at(t(1.2), 0);
  return { track: tb.build(), impact: t(0.34) };
}

/** トペ・スイシーダ：しゃがんで両腕を引き、頭から相手の胸へ飛び込む。当たれば上になって倒し、外れたら腹ばいに落ちる */
function tope(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims, 0.06);
  const tgt = aim(T.body, c.result, -1);
  const hz = tgt[2] - 0.66;
  tb.at(t(0.16), 1, (k) => crouchBack(k, 0.15), "out");
  const dive = (k: KeyEdit) => {
    k.d.hip = [0, tgt[1] - 0.04, hz];
    k.d.hipRot = [1.35, 0, 0];
    k.d.spine = [0.05, 0, 0];
    k.d.chest = [0, 0, 0];
    k.d.neck = [-0.95, 0, 0];
    k.d.foot = [
      [0.1, tgt[1] + 0.08, hz - 0.84],
      [-0.1, tgt[1] + 0.02, hz - 0.8],
    ];
    k.d.footRot = [
      [1.5, 0, 0],
      [1.5, 0, 0],
    ];
    k.d.knee = [
      [0.2, -1, 0],
      [-0.2, -1, 0],
    ];
    k.d.elbow = [
      [0.4, -1, 0],
      [-0.4, -1, 0],
    ];
    k.hand(0, [0.13, tgt[1] + 0.14, hz + 0.74]);
    k.hand(1, [-0.13, tgt[1] + 0.1, hz + 0.74]);
  };
  tb.at(t(0.3), 1, dive, "out");
  const hit = tb.at(t(0.36), 1, dive, "linear");
  if (c.after && c.result === "hit") {
    tb.pose(t(0.75), 1, c.after.att, "in");
    return { track: tb.build(), impact: t(0.36) };
  }
  tb.pose(t(0.4), 1, hit, "linear");
  const z = hz + 0.2;
  tb.at(t(0.6), 1, (k) => {
    k.d.hip = [0, 0.2, z];
    k.d.hipRot = [1.5, 0, 0];
    k.d.spine = [0, 0, 0];
    k.d.neck = [-0.9, 0, 0];
    k.d.foot = [
      [0.12, 0.07, z - 0.85],
      [-0.12, 0.07, z - 0.82],
    ];
    k.d.footRot = [
      [1.3, 0, 0],
      [1.3, 0, 0],
    ];
    k.hand(0, [0.26, 0.04, z + 0.36]);
    k.hand(1, [-0.26, 0.04, z + 0.36]);
  }, "in");
  tb.at(t(0.9), 1, (k) => squat(k, dims, z * 0.7), "inOut");
  tb.at(t(1.15), 0);
  return { track: tb.build(), impact: t(0.36) };
}

/**
 * ウラカン・ラナ：跳びついて相手の肩に乗り、太ももで頭をはさむ。後ろへ回って相手を前へ丸め込み、上になる。
 * 外れたら、そのまま後ろへ転がって起き上がる
 */
function rana(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims, 0.06);
  const H = c.result === "hit" ? T.head : aim(T.head, c.result, -1);
  tb.at(t(0.12), 1, (k) => {
    k.d.hip[1] -= 0.1;
    k.d.hipRot[0] += 0.3;
    face(k.d);
    const h = headCenter(pack(k.d), dims);
    k.hand(0, add(h, [0.18, 0.25, 0.1]));
    k.hand(1, add(h, [-0.18, 0.25, 0.1]));
  }, "out");
  const mount = (k: KeyEdit) => {
    const hz = H[2] - 0.34;
    k.d.hip = [0, H[1] - 0.1, hz];
    k.d.hipRot = [-0.35, 0, 0];
    k.d.spine = [0.25, 0, 0];
    k.d.chest = [0.1, 0, 0];
    k.d.neck = [0.2, 0, 0];
    k.d.foot = [
      [0.2, H[1] - 0.24, H[2] + 0.2],
      [-0.2, H[1] - 0.24, H[2] + 0.2],
    ];
    k.d.knee = [
      [1, 0.3, 0.3],
      [-1, 0.3, 0.3],
    ];
    k.d.footRot = [
      [0.6, -0.8, 0],
      [0.6, 0.8, 0],
    ];
    k.d.elbow = [
      [0.6, -0.5, -0.2],
      [-0.6, -0.5, -0.2],
    ];
    k.hand(0, add(H, [0.13, 0.04, -0.1]));
    k.hand(1, add(H, [-0.13, 0.04, -0.1]));
  };
  tb.at(t(0.3), 1, mount, "out");
  tb.at(t(0.4), 1, mount);
  // 後ろへ大きく反って回る（相手は前へ丸め込まれる）
  const flip = (k: KeyEdit) => {
    k.d.hip = [0, 0.62, H[2] - 0.5];
    k.d.hipRot = [-2.3, 0, 0];
    k.d.spine = [0.3, 0, 0];
    k.d.chest = [0.1, 0, 0];
    k.d.neck = [0.6, 0, 0];
    k.d.foot = [
      [0.2, 1.0, H[2] - 0.05],
      [-0.2, 1.0, H[2] - 0.05],
    ];
    k.d.knee = [
      [0.6, 0, 1],
      [-0.6, 0, 1],
    ];
    k.d.footRot = [
      [-0.5, 0, 0],
      [-0.5, 0, 0],
    ];
    k.hand(0, [0.22, 0.05, H[2] - 0.95]);
    k.hand(1, [-0.22, 0.05, H[2] - 0.95]);
  };
  tb.at(t(0.56), 1, flip, "inOut");
  if (c.after && c.result === "hit") {
    tb.pose(t(0.92), 1, c.after.att, "inOut");
    return { track: tb.build(), impact: t(0.5) };
  }
  tb.at(t(0.76), 1, (k) => landOnBack(k, H[2] - 0.75), "out");
  tb.at(t(1.0), 1, (k) => squat(k, dims, (H[2] - 0.75) * 0.6), "inOut");
  tb.at(t(1.22), 0);
  return { track: tb.build(), impact: t(0.3) };
}

/** ロープワーク：両腕を広げて後ろへ大きく身を預け（ロープに跳ね返るように）、軽やかに戻る */
function ropes(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const lean = (k: KeyEdit, s: number) => {
    shift(k.d, -0.26 * s);
    k.d.hip[1] -= 0.02 * s;
    k.d.spine[0] -= 0.22 * s;
    k.d.chest[0] -= 0.12 * s;
    k.d.neck[0] += 0.28 * s;
    k.d.elbow = [
      [1, -0.3, -0.5],
      [-1, -0.3, -0.5],
    ];
    const c0 = chestPoint(k.d, dims, [0, dims.shoulderY, 0]);
    k.hand(0, add(c0, [0.42 * s, 0.05, -0.12 * s]));
    k.hand(1, add(c0, [-0.42 * s, 0.05, -0.12 * s]));
  };
  tb.at(0.14, 1, (k) => lean(k, 1), "out");
  tb.at(0.34, 1, (k) => lean(k, 1.05));
  tb.at(0.5, 1, (k) => {
    shift(k.d, 0.06);
    k.d.spine[0] += 0.08;
    k.d.hip[1] -= 0.03;
  }, "out");
  tb.at(0.7, 0);
  return { track: tb.build(), impact: 0.14 };
}

// ---- 消防士 ----

/**
 * ファイアーマンズキャリー：低く入って相手の腰を取り、肩にかついで立ち上がる。向きを変えて肩から下ろす。
 * かつがれる人の動きは moves.ts の carried
 */
function carry(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims, 0.05);
  const L = legLength(dims);
  const hip0 = c.att.base[P.hip + 1]!;
  tb.at(t(0.16), 1, (k) => {
    shift(k.d, Math.max(0, c.dist - 0.55));
    k.d.hip[1] = L * 0.6;
    k.d.hipRot[0] = 0.75;
    k.d.spine[0] += 0.2;
    k.d.neck[0] = -0.5;
    k.d.foot[1][2] += 0.12;
    k.hand(1, add(T.legs, [0.0, 0.12, -0.06]));
    k.hand(0, add(T.body, [0.16, 0.1, -0.08]));
  }, "out");
  if (!(c.after && c.result === "hit")) {
    // かつげなかった：腰を戻して離れる
    tb.at(t(0.36), 1, (k) => {
      shift(k.d, Math.max(0, c.dist - 0.6));
      k.d.hip[1] = L * 0.64;
      k.d.hipRot[0] = 0.6;
      k.d.neck[0] = -0.4;
    });
    tb.at(t(0.62), 1, (k) => shift(k.d, 0.06));
    tb.at(t(0.85), 0);
    return { track: tb.build(), impact: t(0.16) };
  }
  const lift = tb.at(t(0.42), 1, (k) => {
    shift(k.d, Math.max(0, c.dist - 0.65));
    k.d.hip[1] = hip0 - 0.02;
    k.d.hipRot[0] = 0.1;
    k.d.spine[0] = 0.12;
    face(k.d, 0.05);
    k.d.elbow = [
      [0.8, 0.3, -0.2],
      [-0.8, 0.3, -0.2],
    ];
    k.hand(1, chestPoint(k.d, dims, [-0.18, dims.shoulderY + 0.06, 0.16]));
    k.hand(0, chestPoint(k.d, dims, [0.22, dims.shoulderY + 0.08, 0.1]));
  }, "inOut");
  tb.at(t(0.58), 1, (k) => (k.d.hip[1] -= 0.02), "inOut", lift);
  // 向きを変え、腰を落として肩から下ろす
  tb.at(t(0.74), 1, (k) => {
    k.d.hipRot[1] += 0.5;
    k.d.hip[1] -= 0.14;
    k.d.spine[0] += 0.3;
  }, "inOut", lift);
  tb.pose(t(1.0), 1, c.after.att, "inOut");
  return { track: tb.build(), impact: t(0.32) };
}

/** 救助の体当たり：肩を前に低く構えて、大きく踏み込んでぶつかる */
function charge(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const t = pace(dims, 0.05);
  const tuck = (k: KeyEdit) => {
    face(k.d, 0.1);
    k.d.elbow = [
      [0.4, -1, 0.3],
      [-0.4, -1, 0.3],
    ];
    k.hand(0, chestPoint(k.d, dims, [0.05, dims.shoulderY - 0.2, 0.2]));
    k.hand(1, chestPoint(k.d, dims, [-0.1, dims.shoulderY - 0.26, 0.17]));
  };
  tb.at(t(0.14), 1, (k) => {
    k.d.hip[1] -= 0.06;
    k.d.hipRot[1] -= 0.45;
    k.d.spine[0] += 0.15;
    k.d.chest[1] -= 0.15;
    tuck(k);
  }, "out");
  const hit = tb.at(t(0.28), 1, (k) => {
    shift(k.d, Math.max(0.2, c.dist - 0.56));
    k.d.hip[1] -= 0.05;
    k.d.hipRot[1] -= 0.55;
    k.d.spine[0] += 0.25;
    k.d.chest[1] -= 0.2;
    k.d.foot[0][2] += 0.12;
    tuck(k);
  }, "snap");
  tb.pose(t(0.38), 1, hit, "linear");
  tb.at(t(0.62), 1, (k) => shift(k.d, 0.12));
  tb.at(t(0.82), 0);
  return { track: tb.build(), impact: t(0.28) };
}

// ---- DJ ----

/** ハイタッチ：開いた手のひらを高く上げて、相手の顔の前へ勢いよく出す */
function highFive(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims);
  tb.at(t(0.08), 1, (k) => {
    shift(k.d, -0.02);
    k.d.hipRot[1] += 0.08;
    k.d.elbow[0] = [0.8, 0.4, -0.3];
    k.hand(0, chestPoint(k.d, dims, [0.18, dims.shoulderY + 0.22, 0.05]));
  });
  const hit = tb.at(t(0.18), 1, (k) => {
    shift(k.d, 0.05, 0, 0);
    k.d.hipRot[1] -= 0.2;
    k.d.chest[1] -= 0.1;
    face(k.d, 0.05);
    k.d.elbow[0] = [0.6, 0.6, -0.1];
    k.d.fist[0] = [-1.3, 0.2, 0];
    reachHand(k, dims, 0, aim(add(T.head, [0, 0.1, 0.02]), c.result, 1));
  }, "snap");
  tb.pose(t(0.27), 1, hit, "linear");
  tb.at(t(0.45), 1, (k) => shift(k.d, 0.02), "inOut");
  tb.at(t(0.6), 0);
  return { track: tb.build(), impact: t(0.18) };
}

/** ステップ：ビートに乗って横へ軽く跳び、肩をひねってかわす */
function djStep(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const step = (k: KeyEdit, s: number) => {
    shift(k.d, -0.08 * s, -0.18 * s);
    k.d.hip[1] -= 0.04 * s;
    k.d.spine[2] += 0.12 * s;
    k.d.chest[1] += 0.22 * s;
    k.d.neck[1] -= 0.15 * s;
  };
  tb.at(0.12, 1, (k) => {
    step(k, 1);
    k.d.foot[0][1] += 0.05;
    k.d.footRot[0][0] += 0.3;
  }, "out");
  tb.at(0.4, 1, (k) => step(k, 0.95));
  tb.at(0.62, 0);
  return { track: tb.build(), impact: 0.12 };
}

// ---- 恐竜の着ぐるみ ----

/** しっぽ：くるっと 1 回転して、持ち上げた太いしっぽで相手を払う */
function tailSweep(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const t = pace(dims, 0.06);
  const y0 = c.att.base[P.hipRot + 1]!;
  const spin = (k: KeyEdit, a: number, dz: number) => {
    k.d.hipRot[1] = y0 - a;
    k.d.footRot[0][1] -= a;
    k.d.footRot[1][1] -= a;
    shift(k.d, dz);
    // 肩ごしに相手を見る
    k.d.neck[1] += Math.min(a, 1.3) * 0.7;
  };
  tb.at(t(0.16), 1, (k) => {
    spin(k, 0.7, 0.05);
    k.d.hip[1] -= 0.04;
  }, "in");
  const reach = Math.max(0.05, c.dist - 0.95);
  const hit = tb.at(t(0.36), 1, (k) => {
    spin(k, Math.PI, reach);
    k.d.hip[1] -= 0.02;
    k.d.spine[0] += 0.12;
  }, "linear");
  tb.pose(t(0.44), 1, hit, "linear");
  tb.at(t(0.64), 1, (k) => spin(k, Math.PI * 1.6, reach * 0.6), "out");
  tb.at(t(0.9), 1, (k) => spin(k, Math.PI * 2, 0), "inOut");
  const fx: FxLocal[] = [{ type: "tail", at: t(0.1), until: t(0.8) }];
  return { track: tb.build(), impact: t(0.36), fx };
}

/** かぷっ：両手を相手の肩にかけ、フードの口で相手の頭を甘がみする（上あごが開いて閉じる） */
function bite(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims, 0.05);
  tb.at(t(0.14), 1, (k) => {
    shift(k.d, 0.12);
    k.d.hip[1] -= 0.02;
  }, "out");
  const grab = tb.at(t(0.32), 1, (k) => {
    shift(k.d, 0.3);
    k.d.spine[0] += 0.18;
    k.d.chest[0] += 0.1;
    k.d.neck = [0.3, 0, 0];
    k.d.elbow = [
      [0.6, -0.5, -0.2],
      [-0.6, -0.5, -0.2],
    ];
    reachHand(k, dims, 0, add(T.neck, [0.16, -0.06, -0.06]), 0.9);
    k.hand(1, add(T.neck, [-0.16, -0.08, -0.06]));
  }, "out");
  const fx: FxLocal[] = [{ type: "chomp", at: t(0.12), until: t(0.72) }];
  if (c.after && c.result === "hit") {
    tb.pose(t(0.72), 1, c.after.att);
    return { track: tb.build(), impact: t(0.34), fx };
  }
  tb.pose(t(0.5), 1, grab, "linear");
  tb.at(t(0.72), 1, (k) => shift(k.d, 0.02));
  tb.at(t(0.9), 0);
  return { track: tb.build(), impact: t(0.34), fx };
}

/** のしかかり：両手を上げて伸び上がり、前へ倒れこんで相手に覆いかぶさる */
function press(c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  const T = targetsOf(c.def, c.dist);
  const t = pace(dims, 0.05);
  tb.at(t(0.2), 1, (k) => {
    k.d.hip[1] += 0.03;
    k.d.spine[0] -= 0.12;
    k.d.chest[0] -= 0.1;
    face(k.d, -0.1);
    for (const i of [0, 1] as const) k.d.footRot[i][0] += 0.35;
    k.d.elbow = [
      [0.9, 0.3, -0.3],
      [-0.9, 0.3, -0.3],
    ];
    k.hand(0, chestPoint(k.d, dims, [0.4, dims.shoulderY + 0.16, 0.06]));
    k.hand(1, chestPoint(k.d, dims, [-0.4, dims.shoulderY + 0.16, 0.06]));
  }, "out");
  const hit = tb.at(t(0.4), 1, (k) => {
    shift(k.d, Math.max(0.2, c.dist - 0.5));
    k.d.hip[1] -= 0.2;
    k.d.hipRot[0] = 0.85;
    k.d.spine[0] = 0.25;
    k.d.neck[0] = -0.6;
    k.d.foot[0][2] -= 0.2;
    k.d.footRot[0][0] = 0.9;
    k.d.elbow = [
      [0.6, -1, 0.2],
      [-0.6, -1, 0.2],
    ];
    k.hand(0, add(T.body, [0.22, 0.16, 0.04]));
    k.hand(1, add(T.body, [-0.22, 0.16, 0.04]));
  }, "in");
  const fx: FxLocal[] = [{ type: "fluff", at: t(0.4), until: t(0.5) }];
  if (c.after && c.result === "hit") {
    tb.pose(t(0.78), 1, c.after.att, "inOut");
    return { track: tb.build(), impact: t(0.4), fx };
  }
  tb.pose(t(0.5), 1, hit, "linear");
  tb.at(t(0.8), 1, (k) => {
    shift(k.d, 0.08);
    k.d.hip[1] -= 0.04;
  });
  tb.at(t(1.02), 0);
  return { track: tb.build(), impact: t(0.4), fx };
}
