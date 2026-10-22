import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * ヒット＆ブロー：お互いに秘密の 3 桁の数字（同じ数字は使わない）を決め、
 * 交互に相手の数字を当てる。位置も数字も合えば「ヒット」、数字だけ合えば「ブロー」。
 * 先手が当てても後手にもう 1 回だけ機会があり、両方当てたら引き分け。
 */

export const DIGITS = 3;
/** 1 人あたりの最大回数。両者とも当てられなければ引き分け */
export const MAX_GUESSES = 10;

export type HitBlowMove = { kind: "secret"; value: string } | { kind: "guess"; value: string };

export interface Guess {
  value: string;
  hit: number;
  blow: number;
}

export interface HitBlowState {
  phase: "setup" | "guess" | "done";
  /** 相手には見せない。viewState で隠す */
  secrets: [string | null, string | null];
  /** guesses[s] = s が相手の数字に対して行った推測 */
  guesses: [Guess[], Guess[]];
  turn: Seat;
  winner: Seat | null;
}

/** 相手から見えるように加工した状態。相手の秘密の数字は null、決めたかどうかだけ分かる */
export type HitBlowView = Omit<HitBlowState, "secrets"> & {
  secrets: [string | null, string | null];
  secretSet: [boolean, boolean];
};

export const isValidNumber = (v: string) => new RegExp(`^\\d{${DIGITS}}$`).test(v) && new Set(v).size === DIGITS;

export function judge(secret: string, guess: string): { hit: number; blow: number } {
  let hit = 0;
  let blow = 0;
  for (let i = 0; i < DIGITS; i++) {
    if (guess[i] === secret[i]) hit++;
    else if (secret.includes(guess[i]!)) blow++;
  }
  return { hit, blow };
}

const solved = (guesses: Guess[]) => guesses.some((g) => g.hit === DIGITS);

export const hitblow: GameDefinition<HitBlowState, HitBlowMove> = {
  id: "hitblow",

  initialState() {
    return { phase: "setup", secrets: [null, null], guesses: [[], []], turn: 0, winner: null };
  },

  status(state): GameStatus {
    return state.phase === "done" ? { kind: "finished", winner: state.winner } : { kind: "playing", turn: state.turn };
  },

  applyMove(state, move, seat) {
    if (state.phase === "done") throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!isValidNumber(move.value)) throw new IllegalMoveError("bad_number");

    if (state.phase === "setup") {
      if (move.kind !== "secret") throw new IllegalMoveError("bad_move");
      const secrets: HitBlowState["secrets"] = [...state.secrets];
      secrets[seat] = move.value;
      // 先手→後手の順に決め、そろったら先手から推測をはじめる
      return seat === 0
        ? { ...state, secrets, turn: 1 }
        : { ...state, secrets, phase: "guess", turn: 0 };
    }

    if (move.kind !== "guess") throw new IllegalMoveError("bad_move");
    const result = judge(state.secrets[other(seat)]!, move.value);
    const guesses: HitBlowState["guesses"] = [[...state.guesses[0]], [...state.guesses[1]]];
    guesses[seat].push({ value: move.value, ...result });

    // 先手が推測したら必ず後手の番（同じ回数ずつ推測できるように）。後手の推測で 1 巡が終わる
    if (seat === 0) return { ...state, guesses, turn: 1 };
    const [solved0, solved1] = [solved(guesses[0]), solved(guesses[1])];
    if (solved0 || solved1 || guesses[1].length >= MAX_GUESSES) {
      const winner = solved0 === solved1 ? null : solved0 ? 0 : 1;
      return { ...state, guesses, phase: "done", winner };
    }
    return { ...state, guesses, turn: 0 };
  },

  parseMove(raw) {
    const { kind, value } = (raw ?? {}) as Record<string, unknown>;
    if ((kind !== "secret" && kind !== "guess") || typeof value !== "string") return null;
    return { kind, value };
  },

  viewState(state, viewer, revealAll): HitBlowView {
    const show = (seat: Seat) => (revealAll || viewer === seat ? state.secrets[seat] : null);
    return {
      ...state,
      secrets: [show(0), show(1)],
      secretSet: [state.secrets[0] !== null, state.secrets[1] !== null],
    };
  },

  viewMove(move, mover, viewer) {
    return move.kind === "secret" && mover !== viewer ? { kind: "secret", value: null } : move;
  },
};
