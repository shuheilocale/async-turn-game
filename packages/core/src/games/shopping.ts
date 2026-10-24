import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * ブランド爆買いオークション：2 人とも 1000 万円を持って始める。品物が 1 つずつ競りにかけられ、
 * 2 人は「こっそり」金額を入札する（10 万円きざみ、0 円でもよい）。高い方が自分の入札額を払って手に入れる。
 * 同じ金額なら、だれも払わずに次の品物とセットで競りにかける（最後の品物なら売れ残り）。
 * 品物は 4 つのシリーズに分かれていて、1 局には各シリーズから 2 品ずつ、全部で 8 品が出る。
 * どの 8 品が出るかは最初から見えるが、出る順番は伏せる。
 * 終わったら「品物の点数＋そろえたシリーズのボーナス＋残ったお金（100 万円で 1 点）」が多い方の勝ち。
 * 同点なら残ったお金が多い方の勝ち。
 *
 * 金額は「万円」の整数で持つ（350 = 350 万円）。画面では言語に合わせて書き方だけを変える
 */

export const SERIES = ["fashion", "jewelry", "beauty", "treat"] as const;
export type Series = (typeof SERIES)[number];

/** 品物。カタログ（画面に並べる順）もこの順。ブランド名は使わず、特徴の分かる名前にする（文言は画面側） */
export const ITEMS = {
  chainbag: { series: "fashion", points: 6 },
  trunk: { series: "fashion", points: 5 },
  heels: { series: "fashion", points: 3 },
  ring: { series: "jewelry", points: 7 },
  watch: { series: "jewelry", points: 5 },
  necklace: { series: "jewelry", points: 4 },
  perfume: { series: "beauty", points: 3 },
  clinic: { series: "beauty", points: 4 },
  nail: { series: "beauty", points: 2 },
  massage: { series: "treat", points: 4 },
  spa: { series: "treat", points: 5 },
  tapioca: { series: "treat", points: 2 },
} as const satisfies Record<string, { series: Series; points: number }>;
export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** 1 局に出る、シリーズごとの品物の数。そろえるとボーナス */
export const PER_SERIES = 2;
/** 1 局に出る品物の数 */
export const LOTS = SERIES.length * PER_SERIES;
/** はじめの予算（万円） */
export const BUDGET = 1000;
/** 入札のきざみ（万円） */
export const STEP = 10;
/** 同じシリーズを PER_SERIES 品そろえたときのボーナス */
export const SET_BONUS = 3;
/** 残ったお金を点に直すとき、何万円で 1 点か（端数は切り捨て） */
export const MONEY_PER_POINT = 100;

export interface ShoppingMove {
  /** 入札額（万円） */
  bid: number;
}

export interface LotResult {
  /** 競りにかけた品物（同額で持ち越した品物があれば先頭に入る） */
  items: ItemId[];
  bids: [number, number];
  /** 落札した人。同額なら null */
  winner: Seat | null;
}

type Bids = [number | null, number | null];

export interface ShoppingState {
  /** これから競りにかける品物の順番。先頭が今の品物。相手にも自分にも見せない */
  deck: ItemId[];
  /** 今日の出品（8 品、カタログ順）。どれが出るかはみんなに見せる */
  catalog: ItemId[];
  /** 同額で持ち越され、今の品物とセットで売る品物。終局後に残っていれば売れ残り */
  carried: ItemId[];
  /** 今の品物への入札。まだなら null */
  bids: Bids;
  /** 残りの予算（万円） */
  budgets: [number, number];
  /** 手に入れた品物（手に入れた順） */
  owned: [ItemId[], ItemId[]];
  turn: Seat;
  history: LotResult[];
}

/** 画面に渡す形。出品の順番と、相手の今の入札額は隠す */
export interface ShoppingView {
  catalog: ItemId[];
  /** 今競りにかけている品物。終局後は null */
  current: ItemId | null;
  carried: ItemId[];
  /** まだ出ていない品物（今の品物は除く。順番は伏せてカタログ順） */
  upcoming: ItemId[];
  budgets: [number, number];
  owned: [ItemId[], ItemId[]];
  /** 自分の入札は金額、相手の入札は「出したかどうか」だけ */
  bids: [number | boolean | null, number | boolean | null];
  turn: Seat;
  history: LotResult[];
}

export interface Score {
  /** 品物の点数の合計 */
  items: number;
  /** そろえたシリーズ */
  sets: Series[];
  bonus: number;
  /** 残ったお金を点に直したもの */
  money: number;
  total: number;
}

const SEATS: Seat[] = [0, 1];

const seriesOf = (id: ItemId): Series => ITEMS[id].series;
const pointsOf = (items: readonly ItemId[]) => items.reduce((a, id) => a + ITEMS[id].points, 0);
const countOf = (items: readonly ItemId[], series: Series) => items.filter((id) => seriesOf(id) === series).length;

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 各品物で先に入札する人。公平になるよう交互にする */
export const firstBidder = (lot: number): Seat => (lot % 2 === 0 ? 0 : 1);

/** 手に入れた品物と残りの予算から点数を出す */
export function scoreOf(owned: readonly ItemId[], budget: number): Score {
  const items = pointsOf(owned);
  const sets = SERIES.filter((series) => countOf(owned, series) >= PER_SERIES);
  const bonus = sets.length * SET_BONUS;
  const money = Math.floor(budget / MONEY_PER_POINT);
  return { items, sets, bonus, money, total: items + bonus + money };
}

/** 2 人の入札がそろったので、落札を決めて次の品物へ進める */
function settle(state: ShoppingState, bids: [number, number]): ShoppingState {
  const items = [...state.carried, state.deck[0]!];
  const winner: Seat | null = bids[0] === bids[1] ? null : bids[0] > bids[1] ? 0 : 1;
  const budgets: ShoppingState["budgets"] = [...state.budgets];
  const owned: ShoppingState["owned"] = [[...state.owned[0]], [...state.owned[1]]];
  if (winner !== null) {
    budgets[winner] -= bids[winner];
    owned[winner].push(...items);
  }
  const history = [...state.history, { items, bids, winner }];
  return {
    ...state,
    deck: state.deck.slice(1),
    // 同額ならだれも払わず、次の品物とセットにする。最後の品物ならそのまま売れ残り
    carried: winner === null ? items : [],
    bids: [null, null],
    budgets,
    owned,
    turn: firstBidder(history.length),
    history,
  };
}

/**
 * 入札がそろうまで進める。予算が 0 円の人は 0 円で入札したことにする（入札できる金額がほかにないので、
 * 待たせない）。2 人ともそろったら落札を決めて、次の品物でも同じことをくり返す
 */
function advance(state: ShoppingState): ShoppingState {
  let s = state;
  while (s.deck.length > 0) {
    const bids: Bids = [...s.bids];
    for (const seat of SEATS) if (bids[seat] === null && s.budgets[seat] === 0) bids[seat] = 0;
    if (bids[0] === null || bids[1] === null) {
      const first = firstBidder(s.history.length);
      return { ...s, bids, turn: bids[first] === null ? first : other(first) };
    }
    s = settle(s, bids as [number, number]);
  }
  return s;
}

/** コンピュータの入札のゆらぎ（計画した金額の前後どれだけずらすか） */
const BOT_WOBBLE = 0.15;
/** 相手の入札を見積もれたとき、それをどれだけ上回る金額で買いに行くか */
const BOT_OUTBID = 1.2;
/** コンピュータが、残りの品物の値打ちのうちどれだけを手持ちのお金で買うつもりで入札するか */
const BOT_SHARE = 0.7;
/** まだだれも持っていないシリーズの品物に、ボーナスのうちどれだけを見込むか（もう 1 品もあとで買えるとは限らない） */
const BOT_LATER = 0.75;

/**
 * seat から見た、今の競り（セット売りなら全部）の値打ち。品物の点数に、シリーズのボーナスの見込みを足す。
 * 自分のシリーズがそろう・相手のシリーズがそろうのを止めるならボーナスまるごと、
 * まだだれも持っていないシリーズで、もう 1 品があとで出るなら BOT_LATER の割合
 */
function lotWorth(v: ShoppingView, seat: Seat, lot: ItemId[]): number {
  let worth = pointsOf(lot);
  for (const series of SERIES) {
    const n = countOf(lot, series);
    if (n === 0) continue;
    if (countOf(v.owned[seat], series) + n >= PER_SERIES) worth += SET_BONUS;
    else if (countOf(v.owned[other(seat)], series) > 0) worth += SET_BONUS;
    else if (countOf(v.upcoming, series) > 0) worth += SET_BONUS * BOT_LATER;
  }
  return worth;
}

/**
 * 相手のこれまでの入札（結果で公開された金額）から、今の競りへの入札額を見積もる。
 * 「予算のうち何割を出したか」を「残りの点数のうち何割の品物だったか」で割って相手の気前のよさとし、
 * 今の品物にあてはめる。まだ手がかりがなければ null
 */
function guessBid(v: ShoppingView, seat: Seat, lot: ItemId[]): number | null {
  const opp = other(seat);
  let budget = BUDGET;
  let left = pointsOf(v.catalog);
  let spent = 0;
  let share = 0;
  for (const r of v.history) {
    const points = pointsOf(r.items);
    // 予算 0 円で自動で入った 0 円は、相手が選んだ金額ではないので数えない
    if (budget > 0 && left > 0) {
      spent += r.bids[opp] / budget;
      share += points / left;
    }
    if (r.winner === opp) budget -= r.bids[opp];
    if (r.winner !== null) left -= points;
  }
  if (share === 0) return null;
  const nowLeft = pointsOf(lot) + pointsOf(v.upcoming);
  return (spent / share) * v.budgets[opp] * (pointsOf(lot) / nowLeft);
}

export const shopping: GameDefinition<ShoppingState, ShoppingMove> = {
  id: "shopping",

  initialState(rng) {
    // シリーズごとに 3 品から 2 品を選び、8 品の順番を決める
    const picked = SERIES.flatMap((series) =>
      shuffle(
        ITEM_IDS.filter((id) => seriesOf(id) === series),
        rng,
      ).slice(0, PER_SERIES),
    );
    const deck = shuffle(picked, rng);
    return {
      deck,
      catalog: ITEM_IDS.filter((id) => deck.includes(id)),
      carried: [],
      bids: [null, null],
      budgets: [BUDGET, BUDGET],
      owned: [[], []],
      turn: firstBidder(0),
      history: [],
    };
  },

  status(state): GameStatus {
    if (state.deck.length > 0) return { kind: "playing", turn: state.turn };
    const [a, b] = SEATS.map((seat) => scoreOf(state.owned[seat], state.budgets[seat]).total) as [number, number];
    if (a !== b) return { kind: "finished", winner: a > b ? 0 : 1 };
    const [m0, m1] = state.budgets;
    return { kind: "finished", winner: m0 === m1 ? null : m0 > m1 ? 0 : 1 };
  },

  applyMove(state, { bid }, seat) {
    if (state.deck.length === 0) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!Number.isInteger(bid) || bid < 0 || bid % STEP !== 0) throw new IllegalMoveError("shopping_bad_bid");
    if (bid > state.budgets[seat]) throw new IllegalMoveError("shopping_over_budget");
    const bids: Bids = [...state.bids];
    bids[seat] = bid;
    return advance({ ...state, bids });
  },

  parseMove(raw) {
    const bid = (raw as { bid?: unknown } | null)?.bid;
    return Number.isInteger(bid) ? { bid: bid as number } : null;
  },

  viewState(state, viewer, revealAll): ShoppingView {
    const hide = (seat: Seat) => (revealAll || seat === viewer ? state.bids[seat] : state.bids[seat] !== null);
    const rest = state.deck.slice(1);
    return {
      catalog: state.catalog,
      current: state.deck[0] ?? null,
      carried: state.carried,
      upcoming: ITEM_IDS.filter((id) => rest.includes(id)),
      budgets: state.budgets,
      owned: state.owned,
      bids: [hide(0), hide(1)],
      turn: state.turn,
      history: state.history,
    };
  },

  viewMove(move, mover, viewer) {
    // 入札額は結果（history）で公開される。手の記録では相手の分は伏せる
    return mover === viewer ? move : { bid: null };
  },

  botMove(view, seat, rng) {
    const v = view as ShoppingView;
    if (v.current === null || v.turn !== seat || v.bids[seat] !== null) return null;
    const mine = v.budgets[seat];
    const theirs = v.budgets[other(seat)];
    if (mine === 0) return { bid: 0 };
    const lot = [...v.carried, v.current];
    const worth = lotWorth(v, seat, lot);
    // 残りの値打ちの 7 割くらいを手持ちのお金で買う計画で、今の競りの分を割り当てる
    const total = worth + v.upcoming.reduce((a, id) => a + ITEMS[id].points + SET_BONUS * BOT_LATER, 0);
    let plan = (worth / total / BOT_SHARE) * mine * (1 + (rng() * 2 - 1) * BOT_WOBBLE);
    // 相手がいつも安く入札しているなら、それを少し上回るだけにする（様子見されてもお金を使いすぎない）。
    // 最後の品物は、相手も残りを全部出してくるかもしれないので見積もらない
    const guess = v.upcoming.length > 0 ? guessBid(v, seat, lot) : null;
    if (guess !== null && guess * BOT_OUTBID < plan) plan = guess * BOT_OUTBID + STEP * (1 + rng());
    // 相手の予算より 10 万円多ければ必ず勝てる。点数より多く（お金を点に直して）は払わない
    const cap = Math.floor(Math.min(mine, theirs + STEP, worth * MONEY_PER_POINT) / STEP) * STEP;
    return { bid: Math.max(STEP, Math.min(cap, Math.round(plan / STEP) * STEP)) };
  },
};
