import { Circle, Settings, World, type Body } from "planck";
import { Curling } from "@atg/core";
import { DECEL, releaseAngle, STEP } from "./params.ts";

/**
 * カーリングの物理演算（planck = Box2D の移植）。上から見た平面で、重力はなし。
 * 盤から dynamic import で読み込むので、ほかの画面の読み込みは重くならない。
 * 同じ入力からは同じ結果になる（端末によって三角関数などがわずかにずれることはある）。
 *
 * ブラシでこする：すべっている間に画面を連打すると、投げた石の前の氷をこする。こすっている間は石が遅くなりにくく、
 * 曲がりにくい（本物と同じく、こするとよく伸びて、まっすぐ進む）。連打した 1 回ごとに「こすりの強さ」が上がり、
 * すぐに下がっていくので、続けて連打している間だけ効く。連打したコマの番号を手に残し、相手の画面でも同じに計算する。
 * 自分で投げたときは、連打を受けながら 1 コマずつ計算する（startThrow）
 */

const { STONE_R, SHEET_W, BACK_Y } = Curling;

/** [x, y, 向き（ラジアン、反時計回り）] */
export type Pose = [x: number, y: number, angle: number];

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
  /** こすりの強さが 1 のとき、遅くなる割合をどれだけ減らすか（0.2 なら 2 割減らす） */
  sweepDecel: number;
  /** こすりの強さが 1 のとき、曲がる力をどれだけ減らすか */
  sweepCurl: number;
  /** 1 回の連打で上がる、こすりの強さ（最大 1） */
  sweepTap: number;
  /** こすりの強さが半分に下がるまでの時間（秒） */
  sweepHalfLife: number;
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
  // 1 秒に 6〜8 回くらい連打すると強さが 0.8〜0.9 くらいになる。ずっとこすり続けると 4〜5 m 伸びる
  sweepDecel: 0.2,
  sweepCurl: 0.55,
  sweepTap: 0.5,
  sweepHalfLife: 0.15,
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
  /** 1 コマごとの、こすりの強さ（0〜1）。sweep[コマ] */
  sweep: number[];
}

/** 自分で投げた 1 投を、連打を受けながら 1 コマずつ計算する */
export interface ThrowRun {
  /** ここまでの計算。frames・outAt・sweep は step のたびに伸びる。stones は止まったあと（done）に入る */
  sim: Simulation;
  /** 連打したコマの番号（手に入れて送る） */
  taps: number[];
  /** 全部の石が止まった（か、計算の上限まで来た） */
  done: boolean;
  /** 1 コマ進める。tap はこのコマで連打したか。止まったあとは何もしない */
  step(tap: boolean): void;
  /** 投げた石がまだ動いていて、こすれるか */
  canSweep(): boolean;
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
 * MAX_FRAMES コマ計算するまで進める。aim は向き（正なら右）、speed は速さ、spin は回転（1 = 右回り）、
 * taps はブラシでこすった（連打した）コマの番号
 */
export function simulateThrow(
  before: readonly Curling.CurlingStone[],
  id: number,
  aim: number,
  speed: number,
  spin: Curling.Spin,
  taps: readonly number[] = [],
  tuning: Tuning = TUNING,
): Simulation {
  const run = startThrow(before, id, aim, speed, spin, tuning);
  const tapped = new Set(taps);
  while (!run.done) run.step(tapped.has(run.sim.frames.length));
  return run.sim;
}

/** 1 投の計算をはじめる。step で 1 コマずつ進める */
export function startThrow(
  before: readonly Curling.CurlingStone[],
  id: number,
  aim: number,
  speed: number,
  spin: Curling.Spin,
  tuning: Tuning = TUNING,
): ThrowRun {
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
  const thrown = ids.length - 1;
  const bodies: (Body | null)[] = [
    ...before.map((s) => addStone(s.x, s.y, s.angle, false)),
    addStone(0, 0, releaseAngle(spin), true),
  ];
  // 回転で曲がるのは投げた石だけ（当てられた石はほとんど回らないので曲げない）
  const curls = ids.map((_, k) => (k === thrown ? spin : 0));
  const ghosts: (Ghost | null)[] = ids.map(() => null);
  const outAt: (number | null)[] = ids.map(() => null);
  /** こすりの強さが 1 コマで下がる割合 */
  const cool = Math.pow(0.5, STEP / tuning.sweepHalfLife);
  let heat = 0;

  /** 氷の上をすべる：速さを一定の割合で落とし、回転の向きへ進む向きを少しずつ曲げる。swept はこすりの強さ */
  const slide = (body: Body, curl: number, swept: number) => {
    const v = body.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    if (sp === 0) return;
    const next = sp - tuning.decel * (1 - tuning.sweepDecel * swept) * dt;
    if (next <= 0) {
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAngularVelocity(0);
      return;
    }
    // 右回りなら時計回りに曲げる（右へ寄る）
    const turn = (-curl * tuning.curl * (1 - tuning.sweepCurl * swept) * dt) / Math.max(sp, tuning.curlMinSpeed);
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

  const isMoving = (b: Body | null) => {
    if (!b) return false;
    const v = b.getLinearVelocity();
    return v.x !== 0 || v.y !== 0;
  };

  const sim: Simulation = { ids, frames: [poses()], outAt, stones: [], sweep: [0] };
  const taps: number[] = [];
  const run: ThrowRun = {
    sim,
    taps,
    done: false,
    canSweep: () => !run.done && isMoving(bodies[thrown]!),
    step(tap) {
      if (run.done) return;
      const f = sim.frames.length;
      // 動いている投げた石の前だけこする。止まった・外に出たあとの連打は数えない
      if (tap && run.canSweep()) {
        taps.push(f);
        heat = Math.min(1, heat * cool + tuning.sweepTap);
      } else heat *= cool;
      const swept = bodies[thrown] ? heat : 0;

      // ゆっくり当てても跳ねるよう、planck 全体の設定を計算の間だけ変える（いしつみの計算には影響させない）
      const threshold = Settings.velocityThreshold;
      Settings.velocityThreshold = tuning.bounceThreshold;
      try {
        for (let sub = 0; sub < tuning.subSteps; sub++) {
          bodies.forEach((b, k) => b && slide(b, curls[k]!, k === thrown ? swept : 0));
          world.step(dt, 8, 3);
        }
      } finally {
        Settings.velocityThreshold = threshold;
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
      sim.frames.push(poses());
      sim.sweep.push(swept);

      const moving = bodies.some(isMoving);
      const fading = outAt.some((o) => o !== null && (f - o) * STEP < FADE_TIME);
      if ((moving || fading) && f < Curling.MAX_FRAMES) return;

      run.done = true;
      const last = sim.frames[sim.frames.length - 1]!;
      bodies.forEach((b, k) => {
        if (!b) return;
        const [x, y, angle] = last[k]!;
        if (Curling.inPlay(round4(x), round4(y))) sim.stones.push([ids[k]!, round4(x), round4(y), round4(wrap(angle))]);
      });
    },
  };
  return run;
}
