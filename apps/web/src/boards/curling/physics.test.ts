import { describe, expect, it } from "vitest";
import { Settings } from "planck";
import { Curling, type Seat } from "@atg/core";
import { simulateThrow } from "./physics.ts";
import { DEFAULT_POWER, powerOfReach, powerOfSpeed, reachOf, speedOf, zoneOf } from "./params.ts";

const { TEE_Y, HOG_Y, STONE_R } = Curling;

/** 何にも当たらなければ d m で止まる速さ */
const speedFor = (d: number) => speedOf(powerOfReach(d));

const stone = (id: number, seat: Seat, x: number, y: number, angle = 0): Curling.CurlingStone => ({ id, seat, x, y, angle });

/** 投げた石（最後の石）の止まった位置 */
const endOf = (sim: ReturnType<typeof simulateThrow>) => sim.frames[sim.frames.length - 1]!.at(-1)!;

describe("カーリングの物理演算", () => {
  it("まっすぐ投げると、強さで決めた距離のあたりで止まる", () => {
    const sim = simulateThrow([], 0, 0, speedFor(TEE_Y), 1);
    const [x, y] = endOf(sim);
    expect(y).toBeGreaterThan(TEE_Y - 0.2);
    expect(y).toBeLessThan(TEE_Y + 0.05);
    // 止まるまで 5〜9 秒くらい
    expect(sim.frames.length / 60).toBeGreaterThan(5);
    expect(sim.frames.length / 60).toBeLessThan(9);
    // 曲がっても 1.5 m まで
    expect(Math.abs(x)).toBeLessThan(1.5);
    expect(sim.stones).toEqual([[0, expect.closeTo(x, 3), expect.closeTo(y, 3), expect.any(Number)]]);
    // 向きは -π〜π にそろえて送る
    expect(Math.abs(sim.stones[0]![3])).toBeLessThanOrEqual(Math.PI);
  });

  it("回転の向きに曲がる。右回りなら右、左回りなら左へ、同じだけ", () => {
    const right = endOf(simulateThrow([], 0, 0, speedFor(TEE_Y), 1));
    const left = endOf(simulateThrow([], 0, 0, speedFor(TEE_Y), -1));
    expect(right[0]).toBeGreaterThan(0.5);
    expect(left[0]).toBeLessThan(-0.5);
    expect(left[0]).toBeCloseTo(-right[0], 6);
    expect(left[1]).toBeCloseTo(right[1], 6);
    // 石も回っている（右回りは時計回り = 角度が減る）
    expect(right[2]).toBeLessThan(-Math.PI);
    expect(left[2]).toBeGreaterThan(Math.PI);
  });

  it("ゆっくり投げるほど、止まるまでに大きく曲がる（強く投げると曲がる前に着く）", () => {
    const sim = simulateThrow([], 0, 0, speedFor(60), 1);
    // ハウスの中心を通りすぎるときの横のずれ
    const pass = sim.frames.find((f) => f.at(-1)![1] >= TEE_Y)!.at(-1)!;
    expect(Math.abs(pass[0])).toBeLessThan(0.4);
    expect(Math.abs(endOf(simulateThrow([], 0, 0, speedFor(TEE_Y), 1))[0])).toBeGreaterThan(Math.abs(pass[0]) * 2);
  });

  it("強く当てると、当てられた石ははじかれて奥から出て、当てた石はその近くに止まる", () => {
    const target = [stone(0, 0, 0, TEE_Y)];
    // 回転で曲がる分だけ左をねらって、正面から当てる
    const aim = -0.0185;
    const sim = simulateThrow(target, 1, aim, speedFor(35), 1);
    expect(sim.outAt[0]).not.toBeNull();
    expect(sim.outAt[1]).toBeNull();
    expect(sim.stones.map((s) => s[0])).toEqual([1]);
    const [, x, y] = sim.stones[0]!;
    expect(Math.hypot(x, y - TEE_Y)).toBeLessThan(0.6);
  });

  it("ゆっくり当てても跳ねる（くっついて一緒に動かない）", () => {
    // 何もなければ 21 m で止まる石が、20 m の所を通る場所に石を置いておく
    const free = simulateThrow([], 0, 0, speedFor(21), 1);
    const pass = free.frames.find((f) => f[0]![1] >= 20)![0]!;
    const target = [stone(0, 1, pass[0], 20 + 2 * STONE_R)];
    const sim = simulateThrow(target, 1, 0, speedFor(21), 1);
    const hit = sim.frames[sim.frames.length - 1]![0]!;
    const thrower = endOf(sim);
    // 当てられた石の方が先へ進み、2 つは離れて止まる
    expect(hit[1]).toBeGreaterThan(20.2);
    expect(hit[1]).toBeGreaterThan(thrower[1] + 0.2);
    // 計算の間だけ変えた planck の設定は元に戻す
    expect(Settings.velocityThreshold).toBe(1);
  });

  it("横に出た石・奥から出た石・ホッグラインを越えなかった石は残らない", () => {
    // 横へ
    const side = simulateThrow([], 0, Curling.AIM_MAX, speedFor(TEE_Y), 1);
    expect(side.outAt[0]).not.toBeNull();
    expect(side.stones).toEqual([]);
    // 奥へ
    const back = simulateThrow([], 0, -0.02, speedFor(40), 1);
    expect(back.outAt[0]).not.toBeNull();
    expect(back.stones).toEqual([]);
    // 手前で止まる
    const short = simulateThrow([], 0, 0, speedFor(HOG_Y - 1), 1);
    expect(short.outAt[0]).toBeNull();
    expect(endOf(short)[1]).toBeLessThan(HOG_Y + STONE_R);
    expect(short.stones).toEqual([]);
  });

  it("止まっている前の石は、当たらなければ動かない", () => {
    const guards = [stone(0, 0, 1.5, 18, 0.7), stone(1, 1, -1.6, 23, -2)];
    const sim = simulateThrow(guards, 2, 0, speedFor(TEE_Y), 1);
    expect(sim.stones.slice(0, 2)).toEqual([
      [0, 1.5, 18, 0.7],
      [1, -1.6, 23, -2],
    ]);
  });

  it("同じ入力からは同じ結果になる", () => {
    const before = [stone(0, 0, 0.3, 21.5), stone(1, 1, -0.2, 22.4)];
    const a = simulateThrow(before, 2, -0.01, speedFor(30), -1);
    const b = simulateThrow(before, 2, -0.01, speedFor(30), -1);
    expect(a).toEqual(b);
  });

  describe("強さのつまみ", () => {
    it("つまみ 0〜1 で、ホッグラインの手前からハウスの奥を大きく越えるまで", () => {
      expect(zoneOf(0)).toBe("short");
      expect(zoneOf(1)).toBe("hit");
      expect(zoneOf(DEFAULT_POWER)).toBe("house");
      expect(reachOf(DEFAULT_POWER)).toBeCloseTo(TEE_Y, 9);
      expect(speedOf(0)).toBeGreaterThanOrEqual(Curling.SPEED_MIN);
      expect(speedOf(1)).toBeLessThanOrEqual(Curling.SPEED_MAX);
      for (const p of [0, 0.2, 0.45, 0.6, 0.8, 1]) expect(powerOfSpeed(speedOf(p))).toBeCloseTo(p, 9);
    });

    it("つまみの半分以上を、ガードからハウスの奥までに使う（細かく合わせやすい）", () => {
      const span = powerOfReach(Curling.BACK_Y + STONE_R) - powerOfReach(HOG_Y + STONE_R);
      expect(span).toBeGreaterThan(0.4);
    });
  });
});
