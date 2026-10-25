import { armLength, type BodyDims } from "./body.ts";
import { add, apply3, norm, scale, sub, type V3 } from "./math.ts";
import { PROP_LENGTH, propOf } from "./outfit.ts";
import { chestFrame, headCenter, pack, shoulderLocal } from "./pose.ts";
import {
  aim,
  chestPoint,
  face,
  reachHand,
  shift,
  targetsOf,
  TrackBuilder,
  type AttackCtx,
  type Built,
  type FxLocal,
  type KeyEdit,
  type ShotKind,
} from "./track.ts";
import type { ActionKind, StyleId } from "./types.ts";

/**
 * 格闘家ではない人たちの技の動き：飛ばす・振る・見せる・回復・消えて現れる。
 * 持ち物・飛ぶもの・効果はバックボーンで決め、決めていない人には既定の形を使う。
 * 動きはほかの技と同じく左足が前の構えで、持ち物はいつも右手（1）に持つ
 */

export type SpecialKind = Extract<ActionKind, "projectile" | "swing" | "perform" | "heal" | "vanish">;
export const isSpecial = (k: ActionKind): k is SpecialKind => k === "projectile" || k === "swing" || k === "perform" || k === "heal" || k === "vanish";
/** 自分にかける技（相手は受けない） */
export const isSelf = (k: ActionKind) => k === "heal" || k === "vanish";

/** 飛ばすもの：マジシャンはトランプ、ロボットはロケットパンチ、ほかは光の玉 */
export const shotOf = (style: StyleId | null): ShotKind => (style === "magician" ? "cards" : style === "robot" ? "rocket" : "orb");
/** 手を離れてから相手に届くまで */
export const SHOT_FLIGHT: Record<ShotKind, number> = { cards: 0.2, rocket: 0.24, orb: 0.3 };
/** ロケットパンチが腕に戻るまで */
export const ROCKET_RETURN = 0.3;

export type PerformKind = "idol" | "rapper" | "gamer" | "magician" | "pose";
/** 見せる技の形：アイドルはウインク、ラッパーは指さし、ゲーマーは指の動き、マジシャンは手のひらの光、ほかは決めポーズ */
export const performOf = (style: StyleId | null): PerformKind =>
  style === "idol" || style === "rapper" || style === "gamer" || style === "magician" ? style : "pose";

export type HealKind = "nurse" | "robot" | "chef" | "glow";
/** 回復の形：看護師は手当て、ロボットは再起動、料理人は味見、ほかはやわらかい光 */
export const healOf = (style: StyleId | null): HealKind => (style === "nurse" || style === "robot" || style === "chef" ? style : "glow");

/** 消えて現れるとき、元の場所から下がる・横へずれる距離 */
export const VANISH_BACK = 0.3;
export const VANISH_SIDE = 0.24;
/** 消える動きの、技を出しはじめてから姿が消えるまで（かわす動きに使うとき、相手の技が当たる瞬間に合わせる） */
export const VANISH_GONE = 0.3;
/** 攻防の終わりまで続く効果の until */
export const UNTIL_END = 99;

/** 手首を、肩から target へ向けて腕の長さの ext 倍のところへ置く（踏み込まない） */
function armToward(k: KeyEdit, dims: BodyDims, i: 0 | 1, target: V3, ext = 0.92) {
  const f = chestFrame(pack(k.d), dims);
  const sh = add(f.o, apply3(f.r, shoulderLocal(dims, i)));
  const dir = norm(sub(target, sh));
  k.hand(i, add(sh, scale(dir, armLength(dims) * ext)));
}

const headOf = (k: KeyEdit, dims: BodyDims) => headCenter(pack(k.d), dims);

/**
 * 新しい技の動き。寝技のときは、打つ技は ground（寝技の打撃）の動きに効果だけを重ね、見せる技・回復は上半身だけで見せる
 */
export function specialTrack(kind: SpecialKind, c: AttackCtx, groundPunch: () => Built): Built {
  const style = c.att.style;
  if (c.position === "ground") {
    if (kind === "projectile" || kind === "swing") {
      const b = groundPunch();
      if (kind === "swing") return b;
      const shot = shotOf(style);
      const at = Math.max(0.02, b.impact - 0.12);
      return { ...b, fx: shotFx(shot, at, b.impact) };
    }
    return groundSpecial(kind, c);
  }
  switch (kind) {
    case "projectile":
      return projectileTrack(c);
    case "swing":
      return swingTrack(c);
    case "perform":
      return performTrack(c);
    case "heal":
      return healTrack(c);
    case "vanish":
      return vanishTrack(c);
  }
}

function shotFx(shot: ShotKind, at: number, impact: number): FxLocal[] {
  const fx: FxLocal[] = [{ type: "shot", at, until: impact, side: 1, shot }];
  if (shot === "rocket") fx.push({ type: "detach", at, until: impact + ROCKET_RETURN, side: 1 });
  return fx;
}

// ---- 飛ばす ----

function projectileTrack(c: AttackCtx): Built {
  const { att, def, dist, result } = c;
  const dims = att.d;
  const tb = new TrackBuilder(att.base, dims);
  const T = targetsOf(def, dist);
  const sp = 1 - 0.06 * dims.speed;
  const t = (v: number) => v * sp;
  const shot = shotOf(att.style);
  const target = aim(T.body, result, -1);
  if (shot === "cards") {
    // 右手はステッキを持ったまま、左手を右の肩へ引き、体をひねり戻しながら手首を返してトランプを放つ
    tb.at(t(0.15), 1, (k) => {
      k.d.hipRot[1] -= 0.22;
      k.d.chest[1] -= 0.16;
      k.d.elbow[0] = [0.3, 0.2, -1];
      k.d.fist[0] = [0.2, -0.9, -0.4];
      face(k.d);
      k.hand(0, chestPoint(k.d, dims, [-0.12, dims.shoulderY - 0.04, 0.17]));
    });
    const rel = tb.at(t(0.27), 1, (k) => {
      shift(k.d, 0.04, 0, 0);
      k.d.hipRot[1] += 0.3;
      k.d.chest[1] += 0.2;
      k.d.elbow[0] = [0.6, 0.4, -0.2];
      k.d.fist[0] = [0, 0.7, 0.3];
      face(k.d);
      armToward(k, dims, 0, add(target, [0, 0.1, 0]), 0.96);
    }, "snap");
    tb.pose(t(0.45), 1, rel, "linear");
    tb.at(t(0.66), 1, (k) => shift(k.d, 0.02));
    tb.at(t(0.84), 0);
    const at = t(0.25);
    const impact = at + SHOT_FLIGHT.cards;
    const fx = shotFx(shot, at, impact);
    fx[0]!.side = 0;
    return { track: tb.build(), impact, fx };
  }
  if (shot === "rocket") {
    // 腕を引いてから、まっすぐ伸ばしきったところで手が飛ぶ。戻るまで腕は伸ばしたまま
    tb.at(t(0.14), 1, (k) => {
      k.d.hipRot[1] -= 0.12;
      k.d.elbow[1] = [-0.5, -1, -0.3];
      k.hand(1, chestPoint(k.d, dims, [-0.17, dims.shoulderY - 0.2, -0.02]));
    }, "linear");
    const ext = tb.at(t(0.26), 1, (k) => {
      k.d.hipRot[1] += 0.28;
      k.d.chest[1] += 0.1;
      k.d.elbow[1] = [-0.6, 0.3, -0.2];
      k.d.fist[1] = [0, 0, 0];
      face(k.d);
      armToward(k, dims, 1, target, 0.995);
    }, "linear");
    const at = t(0.26);
    const impact = at + SHOT_FLIGHT.rocket;
    const back = impact + ROCKET_RETURN;
    tb.pose(back, 1, ext, "linear");
    // 手が戻った反動
    tb.at(back + 0.06, 1, (k) => {
      k.d.hipRot[1] -= 0.08;
      shift(k.d, -0.03);
    }, "linear", ext);
    tb.pose(back + 0.14, 1, ext, "linear");
    tb.at(back + 0.36, 0, undefined, "linear");
    return { track: tb.build(), impact, fx: shotFx(shot, at, impact) };
  }
  // 光の玉：両手を右の腰でためてから、手のひらで前へ押し出す
  tb.at(t(0.2), 1, (k) => {
    shift(k.d, -0.1);
    k.d.hip[1] -= 0.04;
    k.d.hipRot[1] += 0.25;
    k.d.spine[0] += 0.05;
    k.d.elbow = [
      [0.5, -1, -0.4],
      [-0.6, -1, -0.4],
    ];
    k.d.fist = [
      [-0.9, 0, 0],
      [-0.9, 0, 0],
    ];
    face(k.d);
    k.hand(0, chestPoint(k.d, dims, [-0.04, 0.08, 0.17]));
    k.hand(1, chestPoint(k.d, dims, [-0.14, 0.03, 0.12]));
  });
  const push = tb.at(t(0.34), 1, (k) => {
    shift(k.d, -0.06, 0, 0);
    k.d.hipRot[1] -= 0.38;
    k.d.spine[0] += 0.04;
    k.d.fist = [
      [-1.3, 0, 0],
      [-1.3, 0, 0],
    ];
    face(k.d);
    armToward(k, dims, 0, add(target, [-0.04, 0.05, 0]), 0.82);
    armToward(k, dims, 1, add(target, [0.04, -0.02, 0]), 0.82);
  }, "snap");
  tb.pose(t(0.56), 1, push, "linear");
  tb.at(t(0.86), 0);
  const at = t(0.33);
  const impact = at + SHOT_FLIGHT.orb;
  return { track: tb.build(), impact, fx: shotFx(shot, at, impact) };
}

// ---- 振る ----

function swingTrack(c: AttackCtx): Built {
  const { att, def, dist, result } = c;
  const dims = att.d;
  const tb = new TrackBuilder(att.base, dims);
  const T = targetsOf(def, dist);
  const sp = 1 - 0.06 * dims.speed;
  const t = (v: number) => v * sp;
  const prop = propOf(att.style);
  const len = PROP_LENGTH[prop];
  // 手首の曲げ（振りかぶる・当てる・振り抜く）。ステッキは前腕の向きに、ほかは親指の側に伸びる
  // フライパン・ペンライトは手首を小指の側へ倒して、前腕の先へ向ける
  const wrist: [V3, V3, V3] =
    prop === "none"
      ? [
          [0.3, 0, 0],
          [0.2, 0.3, 0],
          [0.2, 0.3, 0],
        ]
      : prop === "cane"
        ? [
            [-0.5, 0, 0],
            [0.15, 0, 0],
            [0.4, 0, 0],
          ]
        : [
            [0, 0, 0.5],
            [0, 0, 1.35],
            [0, 0, 1.7],
          ];
  // 振りかぶる：右手を頭の後ろへ上げ、体を右へひねって少し反る
  tb.at(t(0.22), 1, (k) => {
    k.d.hipRot[1] -= 0.22;
    k.d.spine[0] -= 0.08;
    k.d.chest[0] -= 0.1;
    k.d.hip[1] -= 0.02;
    k.d.elbow[1] = [-0.7, 0.7, -0.4];
    k.d.fist[1] = wrist[0];
    face(k.d);
    k.hand(1, chestPoint(k.d, dims, [-0.15, dims.shoulderY + 0.33, -0.1]));
  }, "out");
  const tgt = aim(T.head, result, -1);
  // 持ち物があれば、腕を相手の頭へ向けて伸ばし、持ち物の先を頭に当てる（手は届かなくてよい）
  const hit = tb.at(t(0.36), 1, (k) => {
    shift(k.d, 0.1, 0, 0);
    k.d.hipRot[1] += 0.62;
    k.d.spine[0] += 0.22;
    k.d.chest[1] += 0.1;
    k.d.footRot[1] = [0.5, k.d.footRot[1][1] + 0.5, 0];
    k.d.elbow[1] = [-0.7, 0.2, 0.2];
    k.d.fist[1] = wrist[1];
    face(k.d, 0.1);
    if (prop === "none") reachHand(k, dims, 1, tgt, 0.95);
    else armToward(k, dims, 1, add(tgt, [0, 0.1 - len * 0.15, 0]), 0.95);
  }, "snap");
  tb.pose(t(0.44), 1, hit, "linear");
  // 振り抜く
  tb.at(t(0.6), 1, (k) => {
    shift(k.d, 0.1, 0, 0);
    k.d.hipRot[1] += 0.75;
    k.d.spine[0] += 0.26;
    k.d.elbow[1] = [-0.5, -1, 0.2];
    k.d.fist[1] = wrist[2];
    face(k.d, 0.1);
    k.hand(1, chestPoint(k.d, dims, [0.16, -0.06, 0.3]));
  }, "out");
  tb.at(t(0.84), 1, (k) => shift(k.d, 0.03));
  tb.at(t(1.0), 0);
  return { track: tb.build(), impact: t(0.36) };
}

// ---- 見せる ----

function performTrack(c: AttackCtx): Built {
  const { att, def, dist } = c;
  const dims = att.d;
  const tb = new TrackBuilder(att.base, dims);
  const T = targetsOf(def, dist);
  const kind = performOf(att.style);
  switch (kind) {
    case "idol": {
      // 軽くかがんでから、首をかしげてウインク。左手（見ている人の側）は目の横でピース、ペンライトの右手は腰に
      tb.at(0.14, 1, (k) => {
        k.d.hip[1] -= 0.035;
        k.hand(0, chestPoint(k.d, dims, [0.06, dims.shoulderY - 0.2, 0.18]));
        k.hand(1, chestPoint(k.d, dims, [-0.06, dims.shoulderY - 0.2, 0.18]));
      });
      const pose = (k: KeyEdit, up: number) => {
        k.d.hip[1] += 0.015 * up;
        k.d.hipRot[1] *= 0.4;
        k.d.hipRot[2] += 0.07;
        k.d.chest[2] -= 0.05;
        k.d.chest[0] -= 0.05;
        face(k.d);
        k.d.neck[2] -= 0.2;
        k.d.elbow = [
          [1, 0.3, -0.2],
          [-1, 0, -0.5],
        ];
        k.d.fist[0] = [0.4, 0.4, -0.3];
        const h = headOf(k, dims);
        k.hand(0, add(h, [0.14, -0.02, 0.08]));
        const hip = k.d.hip;
        k.hand(1, [hip[0] - 0.19, hip[1] + 0.1, hip[2] + 0.02]);
      };
      tb.at(0.32, 1, (k) => pose(k, 1), "outBack");
      tb.at(0.62, 1, (k) => pose(k, 0.6));
      tb.at(0.86, 1, (k) => pose(k, 1));
      tb.at(1.12, 0);
      return {
        track: tb.build(),
        impact: 0.62,
        fx: [
          { type: "wink", at: 0.3, until: 0.86 },
          { type: "hearts", at: 0.34, until: 0.9 },
          { type: "sparkle", at: 0.32, until: 0.6 },
        ],
      };
    }
    case "rapper": {
      // 少し反ってから、右手で相手を 2 回指さす。左手は胸の前でリズムをとる
      tb.at(0.15, 1, (k) => {
        k.d.spine[0] -= 0.08;
        k.d.hip[1] -= 0.02;
        k.hand(0, chestPoint(k.d, dims, [0.1, dims.shoulderY - 0.1, 0.16]));
      });
      const point = (k: KeyEdit, bob: number) => {
        shift(k.d, 0.05, 0, 0);
        k.d.hipRot[1] += 0.32;
        k.d.chest[0] -= 0.04;
        k.d.hip[1] -= 0.03 * bob;
        face(k.d);
        k.d.neck[0] += 0.12 * bob;
        k.d.elbow[1] = [-0.4, -1, 0];
        k.d.fist[1] = [0.1, 0, 0];
        armToward(k, dims, 1, add(T.head, [0, -0.05 * bob, 0]), 0.97 - 0.05 * bob);
        k.hand(0, chestPoint(k.d, dims, [0.12, dims.shoulderY - 0.12 - 0.04 * bob, 0.17]));
      };
      tb.at(0.3, 1, (k) => point(k, 0), "snap");
      tb.at(0.44, 1, (k) => point(k, 1));
      tb.at(0.58, 1, (k) => point(k, 0), "snap");
      tb.at(0.72, 1, (k) => point(k, 1));
      tb.at(0.92, 1, (k) => point(k, 0.5));
      tb.at(1.15, 0);
      return { track: tb.build(), impact: 0.58, fx: [{ type: "notes", at: 0.26, until: 1.0 }] };
    }
    case "gamer": {
      // 両手を胸の前に寄せ、見えないコントローラーをすばやく操作する。目の前に画面のような光の枠
      const hold = (k: KeyEdit, j: number) => {
        k.d.spine[0] += 0.08;
        k.d.chest[0] += 0.04;
        face(k.d, 0.1);
        k.d.neck[0] += 0.06;
        k.d.elbow = [
          [0.8, -1, -0.2],
          [-0.8, -1, -0.2],
        ];
        k.d.fist = [
          [0.4 + 0.3 * j, 0.3, 0.2 * j],
          [0.4 - 0.3 * j, -0.3, -0.2 * j],
        ];
        k.hand(0, chestPoint(k.d, dims, [0.06 + 0.008 * j, dims.shoulderY - 0.19 + 0.012 * j, 0.25]));
        k.hand(1, chestPoint(k.d, dims, [-0.06 + 0.008 * j, dims.shoulderY - 0.19 - 0.012 * j, 0.25]));
      };
      tb.at(0.14, 1, (k) => hold(k, 0));
      for (let i = 0; i < 12; i++) tb.at(0.2 + i * 0.06, 1, (k) => hold(k, i % 2 ? 1 : -1), "inOut");
      tb.at(0.94, 1, (k) => hold(k, 0));
      tb.at(1.1, 0);
      return { track: tb.build(), impact: 0.62, fx: [{ type: "frame", at: 0.18, until: 0.96 }] };
    }
    case "magician": {
      // 左手で右の肩を払うように引き、相手へ手のひらを向けて光を放つ
      tb.at(0.18, 1, (k) => {
        k.d.hipRot[1] -= 0.08;
        k.d.elbow[0] = [1, 0.3, -0.2];
        k.hand(0, chestPoint(k.d, dims, [-0.1, dims.shoulderY, 0.16]));
      });
      const open = tb.at(0.32, 1, (k) => {
        k.d.hipRot[1] += 0.12;
        k.d.chest[0] -= 0.05;
        face(k.d);
        k.d.elbow[0] = [0.6, 0.4, -0.2];
        k.d.fist[0] = [-1.25, 0, 0];
        armToward(k, dims, 0, add(T.head, [0, -0.04, 0]), 0.95);
      }, "outBack");
      tb.pose(0.72, 1, open, "linear");
      tb.at(0.98, 0);
      return { track: tb.build(), impact: 0.5, fx: [{ type: "palm", at: 0.32, until: 0.66, side: 0 }] };
    }
    case "pose": {
      // かがんでから、両手を上げて胸を張る決めポーズ
      tb.at(0.16, 1, (k) => (k.d.hip[1] -= 0.04));
      const up = (k: KeyEdit) => {
        k.d.hipRot[1] *= 0.5;
        k.d.chest[0] -= 0.12;
        face(k.d, -0.08);
        k.d.elbow = [
          [1, 0.2, -0.3],
          [-1, 0.2, -0.3],
        ];
        const h = headOf(k, dims);
        k.hand(0, add(h, [0.3, 0.3, 0.05]));
        k.hand(1, add(h, [-0.3, 0.3, 0.05]));
      };
      tb.at(0.3, 1, up, "outBack");
      tb.at(0.75, 1, up);
      tb.at(1.0, 0);
      return { track: tb.build(), impact: 0.5, fx: [{ type: "sparkle", at: 0.3, until: 0.8 }] };
    }
  }
}

// ---- 回復 ----

function healTrack(c: AttackCtx): Built {
  const { att } = c;
  const dims = att.d;
  const tb = new TrackBuilder(att.base, dims);
  const kind = healOf(att.style);
  switch (kind) {
    case "nurse": {
      // 左の前腕を胸の前に出し、右手で包帯を巻いていく
      const arm = (k: KeyEdit, i: number) => {
        k.d.spine[0] += 0.06;
        face(k.d, 0.3);
        k.d.elbow[0] = [1, -0.4, -0.2];
        k.d.elbow[1] = [-1, -0.2, -0.2];
        k.d.fist[0] = [0.2, 1.2, 0];
        k.hand(0, chestPoint(k.d, dims, [-0.03, dims.shoulderY - 0.21, 0.3]));
        const below = i % 2;
        k.hand(1, chestPoint(k.d, dims, [0.05 + 0.03 * Math.sin(i), dims.shoulderY - 0.13 - 0.13 * below, 0.31 + 0.05 * below]));
      };
      tb.at(0.22, 1, (k) => arm(k, 0));
      for (let i = 1; i <= 5; i++) tb.at(0.22 + i * 0.13, 1, (k) => arm(k, i));
      tb.at(1.04, 1, (k) => {
        arm(k, 0);
        face(k.d, 0.05);
        k.d.breath = 1;
      });
      tb.at(1.28, 0);
      return {
        track: tb.build(),
        impact: 0.86,
        fx: [
          { type: "bandage", at: 0.42, until: UNTIL_END, side: 0 },
          { type: "heal", at: 0.32, until: 1.2 },
        ],
      };
    }
    case "robot": {
      // 体が止まり（頭が落ち、腕がだらりと下がる）、目の光が消えて光の線が走り、カクカクと起き上がる
      const off = (k: KeyEdit) => {
        k.d.neck[0] += 0.45;
        k.d.spine[0] += 0.12;
        k.d.hip[1] -= 0.03;
        k.d.elbow = [
          [0.3, -1, 0],
          [-0.3, -1, 0],
        ];
        const hip = k.d.hip;
        k.hand(0, [hip[0] + 0.21, hip[1] + 0.04, hip[2] + 0.07]);
        k.hand(1, [hip[0] - 0.21, hip[1] + 0.04, hip[2] + 0.07]);
      };
      tb.at(0.12, 0, undefined, "linear");
      tb.at(0.26, 1, off, "linear");
      tb.at(0.74, 1, off, "linear");
      tb.at(0.8, 0.62, off, "linear");
      tb.at(0.9, 0.62, off, "linear");
      tb.at(0.96, 0.28, off, "linear");
      tb.at(1.06, 0.28, off, "linear");
      tb.at(1.12, 0, off, "linear");
      return {
        track: tb.build(),
        impact: 0.96,
        fx: [
          { type: "reboot", at: 0.24, until: 1.08 },
          { type: "heal", at: 0.74, until: 1.24 },
        ],
      };
    }
    case "chef": {
      // 左手のスプーンで味見をして、うなずく
      const taste = (k: KeyEdit, nod: number) => {
        face(k.d, -0.08 + 0.22 * nod);
        k.d.elbow[0] = [1, -0.5, -0.3];
        k.d.fist[0] = [0.6, 1.3, 0];
        const h = headOf(k, dims);
        k.hand(0, add(h, [0.04, -0.13 - 0.05 * nod, 0.16 + 0.04 * nod]));
      };
      tb.at(0.3, 1, (k) => taste(k, 0));
      tb.at(0.5, 1, (k) => taste(k, 0));
      tb.at(0.62, 1, (k) => taste(k, 1));
      tb.at(0.76, 1, (k) => taste(k, 0.2));
      tb.at(0.88, 1, (k) => taste(k, 1));
      tb.at(1.16, 0);
      return {
        track: tb.build(),
        impact: 0.72,
        fx: [
          { type: "spoon", at: 0.12, until: 1.05, side: 0 },
          { type: "steam", at: 0.48, until: 1.0 },
          { type: "heal", at: 0.56, until: 1.16 },
          { type: "sparkle", at: 0.64, until: 0.9 },
        ],
      };
    }
    case "glow": {
      // 両手を胸に当て、深く息を吸う
      const calm = (k: KeyEdit) => {
        k.d.spine[0] += 0.05;
        face(k.d, 0.22);
        k.d.breath = 1;
        k.d.shrug = [0.02, 0.02];
        k.d.elbow = [
          [0.8, -1, -0.3],
          [-0.8, -1, -0.3],
        ];
        k.hand(0, chestPoint(k.d, dims, [0.05, dims.shoulderY - 0.12, 0.17]));
        k.hand(1, chestPoint(k.d, dims, [-0.05, dims.shoulderY - 0.15, 0.17]));
      };
      tb.at(0.26, 1, calm);
      tb.at(0.78, 1, calm);
      tb.at(1.02, 0);
      return { track: tb.build(), impact: 0.6, fx: [{ type: "heal", at: 0.2, until: 1.0 }] };
    }
  }
}

// ---- 消えて現れる ----

/** 消える動き。VANISH_GONE 秒で姿が消え、少し下がって横にずれた所に現れ、ゆっくり元の場所へ戻る */
export function vanishTrack(c: Pick<AttackCtx, "att">): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  // マントをひるがえすように、左手を顔の前へ払う
  const flourish = (k: KeyEdit) => {
    k.d.hip[1] -= 0.03;
    k.d.spine[0] += 0.1;
    k.d.elbow[0] = [1, 0.4, 0];
    k.hand(0, chestPoint(k.d, dims, [-0.12, dims.shoulderY + 0.12, 0.2]));
  };
  tb.at(0.2, 1, flourish, "out");
  tb.at(VANISH_GONE, 1, flourish, "linear");
  // 見えないあいだに動く
  const away = (k: KeyEdit, bow: number) => {
    shift(k.d, -VANISH_BACK, VANISH_SIDE);
    k.d.spine[0] += 0.2 * bow;
    face(k.d);
    k.d.neck[0] += 0.15 * bow;
    k.d.elbow[0] = [1, -0.2, -0.3];
    k.hand(0, chestPoint(k.d, dims, [0.33, dims.shoulderY - 0.08, 0.12]));
  };
  tb.at(0.6, 1, (k) => away(k, 0), "linear");
  tb.at(0.82, 1, (k) => away(k, 0), "linear");
  // 現れて、一礼
  tb.at(1.0, 1, (k) => away(k, 1), "out");
  tb.at(1.18, 1, (k) => away(k, 0.3));
  tb.at(1.6, 0);
  return {
    track: tb.build(),
    impact: VANISH_GONE,
    fx: [
      { type: "smoke", at: VANISH_GONE - 0.03, until: VANISH_GONE + 0.3 },
      { type: "hide", at: VANISH_GONE, until: 0.82 },
      { type: "smoke", at: 0.8, until: 1.1 },
    ],
  };
}

/** 寝技の中での、見せる技・回復・消える技（上半身だけで見せる） */
function groundSpecial(kind: SpecialKind, c: AttackCtx): Built {
  const dims = c.att.d;
  const tb = new TrackBuilder(c.att.base, dims);
  if (kind === "vanish") {
    tb.at(0.2, 1, (k) => (k.d.neck[0] += 0.1));
    tb.at(1.0, 0);
    return {
      track: tb.build(),
      impact: 0.24,
      fx: [
        { type: "smoke", at: 0.2, until: 0.5 },
        { type: "hide", at: 0.24, until: 0.66 },
        { type: "smoke", at: 0.64, until: 0.9 },
      ],
    };
  }
  const hands = (k: KeyEdit) => {
    k.d.breath = 1;
    k.d.shrug = [0.02, 0.02];
    k.hand(0, chestPoint(k.d, dims, [0.06, dims.shoulderY - 0.1, 0.18]));
    k.hand(1, chestPoint(k.d, dims, [-0.06, dims.shoulderY - 0.12, 0.18]));
  };
  tb.at(0.25, 1, hands);
  tb.at(0.75, 1, hands);
  tb.at(1.0, 0);
  if (kind === "heal") {
    const h = healOf(c.att.style);
    const fx: FxLocal[] = [{ type: "heal", at: 0.2, until: 1.0 }];
    if (h === "nurse") fx.push({ type: "bandage", at: 0.4, until: UNTIL_END, side: 0 });
    if (h === "robot") fx.push({ type: "reboot", at: 0.2, until: 0.9 });
    return { track: tb.build(), impact: 0.6, fx };
  }
  const p = performOf(c.att.style);
  const type = p === "idol" ? "hearts" : p === "rapper" ? "notes" : p === "gamer" ? "frame" : p === "magician" ? "palm" : "sparkle";
  const fx: FxLocal[] = [{ type, at: 0.25, until: 0.85, side: 0 }];
  if (p === "idol") fx.push({ type: "wink", at: 0.25, until: 0.8 });
  return { track: tb.build(), impact: 0.5, fx };
}

/** 機械の動き：キーの間を、ゆるめずに一定の速さで動く（ロボットの技） */
export function mechanical(b: Built): Built {
  for (const k of b.track.keys) if (k.ease !== "linear") k.ease = "linear";
  return b;
}

/** 太極拳の技：ゆっくり大きく（キーの時刻を伸ばす） */
export function stretchTime(b: Built, k: number): Built {
  for (const key of b.track.keys) key.t *= k;
  b.track.end *= k;
  b.impact *= k;
  if (b.fx) for (const f of b.fx) {
    f.at *= k;
    if (f.until < UNTIL_END) f.until *= k;
  }
  return b;
}

/** 消えている人の、腰の位置が元の場所からどれだけずれるか（足もとから見て）。テストと確かめ用 */
export const vanishOffset = (): V3 => [VANISH_SIDE, 0, -VANISH_BACK];
