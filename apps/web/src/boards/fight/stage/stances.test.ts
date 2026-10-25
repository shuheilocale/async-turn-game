import { describe, expect, it } from "vitest";
import { armLength, bodyOf, legLength, NEUTRAL_STATS } from "./body.ts";
import { add, apply3, dist } from "./math.ts";
import { chestFrame, headCenter, P, shoulderLocal, unpack } from "./pose.ts";
import {
  breathRate,
  breathWave,
  caneSpin,
  clinchPose,
  downPose,
  fatigueOf,
  groundBottomPose,
  groundTopPose,
  handRoot,
  idleDelta,
  rhythmOf,
  stanceOf,
  throttleOf,
  tieFix,
  tiredPose,
  waveOf,
} from "./stances.ts";
import type { StyleId } from "./types.ts";

const STYLES: StyleId[] = [
  "boxing",
  "muaythai",
  "karate",
  "taekwondo",
  "judo",
  "bjj",
  "wrestling",
  "mma",
  "capoeira",
  "sumo",
  "kickboxing",
  "taichi",
  "gamer",
  "magician",
  "nurse",
  "swimmer",
  "idol",
  "rapper",
  "chef",
  "robot",
  "ninja",
  "tuktuk",
  "stuntman",
  "salaryman",
  "bubbletea",
];

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

describe("新しいキャラクターの構えと待ちの動き", () => {
  const d = bodyOf(NEUTRAL_STATS);

  it("ゲーマーは猫背（胸が前へ倒れる）、マジシャンは胸を張る", () => {
    const lean = (s: StyleId) => {
      const p = stanceOf(s, d);
      return p[P.spine]! + p[P.chest]!;
    };
    expect(lean("gamer")).toBeGreaterThan(lean("nurse") + 0.25);
    expect(lean("magician")).toBeLessThan(lean("nurse"));
  });

  it("マジシャンのステッキを持つ手は腰の高さで、体の前にある（ステッキを床につく）", () => {
    const p = stanceOf("magician", d);
    const hand = handRoot(p, d, 1);
    expect(hand[1]).toBeLessThan(legLength(d) * 1.12);
    expect(hand[2]).toBeGreaterThan(0.08);
  });

  it("水泳選手は腕を体の横に下げ、キックボクシングはボクシングより足幅が広い", () => {
    const swim = stanceOf("swimmer", d);
    for (const i of [0, 1] as const) expect(handRoot(swim, d, i)[1]).toBeLessThan(legLength(d) * 1.05);
    const width = (s: StyleId) => {
      const f = unpack(stanceOf(s, d)).foot;
      return f[0][2] - f[1][2];
    };
    expect(width("kickboxing")).toBeGreaterThan(width("boxing"));
  });

  it("ロボットは息で胸がふくらまない（胸の光の点滅で見せる）", () => {
    for (let t = 0; t < 4; t += 0.5) {
      const delta = idleDelta("robot", t * 3, t, t, 0.5, 1, false);
      expect(delta[P.breath]).toBe(0);
      expect(delta[P.shrug]).toBe(0);
    }
  });

  it("ロボットの待ちの動きは、ほとんどの時間止まっていて、ときどきカクッと動く", () => {
    let still = 0;
    const n = 400;
    let prev = idleDelta("robot", 0, 0, 0, 0, 1, false)[P.neck + 1]!;
    for (let i = 1; i <= n; i++) {
      const t = i * 0.01;
      const v = idleDelta("robot", 0, 0, t, 0, 1, false)[P.neck + 1]!;
      if (Math.abs(v - prev) < 1e-6) still++;
      prev = v;
    }
    expect(still / n).toBeGreaterThan(0.8);
  });

  it("太極拳はゆっくり、ラッパーはビートに乗って速めにリズムをとる", () => {
    expect(rhythmOf("taichi", 1)).toBeLessThan(0.2);
    expect(rhythmOf("rapper", 0)).toBeGreaterThan(rhythmOf("nurse", 0) * 3);
  });

  it("マジシャンはときどきステッキを回し、アイドルはときどき手を振る（いつもではない）", () => {
    let spin = 0;
    let wave = 0;
    for (let t = 0; t < 22; t += 0.05) {
      if (caneSpin(t) > 0) spin++;
      if (waveOf(t) > 0) wave++;
      expect(caneSpin(t)).toBeLessThan(1);
      expect(waveOf(t)).toBeLessThan(1);
    }
    expect(spin / 440).toBeGreaterThan(0.05);
    expect(spin / 440).toBeLessThan(0.3);
    expect(wave / 440).toBeGreaterThan(0.1);
    expect(wave / 440).toBeLessThan(0.45);
  });
});

describe("忍者・トゥクトゥク運転手・スタントマン・サラリーマン・タピオカ店員の構え", () => {
  const d = bodyOf(NEUTRAL_STATS);

  it("忍者は低く構え、息を小さくして、ゆっくり静かに待つ", () => {
    expect(stanceOf("ninja", d)[P.hip + 1]!).toBeLessThan(stanceOf("boxing", d)[P.hip + 1]! - 0.08);
    const breath = (s: StyleId) => Math.max(...[0, 0.5, 1, 1.5, 2, 2.5].map((b) => Math.abs(idleDelta(s, b, 0, 0, 0, 1, false)[P.breath]!)));
    expect(breath("ninja")).toBeLessThan(breath("karate") * 0.6);
    expect(rhythmOf("ninja", 1)).toBeLessThan(rhythmOf("boxing", 0) / 3);
  });

  it("トゥクトゥク運転手は、ハンドルを握るように両手を同じ高さで前へ出し、ときどきアクセルをふかす", () => {
    const p = stanceOf("tuktuk", d);
    const [l, r] = [handRoot(p, d, 0), handRoot(p, d, 1)];
    expect(Math.abs(l[1] - r[1])).toBeLessThan(0.05);
    expect(Math.min(l[2], r[2])).toBeGreaterThan(0.15);
    expect(l[0] - r[0]).toBeGreaterThan(0.25);
    let rev = 0;
    for (let t = 0; t < 14; t += 0.05) if (throttleOf(t) > 0.3) rev++;
    expect(rev).toBeGreaterThan(0);
    expect(rev / 280).toBeLessThan(0.3);
  });

  it("サラリーマンは背すじを伸ばしてカバンを下げ、ときどきネクタイを直す", () => {
    const p = stanceOf("salaryman", d);
    expect(p[P.spine]! + p[P.chest]!).toBeLessThan(0);
    expect(handRoot(p, d, 1)[1]).toBeLessThan(legLength(d) * 1.05);
    let fix = 0;
    for (let t = 0; t < 14; t += 0.05) if (tieFix(t) > 0) fix++;
    expect(fix / 280).toBeGreaterThan(0.1);
    expect(fix / 280).toBeLessThan(0.35);
    // 直しているあいだは、左手が上がる
    const t = [...Array(280).keys()].map((i) => i * 0.05).find((x) => tieFix(x) > 0.45 && tieFix(x) < 0.55)!;
    expect(idleDelta("salaryman", 0, 0, t, 0, 1, false)[P.hand + 1]!).toBeGreaterThan(0.1);
  });

  it("スタントマンは身軽に弾み、タピオカ店員は左手を腰に当ててカップを胸の前に持つ", () => {
    const hop = (s: StyleId) => Math.max(...[...Array(40).keys()].map((i) => idleDelta(s, 0, i * 0.3, i * 0.1, 0, 1, false)[P.hip + 1]!));
    expect(hop("stuntman")).toBeGreaterThan(hop("boxing"));
    const p = stanceOf("bubbletea", d);
    expect(handRoot(p, d, 0)[1]).toBeLessThan(legLength(d) * 1.15);
    expect(handRoot(p, d, 1)[1]).toBeGreaterThan(handRoot(p, d, 0)[1] + 0.2);
  });
});
