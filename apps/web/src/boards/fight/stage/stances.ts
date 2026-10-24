import { legLength, type BodyDims } from "./body.ts";
import { add, clamp, lerp, smoothstep, wobble, type V3 } from "./math.ts";
import { chestFrame, headCenter, newPose, P, pack, toChest, unpack, type Pose, type PoseDesc } from "./pose.ts";
import type { StyleId } from "./types.ts";

/**
 * 構え（待っているときの姿勢）と、その上に重ねる息づかい・バックボーンごとの待ちの動き。
 * どれも左足が前の構え（オーソドックス）で作り、画面の右に立つ人は左右を入れかえて使う（mirrorPose）
 */

/** 構えの作り方。足・腰・胸の向きを決め、手はあごからの位置で決める */
interface StanceSpec {
  /** 前足（左）・後ろ足（右）の位置（x, z）。y は足首の高さに、かかとの浮き lift を足す */
  lead: [number, number];
  rear: [number, number];
  leadLift?: number;
  rearLift?: number;
  /** つま先の向き（y の角度。負で右へ開く）と、かかとの浮き（x の角度） */
  leadYaw?: number;
  rearYaw?: number;
  leadHeel?: number;
  rearHeel?: number;
  /** ひざを曲げて腰を落とす割合（脚の長さに対して） */
  crouch: number;
  /** 腰の位置のずれ（x, z） */
  shift?: [number, number];
  hipYaw?: number;
  hipPitch?: number;
  hipRoll?: number;
  spinePitch?: number;
  spineYaw?: number;
  chestPitch?: number;
  chestYaw?: number;
  /** 顔を前へ向けたあと、さらにあごを引く角度 */
  chin?: number;
  /** こぶしの位置。あごから見た、足もとの向きでのずれ（左手・右手） */
  hands: [V3, V3];
  /** こぶしの位置を、あごからでなく足もとから直接決めるとき */
  handsAbs?: [V3 | null, V3 | null];
  elbows: [V3, V3];
  fists?: [V3, V3];
  knees?: [V3, V3];
}

const L = 0;
const R = 1;

/** あご（顔の前の下）の位置。こぶしの位置の基準にする */
export function chinOf(p: Pose, d: BodyDims): V3 {
  return add(headCenter(p, d), [0, -d.headR * 0.85, d.headR * 0.55]);
}

function build(spec: StanceSpec, d: BodyDims): Pose {
  const leg = legLength(d);
  // 守りが高いほど低く構える（ひざは少しでも曲げておく）
  const crouch = Math.max(0.025, spec.crouch + 0.045 * d.guard);
  const wide = 1 + 0.07 * d.guard + 0.03 * d.speed;
  const hipPitch = spec.hipPitch ?? 0;
  const hipYaw = spec.hipYaw ?? 0;
  const hipRoll = spec.hipRoll ?? 0;
  const spineP = spec.spinePitch ?? 0;
  const chestP = spec.chestPitch ?? 0;
  const spineY = spec.spineYaw ?? 0;
  const chestY = spec.chestYaw ?? 0;
  const desc: PoseDesc = {
    hip: [spec.shift?.[0] ?? 0, leg * (1 - crouch), spec.shift?.[1] ?? 0],
    hipRot: [hipPitch, hipYaw, hipRoll],
    spine: [spineP, spineY, -hipRoll * 0.6],
    chest: [chestP, chestY, -hipRoll * 0.3],
    // 体をひねったり倒したりしても、顔は相手のほうへ向ける
    neck: [-(hipPitch + spineP + chestP) * 0.9 + (spec.chin ?? 0.05), -(hipYaw + spineY + chestY) * 0.92, -hipRoll * 0.1],
    shrug: [0, 0],
    hand: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    elbow: spec.elbows,
    fist: spec.fists ?? [
      [0, 0, 0],
      [0, 0, 0],
    ],
    foot: [
      [spec.lead[0] * wide, d.ankleH + (spec.leadLift ?? 0), spec.lead[1] * wide],
      [spec.rear[0] * wide, d.ankleH + (spec.rearLift ?? 0), spec.rear[1] * wide],
    ],
    footRot: [
      [spec.leadHeel ?? 0, spec.leadYaw ?? -0.2, 0],
      [spec.rearHeel ?? 0, spec.rearYaw ?? -0.6, 0],
    ],
    knee: spec.knees ?? [
      [0.25, 0, 1],
      [-0.25, 0, 1],
    ],
    breath: 0,
  };
  const p = pack(desc);
  // こぶしは、あごを基準に足もとの向きで置き、胸から見た位置に直す（胸が動くと手もついてくる）
  const chin = chinOf(p, d);
  const frame = chestFrame(p, d);
  for (const i of [L, R] as const) {
    const at = spec.handsAbs?.[i] ?? add(chin, spec.hands[i]);
    const local = toChest(frame, at);
    p[P.hand + i * 3] = local[0];
    p[P.hand + i * 3 + 1] = local[1];
    p[P.hand + i * 3 + 2] = local[2];
  }
  return p;
}

/** バックボーンごとの構え（立ち技の間合い） */
export function stanceOf(style: StyleId | null, d: BodyDims): Pose {
  const leg = legLength(d);
  switch (style) {
    case "boxing":
      // ガードを高く、あごを引いて、少し前へ
      return build(
        {
          lead: [0.1, 0.2],
          rear: [-0.13, -0.2],
          rearLift: 0.025,
          leadYaw: -0.3,
          rearYaw: -0.75,
          rearHeel: 0.35,
          crouch: 0.07,
          hipYaw: -0.55,
          hipPitch: 0.06,
          spinePitch: 0.12,
          chestPitch: 0.1,
          chestYaw: 0.05,
          chin: 0.14,
          hands: [
            [0.12, -0.14, 0.25],
            [-0.13, -0.13, 0.13],
          ],
          elbows: [
            [0.3, -1, -0.25],
            [-0.3, -1, -0.25],
          ],
          fists: [
            [0.2, 0.3, 0],
            [0.2, -0.3, 0],
          ],
        },
        d,
      );
    case "muaythai":
      // 背筋を伸ばして体重は後ろ足に。前足は軽く浮かせ、ガードは高く長く
      return build(
        {
          lead: [0.1, 0.17],
          rear: [-0.12, -0.17],
          leadLift: 0.03,
          leadHeel: 0.5,
          leadYaw: -0.12,
          rearYaw: -0.5,
          crouch: 0.035,
          shift: [-0.01, -0.05],
          hipYaw: -0.25,
          hipPitch: -0.02,
          spinePitch: -0.03,
          chestPitch: 0.02,
          chin: 0.06,
          hands: [
            [0.13, -0.12, 0.26],
            [-0.13, -0.12, 0.19],
          ],
          elbows: [
            [0.55, -1, 0.05],
            [-0.55, -1, 0.05],
          ],
          fists: [
            [0.3, 0.6, 0],
            [0.3, -0.6, 0],
          ],
        },
        d,
      );
    case "karate":
      // 半身。前の手は胸の高さに出し、後ろのこぶしは腰に引く（引き手）
      return build(
        {
          lead: [0.07, 0.34],
          rear: [-0.1, -0.3],
          leadYaw: -0.15,
          rearYaw: -1.0,
          crouch: 0.1,
          shift: [0, -0.02],
          hipYaw: -0.8,
          spinePitch: -0.01,
          chestPitch: 0.0,
          chestYaw: -0.05,
          chin: 0.02,
          hands: [
            [0.04, -0.24, 0.3],
            [0, 0, 0],
          ],
          handsAbs: [null, [-0.15, leg * 0.95 + 0.06, -0.08]],
          elbows: [
            [0.3, -1, -0.2],
            [-0.4, -0.6, -1],
          ],
          fists: [
            [0.1, 1.2, 0],
            [-0.6, -2.2, 0],
          ],
        },
        d,
      );
    case "taekwondo":
      // ほぼ横向きの半身で、つま先で軽く立つ
      return build(
        {
          lead: [0.03, 0.26],
          rear: [-0.06, -0.24],
          leadLift: 0.012,
          rearLift: 0.03,
          leadHeel: 0.2,
          rearHeel: 0.45,
          leadYaw: -0.85,
          rearYaw: -1.35,
          crouch: 0.05,
          hipYaw: -1.15,
          spinePitch: 0.02,
          chestYaw: 0.08,
          chin: 0.04,
          hands: [
            [0.06, -0.2, 0.25],
            [-0.04, -0.17, 0.09],
          ],
          elbows: [
            [0.3, -1, -0.1],
            [-0.3, -1, -0.1],
          ],
          fists: [
            [0.1, 0.8, 0],
            [0.1, -0.5, 0],
          ],
        },
        d,
      );
    case "judo":
      // 腰を落として、相手の襟と袖を取りにいくように両手を前へ
      return build(
        {
          lead: [0.15, 0.09],
          rear: [-0.15, -0.09],
          leadYaw: -0.15,
          rearYaw: -0.35,
          crouch: 0.12,
          hipYaw: -0.15,
          hipPitch: 0.16,
          spinePitch: 0.12,
          chestPitch: 0.05,
          chin: 0.0,
          hands: [
            [0.13, -0.17, 0.37],
            [-0.17, -0.3, 0.3],
          ],
          elbows: [
            [0.6, -1, -0.2],
            [-0.6, -1, -0.2],
          ],
          fists: [
            [0.6, 0.9, 0],
            [0.5, -0.9, 0],
          ],
          knees: [
            [0.35, 0, 1],
            [-0.35, 0, 1],
          ],
        },
        d,
      );
    case "bjj":
      // 低く構え、両手を前へ出して組み手を探る
      return build(
        {
          lead: [0.15, 0.13],
          rear: [-0.16, -0.16],
          rearHeel: 0.3,
          rearLift: 0.02,
          leadYaw: -0.2,
          rearYaw: -0.5,
          crouch: 0.19,
          hipYaw: -0.3,
          hipPitch: 0.3,
          spinePitch: 0.16,
          chestPitch: 0.06,
          chin: 0.05,
          hands: [
            [0.12, -0.12, 0.3],
            [-0.1, -0.14, 0.24],
          ],
          elbows: [
            [0.3, -1, -0.1],
            [-0.3, -1, -0.1],
          ],
          fists: [
            [0.5, 0.9, 0],
            [0.5, -0.9, 0],
          ],
          knees: [
            [0.4, 0, 1],
            [-0.3, 0, 1],
          ],
        },
        d,
      );
    case "wrestling":
      // 低く前かがみ。いつでもタックルに入れるよう、頭を上げ両手を前に
      return build(
        {
          lead: [0.17, 0.2],
          rear: [-0.19, -0.22],
          rearHeel: 0.45,
          rearLift: 0.03,
          leadYaw: -0.15,
          rearYaw: -0.4,
          crouch: 0.24,
          hipYaw: -0.2,
          hipPitch: 0.6,
          spinePitch: 0.18,
          chestPitch: 0.05,
          chin: -0.05,
          hands: [
            [0.14, -0.12, 0.2],
            [-0.14, -0.14, 0.17],
          ],
          elbows: [
            [0.2, -1, 0.15],
            [-0.2, -1, 0.15],
          ],
          fists: [
            [0.6, 0.9, 0],
            [0.6, -0.9, 0],
          ],
          knees: [
            [0.35, 0, 1],
            [-0.35, 0, 1],
          ],
        },
        d,
      );
    case "mma":
      // ボクシングより低めのガード、広めの足幅
      return build(
        {
          lead: [0.11, 0.22],
          rear: [-0.15, -0.21],
          rearLift: 0.02,
          rearHeel: 0.3,
          leadYaw: -0.25,
          rearYaw: -0.65,
          crouch: 0.09,
          hipYaw: -0.45,
          hipPitch: 0.1,
          spinePitch: 0.12,
          chestPitch: 0.06,
          chin: 0.1,
          hands: [
            [0.08, -0.06, 0.23],
            [-0.09, -0.05, 0.1],
          ],
          elbows: [
            [0.3, -1, -0.1],
            [-0.3, -1, -0.1],
          ],
          fists: [
            [0.25, 0.4, 0],
            [0.25, -0.4, 0],
          ],
        },
        d,
      );
    case "capoeira":
      // ジンガの真ん中（両足をそろえた形）。左右へ揺れる動きは待ちの動きで重ねる
      return build(
        {
          lead: [0.2, 0.03],
          rear: [-0.2, 0.03],
          leadYaw: 0.15,
          rearYaw: -0.15,
          crouch: 0.13,
          hipPitch: 0.15,
          spinePitch: 0.12,
          chestPitch: 0.04,
          chin: 0.02,
          hands: [
            [0.14, -0.2, 0.22],
            [-0.2, -0.38, 0.06],
          ],
          elbows: [
            [0.4, -1, -0.3],
            [-0.4, -1, -0.3],
          ],
          fists: [
            [0.2, 0.6, 0],
            [0.2, -0.6, 0],
          ],
          knees: [
            [0.45, 0, 1],
            [-0.45, 0, 1],
          ],
        },
        d,
      );
    case "sumo":
      // 足を大きく開き、つま先を外へ。腰を落として両手を前に
      return build(
        {
          lead: [0.25, 0.05],
          rear: [-0.25, -0.05],
          leadYaw: 0.55,
          rearYaw: -0.55,
          crouch: 0.2,
          hipPitch: 0.22,
          spinePitch: 0.12,
          chestPitch: 0.04,
          chin: 0.0,
          hands: [
            [0.17, -0.33, 0.27],
            [-0.17, -0.33, 0.27],
          ],
          elbows: [
            [0.7, -1, -0.3],
            [-0.7, -1, -0.3],
          ],
          fists: [
            [0.5, 1.1, 0],
            [0.5, -1.1, 0],
          ],
          knees: [
            [0.9, 0, 1],
            [-0.9, 0, 1],
          ],
        },
        d,
      );
    default:
      // まだ決まっていない人（シルエット）。肩幅に立ち、軽くこぶしを上げる
      return build(
        {
          lead: [0.12, 0.08],
          rear: [-0.12, -0.08],
          leadYaw: 0.05,
          rearYaw: -0.25,
          crouch: 0.03,
          hipYaw: -0.15,
          spinePitch: 0.04,
          chin: 0.04,
          hands: [
            [0.13, -0.16, 0.18],
            [-0.13, -0.18, 0.14],
          ],
          elbows: [
            [0.4, -1, -0.2],
            [-0.4, -1, -0.2],
          ],
          fists: [
            [0.3, 0.6, 0],
            [0.3, -0.6, 0],
          ],
        },
        d,
      );
  }
}

/**
 * 組み合い（クリンチ）。dist は 2 人の足もとの間。両手を相手の首・肩にかけ、頭は相手の頭の横に置く。
 * mirrored は左右を入れかえて描く人か（2 人の頭が反対側に来るよう、頭を寄せる向きを変える）
 */
export function clinchPose(style: StyleId | null, d: BodyDims, dist: number, mirrored = false): Pose {
  // 頭を寄せる向き（左右を入れかえる人は反対へ）
  const h = mirrored ? 1 : -1;
  const base = build(
    {
      lead: [0.13, 0.1],
      rear: [-0.14, -0.16],
      rearHeel: 0.25,
      rearLift: 0.015,
      leadYaw: -0.1,
      rearYaw: -0.45,
      crouch: style === "sumo" ? 0.16 : 0.07,
      shift: [-h * 0.03, 0],
      hipYaw: -0.15,
      hipPitch: 0.1,
      spinePitch: 0.1,
      chestPitch: 0.06,
      chestYaw: -h * 0.12,
      hipRoll: 0,
      chin: 0.15,
      hands: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      elbows: [
        [0.3, -1, -0.1],
        [-0.3, -1, -0.1],
      ],
      fists: [
        [0.9, 0.9, 0],
        [0.9, -0.9, 0],
      ],
    },
    d,
  );
  const desc = unpack(base);
  // 頭を横へ寄せる（胸を少し傾ける）
  desc.chest[2] += -h * 0.17;
  desc.neck[2] += h * 0.1;
  const p = pack(desc);
  // 相手の首の後ろと、肩に手をかける（相手の頭はこちらと反対の側にある）
  const neckY = legLength(d) * 0.94 + d.pelvisUp + d.abdomen + d.chestH + 0.02;
  const ox = -h * 0.08;
  return withHands(p, d, [
    [ox + 0.08, neckY - 0.03, dist - 0.1],
    [ox - 0.12, neckY - 0.15, dist - 0.14],
  ]);
}

/** 寝技で上になった人。相手の脚のあいだにひざをつき、両手を相手の胸に置く */
export function groundTopPose(d: BodyDims, dist: number): Pose {
  const desc: PoseDesc = {
    hip: [0, 0.5 + d.thigh * 0.1, -0.05],
    hipRot: [0.45, 0, 0],
    spine: [0.25, 0, 0],
    chest: [0.1, 0, 0],
    neck: [-0.55, 0, 0],
    shrug: [0.01, 0.01],
    hand: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    elbow: [
      [0.5, -1, -0.2],
      [-0.5, -1, -0.2],
    ],
    fist: [
      [0.4, 0.8, 0],
      [0.4, -0.8, 0],
    ],
    foot: [
      [0.17, 0.09, -0.48],
      [-0.17, 0.09, -0.48],
    ],
    footRot: [
      [0.9, 0.1, 0],
      [0.9, -0.1, 0],
    ],
    knee: [
      [0.2, -0.6, 1],
      [-0.2, -0.6, 1],
    ],
    breath: 0,
  };
  return withHands(pack(desc), d, [
    [0.12, 0.2, dist - 0.05],
    [-0.12, 0.18, dist + 0.05],
  ]);
}

/** 寝技で下になった人。あお向けで、脚で相手の腰をはさむ（ガード） */
export function groundBottomPose(d: BodyDims, dist: number): Pose {
  const desc: PoseDesc = {
    hip: [0, 0.13, 0],
    hipRot: [-1.4, 0, 0],
    spine: [0.18, 0, 0],
    chest: [0.12, 0, 0],
    neck: [0.45, 0, 0],
    shrug: [0.02, 0.02],
    hand: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    elbow: [
      [0.8, -1, -0.4],
      [-0.8, -1, -0.4],
    ],
    fist: [
      [0.5, 0.8, 0],
      [0.5, -0.8, 0],
    ],
    foot: [
      [0.13, 0.4, dist + 0.22],
      [-0.13, 0.36, dist + 0.25],
    ],
    footRot: [
      [-0.2, 0.8, 0],
      [-0.2, -0.8, 0],
    ],
    knee: [
      [1, 0.6, 0],
      [-1, 0.6, 0],
    ],
    breath: 0,
  };
  return withHands(pack(desc), d, [
    [0.15, 0.62, dist - 0.08],
    [-0.15, 0.58, dist - 0.02],
  ]);
}

/** 倒れた姿勢（KO、hp が 0）。あお向けで両手を広げ、顔を横へ向ける */
export function downPose(d: BodyDims): Pose {
  const desc: PoseDesc = {
    hip: [0, 0.11, 0],
    hipRot: [-1.56, 0, 0.05],
    spine: [-0.02, 0.05, 0],
    chest: [-0.02, 0.05, 0],
    neck: [0.05, 0.75, 0.15],
    shrug: [0.02, 0.02],
    hand: [
      [0.5, 0.18, -0.04],
      [-0.42, 0.32, -0.05],
    ],
    elbow: [
      [0.2, -0.2, -1],
      [-0.2, -0.2, -1],
    ],
    fist: [
      [0.4, 0.6, 0],
      [0.4, -0.6, 0],
    ],
    foot: [
      [0.2, 0.08, d.thigh + d.shin - 0.06],
      [-0.1, 0.17, d.thigh + d.shin - 0.32],
    ],
    footRot: [
      [-1.25, 0.4, 0],
      [-1.0, -0.2, 0],
    ],
    knee: [
      [0.3, 1, 0],
      [-0.4, 1, 0],
    ],
    breath: 0,
  };
  return pack(desc);
}

/** 手首の目標を、足もとから見た位置で決め直す */
export function withHands(p: Pose, d: BodyDims, at: [V3 | null, V3 | null]): Pose {
  const frame = chestFrame(p, d);
  const out = Float64Array.from(p);
  for (const i of [L, R] as const) {
    const v = at[i];
    if (!v) continue;
    const local = toChest(frame, v);
    out[P.hand + i * 3] = local[0];
    out[P.hand + i * 3 + 1] = local[1];
    out[P.hand + i * 3 + 2] = local[2];
  }
  return out;
}

/** 足もとから見た手首の位置（胸から見た位置を戻す） */
export function handRoot(p: Pose, d: BodyDims, i: 0 | 1): V3 {
  const f = chestFrame(p, d);
  const v: V3 = [p[P.hand + i * 3]!, p[P.hand + i * 3 + 1]!, p[P.hand + i * 3 + 2]!];
  return add(f.o, [
    f.r[0] * v[0] + f.r[1] * v[1] + f.r[2] * v[2],
    f.r[3] * v[0] + f.r[4] * v[1] + f.r[5] * v[2],
    f.r[6] * v[0] + f.r[7] * v[1] + f.r[8] * v[2],
  ]);
}

/**
 * hp が減ったときの疲れ（0〜1）。7 割を切ったあたりから効きはじめる
 */
export const fatigueOf = (hp: number) => smoothstep((70 - clamp(hp, 0, 100)) / 65);

/** 疲れた姿勢：前かがみになり、ガードが下がり、ひざが少し落ちる */
export function tiredPose(p: Pose, d: BodyDims, fatigue: number): Pose {
  if (fatigue <= 0) return p;
  const f = fatigue;
  const desc = unpack(p);
  const hands = [handRoot(p, d, 0), handRoot(p, d, 1)];
  desc.hip[1] -= 0.035 * f;
  desc.spine[0] += 0.16 * f;
  desc.chest[0] += 0.08 * f;
  desc.neck[0] -= 0.17 * f;
  desc.shrug = [desc.shrug[0] + 0.01 * f, desc.shrug[1] + 0.01 * f];
  const out = pack(desc);
  return withHands(out, d, [
    add(hands[0]!, [0, -0.13 * f, 0.03 * f]),
    add(hands[1]!, [0, -0.15 * f, 0.03 * f]),
  ]);
}

// ---- 息づかいと待ちの動き（構えに足す差分） ----

/** 息の波（-1 = 吐ききった、1 = 吸いきった）。吸うのは速く、吐くのはゆっくり */
export function breathWave(phase: number) {
  const u = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  return u < 0.4 ? -Math.cos((Math.PI * u) / 0.4) : Math.cos((Math.PI * (u - 0.4)) / 0.6);
}

/**
 * 1 秒あたりの呼吸の回数。スタミナが高いほどゆったり、hp が少ないほど速く荒く
 */
export function breathRate(stamina: number, hp: number) {
  const calm = lerp(0.3, 0.2, clamp((stamina + 1.33) / 2.33, 0, 1));
  return calm * (1 + 1.5 * fatigueOf(hp));
}

/** 待ちの動きの速さ（1 秒あたりの回数）。バックボーンごとのリズム */
export function rhythmOf(style: StyleId | null, speed: number) {
  const quick = 1 + 0.12 * speed;
  switch (style) {
    case "boxing":
      return 1.7 * quick;
    case "taekwondo":
      return 2.0 * quick;
    case "muaythai":
      return 0.95 * quick;
    case "mma":
      return 0.7 * quick;
    case "capoeira":
      return 0.36 * quick;
    case "judo":
    case "bjj":
    case "wrestling":
      return 0.55 * quick;
    default:
      return 0.4;
  }
}

const inc = (p: Pose, at: number, x: number) => {
  p[at] = p[at]! + x;
};
const addV = (p: Pose, at: number, x: number, y: number, z: number) => {
  p[at] = p[at]! + x;
  p[at + 1] = p[at + 1]! + y;
  p[at + 2] = p[at + 2]! + z;
};

/**
 * 構えに足す差分（息づかい + バックボーンごとの待ちの動き）を out に入れる。
 * breath：呼吸の位相、beat：待ちの動きの位相（どちらもラジアン）。t：経過時間（小さなゆらぎ用）。
 * energy：動きの大きさ（reduce-motion のときは小さくする）。lying：寝ている・倒れているときは息だけにする
 */
export function idleDelta(
  style: StyleId | null,
  breath: number,
  beat: number,
  t: number,
  fatigue: number,
  energy: number,
  lying: boolean,
  out: Pose = newPose(),
): Pose {
  out.fill(0);
  // 息：吸うと胸がふくらみ、肩が上がり、胸が少し起きる。疲れると大きく荒く
  const b = breathWave(breath);
  const a = 1 + 1.6 * fatigue;
  out[P.breath] = b * a;
  out[P.shrug] = out[P.shrug + 1] = 0.009 * a * (b + 1);
  out[P.chest] = -0.03 * a * b;
  out[P.spine] = -0.008 * a * b;
  out[P.neck] = 0.018 * a * b;
  out[P.hip + 1] = lying ? 0 : 0.003 * a * b;
  if (lying) return out;

  const e = energy * (1 - 0.55 * fatigue);
  const s = Math.sin(beat);
  const c = Math.cos(beat);
  // 小さなゆらぎ（同じ動きのくり返しに見えないように）
  const w1 = wobble(t * 0.7, 1);
  const w2 = wobble(t * 0.6, 2);
  addV(out, P.neck, 0.015 * w2 * e, 0.03 * w1 * e, 0);
  switch (style) {
    case "boxing": {
      // つま先で小さく上下に弾む。肩も少し揺らす
      const hop = Math.abs(Math.sin(beat / 2 + Math.PI / 2)) * 2 - 1;
      inc(out, P.hip + 1, 0.011 * hop * e);
      addV(out, P.hip, 0.012 * Math.sin(beat / 4) * e, 0, 0.006 * w1 * e);
      for (const i of [0, 1]) {
        inc(out, P.foot + i * 3 + 1, 0.006 * (hop + 1) * e);
        inc(out, P.footRot + i * 3, 0.06 * (hop + 1) * e);
      }
      inc(out, P.chest + 1, 0.04 * Math.sin(beat / 4) * e);
      inc(out, P.shrug, 0.005 * Math.sin(beat / 2) * e);
      inc(out, P.shrug + 1, -(0.005 * Math.sin(beat / 2) * e));
      break;
    }
    case "muaythai": {
      // 後ろ足でリズムをとり、前足のつま先で床をたたく
      inc(out, P.hip + 1, 0.01 * Math.sin(beat * 2) * e);
      inc(out, P.hip + 2, 0.015 * s * e);
      inc(out, P.foot + 1, 0.018 * Math.max(0, s) * e);
      inc(out, P.footRot, 0.12 * Math.max(0, s) * e);
      inc(out, P.chest, 0.02 * s * e);
      for (const i of [0, 1]) addV(out, P.hand + i * 3, 0, 0.012 * Math.sin(beat + i * 1.7) * e, 0.01 * c * e);
      break;
    }
    case "karate": {
      // 静か。重心だけがわずかに前後する
      inc(out, P.hip + 2, 0.006 * s * e);
      inc(out, P.hip + 1, 0.003 * c * e);
      break;
    }
    case "taekwondo": {
      // 両足で軽く跳ね、前足を少し出し入れする
      const hop = Math.abs(Math.sin(beat / 2 + Math.PI / 2)) * 2 - 1;
      inc(out, P.hip + 1, 0.016 * hop * e);
      for (const i of [0, 1]) {
        inc(out, P.foot + i * 3 + 1, 0.01 * (hop + 1) * e);
        inc(out, P.footRot + i * 3, 0.07 * (hop + 1) * e);
      }
      inc(out, P.foot + 2, 0.025 * Math.sin(beat / 4) * e);
      inc(out, P.hip + 2, 0.01 * Math.sin(beat / 4) * e);
      break;
    }
    case "judo":
    case "bjj": {
      // 体重を左右に移しながら、組み手を探って手を動かす
      inc(out, P.hip, 0.022 * s * e);
      inc(out, P.hipRot + 1, 0.06 * s * e);
      inc(out, P.hipRot + 2, 0.02 * s * e);
      for (const i of [0, 1]) addV(out, P.hand + i * 3, 0.02 * Math.sin(beat * 1.6 + i * 2) * e, 0.02 * Math.sin(beat * 1.3 + i) * e, 0.03 * Math.sin(beat * 1.9 + i * 1.3) * e);
      break;
    }
    case "wrestling": {
      // 腰の高さを上げ下げし、手で相手の手を払う
      inc(out, P.hip + 1, -0.016 * (s + 1) * e);
      inc(out, P.hip + 2, 0.012 * c * e);
      for (const i of [0, 1]) addV(out, P.hand + i * 3, 0.025 * Math.sin(beat * 2 + i * Math.PI) * e, 0.015 * Math.cos(beat * 2 + i * Math.PI) * e, 0.02 * s * e);
      break;
    }
    case "mma": {
      // 前後に小さくステップ
      inc(out, P.hip + 2, 0.035 * s * e);
      inc(out, P.hip + 1, 0.008 * Math.abs(Math.sin(beat * 2)) * e);
      inc(out, P.foot + 2, 0.045 * s * e);
      inc(out, P.foot + 3 + 2, 0.025 * Math.sin(beat - 0.6) * e);
      inc(out, P.foot + 1, 0.012 * Math.max(0, Math.cos(beat)) * e);
      inc(out, P.foot + 3 + 1, 0.012 * Math.max(0, -Math.cos(beat - 0.6)) * e);
      inc(out, P.chest + 1, 0.04 * s * e);
      break;
    }
    case "capoeira": {
      // ジンガ：片足ずつ後ろへ引きながら、左右へ体重を移してゆらゆら揺れる。引いた足と同じ側の腕で顔を守る
      const k = s;
      const left = Math.max(0, k);
      const right = Math.max(0, -k);
      const ge = Math.min(1, energy * 1.1);
      inc(out, P.foot + 2, -0.36 * left * ge);
      inc(out, P.foot + 3 + 2, -0.36 * right * ge);
      inc(out, P.foot, -0.04 * left * ge);
      inc(out, P.foot + 3, 0.04 * right * ge);
      inc(out, P.footRot, 0.35 * left * ge);
      inc(out, P.footRot + 3, 0.35 * right * ge);
      inc(out, P.hip, -0.06 * k * ge);
      inc(out, P.hip + 1, -0.05 * Math.abs(k) * ge);
      inc(out, P.hip + 2, -0.12 * Math.abs(k) * ge);
      inc(out, P.hipRot + 1, 0.42 * k * ge);
      inc(out, P.spine, 0.12 * Math.abs(k) * ge);
      inc(out, P.chest + 1, 0.12 * k * ge);
      // 腕：引いた足の側の腕が顔の前へ、反対の腕は下へ
      addV(out, P.hand, -0.1 * left * ge, 0.16 * left * ge - 0.08 * right * ge, 0.06 * left * ge);
      addV(out, P.hand + 3, 0.1 * right * ge, 0.3 * right * ge - 0.05 * left * ge, 0.08 * right * ge);
      break;
    }
    case "sumo": {
      // ほとんど動かず、重心をわずかに左右へ
      inc(out, P.hip, 0.012 * s * e);
      inc(out, P.hip + 1, -0.004 * (c + 1) * e);
      break;
    }
    default: {
      inc(out, P.hip, 0.008 * s * e);
      break;
    }
  }
  return out;
}
