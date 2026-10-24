import { Circle, Settings, World, type Body } from "planck";
import { Curling } from "@atg/core";
import { DECEL, releaseAngle, STEP } from "./params.ts";

/**
 * カーリングの物理演算（planck = Box2D の移植）。上から見た平面で、重力はなし。
 * 盤から dynamic import で読み込むので、ほかの画面の読み込みは重くならない。
 * 同じ入力からは同じ結果になる（端末によって三角関数などがわずかにずれることはある）
 */

const { STONE_R, SHEET_W, BACK_Y } = Curling;

/** [x, y, 向き（ラジアン、反時計回り）] */
export type Pose = [x: number, y: number, angle: number];

/** これだけ計算しても止まらなければ、そこで結果を決める */
const MAX_TIME = 30;
/** シートの外に出た石を、消えるまで動かして見せる時間（秒） */
const FADE_TIME = 0.5;

/** 物理演算の値。調整するときは simulateThrow に別の値を渡して試せる */
export interface Tuning {
  /** 遅くなる割合（m/s²） */
  decel: number;
  /** 回転で横へ曲がる力（m/s²）。進む向きに直角にかかる */
  curl: number;
  /** これより遅いときは、この速さとみなして曲げる（止まりぎわに急に向きが変わらないように） */
  curlMinSpeed: number;
  /** 投げたときの回転の速さ（ラジアン/秒） */
  spin: number;
  /** 回転は速さ 1 m/s あたりこれより速くならない（止まるときに回転も止まる） */
  spinPerSpeed: number;
  /** 石どうしの反発 */
  restitution: number;
  /** 石どうしの摩擦 */
  friction: number;
  /** これより遅くぶつかっても反発させる（planck の既定は 1 m/s で、ゆっくり当てると跳ねない） */
  bounceThreshold: number;
  /** 1 コマを何回に分けて計算するか */
  subSteps: number;
}

/**
 * 決めた値。ハウスの中心をねらう強さで投げると、7 秒くらいで止まり、回転の向きへ 1 m くらい曲がる。
 * 強く当てると、当てた石はほとんど止まり、当てられた石がはじかれる
 */
export const TUNING: Tuning = {
  decel: DECEL,
  curl: 0.09,
  curlMinSpeed: 0.3,
  spin: 2.2,
  spinPerSpeed: 0.6,
  restitution: 0.85,
  friction: 0.08,
  bounceThreshold: 0.02,
  subSteps: 4,
};

export interface Simulation {
  /** k 番目の石の id。投げる前の石の順で、最後が投げた石 */
  ids: number[];
  /** 1 コマごとの全部の石の位置。frames[コマ][k] */
  frames: Pose[][];
  /** k 番目の石がシートの外（横・奥）に出たコマ。出なければ null */
  outAt: (number | null)[];
  /** 止まったあと、シートに残った石（0.1 mm 単位にそろえたもの。向きは -π〜π）。ホッグラインを越えなかった石も除く */
  stones: Curling.Placed[];
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
/** 角度を -π〜π にそろえる */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** 横の線に触れたか、奥の線を完全に越えたか（すぐに取り除く） */
const leftSheet = (x: number, y: number) => Math.abs(x) + STONE_R >= SHEET_W / 2 || y - STONE_R > BACK_Y;

interface Ghost {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
}

/**
 * before の石が止まっているところへ、投げる場所（原点）から id 番の石を投げ、全部の石が止まるか
 * MAX_TIME 秒たつまで計算する。aim は向き（正なら右）、speed は速さ、spin は回転（1 = 右回り）
 */
export function simulateThrow(
  before: readonly Curling.CurlingStone[],
  id: number,
  aim: number,
  speed: number,
  spin: Curling.Spin,
  tuning: Tuning = TUNING,
): Simulation {
  // ゆっくり当てても跳ねるよう、planck 全体の設定を計算の間だけ変える（いしつみの計算には影響させない）
  const threshold = Settings.velocityThreshold;
  Settings.velocityThreshold = tuning.bounceThreshold;
  try {
    return run(before, id, aim, speed, spin, tuning);
  } finally {
    Settings.velocityThreshold = threshold;
  }
}

function run(
  before: readonly Curling.CurlingStone[],
  id: number,
  aim: number,
  speed: number,
  spin: Curling.Spin,
  tuning: Tuning,
): Simulation {
  const world = new World({ gravity: { x: 0, y: 0 }, allowSleep: false });
  const dt = STEP / tuning.subSteps;

  const addStone = (x: number, y: number, angle: number, moving: boolean): Body => {
    const body = world.createBody({
      type: "dynamic",
      position: { x, y },
      angle,
      bullet: moving,
      linearVelocity: moving ? { x: speed * Math.sin(aim), y: speed * Math.cos(aim) } : { x: 0, y: 0 },
      // 右回り（時計回り）は planck では負の向き
      angularVelocity: moving ? -spin * tuning.spin : 0,
    });
    body.createFixture(new Circle(STONE_R), { density: 1, friction: tuning.friction, restitution: tuning.restitution });
    return body;
  };

  const ids = [...before.map((s) => s.id), id];
  const bodies: (Body | null)[] = [
    ...before.map((s) => addStone(s.x, s.y, s.angle, false)),
    addStone(0, 0, releaseAngle(spin), true),
  ];
  // 回転で曲がるのは投げた石だけ（当てられた石はほとんど回らないので曲げない）
  const curls = ids.map((_, k) => (k === ids.length - 1 ? spin : 0));
  const ghosts: (Ghost | null)[] = ids.map(() => null);
  const outAt: (number | null)[] = ids.map(() => null);

  /** 氷の上をすべる：速さを一定の割合で落とし、回転の向きへ進む向きを少しずつ曲げる */
  const slide = (body: Body, curl: number) => {
    const v = body.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    if (sp === 0) return;
    const next = sp - tuning.decel * dt;
    if (next <= 0) {
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
      return;
    }
    // 右回りなら時計回りに曲げる（右へ寄る）
    const turn = (-curl * tuning.curl * dt) / Math.max(sp, tuning.curlMinSpeed);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const k = next / sp;
    body.setLinearVelocity({ x: (v.x * c - v.y * s) * k, y: (v.x * s + v.y * c) * k });
    const w = body.getAngularVelocity();
    const cap = tuning.spinPerSpeed * next;
    if (Math.abs(w) > cap) body.setAngularVelocity(Math.sign(w) * cap);
  };

  /** 外に出た石は、ほかの石には当たらずに少しすべって消える（見た目だけ） */
  const drift = (g: Ghost) => {
    const sp = Math.hypot(g.vx, g.vy);
    const k = sp > 0 ? Math.max(0, sp - tuning.decel * STEP) / sp : 0;
    g.vx *= k;
    g.vy *= k;
    g.x += g.vx * STEP;
    g.y += g.vy * STEP;
    g.angle += g.spin * STEP;
  };

  const poses = (): Pose[] =>
    bodies.map((b, k) => {
      if (b) {
        const p = b.getPosition();
        return [p.x, p.y, b.getAngle()];
      }
      const g = ghosts[k]!;
      return [g.x, g.y, g.angle];
    });

  const frames: Pose[][] = [poses()];
  const maxFrames = Math.ceil(MAX_TIME / STEP);
  for (let f = 1; f <= maxFrames; f++) {
    for (let sub = 0; sub < tuning.subSteps; sub++) {
      bodies.forEach((b, k) => b && slide(b, curls[k]!));
      world.step(dt, 8, 3);
    }
    ghosts.forEach((g) => g && drift(g));
    bodies.forEach((b, k) => {
      if (!b) return;
      const p = b.getPosition();
      if (!leftSheet(p.x, p.y)) return;
      // シートの外に出た石はすぐに取り除く（ほかの石に当たらないようにする）
      const v = b.getLinearVelocity();
      ghosts[k] = { x: p.x, y: p.y, vx: v.x, vy: v.y, angle: b.getAngle(), spin: b.getAngularVelocity() };
      outAt[k] = f;
      world.destroyBody(b);
      bodies[k] = null;
    });
    frames.push(poses());

    const moving = bodies.some((b) => {
      if (!b) return false;
      const v = b.getLinearVelocity();
      return v.x !== 0 || v.y !== 0;
    });
    const fading = outAt.some((o) => o !== null && (f - o) * STEP < FADE_TIME);
    if (!moving && !fading) break;
  }

  const last = frames[frames.length - 1]!;
  const stones: Curling.Placed[] = [];
  bodies.forEach((b, k) => {
    if (!b) return;
    const [x, y, angle] = last[k]!;
    if (Curling.inPlay(round4(x), round4(y))) stones.push([ids[k]!, round4(x), round4(y), round4(wrap(angle))]);
  });
  return { ids, frames, outAt, stones };
}
