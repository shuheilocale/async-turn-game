import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * わなの扉：扉は 3 つで、くぐってセーフなら 1 点・2 点・3 点がもらえる。
 * 毎回戦、片方が「仕掛ける人」、もう片方が「くぐる人」。仕掛ける人がこっそり 1 つの扉にわなを
 * 仕掛け、くぐる人が扉を 1 つ選んでくぐる。わなならアウト（0 点）、それ以外はセーフでその扉の点。
 * 役は回戦ごとに交代する（1 回戦目は先手が仕掛ける）。くぐった人がそのまま次の回戦で仕掛けるので、
 * 手番は 仕掛け → くぐり・仕掛け → くぐり・仕掛け … と続く。
 * 6 回戦（3 回ずつ仕掛け・くぐる）で、点の合計が多い方の勝ち。同じなら引き分け。
 *
 * どの扉も同じ点だと、でたらめに選ぶのがいちばん良く運だけになる。点に差を付けると、
 * 高い扉ほどわなを仕掛けられやすく、安い扉ほど安全になるので、相手の傾向と点差を読むゲームになる
 */

export const DOORS = 3;
/** 扉ごとの、くぐってセーフだったときの点 */
export const POINTS = [1, 2, 3] as const;
export const ROUNDS = 6;

export interface DoorsMove {
  /** 扉の番号（0・1・2）。仕掛ける人ならわなの扉、くぐる人ならくぐる扉 */
  door: number;
}

export interface RoundResult {
  setter: Seat;
  /** わなを仕掛けた扉 */
  trap: number;
  /** くぐった扉 */
  door: number;
  safe: boolean;
  /** くぐった人がもらった点（アウトなら 0） */
  points: number;
}

export interface DoorsState {
  /** 今の回戦で仕掛けた扉。まだなら null。くぐる人には見せない */
  trap: number | null;
  /** 点の合計 */
  scores: [number, number];
  /** 終わった回戦。今の回戦は history.length（0 から数える） */
  history: RoundResult[];
}

/** 画面に渡す形。今の回戦のわなの扉は、仕掛けた人にしか見せない */
export interface DoorsView {
  /** 今の回戦（0 から数える）。終局後は ROUNDS */
  round: number;
  /** 今の回戦の仕掛ける人（終局後も setterOf(ROUNDS)） */
  setter: Seat;
  turn: Seat;
  /** 今の回戦のわなの扉。見てはいけないとき・まだ仕掛けていないときは null */
  trap: number | null;
  /** 今の回戦で、もう仕掛けたか */
  trapSet: boolean;
  scores: [number, number];
  /** 終わった回戦は、わなの扉もくぐった扉も 2 人に見せる */
  history: RoundResult[];
}

/** 各回戦の仕掛ける人とくぐる人。公平になるよう交互にする */
export const setterOf = (round: number): Seat => (round % 2 === 0 ? 0 : 1);
export const walkerOf = (round: number): Seat => other(setterOf(round));

/** その人がセーフだった回数 */
export const safeCount = (history: RoundResult[], seat: Seat) =>
  history.filter((r, i) => walkerOf(i) === seat && r.safe).length;

const isDoor = (door: unknown): door is number => Number.isInteger(door) && (door as number) >= 0 && (door as number) < DOORS;

const turnOf = (s: DoorsState): Seat => {
  const round = s.history.length;
  return s.trap === null ? setterOf(round) : walkerOf(round);
};

/*
 * コンピュータの読み方。相手がこれまでに仕掛けた扉・くぐった扉の数を、はじめの見込みに足して
 * 「次にどこを選びそうか」を見積もる。見込みは、2 人が最善を尽くしたときの割合に近い値にしてある
 * （仕掛けは高い扉ほど多く、くぐりは 2 点の扉が多い）
 */
const TRAP_GUESS = [0.15, 0.35, 0.5];
const WALK_GUESS = [0.2, 0.45, 0.35];
/** はじめの見込みを、相手の手の何回分と同じ重さで見るか（小さいほど相手の傾向にすぐ乗る） */
const GUESS_WEIGHT = 2;
/** 良さそうな扉をどれだけ強く選ぶか（1 なら良さに比例、大きいほど一番良い扉に寄る） */
const BOT_SHARPNESS = 2;

/** 相手がこれまでに選んだ扉から、次に選ぶ割合を見積もる */
function guessFrom(base: readonly number[], picks: number[]): number[] {
  const counts = base.map((_, d) => picks.filter((p) => p === d).length);
  return base.map((b, d) => (b * GUESS_WEIGHT + counts[d]!) / (GUESS_WEIGHT + picks.length));
}

/** 重みに比例して扉を選ぶ。重みがすべて 0 なら等しく選ぶ */
function pickWeighted(weights: number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const w = total > 0 ? weights : weights.map(() => 1);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let d = 0; d < w.length; d++) {
    r -= w[d]!;
    if (r < 0) return d;
  }
  return w.length - 1;
}

/**
 * くぐる人 walker にとっての扉の値打ち。ふだんは扉の点。最後の回戦は点差で勝ち負けが決まるので、
 * その扉でセーフだったときの結果（勝ち 1・引き分け 0.5・負け 0）にする
 */
function worthFor(v: DoorsView, walker: Seat): number[] {
  if (v.round !== ROUNDS - 1) return [...POINTS];
  const lead = v.scores[walker] - v.scores[other(walker)];
  return POINTS.map((p) => (lead + p > 0 ? 1 : lead + p === 0 ? 0.5 : 0));
}

export const doors: GameDefinition<DoorsState, DoorsMove> = {
  id: "doors",

  initialState() {
    return { trap: null, scores: [0, 0], history: [] };
  },

  status(state): GameStatus {
    if (state.history.length < ROUNDS) return { kind: "playing", turn: turnOf(state) };
    const [a, b] = state.scores;
    return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
  },

  applyMove(state, { door }, seat) {
    const round = state.history.length;
    if (round >= ROUNDS) throw new IllegalMoveError("game_over");
    if (seat !== turnOf(state)) throw new IllegalMoveError("not_your_turn");
    if (!isDoor(door)) throw new IllegalMoveError("doors_no_such_door");

    if (state.trap === null) return { ...state, trap: door };

    // くぐったので結果を出す
    const safe = door !== state.trap;
    const points = safe ? POINTS[door]! : 0;
    const scores: DoorsState["scores"] = [...state.scores];
    scores[seat] += points;
    return {
      trap: null,
      scores,
      history: [...state.history, { setter: setterOf(round), trap: state.trap, door, safe, points }],
    };
  },

  parseMove(raw) {
    const door = (raw as { door?: unknown } | null)?.door;
    return isDoor(door) ? { door } : null;
  },

  viewState(state, viewer, revealAll): DoorsView {
    const round = state.history.length;
    const setter = setterOf(round);
    return {
      round,
      setter,
      turn: turnOf(state),
      trap: revealAll || viewer === setter ? state.trap : null,
      trapSet: state.trap !== null,
      scores: state.scores,
      history: state.history,
    };
  },

  viewMove(move, mover, viewer) {
    // 手だけでは仕掛けかくぐりか分からないので、相手の手はすべて伏せる（どちらも回戦の結果で公開される）
    return mover === viewer ? move : { door: null };
  },

  botMove(view, seat, rng) {
    const v = view as DoorsView;
    if (v.round >= ROUNDS || v.turn !== seat) return null;
    const opp = other(seat);
    // 相手がこれまでに仕掛けた扉・くぐった扉（自分が見てきた回戦の結果だけを使う）
    const theirTraps = v.history.filter((r) => r.setter === opp).map((r) => r.trap);
    const theirWalks = v.history.filter((r) => r.setter === seat).map((r) => r.door);

    if (v.setter === seat) {
      // 仕掛ける：相手がくぐりそうで、くぐられると痛い扉をねらう
      const walk = guessFrom(WALK_GUESS, theirWalks);
      const worth = worthFor(v, opp);
      return { door: pickWeighted(walk.map((q, d) => (q * worth[d]!) ** BOT_SHARPNESS), rng) };
    }
    // くぐる：わながありそうな扉を避けつつ、点の高い扉をねらう
    const trap = guessFrom(TRAP_GUESS, theirTraps);
    const worth = worthFor(v, seat);
    return { door: pickWeighted(trap.map((p, d) => (worth[d]! * (1 - p)) ** BOT_SHARPNESS), rng) };
  },
};
