import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * ふうせん：1 つの風船を 2 人が交互にふくらませる。割った人の負け。
 * 1 回の手番では風船を 1〜5 回タップして、その回数だけ空気を入れる（「これで決定」で確定）。
 * 風船は 12〜32 回目のどこかで割れ、何回目かは 2 人には見えない（終局後に見せる）。
 *
 * 1 人 5 回ずつ、合わせて 10 手ふくらませて割れなければ、空気を多く入れた方の勝ち（同じなら引き分け）。
 * 毎回 1 回ずつ入れて逃げていると最後に負けるので、どこまで攻めるかを相手と読み合う。
 */

/** 1 回の手番でふくらませる回数の下限と上限 */
export const MIN_TAPS = 1;
export const MAX_TAPS = 5;
/** 2 人合わせた手数。ここまで割れなければ空気の多さで決める */
export const TURNS = 10;
/** 割れる回数の範囲（この回数目の空気で割れる） */
export const BURST_MIN = 12;
export const BURST_MAX = 32;

export interface BalloonMove {
  /** タップした回数 */
  taps: number;
}

/** 1 手分の記録 */
export interface Puff {
  seat: Seat;
  taps: number;
}

export interface BalloonState {
  /** 合わせて何回目の空気で割れるか。2 人には見せない */
  burstAt: number;
  /** 今までに入った空気（2 人の合計） */
  air: number;
  puffs: Puff[];
  turn: Seat;
  /** 割った人。まだ割れていなければ null */
  poppedBy: Seat | null;
}

/** 画面に渡す形。割れる回数は終局まで null */
export type BalloonView = Omit<BalloonState, "burstAt"> & { burstAt: number | null };

/** その人が入れた空気の合計 */
export const airOf = (puffs: readonly Puff[], seat: Seat) =>
  puffs.reduce((sum, p) => (p.seat === seat ? sum + p.taps : sum), 0);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const balloon: GameDefinition<BalloonState, BalloonMove> = {
  id: "balloon",

  initialState(rng) {
    const span = BURST_MAX - BURST_MIN + 1;
    return {
      burstAt: BURST_MIN + Math.min(span - 1, Math.floor(rng() * span)),
      air: 0,
      puffs: [],
      turn: 0,
      poppedBy: null,
    };
  },

  status(state): GameStatus {
    if (state.poppedBy !== null) return { kind: "finished", winner: other(state.poppedBy) };
    if (state.puffs.length < TURNS) return { kind: "playing", turn: state.turn };
    const [a, b] = [airOf(state.puffs, 0), airOf(state.puffs, 1)];
    return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
  },

  applyMove(state, { taps }, seat) {
    if (state.poppedBy !== null || state.puffs.length >= TURNS) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!Number.isInteger(taps) || taps < MIN_TAPS || taps > MAX_TAPS) throw new IllegalMoveError("balloon_taps");
    const air = state.air + taps;
    return {
      ...state,
      air,
      puffs: [...state.puffs, { seat, taps }],
      turn: other(seat),
      poppedBy: air >= state.burstAt ? seat : null,
    };
  },

  parseMove(raw) {
    const taps = (raw as { taps?: unknown } | null)?.taps;
    return typeof taps === "number" && Number.isInteger(taps) ? { taps } : null;
  },

  viewState(state, _viewer, revealAll): BalloonView {
    return { ...state, burstAt: revealAll ? state.burstAt : null };
  },

  viewMove(move) {
    // ふくらませた回数は風船の大きさとして 2 人に見えているので加工しない
    return move;
  },

  botMove(view, seat, rng) {
    const v = view as BalloonView;
    if (v.poppedBy !== null || v.puffs.length >= TURNS || v.turn !== seat) return null;
    const mine = airOf(v.puffs, seat);
    const theirs = airOf(v.puffs, other(seat));
    // 最後の手番：相手をちょうど 1 回上回るだけ入れる（届かなければ引き分けをねらう）
    if (v.puffs.length === TURNS - 1) {
      const need = theirs - mine + 1;
      return { taps: clamp(need <= MAX_TAPS ? need : need - 1, MIN_TAPS, MAX_TAPS) };
    }
    // まだ割れないと分かっている回数。そのうちは多めに入れる
    const free = BURST_MIN - 1 - v.air;
    if (free >= MAX_TAPS) return { taps: 3 + Math.min(2, Math.floor(rng() * 3)) };
    if (free > 0) return { taps: free };
    // 割れるかもしれないところでは控えめに。遅れていたら少し多め、終わりが近いほど取り返しに行く
    const behind = theirs - mine;
    const late = TURNS - v.puffs.length <= 4;
    const taps = 1 + Math.floor(rng() * 2) + (behind > 0 ? 1 : 0) + (late && behind > 2 ? 1 : 0);
    return { taps: clamp(taps, MIN_TAPS, MAX_TAPS) };
  },
};
