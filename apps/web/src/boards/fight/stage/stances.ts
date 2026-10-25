import { legLength, type BodyDims } from "./body.ts";
import { add, clamp, lerp, norm, scale, smoothstep, sub, wobble, type V3 } from "./math.ts";
import { TWO_HAND_GAP } from "./outfit.ts";
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
    case "kickboxing":
      // ボクシングより足幅を広くとり、前足は軽く。ガードは高く、少し前へ
      return build(
        {
          lead: [0.11, 0.23],
          rear: [-0.14, -0.22],
          leadLift: 0.012,
          rearLift: 0.03,
          leadHeel: 0.25,
          rearHeel: 0.45,
          leadYaw: -0.28,
          rearYaw: -0.7,
          crouch: 0.06,
          hipYaw: -0.45,
          hipPitch: 0.04,
          spinePitch: 0.08,
          chestPitch: 0.07,
          chin: 0.12,
          hands: [
            [0.12, -0.12, 0.25],
            [-0.12, -0.11, 0.15],
          ],
          elbows: [
            [0.35, -1, -0.2],
            [-0.35, -1, -0.2],
          ],
          fists: [
            [0.25, 0.4, 0],
            [0.25, -0.4, 0],
          ],
        },
        d,
      );
    case "taichi":
      // 背すじを立て、ひざをゆるめる。前の手のひらを胸の前に、後ろの手はおへその前に
      return build(
        {
          lead: [0.11, 0.17],
          rear: [-0.13, -0.13],
          leadYaw: -0.05,
          rearYaw: -0.6,
          crouch: 0.08,
          hipYaw: -0.32,
          hipPitch: 0.02,
          spinePitch: -0.02,
          chestPitch: 0.0,
          chin: 0.0,
          hands: [
            [0.07, -0.2, 0.27],
            [-0.05, -0.43, 0.21],
          ],
          elbows: [
            [0.4, -1, -0.5],
            [-0.4, -1, -0.5],
          ],
          fists: [
            [-0.5, 0.9, 0],
            [0.3, -1.2, 0],
          ],
        },
        d,
      );
    case "gamer":
      // 少し猫背で首が前へ出る。両手はおなかの前で、見えないコントローラーを持つ
      return build(
        {
          lead: [0.11, 0.06],
          rear: [-0.11, -0.06],
          leadYaw: 0.1,
          rearYaw: -0.25,
          crouch: 0.03,
          hipYaw: -0.12,
          hipPitch: 0.02,
          spinePitch: 0.2,
          chestPitch: 0.2,
          chin: 0.25,
          hands: [
            [0.07, -0.4, 0.17],
            [-0.07, -0.41, 0.17],
          ],
          elbows: [
            [0.8, -1, -0.2],
            [-0.8, -1, -0.2],
          ],
          fists: [
            [0.4, 0.3, 0],
            [0.4, -0.3, 0],
          ],
        },
        d,
      );
    case "magician":
      // 背すじを伸ばして胸を張り、右手のステッキを前の床につく。左手は胸の前に
      return build(
        {
          lead: [0.09, 0.08],
          rear: [-0.09, -0.06],
          leadYaw: 0.2,
          rearYaw: -0.5,
          crouch: 0.02,
          hipYaw: -0.25,
          spinePitch: -0.04,
          chestPitch: -0.04,
          chin: -0.02,
          hands: [
            [0.1, -0.33, 0.13],
            [-0.17, -0.58, 0.1],
          ],
          elbows: [
            [1, -0.6, -0.3],
            [-0.5, -1, 0.1],
          ],
          fists: [
            [0.4, 1.0, 0],
            [0.3, -0.4, 0],
          ],
        },
        d,
      );
    case "nurse":
      // 落ち着いて肩幅に立ち、手は軽く開いて胸の下に。いつでも手を差しのべられる構え
      return build(
        {
          lead: [0.11, 0.1],
          rear: [-0.12, -0.08],
          leadYaw: 0,
          rearYaw: -0.4,
          crouch: 0.035,
          hipYaw: -0.2,
          spinePitch: 0.03,
          chestPitch: 0.02,
          chin: 0.04,
          hands: [
            [0.12, -0.31, 0.2],
            [-0.12, -0.33, 0.16],
          ],
          elbows: [
            [0.5, -1, -0.3],
            [-0.5, -1, -0.3],
          ],
          fists: [
            [0.1, 0.8, 0],
            [0.1, -0.8, 0],
          ],
        },
        d,
      );
    case "swimmer":
      // 足をそろえ気味に立ち、腕は力を抜いて体の横に下げる
      return build(
        {
          lead: [0.1, 0.05],
          rear: [-0.1, -0.03],
          leadYaw: 0.05,
          rearYaw: -0.2,
          crouch: 0.025,
          hipYaw: -0.1,
          spinePitch: 0.02,
          chin: 0.03,
          hands: [
            [0, 0, 0],
            [0, 0, 0],
          ],
          handsAbs: [
            [0.25, leg * 0.98, 0.07],
            [-0.25, leg * 0.98, 0.04],
          ],
          elbows: [
            [0.3, -1, -0.6],
            [-0.3, -1, -0.6],
          ],
          fists: [
            [0.1, 0.4, 0],
            [0.1, -0.4, 0],
          ],
        },
        d,
      );
    case "idol":
      // 足を軽く寄せ、両手は胸の前で「がんばる」のこぶし。右手にペンライト
      return build(
        {
          lead: [0.06, 0.09],
          rear: [-0.1, -0.05],
          leadHeel: 0.15,
          leadLift: 0.006,
          leadYaw: 0.15,
          rearYaw: -0.35,
          crouch: 0.03,
          hipYaw: -0.15,
          hipRoll: 0.04,
          spinePitch: 0.0,
          chestPitch: -0.02,
          chin: 0.02,
          hands: [
            [0.1, -0.25, 0.14],
            [-0.11, -0.24, 0.15],
          ],
          elbows: [
            [0.5, -1, -0.4],
            [-0.5, -1, -0.4],
          ],
          fists: [
            [0.6, 0.8, 0],
            [0.3, -0.8, 0],
          ],
        },
        d,
      );
    case "rapper":
      // 足を開いて少し反り、肩の力を抜く。左手はゆるく下げ、右手は胸の前で言葉に合わせて動かす
      return build(
        {
          lead: [0.15, 0.08],
          rear: [-0.15, -0.08],
          leadYaw: 0.3,
          rearYaw: -0.5,
          crouch: 0.05,
          hipYaw: -0.2,
          hipPitch: -0.03,
          spinePitch: -0.05,
          chestPitch: 0.02,
          chin: 0.08,
          hands: [
            [0.2, -0.5, 0.06],
            [-0.12, -0.25, 0.2],
          ],
          elbows: [
            [0.6, -1, -0.4],
            [-0.6, -1, -0.2],
          ],
          fists: [
            [0.2, 0.6, 0],
            [0.4, -0.6, 0],
          ],
        },
        d,
      );
    case "chef":
      // 右手のフライパンを腰の横に構え、左手は前へ。どっしりと立つ
      return build(
        {
          lead: [0.12, 0.12],
          rear: [-0.13, -0.1],
          leadYaw: -0.05,
          rearYaw: -0.5,
          crouch: 0.045,
          hipYaw: -0.3,
          spinePitch: 0.04,
          chestPitch: 0.02,
          chin: 0.05,
          hands: [
            [0.11, -0.27, 0.22],
            [-0.2, -0.42, 0.14],
          ],
          elbows: [
            [0.5, -1, -0.3],
            [-0.6, -1, -0.2],
          ],
          fists: [
            [0.2, 0.8, 0],
            [0.2, -0.6, 0],
          ],
        },
        d,
      );
    case "robot":
      // まっすぐ立ち、両腕はひじを直角に曲げて前へ（箱のような構え）
      return build(
        {
          lead: [0.12, 0.07],
          rear: [-0.12, -0.07],
          leadYaw: 0,
          rearYaw: -0.15,
          crouch: 0.035,
          hipYaw: -0.08,
          spinePitch: 0.0,
          chestPitch: 0.0,
          chin: 0.0,
          hands: [
            [0.15, -0.3, 0.26],
            [-0.15, -0.3, 0.24],
          ],
          elbows: [
            [0.2, -1, -0.1],
            [-0.2, -1, -0.1],
          ],
          fists: [
            [0, 0, 0],
            [0, 0, 0],
          ],
        },
        d,
      );
    case "ninja":
      // 腰を深く落として低く構える。前の手は手刀にして前へ、後ろの手は胸の前に引く
      return build(
        {
          lead: [0.13, 0.27],
          rear: [-0.15, -0.25],
          rearLift: 0.02,
          rearHeel: 0.4,
          leadYaw: -0.2,
          rearYaw: -0.75,
          crouch: 0.2,
          hipYaw: -0.55,
          hipPitch: 0.3,
          spinePitch: 0.12,
          chestPitch: 0.04,
          chin: 0.06,
          hands: [
            [0.1, -0.22, 0.3],
            [-0.05, -0.33, 0.12],
          ],
          elbows: [
            [0.4, -1, -0.2],
            [-0.5, -1, -0.2],
          ],
          fists: [
            [0.1, 1.3, 0],
            [0.3, -0.9, 0],
          ],
          knees: [
            [0.45, 0, 1],
            [-0.35, 0, 1],
          ],
        },
        d,
      );
    case "tuktuk":
      // ハンドルを握るように、両手を胸の下の前へ出す（手の甲が上）。少し前へ乗り出す
      return build(
        {
          lead: [0.12, 0.09],
          rear: [-0.12, -0.07],
          leadYaw: -0.05,
          rearYaw: -0.4,
          crouch: 0.05,
          hipYaw: -0.12,
          hipPitch: 0.06,
          spinePitch: 0.1,
          chestPitch: 0.04,
          chin: 0.08,
          hands: [
            [0.2, -0.4, 0.28],
            [-0.2, -0.4, 0.28],
          ],
          elbows: [
            [1, -0.6, -0.2],
            [-1, -0.6, -0.2],
          ],
          fists: [
            [0.4, 1.2, 0],
            [0.4, -1.2, 0],
          ],
        },
        d,
      );
    case "stuntman":
      // つま先で軽く立ち、ひざに余裕を持たせる。手は胸の前で軽く握る
      return build(
        {
          lead: [0.12, 0.19],
          rear: [-0.14, -0.19],
          leadLift: 0.012,
          rearLift: 0.03,
          leadHeel: 0.25,
          rearHeel: 0.45,
          leadYaw: -0.3,
          rearYaw: -0.7,
          crouch: 0.08,
          hipYaw: -0.4,
          hipPitch: 0.08,
          spinePitch: 0.08,
          chestPitch: 0.04,
          chin: 0.08,
          hands: [
            [0.12, -0.2, 0.22],
            [-0.12, -0.22, 0.14],
          ],
          elbows: [
            [0.5, -1, -0.2],
            [-0.5, -1, -0.2],
          ],
          fists: [
            [0.2, 0.6, 0],
            [0.2, -0.6, 0],
          ],
        },
        d,
      );
    case "salaryman":
      // 背すじを伸ばしてまっすぐ立つ。右手にカバンを下げ、左手は軽く握ってみぞおちの前に
      return build(
        {
          lead: [0.1, 0.07],
          rear: [-0.1, -0.05],
          leadYaw: 0.05,
          rearYaw: -0.35,
          crouch: 0.02,
          hipYaw: -0.2,
          hipPitch: -0.02,
          spinePitch: -0.04,
          chestPitch: -0.03,
          chin: 0.0,
          hands: [
            [0.07, -0.33, 0.2],
            [0, 0, 0],
          ],
          handsAbs: [null, [-0.24, leg * 0.98, 0.02]],
          elbows: [
            [0.6, -1, -0.3],
            [-0.3, -1, -0.3],
          ],
          fists: [
            [0.2, 0.9, 0],
            [0, -0.2, 0],
          ],
        },
        d,
      );
    case "bubbletea":
      // カップを胸の前に見せるように持ち、左手は腰に当てる。足は軽く開いて楽に立つ
      return build(
        {
          lead: [0.1, 0.08],
          rear: [-0.11, -0.06],
          leadYaw: 0.15,
          rearYaw: -0.4,
          crouch: 0.03,
          hipYaw: -0.2,
          hipRoll: 0.03,
          spinePitch: 0.0,
          chestPitch: -0.02,
          chin: 0.03,
          hands: [
            [0, 0, 0],
            [-0.08, -0.3, 0.2],
          ],
          handsAbs: [[0.26, leg * 1.04, -0.03], null],
          elbows: [
            [1, -0.3, -0.6],
            [-0.5, -1, -0.3],
          ],
          fists: [
            [0.3, 0.6, 0.6],
            [0, 1.6, 0],
          ],
        },
        d,
      );
    case "kendo": {
      // 中段の構え：右足を前に、左のかかとを少し上げて、まっすぐ相手に向く。左手は柄の端をへその前に、
      // 右手はその前（鍔の下）。剣先は相手ののどへ向ける
      const pommel: V3 = [0.0, leg * 0.97 + 0.15, 0.21];
      const dir = norm(sub([0, leg * 0.97 + 0.5, 1.15], pommel));
      return build(
        {
          lead: [0.1, -0.13],
          rear: [-0.09, 0.15],
          leadLift: 0.02,
          leadHeel: 0.4,
          leadYaw: -0.05,
          rearYaw: 0.0,
          crouch: 0.03,
          hipYaw: 0.05,
          spinePitch: -0.02,
          chestPitch: 0.0,
          chin: 0.02,
          hands: [
            [0, 0, 0],
            [0, 0, 0],
          ],
          handsAbs: [pommel, add(pommel, scale(dir, TWO_HAND_GAP))],
          elbows: [
            [0.4, -1, -0.3],
            [-0.4, -1, -0.3],
          ],
          fists: [
            [0.3, 0.6, 0],
            [0.3, -0.6, 0],
          ],
        },
        d,
      );
    }
    case "luchador":
      // 胸を張り、両手を開いて胸の高さに広げる（いつでもつかみに行ける）
      return build(
        {
          lead: [0.12, 0.15],
          rear: [-0.14, -0.15],
          rearLift: 0.015,
          rearHeel: 0.3,
          leadYaw: -0.15,
          rearYaw: -0.5,
          crouch: 0.07,
          hipYaw: -0.25,
          hipPitch: 0.04,
          spinePitch: -0.04,
          chestPitch: -0.1,
          chin: 0.02,
          hands: [
            [0.22, -0.24, 0.18],
            [-0.22, -0.26, 0.13],
          ],
          elbows: [
            [0.9, -0.6, -0.2],
            [-0.9, -0.6, -0.2],
          ],
          fists: [
            [0.2, 0.9, 0],
            [0.2, -0.9, 0],
          ],
        },
        d,
      );
    case "firefighter": {
      // 足を広く、腰を落としてどっしり立つ。筒先は右の腰の前で、両手で前へ向けて持つ（左手は後ろのホース）
      const front: V3 = [-0.07, leg * 0.98 + 0.15, 0.36];
      const dir = norm([0.04, -0.18, 1]);
      return build(
        {
          lead: [0.16, 0.19],
          rear: [-0.17, -0.18],
          rearHeel: 0.15,
          leadYaw: -0.25,
          rearYaw: -0.7,
          crouch: 0.09,
          hipYaw: -0.3,
          hipPitch: 0.06,
          spinePitch: 0.06,
          chestPitch: 0.02,
          chin: 0.05,
          hands: [
            [0, 0, 0],
            [0, 0, 0],
          ],
          handsAbs: [sub(front, scale(dir, TWO_HAND_GAP)), front],
          elbows: [
            [0.3, -1, -0.4],
            [-0.6, -1, -0.3],
          ],
          fists: [
            [0.2, 0.6, 0],
            [0.2, -0.6, 0],
          ],
        },
        d,
      );
    }
    case "dj":
      // 楽に立ち、ひざでリズムをとる。両手は胸の前で軽く握る
      return build(
        {
          lead: [0.1, 0.1],
          rear: [-0.12, -0.08],
          leadYaw: -0.1,
          rearYaw: -0.45,
          crouch: 0.05,
          hipYaw: -0.25,
          hipRoll: 0.02,
          spinePitch: 0.03,
          chin: 0.06,
          hands: [
            [0.1, -0.28, 0.17],
            [-0.12, -0.31, 0.13],
          ],
          elbows: [
            [0.6, -1, -0.2],
            [-0.6, -1, -0.2],
          ],
          fists: [
            [0.2, 0.6, 0],
            [0.2, -0.6, 0],
          ],
        },
        d,
      );
    case "investor":
      // 背すじを伸ばして落ち着いて立つ。右手のタブレットをみぞおちの前に持ち、左手は体の横に下ろす
      return build(
        {
          lead: [0.09, 0.06],
          rear: [-0.1, -0.05],
          leadYaw: 0.0,
          rearYaw: -0.35,
          crouch: 0.02,
          hipYaw: -0.15,
          hipPitch: -0.02,
          spinePitch: -0.03,
          chestPitch: -0.02,
          chin: 0.03,
          hands: [
            [0, 0, 0],
            [-0.05, -0.42, 0.2],
          ],
          handsAbs: [[0.23, leg * 0.97 + 0.02, 0.02], null],
          elbows: [
            [0.3, -1, -0.4],
            [-0.5, -1, -0.3],
          ],
          fists: [
            [0, 0.3, 0],
            [0.2, 1.3, 0],
          ],
        },
        d,
      );
    case "dino":
      // 恐竜らしく、両手を胸の前で小さく構え（ひじを引き、手首を下へ）、つま先を外へ開いてどっしり立つ
      return build(
        {
          lead: [0.13, 0.07],
          rear: [-0.13, -0.06],
          leadYaw: 0.25,
          rearYaw: -0.25,
          crouch: 0.07,
          hipYaw: -0.1,
          hipPitch: 0.06,
          spinePitch: 0.05,
          chestPitch: -0.03,
          chin: 0.05,
          hands: [
            [0.12, -0.26, 0.17],
            [-0.12, -0.26, 0.17],
          ],
          elbows: [
            [0.5, -1, -0.7],
            [-0.5, -1, -0.7],
          ],
          fists: [
            [1.0, 0.3, 0],
            [1.0, -0.3, 0],
          ],
          knees: [
            [0.5, 0, 1],
            [-0.5, 0, 1],
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
  // 剣道家は鍔迫り合い：両手を胸の前に寄せ、竹刀を立てて押し合う
  if (style === "kendo")
    return withHands(p, d, [
      [0.0, neckY - 0.42, 0.24],
      [0.0, neckY - 0.42 + TWO_HAND_GAP * 0.92, 0.29],
    ]);
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
    case "kickboxing":
      return 1.25 * quick;
    case "taichi":
      return 0.13;
    case "gamer":
      return 0.9 * quick;
    case "magician":
    case "nurse":
      return 0.3;
    case "swimmer":
      return 0.42 * quick;
    case "idol":
      return 1.05;
    case "rapper":
      // 90 BPM くらいのビート（肩はその半分の速さで揺らす）
      return 1.5;
    case "chef":
      return 0.45;
    case "robot":
      return 0.5;
    case "ninja":
      return 0.22;
    case "tuktuk":
      return 1.1 * quick;
    case "stuntman":
      return 1.55 * quick;
    case "salaryman":
      return 0.32;
    case "bubbletea":
      // 店の音楽くらいのリズム
      return 0.9;
    case "kendo":
      // すり足の前後（ゆっくり）
      return 0.42;
    case "luchador":
      return 1.5 * quick;
    case "firefighter":
      return 0.38;
    case "dj":
      // 120 BPM のビート
      return 2.0;
    case "investor":
      return 0.28;
    case "dino":
      // のしのし（左右へ 1 歩ずつ）
      return 0.55;
    default:
      return 0.4;
  }
}

/** サラリーマンがネクタイを直している途中か（0〜1 の進み、直していなければ 0）。7 秒ごとに 1.4 秒 */
export function tieFix(t: number) {
  const u = ((((t + 3) % 7) + 7) % 7) / 1.4;
  return u > 0 && u < 1 ? u : 0;
}

/** 投資家が眼鏡を押し上げている途中か（0〜1 の進み、押し上げていなければ 0）。6.5 秒ごとに 1.1 秒 */
export function glassesFix(t: number) {
  const u = ((((t + 1.5) % 6.5) + 6.5) % 6.5) / 1.1;
  return u > 0 && u < 1 ? u : 0;
}

/** トゥクトゥク運転手がアクセルをふかしている強さ（0〜1）。ときどき右の手首をひねる */
export const throttleOf = (t: number) => Math.max(0, Math.sin(t * 0.9)) ** 8;

/** 0〜1 のでたらめに見える数（同じ n なら同じ値） */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** マジシャンがステッキを回している途中か（0〜1 の進み、回していなければ 0）。5.5 秒ごとに 0.7 秒 */
export function caneSpin(t: number) {
  const u = (((t % 5.5) + 5.5) % 5.5) / 0.7;
  return u > 0 && u < 1 ? u : 0;
}

/** アイドルが手を振っている途中か（0〜1 の進み、振っていなければ 0）。4.6 秒ごとに 1.3 秒 */
export function waveOf(t: number) {
  const u = ((((t + 2) % 4.6) + 4.6) % 4.6) / 1.3;
  return u > 0 && u < 1 ? u : 0;
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
  // 息：吸うと胸がふくらみ、肩が上がり、胸が少し起きる。疲れると大きく荒く。
  // ロボットは息をしない（胸の光の点滅で見せる）
  const robot = style === "robot";
  const b = robot ? 0 : breathWave(breath);
  // 忍者は気配を消すように、息を小さくする
  const a = robot ? 0 : (1 + 1.6 * fatigue) * (style === "ninja" ? 0.45 : 1);
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
  if (!robot) addV(out, P.neck, 0.015 * w2 * e, 0.03 * w1 * e, 0);
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
    case "kickboxing": {
      // リズムよく前後に揺れ、前に出るときに前足を軽く浮かせる
      inc(out, P.hip + 2, 0.03 * s * e);
      inc(out, P.hip + 1, 0.009 * Math.abs(Math.sin(beat)) * e);
      inc(out, P.foot + 1, 0.02 * Math.max(0, s) * e);
      inc(out, P.footRot, 0.14 * Math.max(0, s) * e);
      inc(out, P.foot + 2, 0.03 * s * e);
      inc(out, P.chest, 0.025 * s * e);
      inc(out, P.chest + 1, 0.03 * Math.sin(beat / 2) * e);
      for (const i of [0, 1]) addV(out, P.hand + i * 3, 0, 0.01 * Math.sin(beat + i * 1.3) * e, 0.012 * c * e);
      break;
    }
    case "taichi": {
      // ゆっくり円を描く手（雲手）。手と一緒に、重心を左右へ静かに移す
      const r = 0.075 * e;
      addV(out, P.hand, -r * c, r * 0.8 * s, 0.02 * s * e);
      addV(out, P.hand + 3, r * c, -r * 0.8 * s, -0.02 * s * e);
      inc(out, P.hip, 0.035 * c * e);
      inc(out, P.hip + 1, -0.012 * (1 - Math.abs(c)) * e);
      inc(out, P.hipRot + 1, 0.12 * c * e);
      inc(out, P.chest + 1, 0.06 * c * e);
      inc(out, P.fist + 1, 0.3 * s * e);
      inc(out, P.fist + 4, 0.3 * s * e);
      break;
    }
    case "gamer": {
      // 指先だけが細かく動く（見えないボタンを押す）。ときどき首を小さく縦に振る
      const tap = Math.sin(t * 23) * Math.sin(t * 7.3);
      const tap2 = Math.sin(t * 19 + 1) * Math.sin(t * 5.1 + 2);
      addV(out, P.fist, 0.22 * tap * e, 0, 0.1 * tap2 * e);
      addV(out, P.fist + 3, 0.22 * tap2 * e, 0, -0.1 * tap * e);
      addV(out, P.hand, 0.004 * tap2 * e, 0.005 * tap * e, 0);
      addV(out, P.hand + 3, 0.004 * tap * e, 0.005 * tap2 * e, 0);
      inc(out, P.neck, 0.05 * Math.max(0, Math.sin(beat * 2)) ** 4 * e);
      inc(out, P.hip, 0.006 * s * e);
      break;
    }
    case "magician": {
      // 優雅にゆっくり揺れ、ときどき右手のステッキをくるりと回す
      inc(out, P.hip, 0.008 * s * e);
      inc(out, P.chest + 1, 0.03 * s * e);
      // 回しかけで止まって見えないよう、動きを小さくするときは回さない
      const spin = energy > 0.5 ? caneSpin(t) : 0;
      if (spin > 0) {
        const lift = Math.sin(Math.PI * spin);
        inc(out, P.fist + 3, -2 * Math.PI * smoothstep(spin));
        addV(out, P.hand + 3, 0, 0.12 * lift * e, 0.04 * lift * e);
      }
      break;
    }
    case "nurse": {
      // 静かに体重を移し、ときどき小さくうなずく
      inc(out, P.hip, 0.01 * s * e);
      inc(out, P.hipRot + 1, 0.03 * s * e);
      inc(out, P.neck, 0.04 * Math.max(0, Math.sin(t * 0.9)) ** 8 * e);
      break;
    }
    case "swimmer": {
      // かかとで軽く弾み、片腕ずつ大きく回す（回していない腕は前後に振る）
      const left = Math.sin(beat / 2) > 0;
      const k = Math.sin(beat);
      const kc = Math.cos(beat);
      // 肩を中心に、腕の長さくらいの円を描く（前から上、後ろへ）
      const big = 0.5 * e;
      addV(out, P.hand + (left ? 0 : 3), (left ? -0.03 : 0.03) * (1 - kc) * e, big * (1 - kc), big * k);
      addV(out, P.hand + (left ? 3 : 0), 0, 0.02 * e, 0.1 * k * e);
      inc(out, P.shrug + (left ? 0 : 1), 0.02 * (1 - kc) * e);
      inc(out, P.chest + 1, (left ? -1 : 1) * 0.06 * (1 - kc) * e);
      inc(out, P.hip + 1, 0.01 * Math.abs(Math.sin(beat * 2)) * e);
      for (const i of [0, 1]) inc(out, P.footRot + i * 3, 0.06 * Math.abs(Math.sin(beat * 2)) * e);
      break;
    }
    case "idol": {
      // リズムに合わせて軽く弾み、腰を左右に。ときどき右手を大きく振る
      inc(out, P.hip + 1, 0.012 * Math.abs(Math.sin(beat)) * e);
      inc(out, P.hip, 0.012 * Math.sin(beat / 2) * e);
      inc(out, P.hipRot + 2, 0.03 * Math.sin(beat / 2) * e);
      inc(out, P.neck + 2, -0.06 * Math.sin(beat / 2) * e);
      for (const i of [0, 1]) inc(out, P.foot + i * 3 + 1, 0.008 * Math.max(0, Math.sin(beat + i * Math.PI)) * e);
      const wave = waveOf(t);
      if (wave > 0) {
        const up = Math.sin(Math.PI * wave) ** 0.6;
        addV(out, P.hand + 3, -0.12 * up * e + 0.08 * Math.sin(wave * 26) * up * e, 0.42 * up * e, 0.02 * up * e);
        inc(out, P.elbow + 3 + 1, 1.2 * up * e);
      }
      break;
    }
    case "rapper": {
      // ビートに乗って肩を交互に揺らし、首でリズムをとる。右手は言葉に合わせて上下
      const half = Math.sin(beat / 2);
      inc(out, P.shrug, 0.018 * Math.max(0, half) * e);
      inc(out, P.shrug + 1, 0.018 * Math.max(0, -half) * e);
      inc(out, P.chest + 2, 0.05 * half * e);
      inc(out, P.chest + 1, 0.05 * half * e);
      inc(out, P.hip + 1, -0.012 * Math.abs(Math.sin(beat)) * e);
      inc(out, P.neck, 0.08 * Math.abs(Math.sin(beat)) * e);
      addV(out, P.hand + 3, 0.02 * half * e, 0.035 * Math.abs(Math.sin(beat)) * e, 0.02 * c * e);
      break;
    }
    case "chef": {
      // どっしり。フライパンを持つ手を、ときどき小さくあおる
      inc(out, P.hip, 0.008 * s * e);
      const toss = Math.max(0, Math.sin(t * 1.4)) ** 10;
      addV(out, P.hand + 3, 0, 0.05 * toss * e, 0.03 * toss * e);
      inc(out, P.fist + 3, -0.3 * toss * e);
      break;
    }
    case "robot": {
      // 機械らしく、ときどき首や腕がカクッと小さく動く（あいだは止まっている）
      const step = Math.floor(t * 0.9);
      const u = smoothstep((t * 0.9 - step) / 0.09);
      const at = (n: number, k: number) => lerp(hash(n * 7 + k), hash((n + 1) * 7 + k), u);
      inc(out, P.neck + 1, 0.22 * (at(step, 1) - 0.5) * e);
      inc(out, P.neck, 0.08 * (at(step, 2) - 0.5) * e);
      addV(out, P.hand, 0, 0.03 * (at(step, 3) - 0.5) * e, 0.03 * (at(step, 4) - 0.5) * e);
      addV(out, P.hand + 3, 0, 0.03 * (at(step, 5) - 0.5) * e, 0.03 * (at(step, 6) - 0.5) * e);
      inc(out, P.chest + 1, 0.06 * (at(step, 0) - 0.5) * e);
      break;
    }
    case "ninja": {
      // ほとんど動かない。ゆっくり腰を沈め、目だけで相手を探るように首を小さく振る
      inc(out, P.hip + 1, -0.008 * (s + 1) * e);
      inc(out, P.hip, 0.006 * c * e);
      inc(out, P.neck + 1, 0.1 * Math.sin(beat * 0.7) * e);
      inc(out, P.neck, 0.03 * s * e);
      break;
    }
    case "tuktuk": {
      // 道のでこぼこで小さく揺れ、ハンドルを少し切る。ときどき右の手首をひねってアクセルをふかす
      const bump = (Math.sin(t * 13) * Math.sin(t * 3.1) + 0.4 * Math.sin(t * 21)) * e;
      const steer = Math.sin(beat / 3) * e;
      inc(out, P.hip + 1, 0.005 * bump);
      for (const i of [0, 1]) addV(out, P.hand + i * 3, 0, 0.006 * bump + (i === 0 ? 1 : -1) * 0.018 * steer, 0);
      inc(out, P.chest + 1, 0.05 * steer);
      inc(out, P.neck + 1, -0.04 * steer);
      const rev = throttleOf(t) * e;
      inc(out, P.fist + 3, -0.6 * rev);
      inc(out, P.shrug + 1, 0.01 * rev);
      break;
    }
    case "stuntman": {
      // 身軽に弾み、左右の足を入れかえるように軽く浮かせる。肩もほぐす
      const hop = Math.abs(Math.sin(beat / 2 + Math.PI / 2)) * 2 - 1;
      inc(out, P.hip + 1, 0.02 * hop * e);
      for (const i of [0, 1]) {
        const lift = Math.max(0, Math.sin(beat / 2 + i * Math.PI));
        inc(out, P.foot + i * 3 + 1, (0.008 * (hop + 1) + 0.025 * lift) * e);
        inc(out, P.footRot + i * 3, (0.08 * (hop + 1) + 0.2 * lift) * e);
      }
      inc(out, P.hip, 0.015 * Math.sin(beat / 2) * e);
      inc(out, P.chest + 1, 0.05 * Math.sin(beat / 2) * e);
      inc(out, P.shrug, 0.008 * Math.max(0, Math.sin(beat / 4)) * e);
      inc(out, P.shrug + 1, 0.008 * Math.max(0, -Math.sin(beat / 4)) * e);
      break;
    }
    case "salaryman": {
      // 落ち着いて静かに立つ。ときどき左手でネクタイの結び目を直し、あごを少し上げる
      inc(out, P.hip, 0.006 * s * e);
      inc(out, P.hipRot + 1, 0.02 * s * e);
      const fix = energy > 0.5 ? tieFix(t) : 0;
      if (fix > 0) {
        const up = Math.sin(Math.PI * fix) ** 0.5;
        const jiggle = Math.sin(fix * 22) * up;
        addV(out, P.hand, -0.06 * up + 0.012 * jiggle, 0.2 * up, -0.03 * up);
        inc(out, P.elbow, 0.5 * up);
        inc(out, P.fist, 0.6 * up);
        inc(out, P.neck, -0.1 * up);
        inc(out, P.neck + 2, 0.06 * jiggle);
      }
      break;
    }
    case "bubbletea": {
      // 店の音楽に合わせて軽く揺れ、カップを持つ手で小さく円を描く（中身を混ぜる）
      inc(out, P.hip, 0.012 * s * e);
      inc(out, P.hipRot + 2, 0.025 * s * e);
      inc(out, P.hip + 1, 0.006 * Math.abs(Math.sin(beat)) * e);
      inc(out, P.neck + 2, -0.05 * s * e);
      addV(out, P.hand + 3, 0.012 * Math.cos(beat * 2) * e, 0.006 * Math.sin(beat) * e, 0.012 * Math.sin(beat * 2) * e);
      break;
    }
    case "kendo": {
      // すり足：前の右足から出て、後ろの左足を引きつける。剣先は小さく上下して相手の気配を探る
      inc(out, P.hip + 2, 0.03 * s * e);
      inc(out, P.foot + 3 + 2, 0.04 * Math.sin(beat + 0.5) * e);
      inc(out, P.foot + 2, 0.04 * Math.sin(beat - 0.5) * e);
      inc(out, P.hip + 1, -0.004 * (c + 1) * e);
      addV(out, P.hand + 3, 0, 0.008 * Math.sin(beat * 2.3) * e, 0.006 * Math.sin(beat * 2.3) * e);
      break;
    }
    case "luchador": {
      // 胸を張ったまま、つま先で軽く弾む。開いた手を握ったり開いたりして、観客にも見せる
      const hop = Math.abs(Math.sin(beat / 2 + Math.PI / 2)) * 2 - 1;
      inc(out, P.hip + 1, 0.014 * hop * e);
      for (const i of [0, 1]) {
        inc(out, P.foot + i * 3 + 1, 0.007 * (hop + 1) * e);
        inc(out, P.footRot + i * 3, 0.07 * (hop + 1) * e);
      }
      inc(out, P.chest, -0.025 * Math.max(0, Math.sin(beat / 2)) * e);
      inc(out, P.chest + 1, 0.05 * Math.sin(beat / 4) * e);
      for (const i of [0, 1]) inc(out, P.fist + i * 3, 0.35 * Math.max(0, Math.sin(beat / 2 + i * 1.5)) * e);
      break;
    }
    case "firefighter": {
      // どっしりと重心を左右に移す。ときどき筒先を握り直す
      inc(out, P.hip, 0.01 * s * e);
      inc(out, P.hipRot + 1, 0.03 * s * e);
      inc(out, P.hip + 1, -0.004 * (c + 1) * e);
      const grip = Math.max(0, Math.sin(t * 0.8)) ** 12;
      addV(out, P.hand + 3, 0, 0.02 * grip * e, 0.015 * grip * e);
      addV(out, P.hand, 0, 0.02 * grip * e, 0.015 * grip * e);
      break;
    }
    case "dj": {
      // ビートに合わせてひざで弾み、首でリズムをとる。肩は 2 拍で交互に上げる
      const bounce = Math.abs(Math.sin(beat));
      inc(out, P.hip + 1, -0.014 * bounce * e);
      inc(out, P.neck, 0.1 * bounce * e);
      const half = Math.sin(beat / 2);
      inc(out, P.shrug, 0.016 * Math.max(0, half) * e);
      inc(out, P.shrug + 1, 0.016 * Math.max(0, -half) * e);
      inc(out, P.chest + 1, 0.06 * half * e);
      inc(out, P.hip, 0.01 * half * e);
      for (const i of [0, 1]) addV(out, P.hand + i * 3, 0, -0.015 * bounce * e, 0.012 * Math.sin(beat + i * Math.PI) * e);
      break;
    }
    case "investor": {
      // 静かに立ち、ときどきタブレットに目を落とす。ときどき左手で眼鏡を押し上げる
      inc(out, P.hip, 0.005 * s * e);
      inc(out, P.neck, 0.12 * Math.max(0, Math.sin(t * 0.55 + 1)) ** 6 * e);
      const fix = energy > 0.5 ? glassesFix(t) : 0;
      if (fix > 0) {
        const up = Math.sin(Math.PI * fix) ** 0.5;
        addV(out, P.hand, -0.13 * up, 0.5 * up, 0.12 * up);
        inc(out, P.elbow, 0.4 * up);
        inc(out, P.fist, 0.8 * up);
        inc(out, P.neck, -0.06 * up);
      }
      break;
    }
    case "dino": {
      // のしのし：左右へ大きく体重を移し、浮いた足で床を踏む。体ごと左右へ揺れる
      inc(out, P.hip, 0.028 * s * e);
      inc(out, P.hipRot + 2, -0.06 * s * e);
      inc(out, P.chest + 2, 0.04 * s * e);
      inc(out, P.chest + 1, 0.06 * s * e);
      inc(out, P.hip + 1, -0.01 * Math.abs(s) * e);
      inc(out, P.foot + 1, 0.035 * Math.max(0, -s) ** 2 * e);
      inc(out, P.foot + 3 + 1, 0.035 * Math.max(0, s) ** 2 * e);
      inc(out, P.neck + 2, -0.05 * s * e);
      break;
    }
    default: {
      inc(out, P.hip, 0.008 * s * e);
      break;
    }
  }
  return out;
}
