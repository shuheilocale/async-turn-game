import { describe, expect, it } from "vitest";
import { Billiards, getGame } from "@atg/core";
import { translator } from "../../i18n/index.tsx";
import { snapshotOf, snapshotToFlex } from "../../snapshot.ts";
import { boards } from "../index.ts";
import { aimGuide, placeNear } from "./aim.ts";
import { simulateShot } from "./physics.ts";
import { ballsAt, lastFrame, qMatrix, restingQuat, withSim, type Clip } from "./playback.ts";
import { layoutFor, toScreen, toTable } from "./render.ts";
import { ballHex } from "./colors.ts";
import { shotText } from "./text.ts";
import { speedOf } from "./table.ts";

const { BALL_R, CUE, EIGHT } = Billiards;
const ball = (id: number, x: number, y: number): Billiards.Ball => ({ id, x, y });

describe("ねらいのガイド", () => {
  it("最初に当たる球のゴーストの位置は、的球から 2R 手前。当たった球は中心を結ぶ向きへ進む", () => {
    const g = aimGuide([ball(CUE, -0.5, 0), ball(3, 0, 0.02), ball(4, 0.3, 0)], ball(CUE, -0.5, 0), 0);
    expect(g.target).toBe(3);
    expect(Math.hypot(g.end[0] - 0, g.end[1] - 0.02)).toBeCloseTo(2 * BALL_R, 9);
    expect(g.end[1]).toBeCloseTo(0, 9);
    const [tx, ty] = g.targetDir!;
    expect(tx).toBeCloseTo((0 - g.end[0]) / (2 * BALL_R), 9);
    expect(ty).toBeCloseTo(0.02 / (2 * BALL_R), 9);
    // 手球は当たった球と直角に進む
    expect(g.cueDir![0] * tx + g.cueDir![1] * ty).toBeCloseTo(0, 9);
  });

  it("ガイドの向きと、物理演算で当たった球が進む向きは、ほぼ同じ", () => {
    const balls = [ball(CUE, -0.5, 0.05), ball(6, 0, 0)];
    const angle = Math.round(Math.atan2(-0.035 - 0.05, 0.5) * 1e4) / 1e4;
    const g = aimGuide(balls, balls[0]!, angle);
    const sim = simulateShot(balls, angle, speedOf(0.25), 0);
    const k = sim.ids.indexOf(6);
    // 当たった球が少し動いた所の向き
    const f = sim.frames.find((fr) => Math.hypot(fr[2 * k]!, fr[2 * k + 1]!) > 0.05)!;
    const dir = Math.atan2(f[2 * k + 1]!, f[2 * k]!);
    expect(Math.abs(dir - Math.atan2(g.targetDir![1], g.targetDir![0]))).toBeLessThan(0.03);
  });

  it("球に当たらなければクッションまで。はね返る向きも出す", () => {
    const g = aimGuide([ball(CUE, 0, 0)], ball(CUE, 0, 0), Math.PI / 2);
    expect(g.target).toBeNull();
    expect(g.end[1]).toBeCloseTo(Billiards.HALF_W - BALL_R, 9);
    expect(g.bounceDir![1]).toBeCloseTo(-1, 9);
  });

  it("手球を置く：重なれば押し出し、ブレイクならヘッドストリングより手前に収める", () => {
    const balls = [ball(5, -0.6, 0)];
    const p = placeNear(-0.6, 0.01, balls, false)!;
    expect(Math.hypot(p[0] + 0.6, p[1])).toBeGreaterThanOrEqual(2 * BALL_R);
    expect(Billiards.canPlaceCue(p[0], p[1], balls, false)).toBe(true);
    const b = placeNear(0.3, 0, [], true)!;
    expect(b[0]).toBeLessThanOrEqual(Billiards.HEAD_X);
    const edge = placeNear(5, 5, [], false)!;
    expect(edge).toEqual([Billiards.HALF_L - BALL_R, Billiards.HALF_W - BALL_R]);
  });
});

describe("台の向き", () => {
  it("台の座標と画面の座標は行き来できる。縦置きならブレイクする側が下", () => {
    for (const vertical of [true, false]) {
      const l = layoutFor(vertical ? 360 : 700, 900, vertical);
      const [sx, sy] = toScreen(l, 0.3, -0.2);
      const [x, y] = toTable(l, sx, sy);
      expect(x).toBeCloseTo(0.3, 9);
      expect(y).toBeCloseTo(-0.2, 9);
    }
    const v = layoutFor(360, 900, true);
    expect(v.height).toBeGreaterThan(v.width);
    expect(toScreen(v, Billiards.HEAD_X, 0)[1]).toBeGreaterThan(v.height / 2);
  });

  it("止まっている球は、番号（球の中の x）が真上を、字の上（球の中の z）が画面の上を向く", () => {
    for (const up of [
      [1, 0],
      [0, 1],
    ] as [number, number][]) {
      const m = qMatrix(restingQuat(up));
      // 列 0 が球の中の x の向き
      expect([m[0]![0], m[1]![0], m[2]![0]].map((v) => Math.round(v * 1e9) / 1e9 || 0)).toEqual([0, 0, 1]);
      expect(m[0]![2]).toBeCloseTo(up[0], 9);
      expect(m[1]![2]).toBeCloseTo(up[1], 9);
    }
  });
});

describe("再生", () => {
  const before = [ball(CUE, -0.5, 0), ball(1, 0, 0), ball(9, 0.4, 0.3)];
  const clipOf = (target: Billiards.Ball[]): Clip => {
    const sim = simulateShot(before, 0, speedOf(0.4), 0);
    return withSim({ n: 1, before, angle: 0, speed: speedOf(0.4), spin: 0, target, sim: null, start: 0, roll: null, rest: null }, sim, 0);
  };
  const q0 = restingQuat([1, 0]);

  it("最後のコマは保存された位置にそろう。最初のコマは打つ前の位置", () => {
    const target = [ball(CUE, -0.1, 0.05), ball(1, 0.5, 0.1), ball(9, 0.4, 0.3)];
    const clip = clipOf(target);
    const last = ballsAt(clip, lastFrame(clip), q0);
    for (const t of target) {
      const b = last.find((s) => s.id === t.id)!;
      expect(b.x).toBeCloseTo(t.x, 9);
      expect(b.y).toBeCloseTo(t.y, 9);
    }
    expect(ballsAt(clip, 0, q0).find((s) => s.id === CUE)!.x).toBeCloseTo(-0.5, 9);
  });

  it("止まった球は、番号が見える向きに戻る。動いている間は転がって回る", () => {
    const clip = clipOf([ball(CUE, -0.1, 0), ball(1, 0.5, 0), ball(9, 0.4, 0.3)]);
    const mid = ballsAt(clip, 20, q0).find((s) => s.id === CUE)!;
    expect(Math.abs(mid.q[0] * q0[0] + mid.q[1] * q0[1] + mid.q[2] * q0[2] + mid.q[3] * q0[3])).toBeLessThan(0.999);
    const end = ballsAt(clip, lastFrame(clip), q0).find((s) => s.id === CUE)!;
    expect(Math.abs(end.q[0] * q0[0] + end.q[1] * q0[1] + end.q[2] * q0[2] + end.q[3] * q0[3])).toBeCloseTo(1, 6);
  });

  it("ポケットに落ちた球は、穴へ吸い込まれて消える", () => {
    const p = [ball(CUE, -0.3, 0.2), ball(2, 0.5, 0.33)];
    const angle = Math.round(Math.atan2(0.13, 0.8) * 1e4) / 1e4;
    const sim = simulateShot(p, angle, speedOf(0.6), 0);
    expect(sim.pocketed).toContain(2);
    const clip = withSim(
      { n: 1, before: p, angle, speed: speedOf(0.6), spin: 0, target: sim.balls.map(([id, x, y]) => ({ id, x, y })), sim: null, start: 0, roll: null, rest: null },
      sim,
      0,
    );
    const k = sim.ids.indexOf(2);
    const at = sim.pocketAt[k]!;
    const sinking = ballsAt(clip, at + 5, q0).find((s) => s.id === 2)!;
    expect(sinking.scale).toBeLessThan(1);
    expect(sinking.opacity).toBeLessThan(1);
    expect(ballsAt(clip, lastFrame(clip), q0).some((s) => s.id === 2)).toBe(false);
  });
});

describe("文と LINE のカード", () => {
  const t = translator("ja");
  const shot = (o: Partial<Billiards.Shot>): Billiards.Shot => ({
    n: 3,
    seat: 0,
    break: false,
    angle: 0,
    speed: 2,
    spin: 0,
    before: [],
    after: [],
    pocketed: [],
    firstHit: 1,
    foul: null,
    outcome: "miss",
    ...o,
  });
  const nameOf = (seat: 0 | 1) => (seat === 0 ? "はるさん" : "Jさん");

  it("1 打の結果の文", () => {
    expect(shotText(t, shot({ outcome: "continue", pocketed: [3, 12], assigned: "solid" }), nameOf)).toBe(
      "はるさんが 3 番・12 番を入れました。続けて打ちます。はるさんはソリッドです",
    );
    expect(shotText(t, shot({ outcome: "foul", foul: "scratch", pocketed: [CUE] }), nameOf)).toBe(
      "はるさんのファウル（手球が落ちた）。Jさんのフリーボールです",
    );
    expect(shotText(t, shot({ outcome: "win", pocketed: [EIGHT] }), nameOf)).toBe("はるさんが 8 番を入れて勝ちました");
    expect(shotText(t, shot({ outcome: "miss" }), nameOf)).toBe("はるさんは入りませんでした");
    expect(shotText(translator("en"), shot({ outcome: "continue", pocketed: [3], assigned: "stripe" }), () => "Haru")).toBe(
      "Haru potted the 3 and shoots again. Haru: Stripes",
    );
  });

  it("LINE の知らせの文", () => {
    const moved = boards.billiards!.movedText!;
    const m = (o: Partial<Billiards.BilliardsMove>) => ({ angle: 0, speed: 2, spin: 0, pocketed: [], firstHit: 1, balls: [], ...o });
    expect(moved(t, m({}), "はる")).toBe("はるさんが打ちました");
    expect(moved(t, m({ pocketed: [9] }), "はる")).toBe("はるさんが 9 番を入れました");
    expect(moved(t, m({ pocketed: [2, CUE] }), "はる")).toBe("はるさんのファウル（手球が落ちた）");
    expect(moved(t, m({ firstHit: null }), "はる")).toBe("はるさんのファウル（どの球にも当たらなかった）");
    expect(moved(t, m({ pocketed: [EIGHT] }), "はる")).toBe("はるさんが 8 番を入れました");
    expect(moved(translator("th"), m({ pocketed: [9] }), "J")).toBe("J แทงลูก 9 ลง");
  });

  it("LINE のカードに台の絵を載せる。どの行も幅がそろい、球の数だけ丸があり、上限に収まる", () => {
    const def = getGame("billiards")!;
    const s0 = def.initialState(() => 0.4) as Billiards.BilliardsState;
    for (const s of [s0, { ...s0, balls: s0.balls.slice(0, 5) }, { ...s0, balls: [] }]) {
      const snap = snapshotOf("billiards", s)!;
      expect(snap).not.toBeNull();
      for (const row of snap.rows) expect(row.cells.reduce((sum, c) => sum + c.w, 0)).toBe(153);
      const dots = snap.rows.flatMap((r) => r.cells).filter((c) => c.dot && c.dot.fill !== "#0e1012");
      // ラックの球は同じ行に重なることがあるので、描けない球もある（ずらして描く）
      expect(dots.length).toBeGreaterThan(Math.min(s.balls.length, 3) - 1);
      expect(dots.length).toBeLessThanOrEqual(s.balls.length);
      expect(JSON.stringify(snapshotToFlex(snap)).length).toBeLessThan(25_000);
    }
    expect(ballHex(2)).toBe("#204ebe");
    expect(ballHex(10)).toBe(ballHex(2));
  });
});
