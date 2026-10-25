import { armLength, type BodyDims } from "./body.ts";
import { add, apply3, norm, scale, sub, type V3 } from "./math.ts";
import { PROP_LENGTH, propOf } from "./outfit.ts";
import { chestFrame, headCenter, pack, shoulderLocal } from "./pose.ts";
import {
  aim,
  chestPoint,
  face,
  hold2,
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
import type { ActionKind, StageStrike, StyleId } from "./types.ts";

/**
 * 格闘家ではない人たちの技の動き：飛ばす・振る・見せる・回復・消えて現れる。
 * 持ち物・飛ぶもの・効果はバックボーンで決め、決めていない人には既定の形を使う。
 * 動きはほかの技と同じく左足が前の構えで、持ち物はいつも右手（1）に持つ
 */

export type SpecialKind = Extract<ActionKind, "projectile" | "swing" | "perform" | "heal" | "vanish">;
export const isSpecial = (k: ActionKind): k is SpecialKind => k === "projectile" || k === "swing" || k === "perform" || k === "heal" || k === "vanish";
/** 自分にかける技（相手は受けない） */
export const isSelf = (k: ActionKind) => k === "heal" || k === "vanish";

/**
 * 飛ばすもの：マジシャンはトランプ、ロボットはロケットパンチ、忍者は手裏剣、サラリーマンは名刺、
 * タピオカ店員はタピオカの粒、消防士は放水（筒先から水の線）、投資家は金色のコイン、ほかは光の玉
 */
export function shotOf(style: StyleId | null): ShotKind {
  switch (style) {
    case "firefighter":
      return "water";
    case "investor":
      return "coins";
    case "magician":
      return "cards";
    case "robot":
      return "rocket";
    case "ninja":
      return "shuriken";
    case "salaryman":
      return "meishi";
    case "bubbletea":
      return "pearls";
    default:
      return "orb";
  }
}
/** 手を離れてから相手に届くまで */
export const SHOT_FLIGHT: Record<ShotKind, number> = { cards: 0.2, rocket: 0.24, orb: 0.3, shuriken: 0.2, meishi: 0.2, pearls: 0.26, ice: 0.26, coins: 0.24, water: 0.18 };

/**
 * タピオカ店員の飛ばす技は 2 つ（タピオカ弾・氷多め）あり、どちらも projectile で来る。
 * 当たって強化・弱体（effects）が付いた技を「氷多め」とみなし、氷のかけらを飛ばす
 */
export const iceShot = (style: StyleId | null, strike: Pick<StageStrike, "kind" | "effects">) =>
  style === "bubbletea" && strike.kind === "projectile" && (strike.effects?.length ?? 0) > 0;
/** ロケットパンチが腕に戻るまで */
export const ROCKET_RETURN = 0.3;

/**
 * 相手には何もせず、自分を強めるだけの技か（DJ のフロアを沸かす・投資家の積み立て）。
 * 見せる技が 2 つあるバックボーンで、どちらかを見分けるのに使う。強化・弱体が付いていなければ、
 * 当たって（hit）ダメージがないときを自分を強める技とみなす（外れた・防がれたのは相手へ向けた技）
 */
export function boostsSelf(s?: Pick<StageStrike, "by" | "damage" | "effects" | "result">): boolean {
  if (!s) return false;
  const fx = s.effects ?? [];
  if (fx.length) return fx.every((e) => e.who === s.by && e.dir > 0);
  return s.damage <= 0 && s.result === "hit";
}

export type PerformKind =
  | "idol"
  | "rapper"
  | "gamer"
  | "magician"
  | "laser"
  | "horn"
  | "tie"
  | "shaker"
  | "seal"
  | "pose"
  | "zanshin"
  | "beckon"
  | "scratch"
  | "hype"
  | "chartUp"
  | "chartDown"
  | "roar";
/**
 * 見せる技の形：アイドルはウインク、ラッパーは指さし、ゲーマーは指の動き、マジシャンは手のひらの光、
 * ロボットはレーザー、トゥクトゥク運転手はクラクション、サラリーマンはネクタイを締める、
 * タピオカ店員はシェイカーを振る、忍者は印を結ぶ、剣道家は残心、ルチャドールは観客をあおる、
 * DJ はスクラッチ（self = 自分を強める技ならフロアを沸かす）、投資家は空売り（self なら積み立て）、
 * 恐竜の着ぐるみはほえる、ほかは決めポーズ
 */
export function performOf(style: StyleId | null, self = false): PerformKind {
  switch (style) {
    case "kendo":
      return "zanshin";
    case "luchador":
      return "beckon";
    case "dj":
      return self ? "hype" : "scratch";
    case "investor":
      return self ? "chartUp" : "chartDown";
    case "dino":
      return "roar";
    case "idol":
    case "rapper":
    case "gamer":
    case "magician":
      return style;
    case "robot":
      return "laser";
    case "tuktuk":
      return "horn";
    case "salaryman":
      return "tie";
    case "bubbletea":
      return "shaker";
    case "ninja":
      return "seal";
    default:
      return "pose";
  }
}

export type HealKind = "nurse" | "robot" | "chef" | "drink" | "helmet" | "dividend" | "glow";
/**
 * 回復の形：看護師は手当て、ロボットは再起動、料理人は味見、タピオカ店員はカップから飲む、
 * 消防士はヘルメットを上げて汗をぬぐう、投資家は配当（コインが降る）、ほかはやわらかい光
 */
export const healOf = (style: StyleId | null): HealKind =>
  style === "nurse" || style === "robot" || style === "chef"
    ? style
    : style === "bubbletea"
      ? "drink"
      : style === "firefighter"
        ? "helmet"
        : style === "investor"
          ? "dividend"
          : "glow";

/** ロボットのレーザーが、目から出て相手に届くまで */
export const LASER_REACH = 0.1;

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
      // 放水は、寝たままでも水の線を相手へ走らせる
      if (shot === "water") return { ...b, fx: [{ type: "water", at, until: b.impact + 0.35, side: 1 }] };
      return { ...b, fx: shotFx(shot, at, b.impact) };
    }
    return groundSpecial(kind, c);
  }
  switch (kind) {
    case "projectile":
      return projectileTrack(c);
    case "swing": {
      const b = swingTrack(c);
      // タピオカ店員は、カップのストローを太く抜いて振る（カップは左手に持ちかえる）
      if (propOf(style) === "cup")
        b.fx = [
          { type: "form", at: 0.04, until: b.track.end, form: 1 },
          { type: "held", at: 0.04, until: b.track.end, side: 0 },
        ];
      // 投資家は、タブレットを電卓に持ちかえて軽くたたく
      if (propOf(style) === "tablet") b.fx = [{ type: "form", at: 0.04, until: b.track.end, form: 1 }];
      return b;
    }
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
  if (shot === "water") {
    // 足をふんばって腰を落とし、筒先を相手へ向けて放水する。水の勢いで少しずつ押し戻される
    const aimAt = add(target, [0, 0.12, 0]);
    const brace = (k: KeyEdit, push: number) => {
      shift(k.d, -0.06 * push);
      k.d.hip[1] -= 0.05;
      k.d.spine[0] += 0.1;
      face(k.d);
      k.d.foot[0][2] += 0.04;
      const grip = chestPoint(k.d, dims, [-0.04, dims.shoulderY - 0.3, 0.42]);
      hold2(k, grip, sub(aimAt, grip));
    };
    tb.at(t(0.16), 1, (k) => brace(k, 0), "out");
    tb.at(t(0.3), 1, (k) => brace(k, 0.3));
    tb.at(t(0.95), 1, (k) => brace(k, 1));
    tb.at(t(1.15), 0);
    const at = t(0.28);
    return { track: tb.build(), impact: at + SHOT_FLIGHT.water, fx: [{ type: "water", at, until: t(0.98), side: 1 }] };
  }
  if (shot === "cards" || shot === "meishi" || shot === "coins") {
    // 右手はステッキ（カバン・タブレット）を持ったまま、左手を右の肩へ引き、体をひねり戻しながら手首を返して
    // トランプ（名刺・コイン）を放つ
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
    const impact = at + SHOT_FLIGHT[shot];
    const fx = shotFx(shot, at, impact);
    fx[0]!.side = 0;
    return { track: tb.build(), impact, fx };
  }
  if (shot === "shuriken") {
    // 低く構えたまま、右手を左の肩へ引き、横へ払うように手首を返して手裏剣を打つ
    tb.at(t(0.13), 1, (k) => {
      k.d.hip[1] -= 0.03;
      k.d.hipRot[1] += 0.25;
      k.d.chest[1] += 0.15;
      k.d.elbow[1] = [0.2, 0.3, -1];
      k.d.fist[1] = [0.2, 0.9, 0.3];
      face(k.d);
      k.hand(1, chestPoint(k.d, dims, [0.12, dims.shoulderY - 0.02, 0.14]));
    });
    const rel = tb.at(t(0.24), 1, (k) => {
      shift(k.d, 0.05, 0, 0);
      k.d.hip[1] -= 0.04;
      k.d.hipRot[1] -= 0.35;
      k.d.chest[1] -= 0.2;
      k.d.elbow[1] = [-0.6, 0.4, -0.2];
      k.d.fist[1] = [0, -0.8, -0.3];
      face(k.d);
      armToward(k, dims, 1, add(target, [-0.12, 0.12, 0]), 0.97);
    }, "snap");
    tb.pose(t(0.42), 1, rel, "linear");
    tb.at(t(0.64), 1, (k) => (k.d.hip[1] -= 0.02));
    tb.at(t(0.82), 0);
    const at = t(0.22);
    const impact = at + SHOT_FLIGHT.shuriken;
    return { track: tb.build(), impact, fx: shotFx(shot, at, impact) };
  }
  if (shot === "pearls") {
    // カップを肩の上へ振りかぶり、前へ突き出して、ストローの口からタピオカを飛ばす
    tb.at(t(0.16), 1, (k) => {
      k.d.hipRot[1] -= 0.18;
      k.d.spine[0] -= 0.05;
      k.d.elbow[1] = [-0.6, 0.2, -0.4];
      face(k.d);
      k.hand(1, chestPoint(k.d, dims, [-0.16, dims.shoulderY + 0.12, -0.02]));
    });
    const rel = tb.at(t(0.3), 1, (k) => {
      shift(k.d, 0.06, 0, 0);
      k.d.hipRot[1] += 0.3;
      k.d.spine[0] += 0.08;
      k.d.elbow[1] = [-0.6, 0.3, -0.2];
      // 手首を小指の側へ倒し、カップの口（ストロー）を相手へ向ける
      k.d.fist[1] = [0, 0, 1.3];
      face(k.d);
      armToward(k, dims, 1, add(target, [0, 0.15, 0]), 0.9);
    }, "snap");
    tb.pose(t(0.46), 1, rel, "linear");
    tb.at(t(0.66), 1, (k) => shift(k.d, 0.02));
    tb.at(t(0.84), 0);
    const at = t(0.28);
    const impact = at + SHOT_FLIGHT.pearls;
    return { track: tb.build(), impact, fx: shotFx(shot, at, impact) };
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
  // 投資家の電卓は、肩の高さから小さく軽くたたく
  const light = prop === "tablet" ? 1 : 0;
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
    k.d.hipRot[1] -= 0.22 * (1 - 0.6 * light);
    k.d.spine[0] -= 0.08 * (1 - light);
    k.d.chest[0] -= 0.1 * (1 - light);
    k.d.hip[1] -= 0.02;
    k.d.elbow[1] = [-0.7, 0.7, -0.4];
    k.d.fist[1] = wrist[0];
    face(k.d);
    k.hand(1, chestPoint(k.d, dims, [-0.15, dims.shoulderY + 0.33 - 0.22 * light, -0.1 + 0.18 * light]));
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
  const kind = performOf(att.style, boostsSelf(c.strike));
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
    case "laser": {
      // 足をふんばって腰を落とし、頭を相手へまっすぐ向けて、目（バイザー）から光の線を放つ
      const brace = (k: KeyEdit, pull: number) => {
        shift(k.d, -0.03 * pull);
        k.d.hip[1] -= 0.04;
        k.d.hipRot[1] *= 0.5;
        k.d.spine[0] += 0.06;
        face(k.d, 0.1);
        k.d.elbow = [
          [0.3, -1, -0.1],
          [-0.3, -1, -0.1],
        ];
        const hip = k.d.hip;
        k.hand(0, [hip[0] + 0.24, hip[1] + 0.18, hip[2] + 0.06]);
        k.hand(1, [hip[0] - 0.24, hip[1] + 0.18, hip[2] + 0.06]);
      };
      tb.at(0.18, 1, (k) => brace(k, 0));
      tb.at(0.32, 1, (k) => brace(k, 0));
      // 撃っているあいだの反動で、少しずつ押し戻される
      tb.at(0.78, 1, (k) => brace(k, 1));
      tb.at(1.04, 0);
      return { track: tb.build(), impact: 0.32 + LASER_REACH, fx: [{ type: "laser", at: 0.32, until: 0.8 }] };
    }
    case "horn": {
      // 右手をハンドルの真ん中へ寄せ、手のひらでクラクションを 3 回押す。相手へ音の波が広がる
      const press = (k: KeyEdit, down: number) => {
        // 押すたびに肩ごと体重をかけ、顔は相手へ向けたまま少しあごを上げる
        k.d.spine[0] += 0.06 + 0.06 * down;
        k.d.hip[1] -= 0.015 * down;
        k.d.shrug = [0, 0.03 * down];
        face(k.d, -0.08);
        k.d.elbow[1] = [-1, 0.2, -0.2];
        k.d.fist[1] = [1.3, 0, 0];
        k.hand(1, chestPoint(k.d, dims, [0.04, dims.shoulderY - 0.26 - 0.11 * down, 0.3]));
      };
      tb.at(0.16, 1, (k) => press(k, 0));
      for (let i = 0; i < 3; i++) {
        tb.at(0.26 + i * 0.18, 1, (k) => press(k, 1), "snap");
        tb.at(0.35 + i * 0.18, 1, (k) => press(k, 0));
      }
      tb.at(1.02, 0);
      return { track: tb.build(), impact: 0.5, fx: [{ type: "horn", at: 0.24, until: 0.88 }] };
    }
    case "tie": {
      // 左手でネクタイの結び目をきゅっと締め、あごを上げて相手を見すえる
      const fix = (k: KeyEdit, pull: number) => {
        k.d.chest[0] -= 0.04;
        face(k.d, -0.06 - 0.06 * pull);
        k.d.elbow[0] = [1, -0.4, -0.2];
        k.d.fist[0] = [0.4, 1.2, 0];
        k.hand(0, chestPoint(k.d, dims, [0.03, dims.chestH - 0.1 + 0.025 * pull, dims.chestD + 0.11]));
      };
      tb.at(0.2, 1, (k) => fix(k, 0));
      tb.at(0.36, 1, (k) => fix(k, 1), "snap");
      tb.at(0.48, 1, (k) => fix(k, 0.6));
      tb.at(0.6, 1, (k) => fix(k, 1), "snap");
      tb.at(0.86, 1, (k) => fix(k, 1));
      tb.at(1.08, 0);
      return { track: tb.build(), impact: 0.6, fx: [{ type: "sparkle", at: 0.6, until: 0.9 }] };
    }
    case "shaker": {
      // シェイカーに持ちかえ、両手で右の肩の上で何度も振ってから、前へ差し出す
      const shake = (k: KeyEdit, up: number) => {
        k.d.hipRot[1] -= 0.1;
        k.d.hip[1] -= 0.01 * up;
        face(k.d);
        k.d.elbow = [
          [0.6, -1, -0.4],
          [-0.8, -1, -0.3],
        ];
        k.d.fist[1] = [0, 1.6, 0];
        const at = chestPoint(k.d, dims, [-0.12, dims.shoulderY + 0.06 + 0.08 * up, 0.12]);
        k.hand(1, at);
        k.hand(0, add(at, [0.06, -0.12, 0.02]));
      };
      tb.at(0.16, 1, (k) => shake(k, 0));
      for (let i = 0; i < 7; i++) tb.at(0.22 + i * 0.08, 1, (k) => shake(k, i % 2 ? 0 : 1), "inOut");
      const give = tb.at(0.92, 1, (k) => {
        shift(k.d, 0.04, 0, 0);
        face(k.d);
        k.d.fist[1] = [0, 1.6, 0];
        armToward(k, dims, 1, add(T.head, [0, -0.2, 0]), 0.86);
      }, "outBack");
      tb.pose(1.14, 1, give);
      tb.at(1.34, 0);
      return {
        track: tb.build(),
        impact: 0.94,
        fx: [
          { type: "form", at: 0.1, until: 1.3, form: 2 },
          { type: "shake", at: 0.2, until: 0.8 },
          { type: "sparkle", at: 0.94, until: 1.1 },
        ],
      };
    }
    case "seal": {
      // 腰を落としたまま、胸の前で両手を合わせて印を結ぶ。手のまわりから白い煙がゆらりと立つ
      const seal = (k: KeyEdit, sink: number) => {
        k.d.hip[1] -= 0.03 * sink;
        k.d.hipRot[1] *= 0.6;
        face(k.d, 0.1);
        k.d.elbow = [
          [0.9, -0.6, -0.3],
          [-0.9, -0.6, -0.3],
        ];
        k.d.fist = [
          [0.3, 1.5, 0],
          [0.3, -1.5, 0],
        ];
        k.hand(0, chestPoint(k.d, dims, [0.03, dims.shoulderY - 0.14, 0.2]));
        k.hand(1, chestPoint(k.d, dims, [-0.03, dims.shoulderY - 0.14, 0.2]));
      };
      tb.at(0.22, 1, (k) => seal(k, 0.5), "snap");
      tb.at(0.5, 1, (k) => seal(k, 1));
      tb.at(0.8, 1, (k) => seal(k, 1));
      tb.at(1.02, 0);
      return { track: tb.build(), impact: 0.5, fx: [{ type: "wisp", at: 0.22, until: 0.9 }] };
    }
    case "zanshin": {
      // 残心：一歩下がって構え直し、剣先を相手ののどにつけたまま、静かに息をととのえて気を張る（足もとに光の輪）
      const ready = (k: KeyEdit, hold: number) => {
        shift(k.d, -0.1);
        k.d.hip[1] -= 0.01;
        face(k.d, -0.02);
        k.d.breath = hold;
        k.d.shrug = [0.012 * hold, 0.012 * hold];
        const grip = chestPoint(k.d, dims, [0, dims.shoulderY - 0.36, 0.34]);
        hold2(k, grip, sub(add(T.chin, [0, 0.02, 0]), grip));
      };
      tb.at(0.3, 1, (k) => ready(k, 0), "inOut");
      tb.at(0.7, 1, (k) => ready(k, 1));
      tb.at(1.0, 1, (k) => ready(k, 0.6));
      tb.at(1.25, 0);
      return { track: tb.build(), impact: 0.6, fx: [{ type: "zanshin", at: 0.35, until: 1.15 }] };
    }
    case "beckon": {
      // 観客をあおる：観客（見ている人）のほうへ胸を向け、両腕を V の字に大きく広げて、手招きをくり返す
      const open = (k: KeyEdit, curl: number) => {
        k.d.hipRot[1] = k.d.hipRot[1] * 0.4 - 0.75;
        k.d.chest[1] -= 0.25;
        k.d.chest[0] -= 0.14;
        k.d.hip[1] += 0.01 * curl;
        face(k.d, -0.12);
        k.d.neck[1] -= 0.4;
        k.d.elbow = [
          [1, -0.2, -0.3],
          [-1, -0.2, -0.3],
        ];
        k.d.fist = [
          [1.1 * curl, 0.8, 0],
          [1.1 * curl, -0.8, 0],
        ];
        k.hand(0, chestPoint(k.d, dims, [0.46, dims.shoulderY + 0.3, 0.12 + 0.05 * curl]));
        k.hand(1, chestPoint(k.d, dims, [-0.46, dims.shoulderY + 0.3, 0.12 + 0.05 * curl]));
      };
      tb.at(0.28, 1, (k) => open(k, 0), "outBack");
      for (let i = 0; i < 3; i++) {
        tb.at(0.4 + i * 0.18, 1, (k) => open(k, 1));
        tb.at(0.49 + i * 0.18, 1, (k) => open(k, 0));
      }
      tb.at(1.2, 0);
      return {
        track: tb.build(),
        impact: 0.6,
        fx: [
          { type: "sparkle", at: 0.3, until: 0.5 },
          { type: "sparkle", at: 0.78, until: 0.95 },
        ],
      };
    }
    case "scratch": {
      // スクラッチ：左手でヘッドホンを耳に当て、右手で腰の前のレコードを前後にこする（光るレコードと音符）
      const rub = (k: KeyEdit, j: number) => {
        k.d.spine[0] += 0.12;
        k.d.hip[1] -= 0.03;
        face(k.d, 0.22);
        k.d.elbow = [
          [0.7, 0.4, -0.3],
          [-0.6, -1, -0.2],
        ];
        k.d.fist[1] = [-1.2, 0, 0];
        k.hand(0, add(headOf(k, dims), [0.11, -0.04, 0.02]));
        k.hand(1, chestPoint(k.d, dims, [-0.1 + 0.05 * j, -0.06, 0.32 + 0.02 * j]));
      };
      tb.at(0.18, 1, (k) => rub(k, 0));
      for (let i = 0; i < 8; i++) tb.at(0.26 + i * 0.085, 1, (k) => rub(k, i % 2 ? 1 : -1), "inOut");
      tb.at(1.0, 1, (k) => rub(k, 0));
      tb.at(1.2, 0);
      return {
        track: tb.build(),
        impact: 0.62,
        fx: [
          { type: "phones", at: 0.1, until: 1.1 },
          { type: "vinyl", at: 0.2, until: 1.05, side: 1 },
          { type: "notes", at: 0.3, until: 1.05 },
        ],
      };
    }
    case "hype": {
      // フロアを沸かす：観客のほうへ胸を向け、両手を上げてビートに合わせて交互に突き上げる（音符ときらめき）
      const pump = (k: KeyEdit, j: number) => {
        k.d.hip[1] -= 0.03 * Math.abs(j);
        k.d.hipRot[1] = k.d.hipRot[1] * 0.4 - 0.6;
        k.d.chest[1] -= 0.2;
        k.d.chest[0] -= 0.1;
        face(k.d, -0.12);
        k.d.neck[1] -= 0.3;
        k.d.elbow = [
          [0.8, 0.6, -0.2],
          [-0.8, 0.6, -0.2],
        ];
        k.d.fist = [
          [-0.3, 0.4, 0],
          [-0.3, -0.4, 0],
        ];
        k.hand(0, chestPoint(k.d, dims, [0.32, dims.shoulderY + 0.3 + 0.1 * Math.max(0, j), 0.08]));
        k.hand(1, chestPoint(k.d, dims, [-0.32, dims.shoulderY + 0.3 + 0.1 * Math.max(0, -j), 0.08]));
      };
      tb.at(0.2, 1, (k) => pump(k, 0), "outBack");
      for (let i = 0; i < 4; i++) tb.at(0.32 + i * 0.17, 1, (k) => pump(k, i % 2 ? -1 : 1), "inOut");
      tb.at(1.12, 0);
      return {
        track: tb.build(),
        impact: 0.6,
        fx: [
          { type: "notes", at: 0.25, until: 1.05 },
          { type: "sparkle", at: 0.3, until: 0.5 },
          { type: "sparkle", at: 0.8, until: 0.95 },
        ],
      };
    }
    case "chartUp":
    case "chartDown": {
      // タブレットに目を落とし、左手で画面を 2 回たたく。積み立ては上向きのグラフを自分の上に、
      // 空売りはタブレットを相手へ突き出して下向きのグラフを相手の上に見せる（左手で眼鏡を押し上げる）
      const up = kind === "chartUp";
      const look = (k: KeyEdit, tap: number) => {
        face(k.d, 0.35);
        k.d.spine[0] += 0.05;
        k.d.elbow = [
          [0.6, -1, -0.3],
          [-0.5, -1, -0.3],
        ];
        const tab = chestPoint(k.d, dims, [-0.05, dims.shoulderY - 0.3, 0.3]);
        k.hand(1, tab);
        k.hand(0, add(tab, [0.12, 0.04 + 0.04 * tap, 0.03]));
      };
      tb.at(0.2, 1, (k) => look(k, 1));
      tb.at(0.3, 1, (k) => look(k, 0));
      tb.at(0.4, 1, (k) => look(k, 1));
      tb.at(0.5, 1, (k) => look(k, 0));
      const show = (k: KeyEdit) => {
        if (up) {
          face(k.d, -0.05);
          k.d.chest[0] -= 0.05;
          k.hand(1, chestPoint(k.d, dims, [-0.06, dims.shoulderY - 0.1, 0.34]));
          k.hand(0, chestPoint(k.d, dims, [0.3, dims.shoulderY - 0.25, 0.12]));
          return;
        }
        shift(k.d, 0.05);
        k.d.hipRot[1] += 0.15;
        face(k.d, 0);
        k.d.elbow[1] = [-0.5, -1, -0.2];
        armToward(k, dims, 1, add(T.head, [0, -0.18, 0]), 0.88);
        k.d.elbow[0] = [1, -0.4, -0.2];
        k.hand(0, add(headOf(k, dims), [0.05, -0.03, 0.12]));
      };
      tb.at(0.72, 1, show, "outBack");
      tb.at(1.05, 1, show);
      tb.at(1.3, 0);
      return {
        track: tb.build(),
        impact: 0.78,
        fx: [{ type: "chart", at: 0.62, until: 1.25, dir: up ? 1 : -1 }, ...(up ? [{ type: "sparkle" as const, at: 0.85, until: 1.0 }] : [])],
      };
    }
    case "roar": {
      // ガオー：両手を高く上げてつめを立て、前へ乗り出して口を大きく開け、ほえる（声の波）
      tb.at(0.18, 1, (k) => {
        k.d.hip[1] -= 0.04;
        k.d.spine[0] -= 0.06;
      }, "in");
      // 顔が見えるよう、手は頭の両わきの少し下に広げ、胸を少し見ている人のほうへ向ける
      const roar = (k: KeyEdit, shake: number) => {
        shift(k.d, 0.04);
        k.d.hipRot[1] -= 0.3;
        k.d.spine[0] += 0.18;
        k.d.chest[0] += 0.08;
        face(k.d, -0.15);
        k.d.neck[2] += 0.05 * shake;
        k.d.elbow = [
          [1, 0.2, -0.4],
          [-1, 0.2, -0.4],
        ];
        k.d.fist = [
          [1.2, 0.3, 0],
          [1.2, -0.3, 0],
        ];
        k.hand(0, chestPoint(k.d, dims, [0.4, dims.shoulderY + 0.08, 0.12]));
        k.hand(1, chestPoint(k.d, dims, [-0.4, dims.shoulderY + 0.08, 0.12]));
      };
      tb.at(0.34, 1, (k) => roar(k, 0), "outBack");
      for (let i = 0; i < 4; i++) tb.at(0.46 + i * 0.12, 1, (k) => roar(k, i % 2 ? 1 : -1));
      tb.at(1.2, 0);
      return { track: tb.build(), impact: 0.55, fx: [{ type: "roar", at: 0.34, until: 1.05 }] };
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
    case "drink": {
      // カップのストローを口へ運んで、ごくごく飲む（あごを少し上げる）。飲み終えて、ひと息つく
      const sip = (k: KeyEdit, gulp: number) => {
        face(k.d, -0.12 - 0.04 * gulp);
        k.d.chest[0] -= 0.04;
        k.d.elbow[1] = [-0.7, -1, -0.3];
        // 前腕を立てたまま手首を小指の側へ倒し、カップを前腕の先（上）へ向ける
        k.d.fist[1] = [0, 0, 1.4];
        const h = headOf(k, dims);
        // カップが顔に隠れないよう、口の少し前・下で持つ（ストローの先が口に届く）
        k.hand(1, add(h, [-0.01, -0.4 + 0.01 * gulp, 0.13]));
      };
      tb.at(0.26, 1, (k) => sip(k, 0));
      for (let i = 0; i < 3; i++) tb.at(0.38 + i * 0.16, 1, (k) => sip(k, i % 2 ? 0 : 1));
      tb.at(0.94, 1, (k) => {
        face(k.d, 0.1);
        k.d.breath = 1;
        k.d.shrug = [0.02, 0.02];
      });
      tb.at(1.18, 0);
      return {
        track: tb.build(),
        impact: 0.8,
        fx: [
          { type: "heal", at: 0.36, until: 1.16 },
          { type: "sparkle", at: 0.92, until: 1.1 },
        ],
      };
    }
    case "helmet": {
      // ひと息：筒先を右の腰へ下ろし、左手でヘルメットを少し持ち上げて、手の甲で額の汗をぬぐう
      const rest = (k: KeyEdit) => {
        const hip = k.d.hip;
        k.d.elbow[1] = [-0.3, -1, -0.2];
        k.hand(1, [hip[0] - 0.2, hip[1] + 0.06, hip[2] + 0.16]);
      };
      const brim = (k: KeyEdit, lift: number) => {
        rest(k);
        face(k.d, -0.08);
        k.d.elbow[0] = [1, 0.6, -0.2];
        k.d.fist[0] = [0.3, 1.0, 0];
        k.hand(0, add(headOf(k, dims), [0.06, 0.13 + 0.06 * lift, 0.13]));
      };
      const wipe = (k: KeyEdit, x: number) => {
        rest(k);
        face(k.d, -0.12);
        k.d.elbow[0] = [1, 0.3, -0.3];
        k.d.fist[0] = [0, 1.3, 0];
        k.hand(0, add(headOf(k, dims), [x, 0.07, 0.15]));
      };
      tb.at(0.22, 1, (k) => brim(k, 0));
      tb.at(0.38, 1, (k) => brim(k, 1));
      tb.at(0.54, 1, (k) => wipe(k, -0.06));
      tb.at(0.7, 1, (k) => wipe(k, 0.1));
      tb.at(0.86, 1, (k) => {
        brim(k, 0);
        k.d.breath = 1;
        k.d.shrug = [0.02, 0.02];
      });
      tb.at(1.08, 1, (k) => {
        rest(k);
        face(k.d, 0.1);
        k.d.shrug = [-0.01, -0.01];
      });
      tb.at(1.3, 0);
      return {
        track: tb.build(),
        impact: 0.8,
        fx: [
          { type: "lift", at: 0.3, until: 0.92 },
          { type: "heal", at: 0.34, until: 1.22 },
        ],
      };
    }
    case "dividend": {
      // 配当：タブレットを胸の前に持ったまま、左の手のひらを上へ向けて差し出す。上から金色のコインが降ってきて光る
      const take = (k: KeyEdit, up: number) => {
        face(k.d, -0.12 - 0.06 * up);
        k.d.chest[0] -= 0.04;
        k.d.elbow[0] = [0.8, -0.6, -0.3];
        k.d.fist[0] = [-0.4, 1.4, 0];
        k.hand(0, chestPoint(k.d, dims, [0.16, dims.shoulderY - 0.22 + 0.04 * up, 0.3]));
      };
      tb.at(0.25, 1, (k) => take(k, 0));
      tb.at(0.7, 1, (k) => take(k, 1));
      tb.at(1.0, 1, (k) => take(k, 0.5));
      tb.at(1.25, 0);
      return {
        track: tb.build(),
        impact: 0.8,
        fx: [
          { type: "coinrain", at: 0.2, until: 1.1 },
          { type: "heal", at: 0.42, until: 1.2 },
          { type: "sparkle", at: 0.88, until: 1.0 },
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
  const ninja = c.att.style === "ninja";
  // マントをひるがえすように、左手を顔の前へ払う。忍者は右手で煙玉を足もとへたたきつける
  const flourish = (k: KeyEdit) => {
    k.d.hip[1] -= ninja ? 0.06 : 0.03;
    k.d.spine[0] += ninja ? 0.2 : 0.1;
    if (ninja) {
      k.d.elbow[1] = [-0.4, -1, 0.2];
      k.d.fist[1] = [0.8, 0, 0];
      const hip = k.d.hip;
      k.hand(1, [hip[0] - 0.06, hip[1] - 0.08, hip[2] + 0.32]);
      return;
    }
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
    if (h === "helmet") fx.push({ type: "lift", at: 0.25, until: 0.8 });
    if (h === "dividend") fx.push({ type: "coinrain", at: 0.2, until: 0.9 });
    return { track: tb.build(), impact: 0.6, fx };
  }
  const p = performOf(c.att.style, boostsSelf(c.strike));
  const TYPES: Record<PerformKind, FxLocal["type"]> = {
    idol: "hearts",
    rapper: "notes",
    gamer: "frame",
    magician: "palm",
    laser: "laser",
    horn: "horn",
    tie: "sparkle",
    shaker: "shake",
    seal: "wisp",
    pose: "sparkle",
    zanshin: "zanshin",
    beckon: "sparkle",
    scratch: "vinyl",
    hype: "notes",
    chartUp: "chart",
    chartDown: "chart",
    roar: "roar",
  };
  const fx: FxLocal[] = [{ type: TYPES[p], at: 0.25, until: 0.85, side: p === "scratch" ? 1 : 0, ...(p === "chartUp" || p === "chartDown" ? { dir: p === "chartUp" ? 1 : -1 } : {}) }];
  if (p === "idol") fx.push({ type: "wink", at: 0.25, until: 0.8 });
  if (p === "shaker") fx.push({ type: "form", at: 0.2, until: 0.9, form: 2 });
  return { track: tb.build(), impact: 0.5, fx };
}

/**
 * 忍者の分身のかわし：その場に半透明の残像を残し、横へすばやく跳んでかわす。
 * 技として出したとき（dodge）と、相手の技をかわしたとき（reactionTrack）の両方で使う
 */
export function sidestep(k: KeyEdit, s: number) {
  // 横と後ろへ斜めに跳ぶ（カメラから見ても、残像と本体が離れて見えるように）
  shift(k.d, -0.26 * s, 0.2 * s);
  k.d.hip[1] -= 0.06 * s;
  k.d.spine[2] -= 0.12 * s;
  k.d.neck[2] += 0.08 * s;
}

export function afterimageDodge(c: Pick<AttackCtx, "att">): Built {
  const tb = new TrackBuilder(c.att.base, c.att.d);
  tb.at(0.1, 1, (k) => sidestep(k, 1), "snap");
  tb.at(0.45, 1, (k) => sidestep(k, 0.9));
  tb.at(0.7, 0);
  return { track: tb.build(), impact: 0.1, fx: [{ type: "ghost", at: 0.01, until: 0.45 }] };
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
