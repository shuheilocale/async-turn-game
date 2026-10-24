import { describe, expect, it } from "vitest";
import { armLength, bodyOf, legLength, NEUTRAL_STATS } from "./body.ts";
import { add, apply3, dist } from "./math.ts";
import { chestFrame, headCenter, P, shoulderLocal, unpack } from "./pose.ts";
import {
  breathRate,
  breathWave,
  clinchPose,
  downPose,
  fatigueOf,
  groundBottomPose,
  groundTopPose,
  handRoot,
  idleDelta,
  rhythmOf,
  stanceOf,
  tiredPose,
} from "./stances.ts";
import type { StyleId } from "./types.ts";

const STYLES: StyleId[] = ["boxing", "muaythai", "karate", "taekwondo", "judo", "bjj", "wrestling", "mma", "capoeira", "sumo"];

describe("バックボーンごとの構え", () => {
  for (const style of [...STYLES, null]) {
    it(`${style ?? "未定"}：手は腕の届くところ、足は床、頭は立った人の高さ`, () => {
      for (const stats of [NEUTRAL_STATS, { power: 8, guard: 1, speed: 8, stamina: 3 }, { power: 1, guard: 8, speed: 1, stamina: 8 }]) {
        const d = bodyOf(stats, style);
        const p = stanceOf(style, d);
        const f = chestFrame(p, d);
        for (const i of [0, 1] as const) {
          const shoulder = add(f.o, apply3(f.r, shoulderLocal(d, i)));
          expect(dist(shoulder, handRoot(p, d, i))).toBeLessThan(armLength(d));
          const foot = unpack(p).foot[i];
          expect(foot[1]).toBeGreaterThanOrEqual(d.ankleH - 1e-9);
          expect(foot[1]).toBeLessThan(d.ankleH + 0.06);
        }
        const head = headCenter(p, d)[1];
        expect(head).toBeGreaterThan(1.1);
        expect(head).toBeLessThan(1.95);
        // 腰は脚の長さより低い（ひざが少し曲がっている）
        expect(p[P.hip + 1]).toBeLessThan(legLength(d));
      }
    });
  }

  it("レスリングと相撲は、ボクシングより腰が低い", () => {
    const d = bodyOf(NEUTRAL_STATS);
    const hip = (s: StyleId) => stanceOf(s, d)[P.hip + 1]!;
    expect(hip("wrestling")).toBeLessThan(hip("boxing") - 0.1);
    expect(hip("sumo")).toBeLessThan(hip("boxing") - 0.08);
  });

  it("守りが高いほど、構えが低くどっしりする", () => {
    const lo = bodyOf({ ...NEUTRAL_STATS, guard: 1 });
    const hi = bodyOf({ ...NEUTRAL_STATS, guard: 8 });
    const crouch = (d: typeof lo) => stanceOf("mma", d)[P.hip + 1]! / legLength(d);
    expect(crouch(hi)).toBeLessThan(crouch(lo));
  });
});

describe("組み合い・寝技・倒れた姿勢", () => {
  const d = bodyOf(NEUTRAL_STATS);
  it("組み合いでは、手を相手の首のあたりへ伸ばす", () => {
    const p = clinchPose("judo", d, 0.6);
    expect(handRoot(p, d, 0)[2]).toBeGreaterThan(0.35);
  });

  it("左右を入れかえて描く人は、頭を反対の側へ寄せる", () => {
    const a = headCenter(clinchPose("boxing", d, 0.6, false), d)[0];
    const b = headCenter(clinchPose("boxing", d, 0.6, true), d)[0];
    expect(Math.sign(a)).not.toBe(Math.sign(b));
  });

  it("寝技の下の人と倒れた人は、腰が床の近く、頭も低い", () => {
    for (const p of [groundBottomPose(d, 0.62), downPose(d)]) {
      expect(p[P.hip + 1]).toBeLessThan(0.2);
      expect(headCenter(p, d)[1]).toBeLessThan(0.5);
    }
    expect(groundTopPose(d, 0.62)[P.hip + 1]).toBeLessThan(0.7);
  });
});

describe("息づかいと疲れ", () => {
  it("息の波は -1〜1 で、吸う時間は吐く時間より短い", () => {
    let up = 0;
    let prev = breathWave(0);
    for (let i = 1; i <= 1000; i++) {
      const v = breathWave((i / 1000) * Math.PI * 2);
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      if (v > prev) up++;
      prev = v;
    }
    expect(up).toBeLessThan(500);
  });

  it("スタミナが高いほどゆったり、hp が少ないほど速く息をする", () => {
    expect(breathRate(1, 100)).toBeLessThan(breathRate(-1.33, 100));
    expect(breathRate(0, 10)).toBeGreaterThan(breathRate(0, 100) * 1.8);
  });

  it("疲れは hp が 7 割を切ってから効きはじめ、0 で最大", () => {
    expect(fatigueOf(100)).toBe(0);
    expect(fatigueOf(70)).toBe(0);
    expect(fatigueOf(40)).toBeGreaterThan(0);
    expect(fatigueOf(0)).toBeCloseTo(1, 1);
  });

  it("疲れると前かがみになり、ガードが下がる", () => {
    const d = bodyOf(NEUTRAL_STATS);
    const p = stanceOf("boxing", d);
    const t = tiredPose(p, d, 1);
    expect(t[P.spine]).toBeGreaterThan(p[P.spine]!);
    for (const i of [0, 1] as const) expect(handRoot(t, d, i)[1]).toBeLessThan(handRoot(p, d, i)[1] - 0.05);
  });

  it("待ちの動きは小さく、寝ているときは息だけ", () => {
    for (const style of STYLES) {
      for (let t = 0; t < 6; t += 0.37) {
        const delta = idleDelta(style, t * 2, t * 5, t, 0, 1, false);
        // 足の動きはジンガ（カポエラ）でも 40 cm まで、腰は 15 cm まで
        expect(Math.abs(delta[P.foot + 2]!)).toBeLessThan(0.4);
        expect(Math.abs(delta[P.hip + 1]!)).toBeLessThan(0.15);
      }
      const lying = idleDelta(style, 1, 2, 3, 0.5, 1, true);
      expect(lying[P.foot + 2]).toBe(0);
      expect(lying[P.hip]).toBe(0);
    }
  });

  it("リズムはバックボーンごとに違い、すばやいほど速い", () => {
    expect(rhythmOf("boxing", 0)).toBeGreaterThan(rhythmOf("capoeira", 0));
    expect(rhythmOf("boxing", 1)).toBeGreaterThan(rhythmOf("boxing", -1));
  });
});
