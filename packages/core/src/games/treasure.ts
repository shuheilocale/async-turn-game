import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * 宝と岩（協力ゲーム）：5×5 の盤にある 1 つのコマを、2 人が交互に上下左右へ 1 マスずつ動かす。
 * 宝の場所は先手にだけ、岩の場所は後手にだけ見える。岩のマスへは動けず（その 1 手はむだ）、
 * ぶつかった岩は 2 人に見えるようになる。2 人合わせて 12 手以内に宝に着けばクリア。
 */

export const SIZE = 5;
export const ROCKS = 5;
/** 2 人合わせた手数の上限 */
export const MAX_MOVES = 12;
/** スタートから宝までのマス数（岩がないときの最短）の範囲 */
export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 6;
/** 岩をよけた最短の道が、手数の上限よりこれだけ以上短くなるように配置する */
export const MIN_SLACK = 4;

export type Dir = "up" | "down" | "left" | "right";
export const DIRS: readonly Dir[] = ["up", "down", "left", "right"];

export interface TreasureMove {
  dir: Dir;
}

/** 足あと：誰が、どのマスから、どちらへ動かしたか。bumped なら岩にぶつかって動かなかった */
export interface Step {
  seat: Seat;
  dir: Dir;
  from: number;
  bumped: boolean;
}

export interface TreasureState {
  /** マスの番号は行優先（左上が 0、右下が 24） */
  start: number;
  piece: number;
  /** 先手にだけ見せる。viewState で隠す */
  treasure: number;
  /** 後手にだけ見せる（小さい順）。viewState で、先手と観戦者には見つかった岩だけにする */
  rocks: number[];
  /** ぶつかって見つかった岩（見つかった順）。2 人に見える */
  found: number[];
  steps: Step[];
  movesLeft: number;
  turn: Seat;
  result: "cleared" | "failed" | null;
}

/** 見る人に合わせて加工した状態。見えない宝は null、rocks はその人に見えている岩だけ */
export type TreasureView = Omit<TreasureState, "treasure"> & { treasure: number | null };

const row = (cell: number) => Math.floor(cell / SIZE);
const col = (cell: number) => cell % SIZE;

/** となりのマス。盤の外なら null */
export function neighbor(cell: number, dir: Dir): number | null {
  const [r, c] = [row(cell), col(cell)];
  if (dir === "up") return r > 0 ? cell - SIZE : null;
  if (dir === "down") return r < SIZE - 1 ? cell + SIZE : null;
  if (dir === "left") return c > 0 ? cell - 1 : null;
  if (dir === "right") return c < SIZE - 1 ? cell + 1 : null;
  return null;
}

/** 岩がないときの最短の手数（縦と横のマス数の和） */
export const distance = (a: number, b: number) => Math.abs(row(a) - row(b)) + Math.abs(col(a) - col(b));

/** 岩をよけて from から to へ行く最短の手数。行けなければ null */
export function shortestPath(from: number, to: number, rocks: readonly number[]): number | null {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!;
    if (cell === to) return dist.get(cell)!;
    for (const dir of DIRS) {
      const next = neighbor(cell, dir);
      if (next === null || rocks.includes(next) || dist.has(next)) continue;
      dist.set(next, dist.get(cell)! + 1);
      queue.push(next);
    }
  }
  return null;
}

const CELLS = Array.from({ length: SIZE * SIZE }, (_, i) => i);
const pick = <T>(rng: Rng, list: readonly T[]) => list[Math.floor(rng() * list.length)]!;

/** スタートと宝で囲む長方形の中（2 つのマスは除く）にあるマスか */
const between = (start: number, treasure: number, cell: number) =>
  cell !== start &&
  cell !== treasure &&
  row(cell) >= Math.min(row(start), row(treasure)) &&
  row(cell) <= Math.max(row(start), row(treasure)) &&
  col(cell) >= Math.min(col(start), col(treasure)) &&
  col(cell) <= Math.max(col(start), col(treasure));

/**
 * 遊べる配置か：岩をよけて宝まで行けて、その道が手数の上限より MIN_SLACK 手以上短い。
 * まっすぐ向かうだけでは済まないよう、スタートと宝のあいだに岩が 2 つ以上ある
 */
export function isPlayable(start: number, treasure: number, rocks: readonly number[]): boolean {
  const path = shortestPath(start, treasure, rocks);
  return (
    path !== null && path <= MAX_MOVES - MIN_SLACK && rocks.filter((r) => between(start, treasure, r)).length >= 2
  );
}

/** rng がずっと同じ値を返すなどで遊べる配置が作れなかったときの配置（テストの fixed と同じ形） */
const FALLBACK = { start: 20, treasure: 8, rocks: [3, 11, 13, 15, 16] };

/** スタート・宝・岩を rng で決める。遊べる配置になるまで作り直す */
function makeLayout(rng: Rng) {
  const far = (start: number) => CELLS.filter((c) => {
    const d = distance(start, c);
    return d >= MIN_DISTANCE && d <= MAX_DISTANCE;
  });
  // まん中のマスからは 5 マス以上はなれたマスがないので、スタートにしない
  const starts = CELLS.filter((c) => far(c).length > 0);
  for (let attempt = 0; attempt < 200; attempt++) {
    const start = pick(rng, starts);
    const treasure = pick(rng, far(start));
    // 残りのマスを混ぜて、先頭の ROCKS 個を岩にする（Fisher–Yates の途中まで）
    const rest = CELLS.filter((c) => c !== start && c !== treasure);
    for (let i = 0; i < ROCKS; i++) {
      const j = i + Math.floor(rng() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    const rocks = rest.slice(0, ROCKS).sort((a, b) => a - b);
    if (isPlayable(start, treasure, rocks)) return { start, treasure, rocks };
  }
  return FALLBACK;
}

export const treasure: GameDefinition<TreasureState, TreasureMove> = {
  id: "treasure",

  initialState(rng) {
    const { start, treasure, rocks } = makeLayout(rng);
    return {
      start,
      piece: start,
      treasure,
      rocks: [...rocks],
      found: [],
      steps: [],
      movesLeft: MAX_MOVES,
      turn: 0,
      result: null,
    };
  },

  status(state): GameStatus {
    return state.result
      ? { kind: "finished", winner: null, coop: state.result }
      : { kind: "playing", turn: state.turn };
  },

  applyMove(state, { dir }, seat) {
    if (state.result) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const to = neighbor(state.piece, dir);
    if (to === null) throw new IllegalMoveError("treasure_off_board");

    // 岩のマスへは動けない。ぶつかった岩は 2 人に見えるようになる
    const bumped = state.rocks.includes(to);
    const piece = bumped ? state.piece : to;
    const found = bumped && !state.found.includes(to) ? [...state.found, to] : state.found;
    const movesLeft = state.movesLeft - 1;
    // 最後の 1 手で着いてもクリア
    const result = piece === state.treasure ? "cleared" : movesLeft === 0 ? "failed" : null;
    return {
      ...state,
      piece,
      found,
      steps: [...state.steps, { seat, dir, from: state.piece, bumped }],
      movesLeft,
      turn: other(seat),
      result,
    };
  },

  parseMove(raw) {
    const dir = (raw as { dir?: unknown } | null)?.dir;
    return typeof raw === "object" && DIRS.includes(dir as Dir) ? { dir: dir as Dir } : null;
  },

  viewState(state, viewer, revealAll): TreasureView {
    if (revealAll) return state;
    return {
      ...state,
      treasure: viewer === 0 ? state.treasure : null,
      rocks: viewer === 1 ? state.rocks : state.rocks.filter((r) => state.found.includes(r)),
    };
  },
};
