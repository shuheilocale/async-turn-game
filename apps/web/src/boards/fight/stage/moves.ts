import { armLength, legLength, type BodyDims } from "./body.ts";
import { add, clamp, type V3 } from "./math.ts";
import { edit, headCenter, P, pack, type Pose, type PoseDesc } from "./pose.ts";
import { clinchPose, downPose, groundBottomPose, groundTopPose, handRoot, stanceOf, withHands } from "./stances.ts";
import { isDefense, isGrapple, mergeStrikes } from "./ground.ts";
import { propOf } from "./outfit.ts";
import { afterimageDodge, iceShot, isSelf, isSpecial, mechanical, sidestep, specialTrack, stretchTime, UNTIL_END, vanishTrack, VANISH_GONE } from "./special.ts";
import {
  aim,
  bagShield,
  blockHigh,
  bow,
  chestPoint,
  face,
  reachFoot,
  reachHand,
  shift,
  shiftPose,
  slip,
  targetsOf,
  TrackBuilder,
  type AttackCtx,
  type Built,
  type Fx,
  type KeyEdit,
  type Result,
  type Side,
  type Track,
  type Zone,
} from "./track.ts";
import type { ActionKind, FighterStats, StageEvent, StageStrike } from "./types.ts";

export { mergeStrikes };
export { sampleTrack, shiftPose } from "./track.ts";
export type { Built, Fx, Key, Side, Track, Zone } from "./track.ts";

/**
 * 技の動き（キーフレーム）と、1 回の攻防（StageEvent）を再生する段取り。
 * 動きはどれも左足が前の構えで、その人の足もと（+Z が相手）から見た位置で作る。
 * 動きを書く道具は track.ts、格闘家ではない人たちの技（飛ばす・振る・見せる・回復・消える）は special.ts
 */


/** 技の当たる場所 */
export function zoneOf(kind: ActionKind): Zone {
  switch (kind) {
    case "kick_mid":
    case "knee":
    case "push":
      return "body";
    case "kick_low":
      return "legs";
    case "projectile":
    case "heal":
    case "vanish":
      return "body";
    case "clinch":
    case "takedown":
    case "throw":
    case "submission":
      return "grab";
    default:
      return "head";
  }
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
  // トゥクトゥク運転手の突進は大きく踏み込み、スタントマンの蹴りは跳び上がって蹴る
  const rush = att.style === "tuktuk" ? 1 : 0;
  const air = att.style === "stuntman" ? 1 : 0;

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
        k.d.hip[1] -= 0.02 + 0.05 * air;
        k.d.hipRot[1] += 0.25;
        k.hand(1, [-0.28, k.d.hip[1] + 0.2, -0.15]);
        face(k.d);
      });
      tb.at(t(0.21), 1, (k) => {
        shift(k.d, 0.07, 0.04, 1);
        k.d.hip[1] += 0.1 * air;
        k.d.hipRot = [0.05, 0.75 + 0.3 * high, -0.25 - 0.3 * high];
        k.d.spine[2] += 0.12 * high;
        k.d.chest[0] -= 0.08 * high;
        k.d.footRot[0] = [0.45, 1.0, 0];
        k.d.foot[0][1] += 0.04 + 0.12 * air;
        k.d.foot[1] = [-0.22, 0.3 + 0.45 * high, 0.08];
        k.d.knee[1] = [0.3, 0.3, 1];
        k.d.footRot[1] = [0.9, 0.4, -0.6];
        k.hand(1, [-0.42, k.d.hip[1] + 0.25, -0.2]);
        face(k.d);
      }, "out");
      const hit = tb.at(t(0.32), 1, (k) => {
        shift(k.d, 0.08, 0.04, 1);
        // スタントマンは宙に浮いたまま蹴る（軸足も床から離れ、体を大きく倒す）
        k.d.hip[1] += 0.14 * air;
        k.d.hipRot = [0.08, 1.15 + 0.3 * high + 0.2 * air, -0.35 - 0.5 * high - 0.25 * air];
        k.d.spine[2] += 0.18 * high;
        k.d.chest[0] -= 0.14 * high;
        k.d.footRot[0] = [0.5 + 0.6 * air, 1.45, 0];
        k.d.foot[0][1] += 0.05 + 0.22 * air;
        k.d.foot[0][2] -= 0.08 * air;
        k.d.knee[1] = [0.5, 0.6, 0.4];
        k.d.footRot[1] = [0.1, 0.5, -1.4];
        k.hand(1, [-0.48, k.d.hip[1] + 0.12, -0.3]);
        reachFoot(k.d, dims, 1, end);
        face(k.d);
      }, "snap");
      tb.pose(t(0.42), 1, hit, "linear");
      tb.at(t(0.6), 1, (k) => {
        shift(k.d, 0.04, 0.02, 1);
        // 着地：ひざを深く曲げて受ける
        k.d.hip[1] -= 0.06 * air;
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
      // スタントマンは深く沈んでから跳び、宙で体を後ろへ倒しながら回って蹴る（宙返りのように）
      tb.at(t(0.12), 1, (k) => {
        k.d.hipRot[1] = y0 - 1.3;
        k.d.chest[1] -= 0.3;
        k.d.neck[1] += 0.9;
        k.d.footRot[0][1] -= 1.3;
        k.d.hip[1] -= 0.03 + 0.08 * air;
      });
      tb.at(t(0.24), 1, (k) => {
        k.d.hip[1] += 0.3 * air;
        k.d.hipRot = [0.25 - 0.55 * air, y0 - 2.7, 0.1];
        k.d.chest[1] -= 0.2;
        k.d.neck = [-0.2 + 0.3 * air, 1.4, 0];
        k.d.footRot[0] = [0.3 + 0.6 * air, k.d.footRot[0][1] - 2.4, 0];
        k.d.foot[0][1] += 0.4 * air;
        k.d.foot[1] = [0.05, 0.55, 0.15];
        k.d.knee[1] = [0, -0.3, 1];
        k.d.footRot[1] = [0.9, y0 - 2.6, 0];
      }, "in");
      const hit = tb.at(t(0.38), 1, (k) => {
        shift(k.d, 0.05, 0, 1);
        k.d.hip[1] += 0.32 * air;
        k.d.hipRot = [0.55 - 0.9 * air, y0 - 3.1, 0.25 + 0.2 * air];
        k.d.chest[1] -= 0.15;
        k.d.neck = [-0.45 + 0.5 * air, 1.3, 0];
        k.d.footRot[0] = [0.3 + 0.8 * air, k.d.footRot[0][1] - 2.6, 0];
        k.d.foot[0][1] += 0.45 * air;
        k.d.knee[0] = [0, -1, 0.5 * air];
        k.d.knee[1] = [0, -1, 0];
        k.d.footRot[1] = [0.2, y0 - 3.1, 0];
        reachFoot(k.d, dims, 1, end);
      }, "snap");
      tb.pose(t(0.48), 1, hit, "linear");
      tb.at(t(0.68), 1, (k) => {
        k.d.hip[1] += 0.12 * air;
        k.d.hipRot[0] -= 0.3 * air;
        k.d.hipRot[1] = y0 - 4.6;
        k.d.chest[1] -= 0.1;
        k.d.neck[1] -= 0.4;
        k.d.footRot[0][1] -= 4.0;
        k.d.footRot[1][1] -= 4.6;
        k.d.foot[0][1] += 0.18 * air;
        k.d.foot[1] = [0.1, 0.35, -0.1];
      });
      // 着地（ひざで受けて沈む）
      if (air)
        tb.at(t(0.8), 1, (k) => {
          k.d.hip[1] -= 0.1;
          k.d.hipRot[1] = y0 - 5.6;
          k.d.footRot[0][1] -= 5.2;
          k.d.footRot[1][1] -= 5.6;
        }, "in");
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
        shift(k.d, 0.18 + 0.26 * rush);
        k.d.spine[0] += 0.1 * rush;
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
      tb.at(t(0.6), 1, (k) => shift(k.d, 0.05 + 0.08 * rush));
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
        k.d.hip[1] = legLength(dims) * (0.55 - 0.05 * rush);
        k.d.hipRot = [0.85 + 0.1 * rush, -0.15, 0];
        k.d.spine[0] += 0.2;
        k.d.neck[0] = -0.7;
        shift(k.d, 0.42 + 0.12 * rush, 0, 0);
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
      // サラリーマンはカバンを盾にする
      const shield = att.style === "salaryman" ? bagShield : blockHigh;
      tb.at(t(0.12), 1, (k) => shield(k, k.d, dims), "out");
      tb.at(t(0.55), 1, (k) => shield(k, k.d, dims));
      tb.at(t(0.75), 0);
      return { track: tb.build(), impact: t(0.12) };
    }
    case "dodge":
    default: {
      // サラリーマンはお辞儀をするようにかわす
      const away = att.style === "salaryman" ? bow : slip;
      tb.at(t(0.14), 1, (k) => away(k.d, 1), "out");
      tb.at(t(0.45), 1, (k) => away(k.d, 0.9));
      tb.at(t(0.65), 0);
      return { track: tb.build(), impact: t(0.14) };
    }
  }
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
  const style = c.att.style;
  // 忍者の立ったままのかわしは、残像を残して横へ跳ぶ（分身）
  if (style === "ninja" && kind === "dodge" && c.position === "standing") return afterimageDodge(c);
  const b = isSpecial(kind)
    ? specialTrack(kind, c, () => groundAttack("straight", c))
    : c.position === "ground"
      ? groundAttack(kind, c)
      : c.position === "clinch"
        ? clinchAttack(kind, c)
        : standingAttack(kind, c);
  // トゥクトゥク運転手の突進と、スタントマンの跳び蹴りの着地は、足もとに土ぼこりを立てる
  // タピオカ店員はトレイを盾にして防ぐ
  if (style === "bubbletea" && kind === "block" && c.position !== "ground") b.fx = [...(b.fx ?? []), { type: "tray", at: 0, until: b.track.end, side: 0 }];
  if (c.position === "standing" && ((style === "tuktuk" && (kind === "push" || kind === "takedown")) || (style === "stuntman" && kind === "spin_kick")))
    b.fx = [...(b.fx ?? []), style === "tuktuk" ? { type: "dust", at: 0.04, until: b.impact + 0.08 } : { type: "dust", at: b.track.end * 0.82, until: b.track.end * 0.9 }];
  // ロボットは一定の速さでカクッと動き、太極拳はゆっくり大きく動く
  if (c.att.style === "robot") return mechanical(b);
  if (c.att.style === "taichi" && !isSelf(kind) && kind !== "perform") return stretchTime(b, 1.25);
  return b;
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

  if (kind === "perform" && result !== "whiff") {
    // 見せる技：触れられていないので、少しひるむだけ。防いだときは小さく、かわしたときは目をそらす
    const strong = result === "hit" || result === "countered";
    const f = strong ? k * 0.75 : 0.35;
    tb.at(T(-0.08), 0);
    const flinch = (kk: KeyEdit) => {
      if (result === "dodged") {
        kk.d.neck[1] += 0.55;
        kk.d.neck[0] += 0.1;
        return;
      }
      kk.d.neck[0] -= 0.25 * f;
      kk.d.neck[1] += 0.2 * f;
      kk.d.chest[0] -= 0.12 * f;
      kk.d.spine[0] -= 0.06 * f;
      if (!lying) shift(kk.d, -0.06 * f);
      if (strong && !lying) {
        // 前の手で目の前をかばう
        kk.d.elbow[0] = [0.6, -0.2, -0.3];
        kk.hand(0, add(headCenter(pack(kk.d), dims), [0.05, -0.02, 0.17]));
      }
    };
    tb.at(T(0.06), 1, flinch, "out");
    tb.at(T(0.4), 1, flinch);
    tb.at(T(0.66), 0);
    return { track: tb.build(), offset: 0 };
  }

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
      } else if (me.style === "salaryman") bagShield(kk, kk.d, dims);
      else blockHigh(kk, kk.d, dims);
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
      // 忍者は残像を残して横へ跳ぶ（残像は buildExchange で出す）
      if (me.style === "ninja") sidestep(kk, 1);
      // サラリーマンはお辞儀をするように頭を下げてかわす
      else if (me.style === "salaryman" && zone !== "legs") bow(kk.d, 1);
      else if (zone === "head") slip(kk.d, 1);
      else if (kind === "projectile") {
        // 飛んでくるものは、横へ身をかわす
        slip(kk.d, 1);
        shift(kk.d, 0.04, -0.1);
      } else {
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
    if (me.style === "stuntman") {
      // スタントマンは受け身を取る：あごを引き、落ちる瞬間に両腕で床をたたいて衝撃を逃がす
      tb.at(T(0.42), 1, (kk) => {
        kk.d.neck[0] -= 0.35;
        ukemiArms(kk, 0.3);
      }, "in", c.after);
      tb.at(T(0.52), 1, (kk) => {
        kk.d.neck[0] -= 0.4;
        ukemiArms(kk, 0);
      }, "snap", c.after);
      tb.at(T(0.7), 1, (kk) => (kk.d.neck[0] -= 0.2), "out", c.after);
      tb.pose(T(0.9), 1, c.after);
      return { track: tb.build(), offset: 0 };
    }
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

/**
 * 受け身の腕：あお向けに落ちるとき、両腕を体から 45 度ほど開いて、手のひらで床をたたく。
 * lift は床から浮かせた高さ（振り上げ）
 */
function ukemiArms(k: KeyEdit, lift: number) {
  const hip = k.d.hip;
  k.d.elbow = [
    [0.3, 0.2, -1],
    [-0.3, 0.2, -1],
  ];
  k.d.fist = [
    [0, 1.5, 0],
    [0, -1.5, 0],
  ];
  k.hand(0, [hip[0] + 0.42, 0.05 + lift, hip[2] - 0.22]);
  k.hand(1, [hip[0] - 0.42, 0.05 + lift, hip[2] - 0.22]);
}

/** 倒れる（KO）。ひざが抜け、後ろへ崩れて、あお向けに倒れる。スタントマンは受け身を取って倒れる */
export function fallTrack(me: Side, down: Pose): Track {
  const dims = me.d;
  const tb = new TrackBuilder(me.base, dims);
  const lying = me.base[P.hip + 1]! < 0.35;
  if (!lying && me.style === "stuntman") {
    // 自分から腰を落として後ろへ転がり、あごを引いたまま、背中がつく瞬間に両腕で床をたたく
    tb.at(0.14, 1, (k) => {
      k.d.hip[1] -= 0.24;
      k.d.hipRot[0] += 0.2;
      k.d.spine[0] += 0.3;
      k.d.neck[0] += 0.4;
      k.d.elbow = [
        [0.5, -0.3, -0.5],
        [-0.5, -0.3, -0.5],
      ];
      const hip = k.d.hip;
      k.hand(0, [hip[0] + 0.12, hip[1] + 0.42, hip[2] + 0.28]);
      k.hand(1, [hip[0] - 0.12, hip[1] + 0.42, hip[2] + 0.28]);
    }, "out");
    tb.at(0.42, 1, (k) => {
      k.d.hip = [0, 0.2, -0.2];
      k.d.hipRot = [-1.0, 0, 0];
      k.d.spine = [0.4, 0, 0];
      k.d.neck = [0.6, 0, 0];
      k.d.foot[0] = [0.15, 0.25, 0.2];
      k.d.foot[1] = [-0.15, 0.3, 0.18];
      k.d.knee = [
        [0.3, 1, 0.5],
        [-0.3, 1, 0.5],
      ];
      ukemiArms(k, 0.32);
    }, "inOut");
    tb.at(0.56, 1, (k) => {
      k.d.neck[0] += 0.5;
      ukemiArms(k, 0);
    }, "snap", down);
    tb.at(0.74, 1, (k) => (k.d.neck[0] += 0.3), "out", down);
    tb.pose(1.0, 1, down, "inOut");
    return tb.build();
  }
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
  /** prop は右手の持ち物の先 */
  part: "hand" | "foot" | "prop";
  side: 0 | 1;
  from: number;
  to: number;
}

/** 技を出す手足。軌跡（残像）を見せるのに使う。組み技・守りの技・飛ばす技・見せる技などはなし */
export function limbOf(kind: ActionKind, position: Position, impact: number, style: Side["style"] = null): Limb | null {
  const at = (part: Limb["part"], side: 0 | 1, lead = 0.16): Limb => ({ part, side, from: Math.max(0, impact - lead), to: impact + 0.06 });
  if (kind === "swing") return position === "ground" ? at("hand", 1, 0.12) : propOf(style) === "none" ? at("hand", 1, 0.2) : at("prop", 1, 0.2);
  if (isSpecial(kind)) return null;
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
  /** 動きに合わせて出す効果（飛ぶもの・煙・きらめき・回復の光など） */
  fx: Fx[];
  /** 回復した量（heal）と、強化・弱体の印（effects）を出す時刻 */
  marks: Mark[];
}

/** 頭の上に出す印。heal があれば「+n」、stat があれば上向き（dir = 1）・下向き（-1）の印 */
export interface Mark {
  at: number;
  who: 0 | 1;
  heal?: number;
  stat?: keyof FighterStats;
  dir?: 1 | -1;
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
  const fx: Fx[] = [];
  const marks: Mark[] = [];
  // 相手の技をかわした（dodged）すぐとなりの「消える」技は、かわす動きとして見せる
  const dodgeBy = new Map<StageStrike, StageStrike>();
  const shown = new Set<StageStrike>();
  strikes.forEach((s, i) => {
    if (s.result !== "dodged" || isDefense(s.kind) || isSelf(s.kind)) return;
    const v = [strikes[i + 1], strikes[i - 1]].find((x) => x && x.kind === "vanish" && x.by !== s.by && !shown.has(x));
    if (!v) return;
    dodgeBy.set(s, v);
    shown.add(v);
  });

  const roleOf = (who: 0 | 1, pos: Position, tp: 0 | 1) => (pos === "ground" ? (who === tp ? "top" : "bottom") : null);

  strikes.forEach((s, i) => {
    // かわす動きとして見せた「消える」技は、ここでは出さない
    if (shown.has(s)) return;
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
    const limb = limbOf(eff, position, built.impact, sides[a].style);
    clips.push({ who: a, start: t, track: built.track, ...(limb ? { limb } : {}) });
    const impactAt = t + built.impact;
    let next = t + Math.max(built.impact + 0.45, built.track.end - 0.1);
    for (const f of built.fx ?? []) fx.push({ ...f, ...(f.shot === "pearls" && iceShot(sides[a].style, s) ? { shot: "ice" as const } : {}), at: t + f.at, until: f.until >= UNTIL_END ? UNTIL_END : t + f.until, who: a, target: d, result: s.result });
    if (s.heal) marks.push({ at: impactAt, who: a, heal: s.heal });
    for (const e of s.effects ?? []) marks.push({ at: impactAt + 0.08, who: e.who, stat: e.stat, dir: e.dir });

    const vanish = dodgeBy.get(s);
    if (vanish && s.result === "dodged") {
      // 相手の技が当たる瞬間に、煙とともに消えてかわす
      const v = vanishTrack({ att: sides[d] });
      // 当たる少し前に消える（拳は煙の中を通り抜ける）
      const vStart = impactAt - VANISH_GONE - 0.08;
      clips.push({ who: d, start: vStart, track: v.track });
      for (const f of v.fx ?? []) fx.push({ ...f, at: vStart + f.at, until: vStart + f.until, who: d, target: a, result: vanish.result });
      if (vanish.heal) marks.push({ at: impactAt, who: d, heal: vanish.heal });
      for (const e of vanish.effects ?? []) marks.push({ at: impactAt + 0.08, who: e.who, stat: e.stat, dir: e.dir });
      next = Math.max(next, vStart + v.track.end - 0.2);
    } else if (!isDefense(s.kind) && !isSelf(s.kind)) {
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
        // 忍者がかわしたときは、跳ぶ前の場所に残像を残す（分身）
        if (s.result === "dodged" && sides[d].style === "ninja" && position !== "ground")
          fx.push({ type: "ghost", at: impactAt - lead + 0.01, until: impactAt - lead + 0.45, who: d, target: a, result: s.result });
        // タピオカ店員は、上・胴への技をトレイで受ける
        if (s.result === "blocked" && sides[d].style === "bubbletea" && position !== "ground" && (zone === "head" || (zone === "body" && !s.kind.startsWith("kick"))))
          fx.push({ type: "tray", at: impactAt - lead, until: impactAt - lead + re.track.end, side: 0, who: d, target: a, result: s.result });
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
    for (const f of fx) {
      f.at += by;
      if (f.until < UNTIL_END) f.until += by;
    }
    for (const m of marks) m.at += by;
    if (ko) {
      ko.at += by;
      ko.downAt += by;
    }
    switchAt += by;
    t += by;
  }
  // 攻防の終わりまで続く効果は、終わりで止める
  for (const f of fx) f.until = Math.min(f.until, t);
  return { clips, impacts, switchAt, position, top, dist, ko, end: t, fx, marks };
}
