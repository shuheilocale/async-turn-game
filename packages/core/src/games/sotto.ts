import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * そっと出し（The Mind に似た協力ゲーム）：1〜30 の札から 2 人に 3 枚ずつ配る。自分の札だけ見える。
 * 2 人で協力して、場に小さい順に全部の札を出しきればクリア。
 * - 手番では「出す」（自分の一番小さい札を場に出す）か「待つ」（出さずに相手に渡す）を選ぶ
 * - 待てるのは 2 人合わせて 4 回まで
 * - 出した札より小さい札を相手が持っていたらミス。ライフが 1 減り、相手のその札はすべて捨てる
 * - ライフは 2 人で 2。0 になったら失敗
 * 手番は 1 手ごとに交互（先手から）。手札がなくなった人の番は飛ばし、相手が続けて出す。
 */

export const MAX_CARD = 30;
export const HAND_SIZE = 3;
export const LIVES = 2;
export const WAITS = 4;

export type SottoAction = "play" | "wait";
const ACTIONS: readonly SottoAction[] = ["play", "wait"];

export interface SottoMove {
  action: SottoAction;
}

/** 誰の札か（場に出した札・捨てた札） */
export interface Placed {
  seat: Seat;
  card: number;
}

/** seat が card を出したとき、相手がまだ持っていた小さい札（missed）。missed は捨てた */
export interface Mistake {
  seat: Seat;
  card: number;
  missed: number[];
}

export interface LastMove {
  seat: Seat;
  action: SottoAction;
  /** 出した札。待ったときは null */
  card: number | null;
  /** この手でミスになって捨てた相手の札。ミスでなければ空 */
  missed: number[];
}

export interface SottoState {
  /** それぞれの手札（小さい順） */
  hands: [number[], number[]];
  /** 場に出した札（出した順。いつも小さい順に並ぶ） */
  pile: Placed[];
  /** ミスで捨てた札（捨てた順） */
  discards: Placed[];
  mistakes: Mistake[];
  lives: number;
  /** 2 人合わせて、あと何回待てるか */
  waits: number;
  turn: Seat;
  last: LastMove | null;
}

/** 画面に渡す形。見てはいけない札は null にする（枚数は分かる） */
export interface SottoView extends Omit<SottoState, "hands"> {
  hands: [(number | null)[], (number | null)[]];
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const ascending = (cards: number[]) => [...cards].sort((a, b) => a - b);

/** 手番の人が選べる手。手札があれば出せる。待つのは回数が残っていて、相手に札があるときだけ */
export function legalActions(s: { hands: [unknown[], unknown[]]; waits: number; turn: Seat }): SottoAction[] {
  const actions: SottoAction[] = [];
  if (s.hands[s.turn].length > 0) actions.push("play");
  if (s.waits > 0 && s.hands[other(s.turn)].length > 0) actions.push("wait");
  return actions;
}

/** seat が指したあとの手番。相手に札がなければ飛ばして seat が続ける */
const nextTurn = (hands: SottoState["hands"], seat: Seat): Seat => (hands[other(seat)].length > 0 ? other(seat) : seat);

export const sotto: GameDefinition<SottoState, SottoMove> = {
  id: "sotto",

  initialState(rng) {
    const deck = shuffle(
      Array.from({ length: MAX_CARD }, (_, i) => i + 1),
      rng,
    );
    return {
      hands: [ascending(deck.slice(0, HAND_SIZE)), ascending(deck.slice(HAND_SIZE, HAND_SIZE * 2))],
      pile: [],
      discards: [],
      mistakes: [],
      lives: LIVES,
      waits: WAITS,
      turn: 0,
      last: null,
    };
  },

  status(state): GameStatus {
    if (state.lives <= 0) return { kind: "finished", winner: null, coop: "failed" };
    if (state.hands.every((h) => h.length === 0)) return { kind: "finished", winner: null, coop: "cleared" };
    return { kind: "playing", turn: state.turn };
  },

  applyMove(state, { action }, seat) {
    if (sotto.status(state).kind === "finished") throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const opp = other(seat);

    if (action === "wait") {
      if (state.waits <= 0) throw new IllegalMoveError("sotto_no_waits");
      if (state.hands[opp].length === 0) throw new IllegalMoveError("sotto_wait_alone");
      return {
        ...state,
        waits: state.waits - 1,
        turn: opp,
        last: { seat, action, card: null, missed: [] },
      };
    }

    const [card, ...rest] = state.hands[seat];
    if (card === undefined) throw new IllegalMoveError("sotto_no_cards");
    // 自分の札は小さい順に出すので、出した札より小さい札が残っているとすれば相手の手札だけ
    const missed = state.hands[opp].filter((c) => c < card);
    const hands: SottoState["hands"] = [[], []];
    hands[seat] = rest;
    hands[opp] = state.hands[opp].filter((c) => c > card);
    const mistake = missed.length > 0;
    return {
      ...state,
      hands,
      pile: [...state.pile, { seat, card }],
      discards: [...state.discards, ...missed.map((c) => ({ seat: opp, card: c }))],
      mistakes: mistake ? [...state.mistakes, { seat, card, missed }] : state.mistakes,
      lives: mistake ? state.lives - 1 : state.lives,
      turn: nextTurn(hands, seat),
      last: { seat, action, card, missed },
    };
  },

  parseMove(raw) {
    const action = (raw as { action?: unknown } | null)?.action;
    return ACTIONS.includes(action as SottoAction) ? { action: action as SottoAction } : null;
  },

  viewState(state, viewer, revealAll): SottoView {
    // 相手の札は枚数だけ見せる。場の札・捨てた札・ミスはもともと 2 人に見えている
    const hand = (seat: Seat) => (revealAll || seat === viewer ? state.hands[seat] : state.hands[seat].map(() => null));
    return { ...state, hands: [hand(0), hand(1)] };
  },
};
