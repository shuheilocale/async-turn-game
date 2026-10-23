import { Edge, Polygon, World, type Body } from "planck";
import { Stack } from "@atg/core";
import { GROUND_Y, ROCK, STEP } from "./scene.ts";

/**
 * いしつみの物理演算（planck = Box2D の移植）。盤から dynamic import で読み込むので、
 * ほかの画面の読み込みは重くならない。
 * 同じ入力からは同じ結果になる（端末によって三角関数などがわずかにずれることはある）
 */

type Pose = Stack.Pose;

/** これだけ計算しても止まらなければ、そこで結果を決める */
const MAX_TIME = 6;

/** 物理演算の値。調整するときは simulateDrop に別の値を渡して試せる */
export interface Tuning {
  gravity: number;
  friction: number;
  restitution: number;
  density: number;
  /** 回転の減衰。転がり続けないよう少しだけ */
  angularDamping: number;
  /** 1 コマを何回に分けて計算するか */
  subSteps: number;
  velocityIterations: number;
  positionIterations: number;
}

/**
 * 決めた値。一番上の石のまん中をねらって（数 cm ずれながら）積むと、2 人合わせてだいたい 8〜20 個で崩れる。
 * 計算の回数は Box2D の既定（8・3、分けない）より多めにして、積んだ石が勝手にずれたり
 * 止まらなかったりしないようにしている（石を作り直すたびに、石どうしの押し合いが 0 から始まるため）
 */
export const TUNING: Tuning = {
  gravity: 9.8,
  friction: 0.7,
  restitution: 0.05,
  density: 2.6,
  angularDamping: 0.1,
  subSteps: 2,
  velocityIterations: 30,
  positionIterations: 10,
};

export interface Simulation {
  /** 1 コマごとの全部の石の位置（落とした石を含む） */
  frames: Pose[][];
  /** 止まった位置（0.1 mm 単位にそろえたもの） */
  positions: Pose[];
  collapsed: boolean;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;

/**
 * before の位置に積んである石の上へ、次の石を x・angle で落とし、全部の石が止まる（sleep する）か
 * MAX_TIME 秒たつまで計算する
 */
export function simulateDrop(
  stones: Stack.Point[][],
  before: Pose[],
  x: number,
  angle: number,
  tuning: Tuning = TUNING,
): Simulation {
  const world = new World({ gravity: { x: 0, y: -tuning.gravity } });
  const surface = { friction: tuning.friction, restitution: tuning.restitution };

  // 地面と台（動かない）
  const ground = world.createBody();
  ground.createFixture(new Edge({ x: -50, y: GROUND_Y }, { x: 50, y: GROUND_Y }), surface);
  ground.createFixture(new Polygon(ROCK.map(([px, py]) => ({ x: px, y: py }))), surface);

  const addStone = (i: number, [px, py, pa]: Pose, awake: boolean): Body => {
    const body = world.createBody({
      type: "dynamic",
      position: { x: px, y: py },
      angle: pa,
      angularDamping: tuning.angularDamping,
      awake,
    });
    body.createFixture(new Polygon(stones[i]!.map(([vx, vy]) => ({ x: vx, y: vy }))), {
      ...surface,
      density: tuning.density,
    });
    return body;
  };

  // 積んである石は止まった状態から始める（落とした石が触れると動き出す）
  const bodies = before.map((pose, i) => addStone(i, pose, false));
  bodies.push(addStone(before.length, Stack.dropPose(stones, before, x, angle), true));

  const poses = (): Pose[] =>
    bodies.map((b) => {
      const p = b.getPosition();
      return [p.x, p.y, b.getAngle()];
    });

  const frames: Pose[][] = [poses()];
  for (let t = 0; t < MAX_TIME / STEP; t++) {
    for (let k = 0; k < tuning.subSteps; k++) {
      world.step(STEP / tuning.subSteps, tuning.velocityIterations, tuning.positionIterations);
    }
    frames.push(poses());
    if (bodies.every((b) => !b.isAwake())) break;
  }

  const positions = frames[frames.length - 1]!.map((p) => p.map(round4) as Pose);
  return { frames, positions, collapsed: Stack.hasCollapsed(positions) };
}
