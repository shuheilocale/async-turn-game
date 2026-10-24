import { Tilt } from "@atg/core";

/**
 * かたむけコロコロの玉の動き（自前の簡単な物理）。板の傾き（-1〜1 の向き）の分だけ玉が加速し、
 * 長方形の壁と板のふちで少し跳ね返る。穴に入ったら落ちて、ゴールに入ったらゴール。
 * 決まった刻み（STEP 秒）で進めるので、画面の速さが変わっても動きは同じ
 */

const { BOARD_W, BOARD_H, BALL_R, HOLE_R, GOAL_R } = Tilt;

/** いちばん傾けたときの加速度（板の単位 / 秒²。板の幅が 100） */
export const ACCEL = 200;
/** 速さの上限と、転がるうちに速さが減る割合（1 秒あたり） */
export const MAX_SPEED = 120;
export const DAMPING = 0.8;
/** 壁に当たったときの跳ね返り（0 で止まる、1 で同じ速さで返る） */
export const BOUNCE = 0.35;
/** 穴のふちに乗ると、穴の中へ引かれる強さと、引かれはじめる距離（穴のふちから） */
export const PULL = 140;
export const PULL_REACH = BALL_R * 0.5;
/** ゴールに入ったとみなす距離（玉の中心とゴールの中心） */
export const GOAL_IN = GOAL_R * 0.75;
/** 1 回に進める時間（秒） */
export const STEP = 1 / 240;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** 傾き。x は右、y は下（画面の向き）。長さは 1 まで */
export interface Lean {
  x: number;
  y: number;
}

export type StepEvent = { kind: "hole"; index: number } | { kind: "goal" } | null;

export const ballAt = ([x, y]: Tilt.Point): Ball => ({ x, y, vx: 0, vy: 0 });

/** 長さを 1 までにそろえる */
export function clampLean(x: number, y: number): Lean {
  const d = Math.hypot(x, y);
  return d > 1 ? { x: x / d, y: y / d } : { x, y };
}

/** 長方形の壁に当たっていたら押し戻し、壁に向かう速さを跳ね返す */
function collideRect(b: Ball, [rx, ry, rw, rh]: Tilt.Rect) {
  const cx = Math.max(rx, Math.min(rx + rw, b.x));
  const cy = Math.max(ry, Math.min(ry + rh, b.y));
  let nx = b.x - cx;
  let ny = b.y - cy;
  let d = Math.hypot(nx, ny);
  if (d >= BALL_R) return;
  if (d === 0) {
    // 中心が壁の中に入った：いちばん近い辺から外へ出す
    const gaps = [b.x - rx, rx + rw - b.x, b.y - ry, ry + rh - b.y];
    const side = gaps.indexOf(Math.min(...gaps));
    const outward: [number, number][] = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    [nx, ny] = outward[side]!;
    b.x = side === 0 ? rx - BALL_R : side === 1 ? rx + rw + BALL_R : b.x;
    b.y = side === 2 ? ry - BALL_R : side === 3 ? ry + rh + BALL_R : b.y;
  } else {
    nx /= d;
    ny /= d;
    b.x = cx + nx * BALL_R;
    b.y = cy + ny * BALL_R;
  }
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + BOUNCE) * vn * nx;
    b.vy -= (1 + BOUNCE) * vn * ny;
  }
}

/** 板のふち */
function collideEdges(b: Ball) {
  if (b.x < BALL_R) [b.x, b.vx] = [BALL_R, Math.abs(b.vx) * BOUNCE];
  if (b.x > BOARD_W - BALL_R) [b.x, b.vx] = [BOARD_W - BALL_R, -Math.abs(b.vx) * BOUNCE];
  if (b.y < BALL_R) [b.y, b.vy] = [BALL_R, Math.abs(b.vy) * BOUNCE];
  if (b.y > BOARD_H - BALL_R) [b.y, b.vy] = [BOARD_H - BALL_R, -Math.abs(b.vy) * BOUNCE];
}

/** STEP 秒だけ進める（ball を書き換える）。穴に落ちた・ゴールしたら知らせる */
export function step(maze: Tilt.Maze, b: Ball, lean: Lean, dt = STEP): StepEvent {
  let ax = lean.x * ACCEL;
  let ay = lean.y * ACCEL;
  // 穴のふちに乗ったら、穴の中へ引かれる
  for (const [hx, hy] of maze.holes) {
    const dx = hx - b.x;
    const dy = hy - b.y;
    const d = Math.hypot(dx, dy);
    const reach = HOLE_R + PULL_REACH;
    if (d < reach && d > 0) {
      const k = (PULL * (reach - d)) / reach / d;
      ax += dx * k;
      ay += dy * k;
    }
  }
  const keep = Math.exp(-DAMPING * dt);
  b.vx = (b.vx + ax * dt) * keep;
  b.vy = (b.vy + ay * dt) * keep;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > MAX_SPEED) {
    b.vx *= MAX_SPEED / speed;
    b.vy *= MAX_SPEED / speed;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  for (const wall of maze.walls) collideRect(b, wall);
  collideEdges(b);

  if (Math.hypot(b.x - maze.goal[0], b.y - maze.goal[1]) < GOAL_IN) return { kind: "goal" };
  const index = maze.holes.findIndex(([hx, hy]) => Math.hypot(b.x - hx, b.y - hy) < HOLE_R);
  return index >= 0 ? { kind: "hole", index } : null;
}

/**
 * seconds 秒ぶん STEP ずつ進める。途中で穴に落ちた・ゴールしたらそこで止めて知らせる。
 * 使わなかった端数の時間を返すので、次のフレームに持ち越す
 */
export function advance(maze: Tilt.Maze, b: Ball, lean: Lean, seconds: number): { event: StepEvent; rest: number } {
  let t = seconds;
  while (t >= STEP) {
    t -= STEP;
    const event = step(maze, b, lean);
    if (event) return { event, rest: 0 };
  }
  return { event: null, rest: t };
}
