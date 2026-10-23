import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import {
  DIRS,
  distance,
  MAX_DISTANCE,
  MAX_MOVES,
  MIN_DISTANCE,
  MIN_SLACK,
  neighbor,
  ROCKS,
  shortestPath,
  SIZE,
  treasure,
  type Dir,
  type TreasureState,
  type TreasureView,
} from "./treasure.ts";

/** 決まった順に値を返す乱数（テストを毎回同じにするため） */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

// マスの番号（行優先）
//  0  1  2  3  4
//  5  6  7  8  9
// 10 11 12 13 14
// 15 16 17 18 19
// 20 21 22 23 24

/**
 * 配置を決めた状態を作る。スタート 20（左下）、宝 8、岩は 15・16・11・13・3
 *   .  .  .  R  .
 *   .  .  .  T  .
 *   .  R  .  R  .
 *   R  R  .  .  .
 *   S  .  .  .  .
 */
function fixed(over: Partial<TreasureState> = {}): TreasureState {
  return {
    ...treasure.initialState(seeded(1)),
    start: 20,
    piece: 20,
    treasure: 8,
    rocks: [3, 11, 13, 15, 16],
    ...over,
  };
}

/** 先手から交互に動かす */
function play(dirs: Dir[], s: TreasureState = fixed()): TreasureState {
  dirs.forEach((dir, i) => {
    s = treasure.applyMove(s, { dir }, (i % 2) as Seat);
  });
  return s;
}

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

describe("treasure の配置", () => {
  it("スタートにコマがあり、先手から 12 手ではじまる", () => {
    const s = treasure.initialState(seeded(7));
    expect(s.piece).toBe(s.start);
    expect(s.movesLeft).toBe(MAX_MOVES);
    expect(s.steps).toEqual([]);
    expect(s.found).toEqual([]);
    expect(s.result).toBeNull();
    expect(treasure.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("配置は rng で決まる（同じ rng なら同じ、ちがう rng ならちがう配置がある）", () => {
    const layout = (s: TreasureState) => ({ start: s.start, treasure: s.treasure, rocks: s.rocks });
    expect(layout(treasure.initialState(seeded(3)))).toEqual(layout(treasure.initialState(seeded(3))));
    const all = new Set(
      Array.from({ length: 30 }, (_, i) => JSON.stringify(layout(treasure.initialState(seeded(i + 1))))),
    );
    expect(all.size).toBeGreaterThan(20);
  });

  it("どの配置でも、岩をよけて宝まで行ける道があり、手数に余裕がある", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = treasure.initialState(seeded(seed));
      const cells = [s.start, s.treasure, ...s.rocks];
      // 盤の中で、どれも重ならない
      expect(new Set(cells).size).toBe(2 + ROCKS);
      for (const c of cells) expect(c >= 0 && c < SIZE * SIZE).toBe(true);
      // スタートと宝はある程度はなれている
      const d = distance(s.start, s.treasure);
      expect(d).toBeGreaterThanOrEqual(MIN_DISTANCE);
      expect(d).toBeLessThanOrEqual(MAX_DISTANCE);
      // 岩をよけた最短の道が 12 手より MIN_SLACK 手以上短い
      const path = shortestPath(s.start, s.treasure, s.rocks);
      expect(path).not.toBeNull();
      expect(path!).toBeLessThanOrEqual(MAX_MOVES - MIN_SLACK);
    }
  });

  it("いつも同じ値を返す rng でも配置が決まる", () => {
    for (const value of [0, 0.5, 0.9999]) {
      const s = treasure.initialState(() => value);
      expect(new Set([s.start, s.treasure, ...s.rocks]).size).toBe(2 + ROCKS);
      expect(shortestPath(s.start, s.treasure, s.rocks)!).toBeLessThanOrEqual(MAX_MOVES - MIN_SLACK);
    }
  });

  it("最短の道は岩をよけて数える。囲まれていれば null", () => {
    expect(distance(20, 8)).toBe(6);
    expect(shortestPath(20, 8, [])).toBe(6);
    expect(shortestPath(20, 8, [3, 11, 13, 15, 16])).toBe(6); // 右へ 2、上へ 3、右へ 1
    expect(shortestPath(20, 8, [15, 21])).toBeNull();
  });

  it("となりのマスは盤の中だけ", () => {
    expect(neighbor(12, "up")).toBe(7);
    expect(neighbor(12, "down")).toBe(17);
    expect(neighbor(12, "left")).toBe(11);
    expect(neighbor(12, "right")).toBe(13);
    expect(neighbor(0, "up")).toBeNull();
    expect(neighbor(0, "left")).toBeNull();
    expect(neighbor(4, "right")).toBeNull();
    expect(neighbor(24, "down")).toBeNull();
    // 右端から右へ動いても、次の段の左端には行かない
    expect(neighbor(9, "right")).toBeNull();
    expect(neighbor(10, "left")).toBeNull();
  });
});

describe("treasure の手", () => {
  it("上下左右に 1 マス動かし、足あとと残りの手数が変わり、手番が交代する", () => {
    const s = play(["right", "up"]);
    // 20 → 21。上の 16 は岩なので 21 のまま
    expect(s.piece).toBe(21);
    expect(s.steps).toEqual([
      { seat: 0, dir: "right", from: 20, bumped: false },
      { seat: 1, dir: "up", from: 21, bumped: true },
    ]);
    const t = play(["right", "right", "up"]);
    expect(t.piece).toBe(17);
    expect(t.movesLeft).toBe(MAX_MOVES - 3);
    expect(t.steps.map((st) => st.from)).toEqual([20, 21, 22]);
    expect(treasure.status(t)).toEqual({ kind: "playing", turn: 1 });
  });

  it("盤の外へは動かせない（手数も減らない）", () => {
    const s = fixed();
    expect(codeOf(() => treasure.applyMove(s, { dir: "down" }, 0))).toBe("treasure_off_board");
    expect(codeOf(() => treasure.applyMove(s, { dir: "left" }, 0))).toBe("treasure_off_board");
    expect(s.movesLeft).toBe(MAX_MOVES);
    expect(s.steps).toEqual([]);
  });

  it("岩のマスへは動けず、その 1 手はむだになり、岩が見つかる", () => {
    const s = play(["up"]);
    expect(s.piece).toBe(20);
    expect(s.found).toEqual([15]);
    expect(s.movesLeft).toBe(MAX_MOVES - 1);
    expect(s.steps).toEqual([{ seat: 0, dir: "up", from: 20, bumped: true }]);
    expect(treasure.status(s)).toEqual({ kind: "playing", turn: 1 });
    // 見つかった岩にもう一度ぶつかってもむだになるだけで、見つかった岩は増えない
    const t = play(["up", "up"]);
    expect(t.found).toEqual([15]);
    expect(t.movesLeft).toBe(MAX_MOVES - 2);
    expect(t.steps[1]).toEqual({ seat: 1, dir: "up", from: 20, bumped: true });
  });

  it("宝のマスに着いたら 2 人でクリア。そのあとは動かせない", () => {
    const s = play(["right", "right", "up", "up", "up", "right"]);
    expect(s.piece).toBe(8);
    expect(s.movesLeft).toBe(MAX_MOVES - 6);
    expect(treasure.status(s)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    expect(codeOf(() => treasure.applyMove(s, { dir: "up" }, 0))).toBe("game_over");
  });

  it("12 手で宝に着かなければ失敗", () => {
    const dirs: Dir[] = Array.from({ length: MAX_MOVES - 1 }, (_, i) => (i % 2 === 0 ? "right" : "left"));
    const before = play(dirs);
    expect(before.movesLeft).toBe(1);
    expect(treasure.status(before)).toEqual({ kind: "playing", turn: 1 });
    const s = play([...dirs, "up"]);
    expect(s.movesLeft).toBe(0);
    expect(treasure.status(s)).toEqual({ kind: "finished", winner: null, coop: "failed" });
    expect(codeOf(() => treasure.applyMove(s, { dir: "right" }, 1))).toBe("game_over");
  });

  it("12 手目でちょうど宝に着けばクリア", () => {
    // 6 手むだにしてから、6 手で宝へ
    const waste: Dir[] = ["right", "left", "up", "up", "right", "left"];
    const s = play([...waste, "right", "right", "up", "up", "up", "right"]);
    expect(s.movesLeft).toBe(0);
    expect(treasure.status(s)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
  });

  it("自分の番でなければ動かせない", () => {
    expect(codeOf(() => treasure.applyMove(fixed(), { dir: "right" }, 1))).toBe("not_your_turn");
    expect(codeOf(() => treasure.applyMove(play(["right"]), { dir: "right" }, 0))).toBe("not_your_turn");
  });

  it("parseMove は 4 つの向きだけ受け付ける", () => {
    for (const dir of DIRS) expect(treasure.parseMove({ dir })).toEqual({ dir });
    expect(treasure.parseMove({ dir: "north" })).toBeNull();
    expect(treasure.parseMove({ dir: 1 })).toBeNull();
    expect(treasure.parseMove({})).toBeNull();
    expect(treasure.parseMove(null)).toBeNull();
    expect(treasure.parseMove("up")).toBeNull();
  });
});

describe("treasure の見え方", () => {
  const view = (s: TreasureState, viewer: Seat | null, revealAll = false) =>
    treasure.viewState!(s, viewer, revealAll) as TreasureView;

  it("先手には宝が見え、岩は見えない", () => {
    const v = view(fixed(), 0);
    expect(v.treasure).toBe(8);
    expect(v.rocks).toEqual([]);
  });

  it("後手には岩が見え、宝は見えない", () => {
    const v = view(fixed(), 1);
    expect(v.treasure).toBeNull();
    expect(v.rocks).toEqual([3, 11, 13, 15, 16]);
  });

  it("観戦者にはどちらも見えない", () => {
    const v = view(fixed(), null);
    expect(v.treasure).toBeNull();
    expect(v.rocks).toEqual([]);
  });

  it("ぶつかって見つかった岩は、先手と観戦者にも見える", () => {
    const s = play(["right", "up"]);
    expect(view(s, 0).rocks).toEqual([16]);
    expect(view(s, null).rocks).toEqual([16]);
    expect(view(s, 0).found).toEqual([16]);
    expect(view(s, 1).rocks).toEqual([3, 11, 13, 15, 16]);
  });

  it("終局後は全部見える", () => {
    const s = play(["right", "right", "up", "up", "up", "right"]);
    for (const viewer of [0, 1, null] as const) {
      const v = view(s, viewer, true);
      expect(v.treasure).toBe(8);
      expect(v.rocks).toEqual([3, 11, 13, 15, 16]);
    }
  });

  it("加工しても形は同じで、元の状態は変わらない", () => {
    const s = fixed();
    for (const viewer of [0, 1, null] as const) {
      expect(Object.keys(view(s, viewer)).sort()).toEqual(Object.keys(s).sort());
    }
    expect(s.treasure).toBe(8);
    expect(s.rocks).toEqual([3, 11, 13, 15, 16]);
  });
});
