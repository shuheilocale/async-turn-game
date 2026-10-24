import { describe, expect, it } from "vitest";
import { dragMove, startDrag } from "./aim.ts";

// 盤の幅 356px・見える範囲の幅 4 m（1px ≒ 0.0112 m）
const WIDTH = 356;
const VIEW_W = 4;

describe("いしつみの狙いのドラッグ", () => {
  it("指を動かした分だけ、石の位置が動く", () => {
    let d = startDrag(1, 178);
    let aim = 0;
    for (const x of [183, 190, 200, 210]) {
      const r = dragMove(d, x, aim, WIDTH, VIEW_W);
      d = r.drag;
      aim = r.aim;
    }
    expect(aim).toBeCloseTo((32 * VIEW_W) / WIDTH, 5);
  });

  it("指の位置が 1 回で大きく飛んだら（別の操作の動きが混ざったら）、石は動かさない", () => {
    let d = startDrag(1, 178);
    let r = dragMove(d, 186, 0, WIDTH, VIEW_W);
    d = r.drag;
    const before = r.aim;
    // 指を離した知らせが届かず、そのまま右下の「落とす」ボタンのあたりの動きが来た
    r = dragMove(d, 330, before, WIDTH, VIEW_W);
    expect(r.aim).toBe(before);
    // そこから先の小さな動きは、新しい位置を起点に動く
    r = dragMove(r.drag, 326, r.aim, WIDTH, VIEW_W);
    expect(r.aim).toBeCloseTo(before - (4 * VIEW_W) / WIDTH, 5);
  });

  it("4px までのふるえでは動かさない（タップとして扱う）", () => {
    const d = startDrag(1, 178);
    const r = dragMove(d, 181, 0.3, WIDTH, VIEW_W);
    expect(r.aim).toBe(0.3);
    expect(r.drag.moved).toBe(false);
  });
});
