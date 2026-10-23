import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  DROP_GAP,
  dropPose,
  hasCollapsed,
  PLATFORM_W,
  place,
  stack,
  STONES,
  topOf,
  X_LIMIT,
  type Pose,
  type StackMove,
  type StackState,
} from "./stack.ts";

/** 種から同じ並びの乱数を作る（mulberry32） */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 崩さずに積んだことにする手。core は物理演算をしないので、位置はそれらしく縦に並べるだけ */
function safe(s: StackState): StackMove {
  const n = s.positions.length;
  return { x: 0, angle: 0, positions: [...s.positions, [0, 0.1 + 0.2 * n, 0]], collapsed: false };
}

/** 落とした石が台から落ちて地面へ行ったことにする手 */
function fall(s: StackState): StackMove {
  return { x: 0.9, angle: 0, positions: [...s.positions, [1.4, -0.7, 0.4]], collapsed: true };
}

function play(moves: ((s: StackState) => StackMove)[], s = stack.initialState(seeded(1))): StackState {
  return moves.reduce((st, make, i) => stack.applyMove(st, make(st), (i % 2) as Seat), s);
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof IllegalMoveError ? e.code : "other";
  }
}

const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);

describe("stack", () => {
  describe("石の並び", () => {
    it("最初に 40 個ぶん、rng で決まる", () => {
      const a = stack.initialState(seeded(7));
      expect(a.stones).toHaveLength(STONES);
      expect(stack.initialState(seeded(7)).stones).toEqual(a.stones);
      expect(stack.initialState(seeded(8)).stones).not.toEqual(a.stones);
    });

    it("石は反時計回りの凸多角形で、幅は台の 3〜6 割、厚みは幅の 2〜3 割くらい", () => {
      for (const stone of stack.initialState(seeded(3)).stones) {
        expect(stone.length).toBeGreaterThanOrEqual(6);
        expect(stone.length).toBeLessThanOrEqual(12);
        stone.forEach((p, i) => {
          expect(cross(p, stone[(i + 1) % stone.length]!, stone[(i + 2) % stone.length]!)).toBeGreaterThan(0);
        });
        const xs = stone.map((p) => p[0]);
        const ys = stone.map((p) => p[1]);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        expect(w / PLATFORM_W).toBeGreaterThan(0.27);
        expect(w / PLATFORM_W).toBeLessThan(0.63);
        expect(h / w).toBeGreaterThan(0.15);
        expect(h / w).toBeLessThan(0.36);
      }
    });

    it("最初は先手の番で、まだ何も積んでいない", () => {
      const s = stack.initialState(seeded(1));
      expect(s.positions).toEqual([]);
      expect(s.last).toBeNull();
      expect(stack.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("落とす", () => {
    it("崩れなければ石が 1 つ増えて手番が移り、落とす前の位置と落とし方を覚えておく", () => {
      const s1 = play([safe]);
      expect(s1.positions).toEqual([[0, 0.1, 0]]);
      expect(stack.status(s1)).toEqual({ kind: "playing", turn: 1 });

      const s2 = stack.applyMove(s1, { ...safe(s1), x: 0.25, angle: Math.PI / 12 }, 1);
      expect(s2.positions).toHaveLength(2);
      expect(s2.last).toEqual({ seat: 1, x: 0.25, angle: Math.PI / 12, before: [[0, 0.1, 0]], collapsed: false });
      expect(stack.status(s2)).toEqual({ kind: "playing", turn: 0 });
    });

    it("位置は 0.1 mm 単位にそろえて保存する", () => {
      const s = stack.initialState(seeded(1));
      const next = stack.applyMove(s, { x: 0.123456, angle: 0, positions: [[0.123456, 0.2000049, -0.0300001]], collapsed: false }, 0);
      expect(next.positions[0]).toEqual([0.1235, 0.2, -0.03]);
      expect(next.last!.x).toBe(0.1235);
    });

    it("どれか 1 つでも台から落ちたら、落とした人の負け", () => {
      expect(stack.status(play([safe, safe, fall]))).toEqual({ kind: "finished", winner: 1 });
      expect(stack.status(play([safe, fall]))).toEqual({ kind: "finished", winner: 0 });
    });

    it("前に積んだ石が崩れて落ちても、落とした人の負け", () => {
      const s = play([safe, safe]);
      const knocked: Pose[] = [[0.2, -0.5, 1.2], s.positions[1]!, [0, 0.5, 0]];
      const end = stack.applyMove(s, { x: 0, angle: 0, positions: knocked, collapsed: true }, 0);
      expect(stack.status(end)).toEqual({ kind: "finished", winner: 1 });
    });

    it("40 個積んで崩れなければ引き分け", () => {
      const s = play(Array.from({ length: STONES }, () => safe));
      expect(s.positions).toHaveLength(STONES);
      expect(stack.status(s)).toEqual({ kind: "finished", winner: null });
      expect(codeOf(() => stack.applyMove(s, safe(s), 0))).toBe("game_over");
    });

    it("手番でなければ落とせない・終わったあとは落とせない", () => {
      const s = stack.initialState(seeded(1));
      expect(codeOf(() => stack.applyMove(s, safe(s), 1))).toBe("not_your_turn");
      const end = play([fall]);
      expect(codeOf(() => stack.applyMove(end, safe(end), 1))).toBe("game_over");
    });

    it("石の個数が合わない手は受け付けない", () => {
      const s = play([safe]);
      expect(codeOf(() => stack.applyMove(s, { ...safe(s), positions: [[0, 0.1, 0]] }, 1))).toBe("stack_count");
      expect(codeOf(() => stack.applyMove(s, { ...safe(s), positions: [...safe(s).positions, [0, 1, 0]] }, 1))).toBe(
        "stack_count",
      );
    });

    it("崩れたかどうかが石の位置と食い違う手は受け付けない", () => {
      const s = play([safe]);
      expect(codeOf(() => stack.applyMove(s, { ...fall(s), collapsed: false }, 1))).toBe("stack_mismatch");
      expect(codeOf(() => stack.applyMove(s, { ...safe(s), collapsed: true }, 1))).toBe("stack_mismatch");
    });
  });

  describe("形", () => {
    it("台の上面より下へ行った石があれば崩れたとみなす", () => {
      expect(hasCollapsed([])).toBe(false);
      expect(hasCollapsed([[0, 0.1, 0], [0.3, 0.3, 0.2]])).toBe(false);
      expect(hasCollapsed([[0, 0.1, 0], [1.2, -0.01, 0.2]])).toBe(true);
    });

    it("落とす石は、積んだ石の一番上からすき間ぶん上に出す", () => {
      const s = stack.initialState(seeded(5));
      // まだ何もなければ台の上面（y = 0）が基準
      const first = dropPose(s.stones, [], 0.2, 0.5);
      expect(Math.min(...place(s.stones[0]!, first).map((p) => p[1]))).toBeCloseTo(DROP_GAP, 9);
      expect(first[0]).toBe(0.2);
      expect(first[2]).toBe(0.5);

      const positions: Pose[] = [[0, 0.12, 0.1]];
      expect(topOf(s.stones, positions)).toBeCloseTo(Math.max(...place(s.stones[0]!, positions[0]!).map((p) => p[1])), 9);
      const second = dropPose(s.stones, positions, -0.3, 0);
      expect(Math.min(...place(s.stones[1]!, second).map((p) => p[1]))).toBeCloseTo(topOf(s.stones, positions) + DROP_GAP, 9);
      // 落ちた石は高さに数えない
      expect(topOf(s.stones, [[1.4, -0.7, 0]])).toBe(0);
    });
  });

  describe("parseMove", () => {
    const ok = { x: 0.3, angle: -Math.PI / 6, positions: [[0.1, 0.2, 0.05]], collapsed: false };

    it("数値が有限で範囲内の手だけ受け付ける", () => {
      expect(stack.parseMove(ok)).toEqual(ok);
      expect(stack.parseMove({ ...ok, x: X_LIMIT + 0.01 })).toBeNull();
      expect(stack.parseMove({ ...ok, x: Number.NaN })).toBeNull();
      expect(stack.parseMove({ ...ok, angle: Math.PI + 0.01 })).toBeNull();
      expect(stack.parseMove({ ...ok, angle: "0" })).toBeNull();
      expect(stack.parseMove({ ...ok, collapsed: "no" })).toBeNull();
      expect(stack.parseMove({ ...ok, positions: "[]" })).toBeNull();
      expect(stack.parseMove({ ...ok, positions: [[0.1, 0.2]] })).toBeNull();
      expect(stack.parseMove({ ...ok, positions: [[0.1, Number.POSITIVE_INFINITY, 0]] })).toBeNull();
      expect(stack.parseMove({ ...ok, positions: [[1e6, 0.2, 0]] })).toBeNull();
      expect(stack.parseMove({ ...ok, positions: Array.from({ length: STONES + 1 }, () => [0, 0.2, 0]) })).toBeNull();
      expect(stack.parseMove(null)).toBeNull();
      expect(stack.parseMove({ x: 0, angle: 0, collapsed: false })).toBeNull();
    });
  });
});
