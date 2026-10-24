import { describe, expect, it } from "vitest";
import { Curling } from "@atg/core";
import { simulateThrow } from "./physics.ts";
import { powerOfReach, speedOf } from "./params.ts";
import { cameraAt, lastFrame, nearOf, stonesAt, withSim, type Anim } from "./playback.ts";

const { TEE_Y } = Curling;

/** 投げる前の石と投げ方から、再生する Anim を作る（target は保存された位置） */
function animOf(before: Curling.CurlingStone[], reach: number, target: Curling.CurlingStone[] | null = null): Anim {
  const base: Anim = {
    key: before.length + 1,
    seat: 1,
    id: before.length,
    before,
    aim: 0,
    speed: speedOf(powerOfReach(reach)),
    spin: 1,
    sim: null,
    target,
    start: 0,
    houseFrom: Infinity,
    near: TEE_Y,
  };
  return withSim(base, simulateThrow(before, base.id, base.aim, base.speed, base.spin), 0);
}

describe("カーリングの再生", () => {
  it("計算が済むまでは、投げる前の石と、投げる場所の石を出す", () => {
    const before: Curling.CurlingStone[] = [{ id: 0, seat: 0, x: 0.2, y: 21, angle: 1 }];
    const anim: Anim = { ...animOf(before, TEE_Y), sim: null };
    expect(stonesAt(anim, 0).map((s) => [s.id, s.x, s.y])).toEqual([
      [0, 0.2, 21],
      [1, 0, 0],
    ]);
  });

  it("最後のコマは、保存された位置にそろう（端末による計算のずれを埋める）", () => {
    const saved: Curling.CurlingStone[] = [{ id: 0, seat: 1, x: 0.95, y: 21.9, angle: 0.4 }];
    const anim = animOf([], TEE_Y, saved);
    const last = stonesAt(anim, lastFrame(anim));
    expect(last).toHaveLength(1);
    expect(last[0]!.x).toBeCloseTo(0.95, 9);
    expect(last[0]!.y).toBeCloseTo(21.9, 9);
    expect(last[0]!.opacity).toBe(1);
    // 最初のコマは計算どおり（投げる場所）
    expect(stonesAt(anim, 0)[0]!.y).toBeCloseTo(0, 9);
  });

  it("取り除かれる石は、だんだん消える", () => {
    // ホッグラインの手前で止まる 1 投
    const anim = animOf([], Curling.HOG_Y - 2);
    expect(anim.target).toEqual([]);
    expect(stonesAt(anim, 0)[0]!.opacity).toBe(1);
    expect(stonesAt(anim, lastFrame(anim))[0]!.opacity).toBe(0);
  });

  it("カメラ：投げる前は投げる人の後ろ、すべっている間は石を追い、近づいたらハウスを上から", () => {
    const guard: Curling.CurlingStone[] = [{ id: 0, seat: 0, x: -1.4, y: 18.5, angle: 0 }];
    const anim = animOf(guard, TEE_Y);
    expect(cameraAt(anim, 0)).toEqual({ mode: "aim" });
    expect(cameraAt(anim, 30).mode).toBe("follow");
    const modes = Array.from({ length: lastFrame(anim) + 1 }, (_, i) => cameraAt(anim, i).mode);
    const firstHouse = modes.indexOf("house");
    expect(firstHouse).toBeGreaterThan(30);
    // 一度ハウスになったら戻らない
    expect(modes.slice(firstHouse).every((m) => m === "house")).toBe(true);
    // 上から見るときは、手前のガードまで入れる
    expect(cameraAt(anim, lastFrame(anim))).toEqual({ mode: "house", focus: { x: 0, y: 18.5 } });
    expect(nearOf([])).toBe(TEE_Y);
  });
});
