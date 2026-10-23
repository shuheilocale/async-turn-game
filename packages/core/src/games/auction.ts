import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * 数字のせり：毎ラウンド 1 枚の得点カードがめくられ、2 人は手札（1〜9）から
 * 1 枚ずつ「こっそり」出す。大きい数字を出した方が得点カードをもらう。
 * 同じ数字なら得点カードは次のラウンドに持ち越し。出したカードは戻らない。
 * 9 ラウンド後、得点の合計が多い方の勝ち。
 */

export const CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface AuctionMove {
  card: number;
}

export interface RoundResult {
  prizes: number[];
  bids: [number, number];
  winner: Seat | null;
}

export interface AuctionState {
  hands: [number[], number[]];
  /** これから出る得点カードの順番。先頭が今のラウンドの分。相手にも自分にも見せない */
  deck: number[];
  /** 引き分けで持ち越された得点カード */
  carried: number[];
  /** 今のラウンドで出したカード。出していなければ null */
  bids: [number | null, number | null];
  scores: [number, number];
  turn: Seat;
  history: RoundResult[];
}

/** 画面に渡す形。山札の順番と相手の今の入札は隠す */
export interface AuctionView {
  hands: [number[], number[]];
  /** 今のラウンドの得点カード（終局後は null） */
  current: number | null;
  /** まだ出ていない得点カード（順番は伏せて小さい順） */
  remaining: number[];
  carried: number[];
  /** 自分の入札は数字、相手の入札は「出したかどうか」だけ */
  bids: [number | boolean | null, number | boolean | null];
  scores: [number, number];
  turn: Seat;
  history: RoundResult[];
}

function shuffle(cards: number[], rng: Rng): number[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 各ラウンドで先に出す人。公平になるよう交互にする */
const firstBidder = (round: number): Seat => (round % 2 === 0 ? 0 : 1);

/** コンピュータが出すカードの位置のゆらぎ（手札の並びで前後どれだけずれるか） */
const BOT_WOBBLE = 1.5;

export const auction: GameDefinition<AuctionState, AuctionMove> = {
  id: "auction",

  initialState(rng) {
    return {
      hands: [[...CARDS], [...CARDS]],
      deck: shuffle(CARDS, rng),
      carried: [],
      bids: [null, null],
      scores: [0, 0],
      turn: 0,
      history: [],
    };
  },

  status(state): GameStatus {
    if (state.deck.length > 0) return { kind: "playing", turn: state.turn };
    const [a, b] = state.scores;
    return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
  },

  applyMove(state, { card }, seat) {
    if (state.deck.length === 0) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!state.hands[seat].includes(card)) throw new IllegalMoveError("card_not_in_hand");

    const hands: AuctionState["hands"] = [[...state.hands[0]], [...state.hands[1]]];
    hands[seat] = hands[seat].filter((c) => c !== card);
    const bids: AuctionState["bids"] = [...state.bids];
    bids[seat] = card;

    if (bids[other(seat)] === null) return { ...state, hands, bids, turn: other(seat) };

    // 2 人とも出したので結果を出す
    const [b0, b1] = bids as [number, number];
    const prizes = [...state.carried, state.deck[0]!];
    const winner: Seat | null = b0 === b1 ? null : b0 > b1 ? 0 : 1;
    const scores: AuctionState["scores"] = [...state.scores];
    if (winner !== null) scores[winner] += prizes.reduce((a, b) => a + b, 0);
    const history = [...state.history, { prizes, bids: [b0, b1] as [number, number], winner }];
    return {
      hands,
      deck: state.deck.slice(1),
      // 最後のラウンドで引き分けた得点カードは誰のものにもならない
      carried: winner === null ? prizes : [],
      bids: [null, null],
      scores,
      turn: firstBidder(history.length),
      history,
    };
  },

  parseMove(raw) {
    const card = (raw as { card?: unknown } | null)?.card;
    return Number.isInteger(card) ? { card: card as number } : null;
  },

  viewState(state, viewer, revealAll): AuctionView {
    const visible = (seat: Seat) => revealAll || seat === viewer;
    const hide = (seat: Seat) => (visible(seat) ? state.bids[seat] : state.bids[seat] !== null);
    // 相手の手札から今の入札を引き算で当てられないよう、結果が出るまで出したカードも手札に見せる
    const hand = (seat: Seat) => {
      const bid = state.bids[seat];
      return visible(seat) || bid === null ? state.hands[seat] : [...state.hands[seat], bid].sort((a, b) => a - b);
    };
    return {
      hands: [hand(0), hand(1)],
      current: state.deck[0] ?? null,
      remaining: [...state.deck.slice(1)].sort((a, b) => a - b),
      carried: state.carried,
      bids: [hide(0), hide(1)],
      scores: state.scores,
      turn: state.turn,
      history: state.history,
    };
  },

  viewMove(move, mover, viewer) {
    // 出したカードはラウンドの結果（history）で公開される。手の記録では相手の分は伏せる
    return mover === viewer ? move : { card: null };
  },

  botMove(view, seat, rng) {
    const v = view as AuctionView;
    if (v.current === null || v.turn !== seat) return null;
    const hand = [...v.hands[seat]].sort((a, b) => a - b);
    // 手札と残りの得点カードは同じ枚数。今の得点（持ち越し込み）が残りの得点カードの中で何番目かに合わせて、
    // 手札の同じくらいの位置のカードを、前後に少しゆらして出す
    const prize = v.current + v.carried.reduce((a, b) => a + b, 0);
    const rank = [v.current, ...v.remaining].filter((p) => p < prize).length;
    const at = Math.round(rank + (rng() * 2 - 1) * BOT_WOBBLE);
    return { card: hand[Math.min(Math.max(at, 0), hand.length - 1)]! };
  },
};
