import { describe, expect, it } from "vitest";
import { IllegalMoveError } from "../types.ts";
import { boxEdges, boxes, EDGES, edgeAt, type BoxesState } from "./boxes.ts";

/**
 * 線の番号（点は 4×4、箱は 3×3）
 *
 *   ・ 0 ・ 1 ・ 2 ・        横線 0〜11：上の行から 3 本ずつ
 *  12   13  14  15         縦線 12〜23：上の段から 4 本ずつ
 *   ・ 3 ・ 4 ・ 5 ・
 *  16   17  18  19         箱の番号は左上から 0〜8
 *   ・ 6 ・ 7 ・ 8 ・      （箱 0 の 4 辺は 0・3・12・13）
 *  20   21  22  23
 *   ・ 9 ・10 ・11 ・
 */

/** 手番の人が順に線を引いていく（箱を閉じたら同じ人が続けて引く） */
function play(edges: number[], from: BoxesState = boxes.initialState(Math.random)): BoxesState {
  let s = from;
  for (const edge of edges) {
    const st = boxes.status(s);
    if (st.kind !== "playing") throw new Error("終局後に引こうとした");
    s = boxes.applyMove(s, { edge }, st.turn);
  }
  return s;
}

const HORIZONTAL = Array.from({ length: 12 }, (_, i) => i);

describe("boxes", () => {
  it("はじめは 24 本の線も 9 個の箱もすべて空いていて、先手から", () => {
    const s = boxes.initialState(Math.random);
    expect(s.edges).toHaveLength(EDGES);
    expect(s.edges.every((e) => e === null)).toBe(true);
    expect(s.boxes).toEqual(Array(9).fill(null));
    expect(boxes.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("線の番号：横線は 0〜11、縦線は 12〜23", () => {
    expect(edgeAt(0)).toEqual({ dir: "h", row: 0, col: 0 });
    expect(edgeAt(11)).toEqual({ dir: "h", row: 3, col: 2 });
    expect(edgeAt(12)).toEqual({ dir: "v", row: 0, col: 0 });
    expect(edgeAt(23)).toEqual({ dir: "v", row: 2, col: 3 });
    // 箱の 4 辺は 上・下・左・右 の順
    expect(boxEdges(0)).toEqual([0, 3, 12, 13]);
    expect(boxEdges(4)).toEqual([4, 7, 17, 18]);
    expect(boxEdges(8)).toEqual([8, 11, 22, 23]);
  });

  it("箱を閉じなければ手番が相手に移る", () => {
    const s = play([0]);
    expect(s.edges[0]).toBe(0);
    expect(s.closed).toEqual([]);
    expect(s.lastMove).toEqual({ edge: 0, seat: 0 });
    expect(boxes.status(s)).toEqual({ kind: "playing", turn: 1 });
  });

  it("4 辺目を引いたらその箱を取り、もう 1 本続けて引ける", () => {
    // 先手 0 → 後手 3 → 先手 12 → 後手 13 で箱 0 が閉じる
    const s = play([0, 3, 12, 13]);
    expect(s.boxes[0]).toBe(1);
    expect(s.closed).toEqual([0]);
    expect(s.lastMove).toEqual({ edge: 13, seat: 1 });
    expect(boxes.status(s)).toEqual({ kind: "playing", turn: 1 });

    // 続けて引いた線で閉じなければ、そこで相手に移る
    const t = play([23], s);
    expect(t.edges[23]).toBe(1);
    expect(t.closed).toEqual([]);
    expect(boxes.status(t)).toEqual({ kind: "playing", turn: 0 });
  });

  it("2 箱を同時に閉じても、続けて引けるのは 1 本だけ", () => {
    // 箱 0（0・3・12・13）と箱 1（1・4・13・14）は 13 を共有している
    const s = play([0, 3, 12, 1, 4, 14, 13]);
    expect(s.boxes.slice(0, 2)).toEqual([0, 0]);
    expect(s.closed).toEqual([0, 1]);
    expect(boxes.status(s)).toEqual({ kind: "playing", turn: 0 });

    const t = play([23], s);
    expect(boxes.status(t)).toEqual({ kind: "playing", turn: 1 });
  });

  it("24 本すべて引いたら終わり、箱の多い方の勝ち", () => {
    // 横線を全部引いたあと、縦線を 12 から順に引く。
    // 後手が箱 0〜2、先手が箱 3〜5、後手が箱 6〜8 を取り、後手が 6 対 3 で勝つ
    const before = play([...HORIZONTAL, ...Array.from({ length: 11 }, (_, i) => 12 + i)]);
    expect(boxes.status(before).kind).toBe("playing");

    const s = play([23], before);
    expect(s.edges.every((e) => e !== null)).toBe(true);
    expect(s.boxes).toEqual([1, 1, 1, 0, 0, 0, 1, 1, 1]);
    expect(boxes.status(s)).toEqual({ kind: "finished", winner: 1 });
  });

  it("先手が多く取れば先手の勝ち", () => {
    // 左端の縦線と 15 を先に引かせておき、そのあと先手が 13 から全部の箱を続けて取る
    const s = play([...HORIZONTAL, 12, 16, 20, 15, 13, 14, 17, 18, 19, 21, 22, 23]);
    expect(s.boxes).toEqual(Array(9).fill(0));
    expect(boxes.status(s)).toEqual({ kind: "finished", winner: 0 });
  });

  it("引いた線には引けない・手番でなければ引けない・終局後は引けない", () => {
    const s = play([5]);
    expect(() => boxes.applyMove(s, { edge: 5 }, 1)).toThrow(new IllegalMoveError("boxes_drawn"));
    expect(() => boxes.applyMove(s, { edge: 6 }, 0)).toThrow(new IllegalMoveError("not_your_turn"));

    const done = play([...HORIZONTAL, ...Array.from({ length: 12 }, (_, i) => 12 + i)]);
    expect(() => boxes.applyMove(done, { edge: 0 }, 1)).toThrow(new IllegalMoveError("game_over"));
  });

  it("parseMove は 0〜23 の整数の線だけ受け付ける", () => {
    expect(boxes.parseMove({ edge: 0 })).toEqual({ edge: 0 });
    expect(boxes.parseMove({ edge: 23 })).toEqual({ edge: 23 });
    expect(boxes.parseMove({ edge: 24 })).toBeNull();
    expect(boxes.parseMove({ edge: -1 })).toBeNull();
    expect(boxes.parseMove({ edge: 1.5 })).toBeNull();
    expect(boxes.parseMove({ edge: "3" })).toBeNull();
    expect(boxes.parseMove({})).toBeNull();
    expect(boxes.parseMove(null)).toBeNull();
  });
});
