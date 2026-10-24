import { describe, expect, it } from "vitest";
import { Tilt } from "@atg/core";
import { advance, ballAt, clampLean, MAX_SPEED, PULL_REACH, step, STEP, type Ball, type Lean } from "./physics.ts";

const { MAZES, BOARD_W, BOARD_H, BALL_R, HOLE_R } = Tilt;

/** 壁も穴もない板 */
const empty: Tilt.Maze = { walls: [], holes: [], start: [50, 70], goal: [90, 130], par: 5000 };

/** seconds 秒ぶん、同じ傾きで進める */
function run(maze: Tilt.Maze, b: Ball, lean: Lean, seconds: number) {
  return advance(maze, b, lean, seconds).event;
}

/** 点から長方形の壁までの距離 */
function distToWall(x: number, y: number, [wx, wy, ww, wh]: Tilt.Rect) {
  return Math.hypot(Math.max(wx - x, 0, x - (wx + ww)), Math.max(wy - y, 0, y - (wy + wh)));
}

/** 壁と穴から余裕をとった道を、1 きざみの格子で探す（8 方向） */
function findPath(maze: Tilt.Maze): Tilt.Point[] {
  const ok = (x: number, y: number) =>
    x >= BALL_R + 1 &&
    x <= BOARD_W - BALL_R - 1 &&
    y >= BALL_R + 1 &&
    y <= BOARD_H - BALL_R - 1 &&
    maze.walls.every((w) => distToWall(x, y, w) >= BALL_R + 1.5) &&
    maze.holes.every(([hx, hy]) => Math.hypot(x - hx, y - hy) >= HOLE_R + PULL_REACH + 2.5);
  const key = (x: number, y: number) => y * (BOARD_W + 1) + x;
  const from = new Map<number, number>();
  const sx = Math.round(maze.start[0]);
  const sy = Math.round(maze.start[1]);
  const queue: [number, number][] = [[sx, sy]];
  from.set(key(sx, sy), -1);
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    if (Math.hypot(x - maze.goal[0], y - maze.goal[1]) < 1.5) {
      const path: Tilt.Point[] = [];
      for (let k = key(x, y); k !== -1; k = from.get(k)!) path.unshift([k % (BOARD_W + 1), Math.floor(k / (BOARD_W + 1))]);
      return path;
    }
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && !from.has(key(nx, ny)) && ok(nx, ny)) {
          from.set(key(nx, ny), key(x, y));
          queue.push([nx, ny]);
        }
      }
  }
  throw new Error("道が見つからない");
}

/** 道をなぞるように傾ける自動の操作で 1 回挑戦する。ゴールまでの時間（秒）と落ちた回数 */
function autoplay(maze: Tilt.Maze) {
  const path = findPath(maze);
  const b = ballAt(maze.start);
  let at = 0;
  let falls = 0;
  for (let t = 0; t < Tilt.MAX_MS / 1000; t += 1 / 60) {
    // 近くの道の点を探し、少し先の点へ向かう速さになるよう傾ける
    let best = at;
    for (let i = at; i < Math.min(path.length, at + 40); i++) {
      if (Math.hypot(path[i]![0] - b.x, path[i]![1] - b.y) < Math.hypot(path[best]![0] - b.x, path[best]![1] - b.y)) best = i;
    }
    at = best;
    const [tx, ty] = path[Math.min(path.length - 1, at + 6)]!;
    const d = Math.hypot(tx - b.x, ty - b.y) || 1;
    const lean = clampLean(((tx - b.x) / d) * 30 * 0.06 - b.vx * 0.06, ((ty - b.y) / d) * 30 * 0.06 - b.vy * 0.06);
    const event = run(maze, b, lean, 1 / 60);
    if (event?.kind === "goal") return { seconds: t, falls };
    if (event?.kind === "hole") {
      falls++;
      Object.assign(b, ballAt(maze.start));
      at = 0;
    }
  }
  return { seconds: Infinity, falls };
}

describe("玉の動き", () => {
  it("傾けた向きに転がる。傾けなければ止まったまま", () => {
    const b = ballAt([50, 70]);
    run(empty, b, { x: 0, y: 0 }, 1);
    expect(b).toEqual(ballAt([50, 70]));
    run(empty, b, { x: 1, y: 0 }, 0.3);
    expect(b.x).toBeGreaterThan(55);
    expect(Math.abs(b.y - 70)).toBeLessThan(1e-9);
    const c = ballAt([50, 70]);
    run(empty, c, { x: 0, y: -1 }, 0.3);
    expect(c.y).toBeLessThan(65);
  });

  it("速さには上限がある", () => {
    const b = ballAt([5, 5]);
    run({ ...empty, goal: [-50, -50] }, b, clampLean(1, 1), 3);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
  });

  it("板のふちと壁は通り抜けない（いちばん速くても）", () => {
    const wall: Tilt.Maze = { ...empty, walls: [[60, 0, 3, BOARD_H]], goal: [90, 130] };
    const b = ballAt([20, 70]);
    b.vx = MAX_SPEED;
    run(wall, b, { x: 1, y: 0 }, 2);
    expect(b.x).toBeLessThanOrEqual(60 - BALL_R + 1e-9);
    const e = ballAt([50, 70]);
    run({ ...empty, goal: [-50, -50] }, e, { x: 0, y: 1 }, 3);
    expect(e.y).toBeLessThanOrEqual(BOARD_H - BALL_R + 1e-9);
  });

  it("壁に当たると少し跳ね返る", () => {
    const wall: Tilt.Maze = { ...empty, walls: [[60, 0, 3, BOARD_H]] };
    const b = ballAt([50, 70]);
    b.vx = 80;
    for (let i = 0; i < 60 && b.vx > 0; i++) step(wall, b, { x: 0, y: 0 });
    expect(b.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(-80);
  });

  it("穴の上に来たら落ちる。ゴールに入ったらゴール", () => {
    const holed: Tilt.Maze = { ...empty, holes: [[70, 70]] };
    const b = ballAt([50, 70]);
    expect(run(holed, b, { x: 1, y: 0 }, 2)).toEqual({ kind: "hole", index: 0 });
    const g = ballAt([80, 130]);
    expect(run(empty, g, { x: 1, y: 0 }, 2)).toEqual({ kind: "goal" });
  });

  it("使わなかった端数の時間を次に持ち越す", () => {
    const b = ballAt([50, 70]);
    const { rest } = advance(empty, b, { x: 0, y: 0 }, STEP * 2.5);
    expect(rest).toBeCloseTo(STEP * 0.5, 9);
  });
});

describe("迷路", () => {
  it.each(MAZES.map((m, i) => [i, m] as const))("迷路 %i：道をなぞって傾ければ、穴に落ちずに 60 秒以内にゴールできる", (_, maze) => {
    const { seconds, falls } = autoplay(maze);
    expect(falls).toBe(0);
    expect(seconds).toBeLessThan(Tilt.MAX_MS / 1000);
    // ふつうの人の目安（par）は、自動の操作よりゆっくり
    expect(maze.par / 1000).toBeGreaterThan(seconds);
  });
});
