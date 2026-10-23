import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * はったり三枚（Kuhn poker と同じ仕組み）：カードは 1・2・3 の 3 枚。毎回戦 2 人に 1 枚ずつ配り、
 * 残りの 1 枚は誰も見ない。2 人ともチップを 1 枚ずつ場に出してから、先に動く人が
 * 「上乗せ」（1 枚足す）か「パス」を選ぶ。
 * - パス → 後の人も「上乗せ」か「パス」。両方パスなら見せ合い、大きい方が 1 枚もらう
 * - 上乗せされた人は「受ける」（1 枚足して見せ合い、大きい方が 2 枚もらう）か
 *   「おりる」（上乗せした人が 1 枚もらう。カードは見せない）
 * 先に動く人は回戦ごとに交互。6 回戦でもらったチップの差し引きが多い方の勝ち。
 */

export const CARDS = [1, 2, 3] as const;
export const ROUNDS = 6;

export type BluffAction = "bet" | "pass" | "call" | "fold";
const ACTIONS: readonly BluffAction[] = ["bet", "pass", "call", "fold"];

export interface BluffMove {
  action: BluffAction;
}

export interface Act {
  seat: Seat;
  action: BluffAction;
}

export interface RoundResult {
  /** [先手のカード, 後手のカード] */
  cards: [number, number];
  /** その回戦で指した手（順番どおり） */
  acts: Act[];
  /** 場のチップをもらった人 */
  winner: Seat;
  /** 勝った人が相手からもらったチップの数（1 か 2） */
  won: number;
  /** カードを見せ合ったか（おりたら false） */
  showdown: boolean;
}

export interface BluffState {
  /** 全回戦の配り方。deals[n] = [先手のカード, 後手のカード]。誰にも見せない */
  deals: [number, number][];
  /** 今の回戦で指した手 */
  acts: Act[];
  turn: Seat;
  /** もらったチップの差し引き（2 人の合計はいつも 0） */
  scores: [number, number];
  history: RoundResult[];
}

/** 画面に渡す回戦の結果。見てはいけないカードは null */
export interface RoundView extends Omit<RoundResult, "cards"> {
  cards: [number | null, number | null];
}

/** 画面に渡す形。配り方は渡さず、今の回戦の相手のカードとおりた回戦のカードは伏せる */
export interface BluffView {
  /** 今の回戦（0 から数える）。終局後は ROUNDS */
  round: number;
  /** 今の回戦のカード。見てはいけない分と、終局後は null */
  cards: [number | null, number | null];
  acts: Act[];
  /** 今の回戦でそれぞれが場に出したチップ */
  stakes: [number, number];
  turn: Seat;
  scores: [number, number];
  history: RoundView[];
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 各回戦で先に動く人。公平になるよう交互にする */
export const firstMover = (round: number): Seat => (round % 2 === 0 ? 0 : 1);

/** 今の回戦で選べる手。上乗せされていれば「受ける」か「おりる」、そうでなければ「上乗せ」か「パス」 */
export function legalActions(acts: Act[]): BluffAction[] {
  return acts.at(-1)?.action === "bet" ? ["call", "fold"] : ["bet", "pass"];
}

/** 今の回戦でそれぞれが場に出したチップ。最初の 1 枚に、上乗せ・受けるで 1 枚ずつ足す */
export function stakesOf(acts: Act[]): [number, number] {
  const stakes: [number, number] = [1, 1];
  for (const { seat, action } of acts) if (action === "bet" || action === "call") stakes[seat] += 1;
  return stakes;
}

/** 回戦が終わる手なら、その結果（カードを除く）を返す。続くなら null */
function settle(acts: Act[], cards: [number, number]): Omit<RoundResult, "cards" | "acts"> | null {
  const last = acts.at(-1)!;
  const higher: Seat = cards[0] > cards[1] ? 0 : 1;
  if (last.action === "fold") return { winner: other(last.seat), won: 1, showdown: false };
  if (last.action === "call") return { winner: higher, won: 2, showdown: true };
  if (last.action === "pass" && acts.length === 2) return { winner: higher, won: 1, showdown: true };
  return null;
}

export const bluff: GameDefinition<BluffState, BluffMove> = {
  id: "bluff",

  initialState(rng) {
    return {
      deals: Array.from({ length: ROUNDS }, () => {
        const [a, b] = shuffle(CARDS, rng);
        return [a!, b!];
      }),
      acts: [],
      turn: firstMover(0),
      scores: [0, 0],
      history: [],
    };
  },

  status(state): GameStatus {
    if (state.history.length < ROUNDS) return { kind: "playing", turn: state.turn };
    const [a, b] = state.scores;
    return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
  },

  applyMove(state, { action }, seat) {
    if (state.history.length >= ROUNDS) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!legalActions(state.acts).includes(action)) {
      throw new IllegalMoveError(action === "call" || action === "fold" ? "bluff_no_bet" : "bluff_answer_bet");
    }

    const acts = [...state.acts, { seat, action }];
    const cards = state.deals[state.history.length]!;
    const result = settle(acts, cards);
    if (!result) return { ...state, acts, turn: other(seat) };

    const scores: BluffState["scores"] = [...state.scores];
    scores[result.winner] += result.won;
    scores[other(result.winner)] -= result.won;
    const history = [...state.history, { cards, acts, ...result }];
    return { ...state, acts: [], turn: firstMover(history.length), scores, history };
  },

  parseMove(raw) {
    const action = (raw as { action?: unknown } | null)?.action;
    return ACTIONS.includes(action as BluffAction) ? { action: action as BluffAction } : null;
  },

  viewState(state, viewer, revealAll): BluffView {
    const round = state.history.length;
    const current = state.deals[round];
    const mine = (cards: [number, number], seat: Seat) => (revealAll || seat === viewer ? cards[seat] : null);
    return {
      round,
      cards: current ? [mine(current, 0), mine(current, 1)] : [null, null],
      acts: state.acts,
      stakes: stakesOf(state.acts),
      turn: state.turn,
      scores: state.scores,
      // 見せ合った回戦は両者のカードを公開する。おりた回戦は終局まで自分の分だけ
      history: state.history.map((r) => ({
        ...r,
        cards: r.showdown ? r.cards : [mine(r.cards, 0), mine(r.cards, 1)],
      })),
    };
  },

  viewMove(move) {
    // 上乗せ・パスなどの手は、相手にもそのまま見えている情報なので加工しない
    return move;
  },
};
