import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";
import { isInput, type Input } from "./sensor.ts";

/**
 * かたむけコロコロ：穴のあいた小さな迷路の板を傾けて、玉をスタートからゴールまで転がす。かかった時間が短い方が勝ち。3 回戦。
 * 回戦ごとの迷路は、はじめに rng で候補（MAZES）から選んでおく（2 人とも同じ迷路、同じ迷路は 1 局に 1 回まで）。
 * 先に挑戦する人は回戦ごとに交代する（1 回戦目は先手）。先に挑戦した人のタイムは、相手が挑戦し終わるまで相手に伏せる。
 *
 * 玉の動きは画面が計算する（端末の傾き。センサーを使えなければ画面のスティック）。穴に落ちたらスタートに戻り、時計は止まらない。
 * 画面が測ったタイム（ミリ秒）と落ちた回数を送り、ここでは範囲だけ確かめる。MAX_MS でゴールできなければ時間切れ（MAX_MS）。
 * タイムが短い方がその回戦の勝ち（同じなら引き分け）。多く勝った方の勝ち。同じなら 3 回戦のタイムの合計が短い方、
 * それも同じなら引き分け。2 回戦で 2 勝したら、3 回戦はせずにそこで決着する。
 *
 * やり直しを防ぐため、スタートは「始めた」手としてサーバに記録してから時間を測る。始めたままタイムが届かなかった挑戦
 * （画面を開き直した など）は「失敗扱い」の手で閉じ、いちばん悪いタイム（MAX_MS）として数える。
 */

export const ROUNDS = 3;
/** 送れるタイムの範囲（ミリ秒）。画面は MAX_MS で自動で止める（時間切れ） */
export const MIN_MS = 1000;
export const MAX_MS = 60_000;
/** 送れる「穴に落ちた回数」の上限 */
export const MAX_FALLS = 99;

/** 板の大きさ（縦長）。座標は左上が (0, 0)、右下が (BOARD_W, BOARD_H) */
export const BOARD_W = 100;
export const BOARD_H = 140;
/** 玉・穴・ゴールの半径。玉の中心が穴（ゴール）の円に入ったら落ちる（ゴール） */
export const BALL_R = 3.4;
export const HOLE_R = 4.8;
export const GOAL_R = 6;

/** 長方形の壁 [左, 上, 幅, 高さ] と、点 [x, y] */
export type Rect = [number, number, number, number];
export type Point = [number, number];

export interface Maze {
  /** 板の中の壁（板の外まわりには、いつも壁がある） */
  walls: Rect[];
  /** 穴の中心 */
  holes: Point[];
  start: Point;
  goal: Point;
  /** コンピュータが目安にするタイム（ミリ秒）。ふつうの人がだいたいこのくらいでゴールする */
  par: number;
}

/**
 * 迷路の候補。壁の厚さは 3。道は玉が 3 つ並ぶくらいの幅にして、穴は道のはしに寄せて置く
 * （どの迷路も、穴をよけてゴールまで行けることを tilt.test.ts で確かめている）
 */
export const MAZES: Maze[] = [
  // 0: ジグザグ。左上から、右の切れ目・左の切れ目と下りて、右下のゴールへ
  {
    walls: [
      [0, 44, 72, 3],
      [28, 92, 72, 3],
    ],
    holes: [
      [44, 24],
      [86, 30],
      [58, 70],
      [18, 78],
      [44, 118],
      [72, 104],
    ],
    start: [12, 14],
    goal: [86, 124],
    par: 11_000,
  },
  // 1: まんなかの箱。ゴールは箱の中で、入り口は下だけ。すぐ下に穴があるので、まず横へ
  {
    walls: [
      [28, 44, 44, 3],
      [28, 44, 3, 56],
      [69, 44, 3, 56],
      [28, 97, 14, 3],
      [58, 97, 14, 3],
    ],
    holes: [
      [50, 30],
      [12, 56],
      [88, 80],
      [26, 122],
      [50, 124],
      [74, 122],
      [37, 86],
      [63, 58],
    ],
    start: [50, 12],
    goal: [50, 66],
    par: 10_000,
  },
  // 2: へび。縦の壁を上・下・上と回りこむ。穴は道の左右に交互に寄せてある
  {
    walls: [
      [24, 0, 3, 108],
      [49, 32, 3, 108],
      [74, 0, 3, 108],
    ],
    holes: [
      [19, 64],
      [31, 60],
      [25.5, 128],
      [69, 48],
      [57, 86],
      [75.5, 132],
      [82, 60],
    ],
    start: [12, 12],
    goal: [88, 16],
    par: 20_000,
  },
  // 3: 穴の原っぱ。まんなかの門をくぐって、穴のあいだを抜けて下のゴールへ
  {
    walls: [
      [0, 68, 32, 3],
      [68, 68, 32, 3],
    ],
    holes: [
      [24, 30],
      [76, 30],
      [50, 42],
      [36, 58],
      [64, 58],
      [44, 90],
      [68, 98],
      [28, 108],
      [56, 114],
      [80, 124],
      [24, 130],
    ],
    start: [50, 12],
    goal: [50, 130],
    par: 9_000,
  },
  // 4: うずまき。外側をぐるりと回って左の入り口から中へ入り、仕切りの右から下へ回りこむ
  {
    walls: [
      [0, 30, 83, 3],
      [80, 30, 3, 83],
      [20, 110, 63, 3],
      [20, 58, 3, 55],
      [23, 60, 40, 3],
    ],
    holes: [
      [66, 20],
      [92, 128],
      [56, 130],
      [8, 132],
      [44, 40],
      [72, 96],
      [56, 80],
    ],
    start: [40, 14],
    goal: [36, 88],
    par: 20_000,
  },
  // 5: ふたまた。左は近いけれど穴だらけ、右は穴が少ないけれど遠回り
  {
    walls: [
      [48, 22, 4, 96],
      [52, 46, 34, 3],
      [66, 74, 34, 3],
      [52, 100, 34, 3],
    ],
    holes: [
      [24, 40],
      [10, 66],
      [36, 72],
      [22, 98],
      [38, 110],
      [92, 88],
    ],
    start: [50, 10],
    goal: [50, 130],
    par: 9_000,
  },
];

export type TiltMove =
  /** 挑戦を始める */
  | { kind: "start" }
  /** ゴールした（または時間切れ）。ms はスタートからの時間（画面で測ったミリ秒）、falls は穴に落ちた回数 */
  | { kind: "finish"; ms: number; falls: number; input: Input }
  /** 始めたままタイムが届かなかった挑戦を、失敗扱いで閉じる */
  | { kind: "fail" };

/** 1 人の挑戦の結果。ms が null なら失敗扱い（MAX_MS として数える） */
export interface Try {
  ms: number | null;
  falls: number;
  /** どちらで遊んだか。失敗扱いなら null */
  input: Input | null;
}

export interface Round {
  /** MAZES の何番目か */
  maze: number;
  /** 先に挑戦する人 */
  first: Seat;
  /** 席ごとの結果。まだ挑戦していなければ null */
  tries: [Try | null, Try | null];
  /** スタートして、まだゴールしていない人 */
  running: Seat | null;
}

export interface TiltState {
  /** 3 回戦の迷路（MAZES の何番目か）。はじめに決めておく */
  mazes: number[];
  /** これまでの回戦と、今の回戦（最後）。決着したら最後の回戦も終わっている */
  rounds: Round[];
  turn: Seat;
}

/** 画面に渡す形の結果。相手に伏せている間は "hidden" */
export type TryView = Try | "hidden" | null;
export type RoundView = Omit<Round, "tries"> & { tries: [TryView, TryView] };
export interface TiltView {
  mazes: number[];
  rounds: RoundView[];
  turn: Seat;
}

/** 数えるときのタイム。失敗扱いは MAX_MS（時間切れと同じ、いちばん悪いタイム） */
export const timeOf = (t: Try) => t.ms ?? MAX_MS;

/** 時間切れだったか（ゴールできなかった） */
export const timedOut = (t: Try) => t.ms !== null && t.ms >= MAX_MS;

/** 2 人とも挑戦し終わった回戦か */
const isDone = (r: Round | RoundView) => r.tries[0] !== null && r.tries[1] !== null;

/** 回戦の結果。終わっていない回戦（伏せてある回戦）なら null */
export function roundResult(r: Round | RoundView): { times: [number, number]; winner: Seat | null } | null {
  const [a, b] = r.tries;
  if (a === null || b === null || a === "hidden" || b === "hidden") return null;
  const times: [number, number] = [timeOf(a), timeOf(b)];
  return { times, winner: times[0] === times[1] ? null : times[0] < times[1] ? 0 : 1 };
}

/** 終わった回戦の勝ち数と、タイムの合計（ミリ秒） */
export function tally(rounds: readonly (Round | RoundView)[]) {
  const wins: [number, number] = [0, 0];
  const times: [number, number] = [0, 0];
  for (const r of rounds) {
    const res = roundResult(r);
    if (!res) continue;
    if (res.winner !== null) wins[res.winner]++;
    times[0] += res.times[0];
    times[1] += res.times[1];
  }
  return { wins, times };
}

/** 回戦が終わったあと、残りの回戦で勝ち数が逆転も並びもしなければ決着 */
function decided(rounds: readonly Round[]) {
  const { wins } = tally(rounds);
  return rounds.length >= ROUNDS || Math.abs(wins[0] - wins[1]) > ROUNDS - rounds.length;
}

/** i 回戦目（0 から）で先に挑戦する人。1 回戦目は先手、あとは交代 */
export const firstOf = (i: number): Seat => (i % 2 === 0 ? 0 : 1);

const newRound = (state: Pick<TiltState, "mazes">, i: number): Round => ({
  maze: state.mazes[i]!,
  first: firstOf(i),
  tries: [null, null],
  running: null,
});

const isMs = (ms: number) => Number.isInteger(ms) && ms >= MIN_MS && ms <= MAX_MS;
const isFalls = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_FALLS;

/** 標準正規分布の乱数（ボックス＝ミュラー法）。1 - rng() で 0 の対数を避ける */
const gaussian = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/**
 * コンピュータのタイム。迷路の目安に人間らしいばらつき（2 割ほど）を掛け、ときどき穴に落ちて
 * スタートからやり直した分を足す。1/100 秒に丸める
 */
function botRun(maze: Maze, rng: Rng): { ms: number; falls: number } {
  const r = rng();
  const falls = r < 0.55 ? 0 : r < 0.85 ? 1 : r < 0.96 ? 2 : 3;
  let ms = maze.par * Math.exp(Math.max(-2.5, Math.min(2.5, gaussian(rng))) * 0.2);
  for (let i = 0; i < falls; i++) ms += maze.par * (0.25 + 0.35 * rng());
  return { ms: Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms / 10) * 10)), falls };
}

export const tilt: GameDefinition<TiltState, TiltMove> = {
  id: "tilt",

  initialState(rng) {
    // 候補を rng で並べ替えて、はじめの 3 つを使う（同じ迷路は出ない）
    const order = MAZES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const mazes = order.slice(0, ROUNDS);
    return { mazes, rounds: [newRound({ mazes }, 0)], turn: 0 };
  },

  status(state): GameStatus {
    const last = state.rounds.at(-1)!;
    if (!isDone(last)) return { kind: "playing", turn: state.turn };
    const { wins, times } = tally(state.rounds);
    // 勝ち数が多い方。同じならタイムの合計が短い方。それも同じなら引き分け
    const winner: Seat | null =
      wins[0] !== wins[1] ? (wins[0] > wins[1] ? 0 : 1) : times[0] !== times[1] ? (times[0] < times[1] ? 0 : 1) : null;
    return { kind: "finished", winner };
  },

  applyMove(state, move, seat) {
    const r = state.rounds.at(-1)!;
    if (isDone(r)) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const rounds = state.rounds.slice(0, -1);

    if (move.kind === "start") {
      if (r.running !== null) throw new IllegalMoveError("tilt_running");
      return { ...state, rounds: [...rounds, { ...r, running: seat }] };
    }

    if (r.running !== seat) throw new IllegalMoveError("tilt_not_started");
    let result: Try;
    if (move.kind === "finish") {
      if (!isMs(move.ms)) throw new IllegalMoveError("tilt_ms");
      if (!isFalls(move.falls)) throw new IllegalMoveError("tilt_falls");
      if (!isInput(move.input)) throw new IllegalMoveError("bad_move");
      result = { ms: move.ms, falls: move.falls, input: move.input };
    } else {
      result = { ms: null, falls: 0, input: null };
    }
    const tries: Round["tries"] = [...r.tries];
    tries[seat] = result;
    const done: Round = { ...r, tries, running: null };
    // 相手がまだなら相手の番。2 人とも終わったら、決着していなければ次の回戦（先に挑戦する人が交代）
    if (tries[other(seat)] === null) return { ...state, rounds: [...rounds, done], turn: other(seat) };
    const finished = [...rounds, done];
    if (decided(finished)) return { ...state, rounds: finished };
    const next = newRound(state, finished.length);
    return { ...state, rounds: [...finished, next], turn: next.first };
  },

  parseMove(raw) {
    const m = raw as { kind?: unknown; ms?: unknown; falls?: unknown; input?: unknown } | null;
    if (typeof m !== "object" || m === null) return null;
    if (m.kind === "start") return { kind: "start" };
    if (m.kind === "fail") return { kind: "fail" };
    if (m.kind === "finish" && Number.isInteger(m.ms) && Number.isInteger(m.falls) && isInput(m.input)) {
      return { kind: "finish", ms: m.ms as number, falls: m.falls as number, input: m.input };
    }
    return null;
  },

  viewState(state, viewer, revealAll): TiltView {
    if (revealAll) return state;
    return {
      ...state,
      // 終わっていない回戦では、自分以外の結果を伏せる（失敗扱いだったかどうかも）
      rounds: state.rounds.map((r) =>
        isDone(r)
          ? r
          : { ...r, tries: [0, 1].map((s) => (s === viewer || r.tries[s] === null ? r.tries[s] : "hidden")) as RoundView["tries"] },
      ),
    };
  },

  viewMove(move, mover, viewer) {
    // タイムは回戦の結果（rounds）で公開されるので、手の記録では相手の分を伏せる
    return move.kind === "start" || mover === viewer ? move : { kind: "finish", ms: null, falls: null, input: null };
  },

  botMove(view, seat, rng) {
    const v = view as TiltView;
    const r = v.rounds.at(-1);
    if (!r || isDone(r) || v.turn !== seat || r.tries[seat] !== null) return null;
    if (r.running !== seat) return { kind: "start" };
    return { kind: "finish", ...botRun(MAZES[r.maze]!, rng), input: "motion" };
  },
};
