import { describe, expect, it } from "vitest";
import { Soda } from "@atg/core";
import { powerOf, ShakeMeter } from "./meter.ts";

/** 3 秒間、60 Hz で、大きさ amp（m/s²）の加速度が振れ続けたときの強さ */
function shake(amp: number, withGravityOnly = false) {
  const m = new ShakeMeter();
  for (let i = 0; i <= 180; i++) {
    const t = (i * 1000) / 60;
    // 振る向きは行ったり来たり（大きさは |sin| で 0〜amp。平均は amp の 2/π）
    const a = amp * Math.sin((i / 60) * 2 * Math.PI * 3);
    if (withGravityOnly) m.addMotion(null, { x: a, y: 0, z: 9.8 }, t);
    else m.addMotion({ x: a, y: 0, z: 0 }, null, t);
  }
  return m.power;
}

/** 3 秒間、指で secPx（ピクセル/秒）こすり、taps 回たたいたときの強さ */
function rub(secPx: number, taps = 0) {
  const m = new ShakeMeter();
  for (let i = 0; i < 180; i++) m.addRub(secPx / 60);
  for (let i = 0; i < taps; i++) m.addTap();
  return m.power;
}

describe("振った強さ", () => {
  it("強さは 0〜100。勢いがなければ 0、ためるほど伸びるが伸びにくくなる", () => {
    expect(powerOf(0)).toBe(0);
    expect(powerOf(-5)).toBe(0);
    expect(powerOf(1e6)).toBe(Soda.MAX_POWER);
    expect(powerOf(40)).toBe(63);
    expect(powerOf(80) - powerOf(40)).toBeLessThan(powerOf(40) - powerOf(0));
  });

  it("センサー：手のふるえくらいでは「振りが足りない」、ふつうに振れば 35〜65、思い切り振れば 80 以上", () => {
    expect(shake(1.4)).toBe(0);
    expect(shake(6)).toBeLessThan(Soda.MIN_POWER);
    // 2 G くらいまで振れる強さ
    const normal = shake(18);
    expect(normal).toBeGreaterThanOrEqual(35);
    expect(normal).toBeLessThanOrEqual(65);
    expect(shake(40)).toBeGreaterThanOrEqual(80);
    expect(shake(60)).toBeGreaterThanOrEqual(90);
  });

  it("重力を含む値しかない端末でも、だいたい同じ強さになる", () => {
    for (const amp of [6, 25, 60]) expect(Math.abs(shake(amp, true) - shake(amp))).toBeLessThanOrEqual(8);
  });

  it("指：ゆっくりこするだけでは足りず、ふつうにこすれば 40〜60、必死にこすってたたけば 85 以上", () => {
    expect(rub(100)).toBeLessThan(Soda.MIN_POWER);
    const normal = rub(500);
    expect(normal).toBeGreaterThanOrEqual(40);
    expect(normal).toBeLessThanOrEqual(60);
    expect(rub(1500, 20)).toBeGreaterThanOrEqual(85);
    // たたくだけでも強くできる
    expect(rub(0, 21)).toBeGreaterThanOrEqual(75);
  });

  it("測っている間（open）だけ数える。かまえている間・測り終わったあとの動きは入らない", () => {
    const m = new ShakeMeter();
    m.open = false;
    m.addMotion({ x: 30, y: 0, z: 0 }, null, 0);
    m.addMotion({ x: 30, y: 0, z: 0 }, null, 16);
    m.addRub(500);
    m.addTap();
    expect(m.energy).toBe(0);
    m.open = true;
    m.addTap();
    expect(m.energy).toBeGreaterThan(0);
  });

  it("イベントの間があいても、止まっていた時間を一度に足さない", () => {
    const m = new ShakeMeter();
    m.addMotion({ x: 20, y: 0, z: 0 }, null, 0);
    m.addMotion({ x: 20, y: 0, z: 0 }, null, 5000);
    expect(m.energy).toBeLessThan(5);
  });
});
