import { Circle, Polygon, Settings, World, type Body, type Contact } from "planck";
import { Billiards } from "@atg/core";
import { CUSHIONS, KNUCKLE_R, MAX_FRAMES, pocketOf, STEP } from "./table.ts";

/**
 * ビリヤードの物理演算（planck = Box2D の移植）。上から見た平面で、重力はなし。
 * 盤から dynamic import で読み込むので、ほかの画面の読み込みは重くならない。
 *
 * - 球どうしはよく弾み、クッションは少し弾みが弱い。ラシャの上では、転がりの抵抗で少しずつ遅くなる
 * - 上下の回転（押し球・引き球）：球ごとに「回転が進ませようとする速さ」（roll）を持つ。球の速さと roll が違う間は
 *   ラシャの上をすべっていて、摩擦で両方が近づき、そろうと転がる（中心を打つと、はじめはすべって、やがて転がる）。
 *   球どうしが当たると速さだけが入れかわり、回転は残るので、押し球は当たったあと前へ進み、引き球は戻る
 * - 同じ入力からは同じ結果になる。固定の時間刻みで進め、計算の途中では端末によって末の桁がずれることのある
 *   三角関数などを使わない（四則演算と平方根だけ）。相手の画面でも同じに計算し直せる
 *
 * Box2D は 0.1〜10 くらいの大きさのものが得意なので、計算の中だけ長さを SCALE 倍にする（1 = 10 cm）
 */

const { BALL_R, CUE } = Billiards;

/** 計算の中の長さ（1 = 10 cm） */
const SCALE = 10;

/** 物理演算の値。調整するときは simulateShot に別の値を渡して試せる */
export interface Tuning {
  /** 球どうしの反発 */
  ballRestitution: number;
  /** 球とクッションの反発 */
  cushionRestitution: number;
  /** 球とクッションの摩擦 */
  cushionFriction: number;
  /** すべっている球にかかる摩擦の加速度（m/s²） */
  slide: number;
  /** 転がりの抵抗：一定の分（m/s²）と、速さに比べた分（1/s） */
  rollDecel: number;
  rollDrag: number;
  /** 回転を一番かけたとき、回転が進ませようとする速さは、打った速さの何倍か */
  spinRoll: number;
  /** これより遅くなったら止める（m/s） */
  stopSpeed: number;
  /** 1 コマを何回に分けて計算するか */
  subSteps: number;
}

export const TUNING: Tuning = {
  ballRestitution: 0.95,
  cushionRestitution: 0.76,
  cushionFriction: 0.12,
  slide: 1.1,
  rollDecel: 0.1,
  rollDrag: 0.28,
  spinRoll: 1.5,
  stopSpeed: 0.006,
  subSteps: 8,
};

export interface Simulation {
  /** k 番目の球の id（打つ前の球の順。手球が先頭） */
  ids: number[];
  /** 1 コマごとの全部の球の位置。frames[コマ][2k], frames[コマ][2k+1]。落ちた球は落ちた所のまま */
  frames: Float64Array[];
  /** k 番目の球がポケットに落ちたコマと、落ちたポケット。落ちなければ null */
  pocketAt: (number | null)[];
  pocketIn: (number | null)[];
  /** 落ちた球（落ちた順） */
  pocketed: number[];
  /** 手球が最初に当てた球 */
  firstHit: number | null;
  /** 止まったあと、台に残った球（0.1 mm 単位にそろえたもの） */
  balls: Billiards.Placed[];
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;

/**
 * 向きのサインとコサイン。四則演算だけで計算する（Math.sin などは端末で末の桁がずれることがあるので使わない）。
 * 誤差は 1e-15 くらい
 */
export function sinCos(a: number): [number, number] {
  const HALF_PI = 1.5707963267948966;
  const q = Math.round(a / HALF_PI);
  const r = a - q * HALF_PI;
  const r2 = r * r;
  const s = r * (1 - (r2 / 6) * (1 - (r2 / 20) * (1 - (r2 / 42) * (1 - (r2 / 72) * (1 - (r2 / 110) * (1 - (r2 / 156) * (1 - (r2 / 210) * (1 - r2 / 272))))))));
  const c = 1 - (r2 / 2) * (1 - (r2 / 12) * (1 - (r2 / 30) * (1 - (r2 / 56) * (1 - (r2 / 90) * (1 - (r2 / 132) * (1 - (r2 / 182) * (1 - r2 / 240)))))));
  switch (((q % 4) + 4) % 4) {
    case 0:
      return [s, c];
    case 1:
      return [c, -s];
    case 2:
      return [-s, -c];
    default:
      return [-c, s];
  }
}

interface BallBody {
  id: number;
  body: Body | null;
  /** 回転が進ませようとする速さ（計算の中の長さ / 秒） */
  rx: number;
  ry: number;
}

type Tag = { kind: "ball"; k: number } | { kind: "cushion" };

/**
 * before の球が止まっているところへ、手球を angle の向き・speed の速さ・spin の回転で打ち、
 * 全部の球が止まるか MAX_FRAMES コマ計算するまで進める
 */
export function simulateShot(
  before: readonly Billiards.Ball[],
  angle: number,
  speed: number,
  spin: number,
  tuning: Tuning = TUNING,
): Simulation {
  const run = startShot(before, angle, speed, spin, tuning);
  while (!run.done) run.step();
  return run.sim;
}

export interface ShotRun {
  sim: Simulation;
  done: boolean;
  /** 1 コマ進める */
  step(): void;
}

/** 1 打の計算をはじめる。step で 1 コマずつ進める */
export function startShot(
  before: readonly Billiards.Ball[],
  angle: number,
  speed: number,
  spin: number,
  tuning: Tuning = TUNING,
): ShotRun {
  const world = new World({ gravity: { x: 0, y: 0 }, allowSleep: false });
  const dt = STEP / tuning.subSteps;
  const R = BALL_R * SCALE;

  // クッション（ゴムの形と、口の角の丸み）
  for (const c of CUSHIONS) {
    const body = world.createBody({ type: "static" });
    const tag: Tag = { kind: "cushion" };
    const opts = { friction: tuning.cushionFriction, restitution: tuning.cushionRestitution, userData: tag };
    body.createFixture(new Polygon(c.points.map(([x, y]) => ({ x: x * SCALE, y: y * SCALE }))), opts);
    for (const [x, y] of c.knuckles) body.createFixture(new Circle({ x: x * SCALE, y: y * SCALE }, KNUCKLE_R * SCALE), opts);
  }

  // 手球を先頭に並べる
  const order = [...before].sort((a, b) => (a.id === CUE ? -1 : b.id === CUE ? 1 : a.id - b.id));
  const [sin, cos] = sinCos(angle);
  const v0 = speed * SCALE;
  const balls: BallBody[] = order.map((b, k) => {
    const cue = b.id === CUE;
    const body = world.createBody({
      type: "dynamic",
      position: { x: b.x * SCALE, y: b.y * SCALE },
      bullet: true,
      fixedRotation: true,
      linearVelocity: cue ? { x: v0 * cos, y: v0 * sin } : { x: 0, y: 0 },
    });
    const tag: Tag = { kind: "ball", k };
    body.createFixture(new Circle(R), { density: 1, friction: 0, restitution: tuning.ballRestitution, userData: tag });
    // 打った手球の回転：中心を打てば 0（すべりだす）、上なら前へ、下なら後ろへ
    const roll = cue ? v0 * tuning.spinRoll * spin : 0;
    return { id: b.id, body, rx: roll * cos, ry: roll * sin };
  });

  const ids = balls.map((b) => b.id);
  const pocketAt: (number | null)[] = ids.map(() => null);
  const pocketIn: (number | null)[] = ids.map(() => null);
  const pocketed: number[] = [];
  let firstHit: number | null = null;
  /** このコマでクッションに当たり始めた球と、当たった向き（クッションの面に直角） */
  const bounced: [k: number, nx: number, ny: number][] = [];

  world.on("begin-contact", (contact: Contact) => {
    const a = contact.getFixtureA().getUserData() as Tag;
    const b = contact.getFixtureB().getUserData() as Tag;
    const wm = contact.getWorldManifold(null);
    if (!wm) return;
    const n = wm.normal;
    if (a.kind === "ball" && b.kind === "ball") {
      if (firstHit !== null) return;
      const cueK = a.k === 0 && ids[0] === CUE ? a.k : b.k === 0 && ids[0] === CUE ? b.k : -1;
      if (cueK < 0) return;
      const other = cueK === a.k ? b.k : a.k;
      // 近づきながら触れたときだけ当たったとする（くっついて止まっていた球から離れるときは数えない）
      const va = balls[a.k]!.body!.getLinearVelocity();
      const vb = balls[b.k]!.body!.getLinearVelocity();
      const closing = (va.x - vb.x) * n.x + (va.y - vb.y) * n.y;
      if (closing > 1e-6) firstHit = ids[other]!;
      return;
    }
    // planck は 2 つの反発の大きい方を使うので、クッションに当たったときはクッションの反発にする
    contact.setRestitution(tuning.cushionRestitution);
    if (a.kind === "ball" && b.kind === "cushion") bounced.push([a.k, n.x, n.y]);
    else if (a.kind === "cushion" && b.kind === "ball") bounced.push([b.k, n.x, n.y]);
  });

  const stop = tuning.stopSpeed * SCALE;
  const slideDv = tuning.slide * SCALE * dt;
  const rollDecel = tuning.rollDecel * SCALE * dt;
  const rollDrag = tuning.rollDrag * dt;

  /** ラシャの上：すべっている間は摩擦で速さと回転を近づけ、転がりの抵抗で遅くする */
  const cloth = (b: BallBody) => {
    const body = b.body!;
    const v = body.getLinearVelocity();
    let vx = v.x;
    let vy = v.y;
    let rx = b.rx;
    let ry = b.ry;
    const sx = vx - rx;
    const sy = vy - ry;
    const slip = Math.sqrt(sx * sx + sy * sy);
    let rolling = false;
    if (slip > 1e-9) {
      // 摩擦は、すべりと逆向きに速さを変え、その 2.5 倍だけ回転を変える（中の詰まった球）。すべりは 3.5 倍の速さで減る
      const dv = Math.min(slideDv, slip / 3.5);
      const ux = sx / slip;
      const uy = sy / slip;
      vx -= ux * dv;
      vy -= uy * dv;
      rx += ux * 2.5 * dv;
      ry += uy * 2.5 * dv;
      if (slip - 3.5 * dv <= 1e-9) rolling = true;
    } else rolling = true;
    if (rolling) {
      rx = vx;
      ry = vy;
    }
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > 0) {
      const next = sp - rollDecel - rollDrag * sp;
      const k = next > 0 ? next / sp : 0;
      vx *= k;
      vy *= k;
      if (rolling) {
        rx = vx;
        ry = vy;
      }
    }
    // 止まりぎわ：速さも回転もほとんどなければ止める
    if (vx * vx + vy * vy < stop * stop && rx * rx + ry * ry < stop * stop) {
      vx = vy = rx = ry = 0;
    }
    body.setLinearVelocity({ x: vx, y: vy });
    b.rx = rx;
    b.ry = ry;
  };

  const frame = () => {
    const f = new Float64Array(ids.length * 2);
    balls.forEach((b, k) => {
      if (b.body) {
        const p = b.body.getPosition();
        f[2 * k] = p.x / SCALE;
        f[2 * k + 1] = p.y / SCALE;
      } else {
        const last = sim.frames[sim.frames.length - 1]!;
        f[2 * k] = last[2 * k]!;
        f[2 * k + 1] = last[2 * k + 1]!;
      }
    });
    return f;
  };

  const sim: Simulation = { ids, frames: [], pocketAt, pocketIn, pocketed, firstHit: null, balls: [] };
  sim.frames.push(frame());

  const moving = () =>
    balls.some((b) => {
      if (!b.body) return false;
      const v = b.body.getLinearVelocity();
      return v.x !== 0 || v.y !== 0 || b.rx !== 0 || b.ry !== 0;
    });

  const run: ShotRun = {
    sim,
    done: false,
    step() {
      if (run.done) return;
      const f = sim.frames.length;
      // ゆっくり当てても跳ねるよう、planck 全体の設定を計算の間だけ変える（ほかのゲームの計算には影響させない）
      const threshold = Settings.velocityThreshold;
      Settings.velocityThreshold = 0.01;
      try {
        for (let sub = 0; sub < tuning.subSteps; sub++) {
          for (const b of balls) if (b.body) cloth(b);
          bounced.length = 0;
          world.step(dt, 8, 3);
          // クッションに当たった球：回転のうちクッションに直角な分は、はね返った速さにそろえる（そのまま転がっていく）
          for (const [k, nx, ny] of bounced) {
            const b = balls[k]!;
            if (!b.body) continue;
            const v = b.body.getLinearVelocity();
            const rn = b.rx * nx + b.ry * ny;
            const vn = v.x * nx + v.y * ny;
            b.rx += (vn - rn) * nx;
            b.ry += (vn - rn) * ny;
          }
          // ポケットに落ちた球を取り除く
          balls.forEach((b, k) => {
            if (!b.body) return;
            const p = b.body.getPosition();
            const pocket = pocketOf(p.x / SCALE, p.y / SCALE);
            if (pocket < 0) return;
            pocketAt[k] = f;
            pocketIn[k] = pocket;
            pocketed.push(b.id);
            world.destroyBody(b.body);
            b.body = null;
          });
        }
      } finally {
        Settings.velocityThreshold = threshold;
      }
      sim.frames.push(frame());
      sim.firstHit = firstHit;
      if (moving() && f < MAX_FRAMES) return;

      run.done = true;
      const last = sim.frames[sim.frames.length - 1]!;
      balls.forEach((b, k) => {
        if (b.body) sim.balls.push([b.id, round4(last[2 * k]!), round4(last[2 * k + 1]!)]);
      });
    },
  };
  return run;
}
