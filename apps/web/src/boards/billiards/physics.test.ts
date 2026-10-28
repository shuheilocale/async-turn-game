import { describe, expect, it } from "vitest";
import { Settings } from "planck";
import { Billiards, type Seat } from "@atg/core";
import { simulateShot, sinCos, startShot, type Simulation } from "./physics.ts";
import { BREAK_POWER, POCKETS, powerOfSpeed, speedOf } from "./table.ts";

const { BALL_R, HALF_L, HALF_W, CUE } = Billiards;

const ball = (id: number, x: number, y: number): Billiards.Ball => ({ id, x, y });
const at = (sim: Simulation, id: number) => sim.balls.find((b) => b[0] === id);
/** 向き（ラジアン）。送る手と同じく 0.0001 単位にそろえる */
const aim = (fx: number, fy: number, tx: number, ty: number) => Math.round(Math.atan2(ty - fy, tx - fx) * 1e4) / 1e4;

/** 球 1 を、手球で押してポケット pk へまっすぐ入れる配置（球 1 は口から 0.25 m、手球はその 0.3 m 後ろ） */
function lineUp(pk: number): Billiards.Ball[] {
  const p = POCKETS[pk]!;
  const [nx, ny] = p.normal;
  return [ball(CUE, p.mouth[0] - nx * 0.55, p.mouth[1] - ny * 0.55), ball(1, p.mouth[0] - nx * 0.25, p.mouth[1] - ny * 0.25)];
}

describe("ビリヤードの物理演算", () => {
  it("同じ入力からは同じ結果になる（コマの位置も全部同じ）", () => {
    const s = Billiards.billiards.initialState(() => 0.37);
    const a = simulateShot(s.balls, 0.0123, speedOf(BREAK_POWER), 0.3);
    const b = simulateShot(s.balls, 0.0123, speedOf(BREAK_POWER), 0.3);
    expect(a).toEqual(b);
    // 1 コマずつ進めても、まとめて計算しても同じ
    const run = startShot(s.balls, 0.0123, speedOf(BREAK_POWER), 0.3);
    while (!run.done) run.step();
    expect(run.sim).toEqual(a);
    // 計算の間だけ変えた planck の設定は元に戻す
    expect(Settings.velocityThreshold).toBe(1);
  });

  it("ブレイク：強く打つと球が台いっぱいに散らばる。重ならず、どれも台の中か、ポケットの中", () => {
    for (const seed of [0.1, 0.5, 0.9]) {
      const s = Billiards.billiards.initialState(() => seed);
      const sim = simulateShot(s.balls, 0, speedOf(BREAK_POWER), 0);
      expect(sim.firstHit).not.toBeNull();
      expect(sim.balls.length + sim.pocketed.length).toBe(16);
      const objects = sim.balls.filter((b) => b[0] !== CUE);
      const moved = objects.filter((b) => {
        const from = s.balls.find((x) => x.id === b[0])!;
        return Math.hypot(b[1] - from.x, b[2] - from.y) > 0.1;
      });
      expect(moved.length).toBeGreaterThan(objects.length * 0.7);
      const xs = objects.map((b) => b[1]);
      const ys = objects.map((b) => b[2]);
      // ラックは 0.45 < x < 0.7、|y| < 0.12 くらい。それよりずっと広がる
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.6);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
      for (const b of sim.balls) expect(Billiards.onTable(b[1], b[2])).toBe(true);
      for (let i = 0; i < sim.balls.length; i++) {
        for (let j = i + 1; j < sim.balls.length; j++) {
          const [, x1, y1] = sim.balls[i]!;
          const [, x2, y2] = sim.balls[j]!;
          expect(Math.hypot(x1 - x2, y1 - y2)).toBeGreaterThan(2 * BALL_R - 0.003);
        }
      }
      // 止まるまで 15 秒はかからない
      expect(sim.frames.length / 60).toBeLessThan(15);
    }
  });

  it("ブレイクの結果は、そのままルールに渡せる（core の確かめを通る）", () => {
    const s = Billiards.billiards.initialState(() => 0.5);
    const speed = Math.round(speedOf(BREAK_POWER) * 1e4) / 1e4;
    const sim = simulateShot(s.balls, 0, speed, 0);
    const move = { angle: 0, speed, spin: 0, pocketed: sim.pocketed, firstHit: sim.firstHit, balls: sim.balls };
    const next = Billiards.billiards.applyMove(s, Billiards.billiards.parseMove(JSON.parse(JSON.stringify(move)))!, 0);
    expect(next.shots).toBe(1);
  });

  it("適当に打ち続けても、結果はいつもルールに渡せる", () => {
    let s = Billiards.billiards.initialState(() => 0.21);
    let r = 7;
    const rand = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 25 && s.winner === null; i++) {
      const cueOn = s.balls.some((b) => b.id === CUE);
      let cue: [number, number] | undefined;
      if (s.inHand || !cueOn) {
        // 空いている所に置く
        for (let tries = 0; tries < 50 && !cue; tries++) {
          const p: [number, number] = [(rand() - 0.5) * 1.6, (rand() - 0.5) * 0.8];
          if (Billiards.canPlaceCue(p[0], p[1], s.balls, s.breaking)) cue = p;
        }
      }
      const before = cue ? [ball(CUE, cue[0], cue[1]), ...s.balls.filter((b) => b.id !== CUE)] : s.balls;
      const angle = Math.round((rand() * 2 - 1) * Math.PI * 1e4) / 1e4;
      const speed = Math.round(speedOf(0.2 + rand() * 0.7) * 1e4) / 1e4;
      const spin = Math.round((rand() * 2 - 1) * 100) / 100;
      const sim = simulateShot(before, angle, speed, spin);
      const move = { ...(cue ? { cue } : {}), angle, speed, spin, pocketed: sim.pocketed, firstHit: sim.firstHit, balls: sim.balls };
      s = Billiards.billiards.applyMove(s, move, s.turn as Seat);
    }
    expect(s.shots).toBeGreaterThan(5);
  });

  it("強く打てば、まっすぐ並んだ球は角のポケットにも中央のポケットにも入る。弱すぎると届かない", () => {
    for (const pk of [0, 2, 4, 5]) {
      const balls = lineUp(pk);
      const [c, o] = balls;
      const sim = simulateShot(balls, aim(c!.x, c!.y, o!.x, o!.y), speedOf(0.6), 0);
      expect(sim.pocketed, `pocket ${pk}`).toContain(1);
      expect(sim.pocketIn[1]).toBe(pk);
      expect(sim.firstHit).toBe(1);
      const weak = simulateShot(balls, aim(c!.x, c!.y, o!.x, o!.y), speedOf(0.05), 0);
      expect(weak.pocketed).toEqual([]);
    }
  });

  it("口からずれすぎた球はナックルに当たって入らない。中央のポケットは浅い角度からは入りにくい", () => {
    // 中央のポケットへ、レールに沿うような向き（口の線から 25 度くらい）で、口の中心から 4 cm ずらして転がす
    const p = POCKETS[5]!;
    const dir = [Math.cos(0.45), Math.sin(0.45)] as const;
    const target = [p.mouth[0] + 0.04, p.mouth[1]] as const;
    const obj = ball(1, target[0] - dir[0] * 0.3, target[1] - dir[1] * 0.3);
    const cue = ball(CUE, obj.x - dir[0] * 0.3, obj.y - dir[1] * 0.3);
    const sim = simulateShot([cue, obj], aim(cue.x, cue.y, obj.x, obj.y), speedOf(0.5), 0);
    expect(sim.pocketed).not.toContain(1);
  });

  it("手球だけをポケットへ打つと、手球が落ちる（スクラッチ）。どの球にも当たらない", () => {
    const p = POCKETS[3]!;
    const cue = ball(CUE, p.mouth[0] - p.normal[0] * 0.4, p.mouth[1] - p.normal[1] * 0.4);
    const sim = simulateShot([cue, ball(9, 0.5, -0.3)], aim(cue.x, cue.y, p.mouth[0], p.mouth[1]), speedOf(0.5), 0);
    expect(sim.pocketed).toEqual([CUE]);
    expect(sim.firstHit).toBeNull();
    expect(at(sim, 9)).toEqual([9, 0.5, -0.3]);
  });

  it("最初に当てた球を覚える（手球が当てた球が、ほかの球に当たっても変わらない）", () => {
    const balls = [ball(CUE, -0.5, 0), ball(5, 0, 0), ball(12, 0.3, 0.01)];
    const sim = simulateShot(balls, 0, speedOf(0.5), 0);
    expect(sim.firstHit).toBe(5);
    // 12 番も動いた（5 番に当てられた）
    expect(sim.frames.some((f) => f[4]! > 0.32)).toBe(true);
  });

  it("触れて止まっていた球から離れる向きに打っても、当てたことにしない", () => {
    const balls = [ball(CUE, 0, 0), ball(3, 2 * BALL_R + 0.0002, 0)];
    const sim = simulateShot(balls, Math.round(Math.PI * 1e4) / 1e4 - 0.0001, speedOf(0.2), 0);
    expect(sim.firstHit).toBeNull();
  });

  it("押し球は当たったあと前へ進み、引き球は戻る。中心を打つ（回転なし）と、その間", () => {
    // 近くから当てる（遠いと、回転なしでも当たるまでに転がりはじめて、少し前へ進む）
    const balls = [ball(CUE, -0.2, 0), ball(1, 0, 0)];
    const cueX = (spin: number) => at(simulateShot(balls, 0, speedOf(0.3), spin), CUE)![1];
    const draw = cueX(-1);
    const stun = cueX(0);
    const follow = cueX(1);
    // 当たったときの手球の位置は -2R。回転なしなら、そのあたりで止まる
    expect(Math.abs(stun + 2 * BALL_R)).toBeLessThan(0.08);
    expect(draw).toBeLessThan(-2 * BALL_R - 0.15);
    expect(follow).toBeGreaterThan(-2 * BALL_R + 0.15);
  });

  it("クッションは球どうしより弾みが弱い。まっすぐ当てると、まっすぐはね返る", () => {
    // 右のクッションへまっすぐ。はね返る直前・直後の速さを比べる
    const sim = simulateShot([ball(CUE, 0.5, 0.1)], 0, 1.2, 1);
    const xs = sim.frames.map((f) => f[0]!);
    const turn = xs.indexOf(Math.max(...xs));
    const vin = (xs[turn - 2]! - xs[turn - 4]!) * 30;
    const vout = (xs[turn + 2]! - xs[turn + 4]!) * 30;
    expect(vout / vin).toBeGreaterThan(0.6);
    expect(vout / vin).toBeLessThan(0.85);
    expect(Math.abs(at(sim, CUE)![2] - 0.1)).toBeLessThan(1e-6);
    // 球どうしは、当てた手球がほとんど止まるくらい弾む（中心を近くから当てる）
    const hit = simulateShot([ball(CUE, -0.1, 0), ball(2, 0, 0)], 0, 1.2, 0);
    expect(at(hit, CUE)![1]).toBeLessThan(-2 * BALL_R + 0.05);
    expect(at(hit, 2)![1]).toBeGreaterThan(0.3);
  });

  it("ラシャの上では少しずつ遅くなって止まる。強いほど遠くまで転がる", () => {
    const travel = (power: number) => {
      const sim = simulateShot([ball(CUE, -0.7, 0)], 0.3, speedOf(power), 0);
      let d = 0;
      for (let i = 1; i < sim.frames.length; i++) {
        d += Math.hypot(sim.frames[i]![0]! - sim.frames[i - 1]![0]!, sim.frames[i]![1]! - sim.frames[i - 1]![1]!);
      }
      return { d, t: sim.frames.length / 60 };
    };
    const soft = travel(0.15);
    const mid = travel(0.4);
    expect(soft.d).toBeGreaterThan(0.2);
    expect(soft.d).toBeLessThan(1);
    expect(mid.d).toBeGreaterThan(soft.d * 2);
    expect(mid.t).toBeLessThan(10);
  });

  it("台の外へは出ない（ポケット以外）", () => {
    for (let k = 0; k < 12; k++) {
      const angle = Math.round(((k / 12) * 2 - 1) * Math.PI * 1e4) / 1e4;
      const sim = simulateShot([ball(CUE, 0.1, 0.05), ball(4, 0.3, 0.2)], angle, speedOf(1), -0.5);
      for (const f of sim.frames) {
        sim.ids.forEach((_, i) => {
          if (sim.pocketAt[i] !== null) return;
          expect(Math.abs(f[2 * i]!)).toBeLessThanOrEqual(HALF_L + BALL_R);
          expect(Math.abs(f[2 * i + 1]!)).toBeLessThanOrEqual(HALF_W + BALL_R);
        });
      }
    }
  });

  it("サイン・コサインは Math と同じ値（四則演算だけで計算する）", () => {
    for (let a = -Math.PI; a <= Math.PI; a += 0.0137) {
      const [s, c] = sinCos(a);
      expect(Math.abs(s - Math.sin(a))).toBeLessThan(1e-14);
      expect(Math.abs(c - Math.cos(a))).toBeLessThan(1e-14);
    }
  });

  it("強さのつまみ：0〜1 で、ゆっくりからブレイクの強さまで", () => {
    expect(speedOf(0)).toBeGreaterThanOrEqual(Billiards.SPEED_MIN);
    expect(speedOf(1)).toBeLessThanOrEqual(Billiards.SPEED_MAX);
    for (const p of [0, 0.3, 0.5, 1]) expect(powerOfSpeed(speedOf(p))).toBeCloseTo(p, 9);
  });
});
