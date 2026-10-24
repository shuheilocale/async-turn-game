import { describe, expect, it } from "vitest";
import { Artillery } from "@atg/core";
import { GAUGE_MS, gaugeAt, previewOf } from "./gauge.ts";

describe("強さのゲージ", () => {
  it("押し始めは 0 で、GAUGE_MS（1.5〜2 秒）で 100 までたまる", () => {
    expect(GAUGE_MS).toBeGreaterThanOrEqual(1500);
    expect(GAUGE_MS).toBeLessThanOrEqual(2000);
    expect(gaugeAt(0)).toBe(0);
    expect(gaugeAt(GAUGE_MS / 4)).toBe(25);
    expect(gaugeAt(GAUGE_MS / 2)).toBe(50);
    expect(gaugeAt(GAUGE_MS)).toBe(100);
  });

  it("100 まで行ったら 0 へ戻り、また上がる（押したままでも撃ちそこなわない）", () => {
    expect(gaugeAt(GAUGE_MS * 1.25)).toBe(75);
    expect(gaugeAt(GAUGE_MS * 2)).toBe(0);
    expect(gaugeAt(GAUGE_MS * 2.5)).toBe(50);
    expect(gaugeAt(GAUGE_MS * 3)).toBe(100);
  });

  it("いつも 0〜100 の整数。時計が少し戻っても 0 より下にならない", () => {
    for (let t = -50; t < GAUGE_MS * 4; t += 7) {
      const p = gaugeAt(t);
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it("1 コマ（60 分の 1 秒）で変わるのは 2 ほど。同じ強さで離すにはうでがいる", () => {
    const frame = 1000 / 60;
    for (let t = 0; t < GAUGE_MS; t += frame) expect(Math.abs(gaugeAt(t + frame) - gaugeAt(t))).toBeLessThanOrEqual(2);
    expect(gaugeAt(GAUGE_MS / 2 + frame)).not.toBe(gaugeAt(GAUGE_MS / 2));
  });
});

describe("向きの線", () => {
  const cannon = { x: 20.5, y: 30 };

  it("砲口からまっすぐ、向きの方へ短くのびる（飛ぶ先は見せない）", () => {
    const dots = previewOf(cannon, 45);
    const [mx, my] = Artillery.muzzle(cannon, 45);
    expect(dots.length).toBeGreaterThan(3);
    for (const [x, y] of dots) {
      expect(x).toBeGreaterThan(mx);
      // 45 度なので、横と縦に同じだけ進む（まっすぐで、重力では曲がらない）
      expect(x - mx).toBeCloseTo(y - my, 9);
    }
    const [lx, ly] = dots.at(-1)!;
    expect(Math.hypot(lx - mx, ly - my)).toBeLessThan(30);
  });

  it("左向きなら左へのびる", () => {
    const [mx] = Artillery.muzzle(cannon, 150);
    for (const [x] of previewOf(cannon, 150)) expect(x).toBeLessThan(mx);
  });
});
