import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  BUDGET,
  firstBidder,
  ITEM_IDS,
  ITEMS,
  LOTS,
  MONEY_PER_POINT,
  PER_SERIES,
  scoreOf,
  SERIES,
  SET_BONUS,
  shopping,
  STEP,
  type ItemId,
  type ShoppingMove,
  type ShoppingState,
  type ShoppingView,
} from "./shopping.ts";

/** 出品の順番を決めた状態を作る */
function withDeck(deck: ItemId[], patch: Partial<ShoppingState> = {}): ShoppingState {
  const s = shopping.initialState(Math.random);
  const catalog = ITEM_IDS.filter((id) => deck.includes(id));
  return { ...s, deck, catalog, ...patch };
}

/** [席, 金額] の順に入札する */
function play(s: ShoppingState, bids: [Seat, number][]): ShoppingState {
  return bids.reduce((st, [seat, bid]) => shopping.applyMove(st, { bid }, seat), s);
}

const view = (s: ShoppingState, viewer: Seat | null, revealAll = false) =>
  shopping.viewState!(s, viewer, revealAll) as ShoppingView;

/** よく使う 8 品（各シリーズ 2 品ずつ） */
const DECK: ItemId[] = ["ring", "tapioca", "chainbag", "nail", "watch", "massage", "trunk", "perfume"];

/** 同じ種から同じ並びを返す乱数 */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("shopping", () => {
  describe("品物とはじめの状態", () => {
    it("品物はシリーズごとに 3 つずつ。点数は 2〜7", () => {
      for (const series of SERIES) expect(ITEM_IDS.filter((id) => ITEMS[id].series === series)).toHaveLength(3);
      for (const id of ITEM_IDS) expect(ITEMS[id].points).toBeGreaterThanOrEqual(2);
      for (const id of ITEM_IDS) expect(ITEMS[id].points).toBeLessThanOrEqual(7);
    });

    it("2 人とも同じ予算。各シリーズから 2 品ずつ、全部で 8 品が出品される", () => {
      const s = shopping.initialState(Math.random);
      expect(s.budgets).toEqual([BUDGET, BUDGET]);
      expect(s.deck).toHaveLength(LOTS);
      expect(new Set(s.deck).size).toBe(LOTS);
      for (const series of SERIES) expect(s.deck.filter((id) => ITEMS[id].series === series)).toHaveLength(PER_SERIES);
      // カタログは同じ 8 品をカタログ順に並べたもの
      expect(s.catalog).toEqual(ITEM_IDS.filter((id) => s.deck.includes(id)));
      expect(s.owned).toEqual([[], []]);
      expect(s.bids).toEqual([null, null]);
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("どの品物が出るかと順番は rng で決まる", () => {
      // 常に 0.999… なら並びは変わらず、各シリーズの先頭 2 品がカタログ順に出る
      expect(shopping.initialState(() => 0.9999).deck).toEqual([
        "chainbag",
        "trunk",
        "ring",
        "watch",
        "perfume",
        "clinic",
        "massage",
        "spa",
      ]);
      const a = shopping.initialState(seeded(1)).deck;
      const b = shopping.initialState(seeded(2)).deck;
      expect(a).not.toEqual(b);
      expect(shopping.initialState(seeded(1)).deck).toEqual(a);
    });
  });

  describe("伏せる情報", () => {
    it("出品の順番は見せない。今の品物と、まだ出ていない品物（カタログ順）だけ", () => {
      const s = withDeck(DECK);
      for (const viewer of [0, 1, null] as const) {
        const v = view(s, viewer);
        expect(v).not.toHaveProperty("deck");
        expect(v.current).toBe("ring");
        expect(v.upcoming).toEqual(ITEM_IDS.filter((id) => DECK.slice(1).includes(id)));
        expect(v.upcoming).not.toContain("ring");
        expect(v.catalog).toEqual(ITEM_IDS.filter((id) => DECK.includes(id)));
      }
    });

    it("先に入札した人の金額は伏せて預かる。相手には「入札したか」だけ見える", () => {
      const s = play(withDeck(DECK), [[0, 350]]);
      expect(s.bids).toEqual([350, null]);
      expect(view(s, 0).bids).toEqual([350, false]);
      expect(view(s, 1).bids).toEqual([true, null]);
      expect(view(s, null).bids).toEqual([true, false]);
      // 予算は落札するまで減らないので、残りの予算からも金額は分からない
      expect(view(s, 1).budgets).toEqual([BUDGET, BUDGET]);
      expect(shopping.viewMove!({ bid: 350 }, 0, 1)).toEqual({ bid: null });
      expect(shopping.viewMove!({ bid: 350 }, 0, null)).toEqual({ bid: null });
      expect(shopping.viewMove!({ bid: 350 }, 0, 0)).toEqual({ bid: 350 });
    });

    it("2 人とも入札したら見せ合い、金額は結果（history）に残る", () => {
      const s = play(withDeck(DECK), [
        [0, 350],
        [1, 200],
      ]);
      expect(view(s, 1).history).toEqual([{ items: ["ring"], bids: [350, 200], winner: 0 }]);
      // 次の品物の入札はまだ（相手の分は「まだ出していない」= false）
      expect(view(s, 1).bids).toEqual([false, null]);
    });

    it("終局後は全部見せる", () => {
      let s = withDeck(DECK);
      for (let i = 0; i < LOTS; i++) {
        const first = shopping.status(s);
        if (first.kind !== "playing") break;
        s = shopping.applyMove(s, { bid: 10 }, first.turn);
        const second = shopping.status(s);
        if (second.kind !== "playing") break;
        s = shopping.applyMove(s, { bid: 20 }, second.turn);
      }
      expect(shopping.status(s).kind).toBe("finished");
      const v = view(s, 0, true);
      expect(v.current).toBeNull();
      expect(v.upcoming).toEqual([]);
      expect(v.history.map((r) => r.items[0])).toEqual(DECK);
      expect(v.history.every((r) => r.bids.every((b) => typeof b === "number"))).toBe(true);
    });
  });

  describe("入札の範囲", () => {
    it("10 万円きざみで、0 円から残りの予算まで", () => {
      const s = withDeck(DECK);
      expect(() => shopping.applyMove(s, { bid: 0 }, 0)).not.toThrow();
      expect(() => shopping.applyMove(s, { bid: BUDGET }, 0)).not.toThrow();
      expect(() => shopping.applyMove(s, { bid: STEP }, 0)).not.toThrow();
      expect(() => shopping.applyMove(s, { bid: 15 }, 0)).toThrow("shopping_bad_bid");
      expect(() => shopping.applyMove(s, { bid: -10 }, 0)).toThrow("shopping_bad_bid");
      expect(() => shopping.applyMove(s, { bid: 2.5 }, 0)).toThrow("shopping_bad_bid");
      expect(() => shopping.applyMove(s, { bid: BUDGET + STEP }, 0)).toThrow("shopping_over_budget");
    });

    it("払ったあとは、残りの予算までしか入札できない", () => {
      const s = play(withDeck(DECK), [
        [0, 700],
        [1, 100],
      ]);
      // 2 品目は後手から
      const t = play(s, [[1, 500]]);
      expect(() => shopping.applyMove(t, { bid: 310 }, 0)).toThrow("shopping_over_budget");
      expect(() => shopping.applyMove(t, { bid: 300 }, 0)).not.toThrow();
    });
  });

  describe("落札と支払い", () => {
    it("高い方が自分の入札額を払って品物を手に入れる。負けた方は払わない", () => {
      const s = play(withDeck(DECK), [
        [0, 350],
        [1, 400],
      ]);
      expect(s.owned).toEqual([[], ["ring"]]);
      expect(s.budgets).toEqual([BUDGET, BUDGET - 400]);
      expect(s.deck).toEqual(DECK.slice(1));
      expect(s.carried).toEqual([]);
    });

    it("0 円でも、相手が 0 円でなければ負け。相手が 0 円なら 10 万円で買える", () => {
      const s = play(withDeck(DECK), [
        [0, 0],
        [1, 10],
      ]);
      expect(s.owned[1]).toEqual(["ring"]);
      expect(s.budgets[1]).toBe(BUDGET - 10);
    });
  });

  describe("同額のとき", () => {
    it("だれも払わず、次の品物とセットで競りにかける", () => {
      let s = play(withDeck(DECK), [
        [0, 300],
        [1, 300],
      ]);
      expect(s.budgets).toEqual([BUDGET, BUDGET]);
      expect(s.carried).toEqual(["ring"]);
      expect(s.history[0]).toEqual({ items: ["ring"], bids: [300, 300], winner: null });
      const v = view(s, 0);
      expect(v.current).toBe("tapioca");
      expect(v.carried).toEqual(["ring"]);
      // セットを落札すると 2 品とも手に入る
      s = play(s, [
        [1, 500],
        [0, 450],
      ]);
      expect(s.owned[1]).toEqual(["ring", "tapioca"]);
      expect(s.budgets).toEqual([BUDGET, BUDGET - 500]);
      expect(s.carried).toEqual([]);
      expect(s.history[1]!.items).toEqual(["ring", "tapioca"]);
    });

    it("最後の品物で同額なら、だれのものにもならない（売れ残り）", () => {
      let s = withDeck(["spa"], { catalog: ["spa"] });
      s = play(s, [
        [0, 200],
        [1, 200],
      ]);
      expect(shopping.status(s).kind).toBe("finished");
      expect(s.owned).toEqual([[], []]);
      expect(s.budgets).toEqual([BUDGET, BUDGET]);
      expect(view(s, 0, true).carried).toEqual(["spa"]);
    });
  });

  describe("点数とボーナス", () => {
    it("品物の点数＋そろえたシリーズのボーナス＋残ったお金（100 万円で 1 点、端数は切り捨て）", () => {
      expect(scoreOf([], BUDGET)).toEqual({ items: 0, sets: [], bonus: 0, money: BUDGET / MONEY_PER_POINT, total: 10 });
      const sc = scoreOf(["ring", "watch", "tapioca"], 390);
      expect(sc.items).toBe(ITEMS.ring.points + ITEMS.watch.points + ITEMS.tapioca.points);
      expect(sc.sets).toEqual(["jewelry"]);
      expect(sc.bonus).toBe(SET_BONUS);
      expect(sc.money).toBe(3);
      expect(sc.total).toBe(sc.items + SET_BONUS + 3);
    });

    it("シリーズが違えばボーナスはない。2 シリーズそろえば 2 回分", () => {
      expect(scoreOf(["ring", "chainbag", "nail", "spa"], 0).bonus).toBe(0);
      const two = scoreOf(["nail", "perfume", "massage", "tapioca"], 0);
      expect(two.sets).toEqual(["beauty", "treat"]);
      expect(two.bonus).toBe(2 * SET_BONUS);
    });
  });

  describe("勝敗", () => {
    it("点数の合計が多い方の勝ち", () => {
      // 先手は指輪と腕時計（7 + 5 + ボーナス 3）を 900 万円で、後手はタピオカを 10 万円で
      const s = withDeck([], {
        owned: [["ring", "watch"], ["tapioca"]],
        budgets: [100, 990],
      });
      expect(scoreOf(s.owned[0], s.budgets[0]).total).toBe(16);
      expect(scoreOf(s.owned[1], s.budgets[1]).total).toBe(11);
      expect(shopping.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("同点なら残ったお金が多い方の勝ち。それも同じなら引き分け", () => {
      // どちらも 7 点。先手は 0 点＋ 790 万円、後手は指輪（7 点）＋ 0 万円 → 先手の勝ち
      const byMoney = withDeck([], { owned: [[], ["ring"]], budgets: [790, 0] });
      expect(shopping.status(byMoney)).toEqual({ kind: "finished", winner: 0 });
      const draw = withDeck([], { owned: [["ring"], ["ring"]], budgets: [50, 50] });
      expect(shopping.status(draw)).toEqual({ kind: "finished", winner: null });
    });

    it("8 品すべて競りが終わったら終局。そのあとは入札できない", () => {
      let s = withDeck(DECK);
      while (shopping.status(s).kind === "playing") {
        const st = shopping.status(s) as { turn: Seat };
        s = shopping.applyMove(s, { bid: st.turn === 0 ? 30 : 20 }, st.turn);
      }
      expect(s.history).toHaveLength(LOTS);
      expect(s.owned[0]).toEqual(DECK);
      expect(() => shopping.applyMove(s, { bid: 0 }, 0)).toThrow("game_over");
    });
  });

  describe("手番", () => {
    it("先に入札する人は品物ごとに交代（1 品目は先手）。結果を出した人が続けて次の品物に入札する", () => {
      expect([0, 1, 2, 3].map(firstBidder)).toEqual([0, 1, 0, 1]);
      let s = withDeck(DECK);
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [[0, 100]]);
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [[1, 50]]);
      // 2 品目は後手から。1 品目の結果を出した後手が、続けて入札する
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [[1, 50]]);
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("手番でない人は入札できない", () => {
      const s = withDeck(DECK);
      expect(() => shopping.applyMove(s, { bid: 10 }, 1)).toThrow(IllegalMoveError);
      expect(() => shopping.applyMove(s, { bid: 10 }, 1)).toThrow("not_your_turn");
      const t = play(s, [[0, 10]]);
      expect(() => shopping.applyMove(t, { bid: 10 }, 0)).toThrow("not_your_turn");
    });

    it("予算が 0 円になった人は、自動で 0 円の入札になる（相手だけが入札する）", () => {
      // 先手が全額で 1 品目を買う。2 品目は後手から入札し、先手の 0 円と比べてすぐ結果が出る
      let s = play(withDeck(DECK), [
        [0, BUDGET],
        [1, 990],
      ]);
      expect(s.budgets[0]).toBe(0);
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [[1, 10]]);
      expect(s.owned[1]).toEqual(["tapioca"]);
      expect(s.history[1]!.bids).toEqual([0, 10]);
      // 3 品目は先手からの番だが、予算がないので後手の番になる
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 1 });
      expect(view(s, 1).bids).toEqual([true, null]);
    });

    it("2 人とも予算が 0 円になったら、残りは売れ残りで終局する", () => {
      const s = play(withDeck(DECK), [
        [0, BUDGET],
        [1, 990],
        [1, BUDGET],
      ]);
      expect(s.budgets).toEqual([0, 0]);
      expect(shopping.status(s).kind).toBe("finished");
      expect(s.owned).toEqual([["ring"], ["tapioca"]]);
      expect(view(s, 0, true).carried).toEqual(DECK.slice(2));
    });
  });

  describe("parseMove", () => {
    it("整数の金額だけを手として読む（範囲は applyMove で確かめる）", () => {
      expect(shopping.parseMove({ bid: 120 })).toEqual({ bid: 120 });
      expect(shopping.parseMove({ bid: 0 })).toEqual({ bid: 0 });
      expect(shopping.parseMove({ bid: -10 })).toEqual({ bid: -10 });
      expect(shopping.parseMove({ bid: "120" })).toBeNull();
      expect(shopping.parseMove({ bid: 1.5 })).toBeNull();
      expect(shopping.parseMove({})).toBeNull();
      expect(shopping.parseMove(null)).toBeNull();
      expect(shopping.parseMove(42)).toBeNull();
    });
  });

  describe("コンピュータ", () => {
    const bot = (s: ShoppingState, seat: Seat, rng: Rng = Math.random) =>
      shopping.botMove!(view(s, seat), seat, rng) as ShoppingMove | null;

    it("10 万円きざみで、残りの予算の範囲で入札する。自分の番でなければ null", () => {
      for (let game = 0; game < 30; game++) {
        const rng = seeded(game);
        let s = shopping.initialState(rng);
        while (shopping.status(s).kind === "playing") {
          const { turn } = shopping.status(s) as { turn: Seat };
          expect(bot(s, turn === 0 ? 1 : 0, rng)).toBeNull();
          const move = bot(s, turn, rng)!;
          expect(move.bid % STEP).toBe(0);
          expect(move.bid).toBeGreaterThanOrEqual(0);
          expect(move.bid).toBeLessThanOrEqual(s.budgets[turn]);
          s = shopping.applyMove(s, move, turn);
        }
        expect(bot(s, 0, rng)).toBeNull();
      }
    });

    it("見てよい形（相手の入札は伏せたまま）だけで選ぶ", () => {
      const s = play(withDeck(DECK), [[0, 990]]);
      const v = view(s, 1);
      expect(v.bids[0]).toBe(true);
      expect(shopping.botMove!(v, 1, () => 0.5)).toEqual(shopping.botMove!(view(play(withDeck(DECK), [[0, 0]]), 1), 1, () => 0.5));
    });

    it("相手の予算が 0 円なら、10 万円で買いに行く", () => {
      const s = play(withDeck(DECK), [
        [0, BUDGET],
        [1, 0],
      ]);
      expect(bot(s, 1, () => 0.5)).toEqual({ bid: STEP });
    });

    it("最後の品物には、相手の予算より 10 万円多く（届かなければ全額）入れる", () => {
      const last = withDeck(["spa"], { budgets: [300, 120], catalog: ["spa"] });
      expect(bot(last, 0, () => 0.5)).toEqual({ bid: 130 });
      const poor = withDeck(["spa"], { budgets: [100, 400], catalog: ["spa"] });
      expect(bot(poor, 0, () => 0.5)).toEqual({ bid: 100 });
    });

    it("値打ちのある品物ほど高く入札する", () => {
      const ring = withDeck(["ring", ...DECK.filter((id) => id !== "ring")]);
      const tapioca = withDeck(["tapioca", ...DECK.filter((id) => id !== "tapioca")]);
      expect(bot(ring, 0, () => 0.5)!.bid).toBeGreaterThan(bot(tapioca, 0, () => 0.5)!.bid);
    });

    it("相手がずっと安く入札していたら、安く買いに行く（様子見に付き合わない）", () => {
      // 後手が 0 円で見送り続けた後の 4 品目（後手が先に 0 円を入れて、先手の番）
      let s = withDeck(DECK);
      s = play(s, [
        [0, 200],
        [1, 0],
        [1, 0],
        [0, 120],
        [0, 150],
        [1, 0],
        [1, 0],
      ]);
      expect(shopping.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(bot(s, 0, () => 0.5)!.bid).toBeLessThanOrEqual(3 * STEP);
      // 最初の品物（相手のくせがまだ分からない）なら、もっと高く入れる
      expect(bot(withDeck(DECK.slice(3)), 0, () => 0.5)!.bid).toBeGreaterThan(3 * STEP);
    });
  });

  describe("点数の釣り合い（コンピュータ同士で確かめる）", () => {
    type Strategy = (v: ShoppingView, seat: Seat, rng: Rng) => number;
    const botBid: Strategy = (v, seat, rng) => (shopping.botMove!(v, seat, rng) as ShoppingMove).bid;
    /** 毎回 0 円で様子見する・毎回 10 万円だけ出す・最初の品物に全額を出す・いちばん点の高い品物に全額を出す */
    const naive: Record<string, Strategy> = {
      zero: () => 0,
      minimum: () => STEP,
      allInFirst: (v, seat) => (v.history.length === 0 ? v.budgets[seat] : 0),
      allInBest: (v, seat) => {
        const best = Math.max(...[v.current!, ...v.upcoming].map((id) => ITEMS[id].points));
        return ITEMS[v.current!].points === best ? v.budgets[seat] : 0;
      },
    };

    /** a と b で 1 局遊び、終局の状態を返す */
    function match(a: Strategy, b: Strategy, rng: Rng): ShoppingState {
      let s = shopping.initialState(rng);
      for (;;) {
        const st = shopping.status(s);
        if (st.kind === "finished") return s;
        const bid = (st.turn === 0 ? a : b)(view(s, st.turn), st.turn, rng);
        s = shopping.applyMove(s, { bid: Math.min(bid, s.budgets[st.turn]) }, st.turn);
      }
    }

    it.each(Object.keys(naive))("コンピュータは %s のやり方に 40 局とも勝つ（先手・後手を入れ替えて）", (name) => {
      for (let game = 0; game < 40; game++) {
        const botSeat: Seat = game % 2 === 0 ? 0 : 1;
        const end =
          botSeat === 0 ? match(botBid, naive[name]!, seeded(game)) : match(naive[name]!, botBid, seeded(game));
        expect(shopping.status(end)).toEqual({ kind: "finished", winner: botSeat });
      }
    });

    it("コンピュータ同士なら先手と後手の勝ちはほぼ半々", () => {
      const wins = [0, 0];
      for (let game = 0; game < 200; game++) {
        const st = shopping.status(match(botBid, botBid, seeded(1000 + game)));
        if (st.kind === "finished" && st.winner !== null) wins[st.winner]!++;
      }
      expect(wins[0]).toBeGreaterThan(70);
      expect(wins[1]).toBeGreaterThan(70);
    });
  });
});
