import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * みずそそぎ：1 つのコップに 2 人が交互に水を注ぐ。注いだ水であふれさせた人の負け。
 * 1 回の手番では「そそぐ」ボタンを 1 回だけ長押しし、押している間だけ水が出る（やり直しはできない）。
 * コップのふちは 200 ml。ふちまではあふれないが、ふちを越えても表面張力でもつことがあり、
 * どこまでもつか（200〜230 ml）はコップごとにちがって、2 人には見えない（終局後に見せる）。
 *
 * 1 回に注ぐ量は 20〜45 ml（短く押しても 20 ml は出て、長く押しても 45 ml で止まる）。
 * 少しずつ注いでしのぐことはできないので、ふちのすぐ下（181〜200 ml）で相手に渡せば、
 * 相手はふちを越えて注ぐしかない。そこをねらい合うのがこのゲームの読みどころ。
 */

/** コップのふち（ml） */
export const RIM = 200;
/** ふちを越えてもつ量の上限。もつ量は RIM〜RIM + MAX_EXTRA のどれか */
export const MAX_EXTRA = 30;
/** 1 回に注ぐ量の下限と上限（ml） */
export const MIN_POUR = 20;
export const MAX_POUR = 45;
/** 押している間に出る水の量（1 秒あたりの ml）。画面の長押しと、相手の手の再生で使う */
export const FLOW_PER_SEC = 20;

export interface PourMove {
  /** 注いだ量（ml）。画面が押していた時間から決めて送る */
  amount: number;
}

/** 1 回分の記録 */
export interface PourEntry {
  seat: Seat;
  amount: number;
}

export interface PourState {
  /** このコップがもつ量。水位がこれを超えたらあふれる。2 人には見せない */
  limit: number;
  /** 今の水位（ml） */
  level: number;
  pours: PourEntry[];
  turn: Seat;
  /** あふれさせた人。まだあふれていなければ null */
  spilledBy: Seat | null;
}

/** 画面に渡す形。もつ量は終局まで null */
export type PourView = Omit<PourState, "limit"> & { limit: number | null };

/** 押していた時間（ミリ秒）から、注いだ量を決める。20〜45 ml の整数におさめる */
export function amountForHold(ms: number): number {
  const raw = Math.round((Math.max(0, ms) * FLOW_PER_SEC) / 1000);
  return Math.min(MAX_POUR, Math.max(MIN_POUR, raw));
}

/** その量が出るまでに押している時間（ミリ秒） */
export const holdMsFor = (amount: number) => (amount * 1000) / FLOW_PER_SEC;

/** ここより上で渡すと、相手はふちを越えて注ぐしかない水位（181 ml） */
const TRAP = RIM - MIN_POUR + 1;

/** lo..hi の整数から rng で 1 つ選ぶ */
const between = (lo: number, hi: number, r: number) => lo + Math.min(hi - lo, Math.floor(r * (hi - lo + 1)));

export const pour: GameDefinition<PourState, PourMove> = {
  id: "pour",

  initialState(rng) {
    return {
      limit: RIM + Math.min(MAX_EXTRA, Math.floor(rng() * (MAX_EXTRA + 1))),
      level: 0,
      pours: [],
      turn: 0,
      spilledBy: null,
    };
  },

  status(state): GameStatus {
    if (state.spilledBy !== null) return { kind: "finished", winner: other(state.spilledBy) };
    return { kind: "playing", turn: state.turn };
  },

  applyMove(state, { amount }, seat) {
    if (state.spilledBy !== null) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!Number.isInteger(amount) || amount < MIN_POUR || amount > MAX_POUR) throw new IllegalMoveError("pour_amount");
    const level = state.level + amount;
    return {
      ...state,
      level,
      pours: [...state.pours, { seat, amount }],
      turn: other(seat),
      spilledBy: level > state.limit ? seat : null,
    };
  },

  parseMove(raw) {
    const amount = (raw as { amount?: unknown } | null)?.amount;
    return typeof amount === "number" && Number.isInteger(amount) ? { amount } : null;
  },

  viewState(state, _viewer, revealAll): PourView {
    return { ...state, limit: revealAll ? state.limit : null };
  },

  viewMove(move) {
    // 注いだ量は水位として 2 人に見えているので加工しない
    return move;
  },

  botMove(view, seat, rng) {
    const v = view as PourView;
    if (v.spilledBy !== null || v.turn !== seat) return null;
    // 注いだあとの水位にできる範囲
    const lo = v.level + MIN_POUR;
    const hi = v.level + MAX_POUR;
    let target: number;
    if (lo > RIM) {
      // ふちを越えるしかないなら、いちばん少なく注ぐ
      target = lo;
    } else if (hi >= TRAP) {
      // ふちのすぐ下に届くなら、ふちを越えない高さで相手に渡す
      target = between(Math.max(lo, TRAP), Math.min(hi, RIM), rng());
    } else {
      // 遠いうちは、半分くらいの割合で「相手にふちのすぐ下をねらわれない高さ」に止める（手加減のため毎回はしない）
      const safeTop = TRAP - MAX_POUR - 1;
      const careful = rng() < 0.5 && lo <= safeTop;
      target = careful ? between(lo, Math.min(hi, safeTop), rng()) : between(lo, hi, rng());
    }
    return { amount: target - v.level };
  },
};
