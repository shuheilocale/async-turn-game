import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * いしつみ：まん中の平らな岩（台）の上に、形も大きさもばらばらな平たい石を、交互に 1 つずつ
 * 上から落として積む。落とした結果、どれか 1 つでも石が台の上面より下へ行ったら、落とした人の負け。
 * 40 個積んで崩れなければ引き分け。
 *
 * 物理演算は画面側（ブラウザ）でする。手には落とし方（x・傾き）と、落としたあと全部の石が
 * 止まった位置を入れて送る。ここでは形を確かめてそのまま保存するだけ（身内で遊ぶものなので、
 * 計算結果は送った人を信じる）。
 *
 * 座標はメートル単位で、y は上向き。台の上面の高さを y = 0、台の中心を x = 0 とする。
 */

/** 石の数。最初に全部の形を決めておく */
export const STONES = 40;
/** 台（岩）の上面の幅 */
export const PLATFORM_W = 1.6;
/** 台の高さ。地面は y = -ROCK_H */
export const ROCK_H = 0.8;
/** 落とす位置（石の中心）を動かせる範囲。台の中心から左右にこれだけ */
export const X_LIMIT = 1.8;
/** 落とす石の一番下と、積んだ石の一番上とのすき間 */
export const DROP_GAP = 0.1;

/** 石の中心から見た頂点の位置 */
export type Point = [x: number, y: number];
/** 石の中心の位置と傾き（ラジアン、反時計回り） */
export type Pose = [x: number, y: number, angle: number];

export interface StackMove {
  /** 落とした位置（石の中心の x） */
  x: number;
  /** 落としたときの傾き（ラジアン。-π〜π） */
  angle: number;
  /** 落としたあと、全部の石が止まった位置。積んだ順に並べる */
  positions: Pose[];
  /** どれかの石が台から落ちたか */
  collapsed: boolean;
}

/** 直前の手。相手の画面で「落ちて止まるまで」を再生するのに使う */
export interface LastDrop {
  seat: Seat;
  x: number;
  angle: number;
  /** 落とす前の、全部の石の位置 */
  before: Pose[];
  collapsed: boolean;
}

export interface StackState {
  /** 全部の石の形（反時計回りの凸多角形）。この順に落とす */
  stones: Point[][];
  /** 積んだ石の今の位置。positions[i] が stones[i] の位置。i が偶数なら先手、奇数なら後手が置いた石 */
  positions: Pose[];
  turn: Seat;
  last: LastDrop | null;
}

/** 0.1 mm（角度は 0.0001 ラジアン）単位にそろえる。-0 は 0 にする */
const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
const round3 = (v: number) => Math.round(v * 1e3) / 1e3 || 0;

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** 凸包（反時計回り。一直線に並んだ点は除く） */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** 多角形の重心 */
function centroid(poly: Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const a = p[0] * q[1] - q[0] * p[1];
    area += a;
    cx += (p[0] + q[0]) * a;
    cy += (p[1] + q[1]) * a;
  });
  return [cx / (3 * area), cy / (3 * area)];
}

/**
 * 平たい石を 1 つ作る。横長のだ円と角の丸い長方形の間くらいの形に、上下の面の丸み・
 * 片側だけ厚い「くさび」・ふちのでこぼこを乱数で付ける。
 * 幅は台の 3〜6 割、厚みは幅の 2〜3 割くらい。頂点は 12 個まで（Box2D の上限）
 */
export function makeStone(rng: Rng): Point[] {
  const w = PLATFORM_W * (0.3 + 0.3 * rng());
  const h = w * (0.2 + 0.1 * rng());
  // 面の丸み。2 ならだ円、大きいほど平らで角ばる。上と下で別々に決める
  const top = 2 + 3 * rng();
  const bottom = 2 + 3 * rng();
  // 正なら右側が厚い
  const wedge = (rng() - 0.5) * 0.6;
  const n = 12;
  const offset = rng() * ((2 * Math.PI) / n);
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = offset + (2 * Math.PI * i) / n + (rng() - 0.5) * ((0.3 * 2 * Math.PI) / n);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const m = s >= 0 ? top : bottom;
    const x = (w / 2) * Math.sign(c) * Math.abs(c) ** (2 / m);
    const y = (h / 2) * Math.sign(s) * Math.abs(s) ** (2 / m) * (1 + (wedge * x) / (w / 2));
    const r = 0.94 + 0.06 * rng();
    points.push([x * r, y * r]);
  }
  const shape = hull(points);
  const [cx, cy] = centroid(shape);
  return hull(shape.map(([x, y]) => [round3(x - cx), round3(y - cy)]));
}

/** 石の頂点を、置いた位置での座標にする */
export function place(stone: Point[], [x, y, angle]: Pose): Point[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return stone.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

/** 台の上面より下へ行った（台から落ちた）か */
export const isFallen = (pose: Pose) => pose[1] < 0;

/** どれか 1 つでも石が台から落ちたか */
export const hasCollapsed = (positions: Pose[]) => positions.some(isFallen);

/** 積んだ石の一番上の高さ（台の上面から）。落ちた石は数えない。何もなければ 0 */
export function topOf(stones: Point[][], positions: Pose[]): number {
  let top = 0;
  positions.forEach((pose, i) => {
    if (isFallen(pose)) return;
    for (const [, y] of place(stones[i]!, pose)) top = Math.max(top, y);
  });
  return top;
}

/** 次の石を落とし始める位置。石の一番下が、積んだ石の一番上から DROP_GAP だけ上になるようにする */
export function dropPose(stones: Point[][], positions: Pose[], x: number, angle: number): Pose {
  const stone = stones[positions.length]!;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const bottom = Math.min(...stone.map(([px, py]) => px * s + py * c));
  return [x, topOf(stones, positions) + DROP_GAP - bottom, angle];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 止まった位置として受け付ける範囲。地面の上を転がっていっても収まるくらい広めにとる */
function parsePose(raw: unknown): Pose | null {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(finite)) return null;
  const [x, y, angle] = raw as Pose;
  if (Math.abs(x) > 50 || y < -10 || y > 50 || Math.abs(angle) > 1e4) return null;
  return [x, y, angle];
}

export const stack: GameDefinition<StackState, StackMove> = {
  id: "stack",

  initialState(rng) {
    return { stones: Array.from({ length: STONES }, () => makeStone(rng)), positions: [], turn: 0, last: null };
  },

  status(state): GameStatus {
    // 崩した人の負け。40 個積みきったら引き分け
    if (state.last?.collapsed) return { kind: "finished", winner: other(state.last.seat) };
    if (state.positions.length >= STONES) return { kind: "finished", winner: null };
    return { kind: "playing", turn: state.turn };
  },

  applyMove(state, move, seat) {
    if (stack.status(state).kind === "finished") throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (move.positions.length !== state.positions.length + 1) throw new IllegalMoveError("stack_count");
    if (move.collapsed !== hasCollapsed(move.positions)) throw new IllegalMoveError("stack_mismatch");

    const positions = move.positions.map((p) => p.map(round4) as Pose);
    return {
      stones: state.stones,
      positions,
      turn: other(seat),
      last: { seat, x: round4(move.x), angle: move.angle, before: state.positions, collapsed: move.collapsed },
    };
  },

  parseMove(raw) {
    const m = raw as Partial<Record<keyof StackMove, unknown>> | null;
    if (!m || !finite(m.x) || !finite(m.angle) || typeof m.collapsed !== "boolean") return null;
    if (Math.abs(m.x) > X_LIMIT || Math.abs(m.angle) > Math.PI + 1e-9) return null;
    if (!Array.isArray(m.positions) || m.positions.length > STONES) return null;
    const positions: Pose[] = [];
    for (const p of m.positions) {
      const pose = parsePose(p);
      if (!pose) return null;
      positions.push(pose);
    }
    return { x: m.x, angle: m.angle, positions, collapsed: m.collapsed };
  },
};
