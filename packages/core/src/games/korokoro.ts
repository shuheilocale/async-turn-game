import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * ころころ：4×4 の盤で、6 面のうち 3 面が青・3 面がオレンジのキューブ（向かい合う面は必ず別の色）を
 * 2 人で 1 つ使う。先手が青、後手がオレンジ。
 * 手番では、キューブをたてかよこにまっすぐ 1 マス以上転がし（1 マス進むごとに 1 回転がる）、
 * 止まったマスを、そのとき下になった面の色で塗る。塗ったマスの上も通れるが、止まれるのは空いているマスだけ。
 * 青かオレンジがたてかよこに 3 つ並んだら、誰が塗ってもその色の人の勝ち（ななめは数えない）。
 * 手番の人がどこにも止まれないときは引き分け。
 */

export const SIZE = 4;
/** 何マス並んだら勝ちか */
export const LINE = 3;

export type Dir = "up" | "down" | "left" | "right";
export const DIRS: Dir[] = ["up", "down", "left", "right"];

/**
 * キューブの 6 面の色（0 = 青、1 = オレンジ）。盤を上から見て、上が北、右が東。
 * 面の名前は盤に対する向きで、転がるたびに色が入れ替わる
 */
export interface Faces {
  top: Seat;
  bottom: Seat;
  north: Seat;
  south: Seat;
  east: Seat;
  west: Seat;
}

export interface Cube {
  /** いるマス（行優先） */
  cell: number;
  faces: Faces;
}

export interface KorokoroMove {
  /** 止まるマス。今いるマスと同じ行か列にある */
  to: number;
}

/** 最後の転がし。盤の描画（通った道・再生）に使う */
export interface Roll {
  seat: Seat;
  from: number;
  to: number;
  dir: Dir;
  /** from から to まで、キューブが乗ったマスの順（両はしを含む） */
  path: number[];
  /** to を塗った色（止まったときに下になった面の色） */
  color: Seat;
}

export interface KorokoroState {
  /** マスごとの塗った色。空きは null */
  board: (Seat | null)[];
  cube: Cube;
  /** 次に転がす人。終局後は、勝負がついた手の次の人（引き分けなら止まれなかった人） */
  turn: Seat;
  lastMove: Roll | null;
  /** 勝った並び（3 つ以上並んだマス。たてとよこが同時にそろえば両方）。決着していなければ null */
  winLine: number[] | null;
  winner: Seat | null;
  finished: boolean;
}

/** 始まりの向き：下・東・南がオレンジ、上・西・北が青 */
export const START_FACES: Faces = { top: 0, bottom: 1, north: 0, south: 1, east: 1, west: 0 };

export const rowOf = (i: number) => Math.floor(i / SIZE);
export const colOf = (i: number) => i % SIZE;
export const indexOf = (r: number, c: number) => r * SIZE + c;

const STEP: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** 1 マス転がす。転がる向きの面が下になり、下の面は反対側へ、上の面は転がる向きの側へ回る */
export function roll(f: Faces, dir: Dir): Faces {
  switch (dir) {
    case "right":
      return { ...f, bottom: f.east, east: f.top, top: f.west, west: f.bottom };
    case "left":
      return { ...f, bottom: f.west, west: f.top, top: f.east, east: f.bottom };
    case "down":
      return { ...f, bottom: f.south, south: f.top, top: f.north, north: f.bottom };
    case "up":
      return { ...f, bottom: f.north, north: f.top, top: f.south, south: f.bottom };
  }
}

/** 同じ向きに dist マス転がす */
export function rollBy(f: Faces, dir: Dir, dist: number): Faces {
  let faces = f;
  for (let i = 0; i < dist; i++) faces = roll(faces, dir);
  return faces;
}

/** from から to へまっすぐ転がすときの向きと距離。同じ行・列でない（または同じマス）なら null */
export function lineBetween(from: number, to: number): { dir: Dir; dist: number } | null {
  const dr = rowOf(to) - rowOf(from);
  const dc = colOf(to) - colOf(from);
  if (dr === 0 && dc === 0) return null;
  if (dr === 0) return { dir: dc > 0 ? "right" : "left", dist: Math.abs(dc) };
  if (dc === 0) return { dir: dr > 0 ? "down" : "up", dist: Math.abs(dr) };
  return null;
}

/** from から dir へ dist マス進む間に乗るマス（両はしを含む） */
export function pathOf(from: number, dir: Dir, dist: number): number[] {
  const [dr, dc] = STEP[dir];
  return Array.from({ length: dist + 1 }, (_, k) => indexOf(rowOf(from) + dr * k, colOf(from) + dc * k));
}

/** 止まれるマス 1 つ分。color はそこに止まったときに塗られる色 */
export interface Destination {
  to: number;
  dir: Dir;
  dist: number;
  color: Seat;
}

/** 今のキューブの位置から止まれるマス（空いていて、たてかよこにまっすぐ届くマス）すべて */
export function destinations(state: Pick<KorokoroState, "board" | "cube">): Destination[] {
  const { cell, faces } = state.cube;
  const result: Destination[] = [];
  for (const dir of DIRS) {
    const [dr, dc] = STEP[dir];
    let f = faces;
    let r = rowOf(cell);
    let c = colOf(cell);
    // 盤のはしまで 1 マスずつ転がしていく。塗ったマスは通り越すだけ
    for (let dist = 1; ; dist++) {
      r += dr;
      c += dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) break;
      f = roll(f, dir);
      const to = indexOf(r, c);
      if (state.board[to] === null) result.push({ to, dir, dist, color: f.bottom });
    }
  }
  return result;
}

/** cell を含む、同じ色が LINE 個以上並んだたて・よこの並び（マスの番号を小さい順に）。なければ null */
export function linesThrough(board: (Seat | null)[], cell: number): number[] | null {
  const color = board[cell];
  if (color === null || color === undefined) return null;
  const found = new Set<number>();
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
  ] as const) {
    const run = [cell];
    // 両側へ同じ色が続くところまでのばす
    for (const sign of [-1, 1]) {
      let r = rowOf(cell) + dr * sign;
      let c = colOf(cell) + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[indexOf(r, c)] === color) {
        run.push(indexOf(r, c));
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (run.length >= LINE) for (const i of run) found.add(i);
  }
  return found.size > 0 ? [...found].sort((a, b) => a - b) : null;
}

export const korokoro: GameDefinition<KorokoroState, KorokoroMove> = {
  id: "korokoro",

  initialState() {
    return {
      board: Array(SIZE * SIZE).fill(null),
      cube: { cell: 0, faces: START_FACES },
      turn: 0,
      lastMove: null,
      winLine: null,
      winner: null,
      finished: false,
    };
  },

  status(state): GameStatus {
    if (!state.finished) return { kind: "playing", turn: state.turn };
    return { kind: "finished", winner: state.winner };
  },

  applyMove(state, { to }, seat) {
    if (state.finished) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const from = state.cube.cell;
    const line = lineBetween(from, to);
    if (!line) throw new IllegalMoveError("korokoro_not_straight");
    if (state.board[to] !== null) throw new IllegalMoveError("korokoro_painted");

    const faces = rollBy(state.cube.faces, line.dir, line.dist);
    const color = faces.bottom;
    const board = [...state.board];
    board[to] = color;
    const lastMove: Roll = { seat, from, to, dir: line.dir, path: pathOf(from, line.dir, line.dist), color };
    const next = other(seat);
    const cube = { cell: to, faces };

    // 3 つ並んだら、塗った人ではなく、その色の人の勝ち
    const winLine = linesThrough(board, to);
    if (winLine) return { board, cube, turn: next, lastMove, winLine, winner: color, finished: true };
    // 次の人がどこにも止まれなければ引き分け
    const stuck = destinations({ board, cube }).length === 0;
    return { board, cube, turn: next, lastMove, winLine: null, winner: null, finished: stuck };
  },

  parseMove(raw) {
    const to = (raw as { to?: unknown } | null)?.to;
    return Number.isInteger(to) && (to as number) >= 0 && (to as number) < SIZE * SIZE ? { to: to as number } : null;
  },

  legalMoves(state, seat) {
    if (state.finished || seat !== state.turn) return [];
    return destinations(state).map(({ to }) => ({ to }));
  },
};
