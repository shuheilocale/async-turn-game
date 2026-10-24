import { describe, expect, it } from "vitest";
import { armLength, bodyOf, legLength, lerpBody, NEUTRAL_STATS, standingHeight, statLevel } from "./body.ts";
import type { FighterStats } from "./types.ts";

const stats = (patch: Partial<FighterStats>): FighterStats => ({ ...NEUTRAL_STATS, ...patch });

describe("体格（stats → 骨の長さ・太さ）", () => {
  it("stats は 1〜8 の外や数でない値でも、決まった範囲にならす", () => {
    expect(statLevel(5)).toBe(0);
    expect(statLevel(8)).toBe(1);
    expect(statLevel(1)).toBeCloseTo(-4 / 3);
    expect(statLevel(99)).toBe(1);
    expect(statLevel(-3)).toBeCloseTo(-4 / 3);
    expect(statLevel(Number.NaN)).toBe(0);
  });

  it("攻撃が高いほど、肩幅が広く、腕と首が太い", () => {
    const lo = bodyOf(stats({ power: 2 }));
    const hi = bodyOf(stats({ power: 8 }));
    expect(hi.shoulderHalf).toBeGreaterThan(lo.shoulderHalf);
    expect(hi.upperArmR).toBeGreaterThan(lo.upperArmR * 1.15);
    expect(hi.forearmR).toBeGreaterThan(lo.forearmR);
    expect(hi.neckR).toBeGreaterThan(lo.neckR * 1.15);
    expect(hi.deltR).toBeGreaterThan(lo.deltR);
  });

  it("防御が高いほど、胴が厚く腰まわりがどっしりする", () => {
    const lo = bodyOf(stats({ guard: 2 }));
    const hi = bodyOf(stats({ guard: 8 }));
    expect(hi.chestD).toBeGreaterThan(lo.chestD);
    expect(hi.waistW).toBeGreaterThan(lo.waistW * 1.15);
    expect(hi.waistD).toBeGreaterThan(lo.waistD * 1.15);
    expect(hi.thighR).toBeGreaterThan(lo.thighR);
  });

  it("すばやさが高いほど、手足が長く細い", () => {
    const lo = bodyOf(stats({ speed: 2 }));
    const hi = bodyOf(stats({ speed: 8 }));
    expect(armLength(hi)).toBeGreaterThan(armLength(lo));
    expect(legLength(hi)).toBeGreaterThan(legLength(lo));
    expect(hi.upperArmR).toBeLessThan(lo.upperArmR);
    expect(hi.thighR).toBeLessThan(lo.thighR);
    expect(hi.waistW).toBeLessThan(lo.waistW);
  });

  it("スタミナが高いほど、胸が大きい", () => {
    const lo = bodyOf(stats({ stamina: 2 }));
    const hi = bodyOf(stats({ stamina: 8 }));
    expect(hi.chestW).toBeGreaterThan(lo.chestW);
    expect(hi.chestD).toBeGreaterThan(lo.chestD * 1.15);
    expect(hi.pec).toBeGreaterThan(lo.pec);
  });

  it("どんな振り分けでも、人の背丈と太さに収まる", () => {
    for (const power of [1, 8])
      for (const guard of [1, 8])
        for (const speed of [1, 8])
          for (const stamina of [1, 8]) {
            const d = bodyOf({ power, guard, speed, stamina });
            expect(standingHeight(d)).toBeGreaterThan(1.65);
            expect(standingHeight(d)).toBeLessThan(2.0);
            for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
            expect(d.waistW).toBeLessThan(d.chestW * 1.2);
            expect(d.upperArmR).toBeGreaterThan(0.035);
          }
  });

  it("相撲だけ、少しおなかがふくらむ", () => {
    expect(bodyOf(NEUTRAL_STATS, "sumo").belly).toBeGreaterThan(0.5);
    expect(bodyOf(NEUTRAL_STATS, "boxing").belly).toBe(0);
  });

  it("体格の補間は、両端で元の体格になり、あいだは間の値になる", () => {
    const a = bodyOf(stats({ power: 1, speed: 8 }));
    const b = bodyOf(stats({ power: 8, speed: 1 }));
    expect(lerpBody(a, b, 0)).toEqual(a);
    const end = lerpBody(a, b, 1);
    for (const k of Object.keys(b) as (keyof typeof b)[]) expect(end[k]).toBeCloseTo(b[k], 12);
    const mid = lerpBody(a, b, 0.5);
    expect(mid.shoulderHalf).toBeCloseTo((a.shoulderHalf + b.shoulderHalf) / 2, 12);
    expect(mid.upperArm).toBeLessThan(a.upperArm);
    expect(mid.upperArm).toBeGreaterThan(b.upperArm);
  });
});
