import { describe, expect, it } from "vitest";
import { botMove } from "./bot.ts";
import { games } from "./index.ts";
import { other, type GameDefinition, type Rng, type Seat } from "./types.ts";
import { othello, SIZE as OTHELLO_SIZE, type Cell as OthelloCell } from "./games/othello.ts";
import { bridge } from "./games/bridge.ts";
import { gobble } from "./games/gobble.ts";
import {
  candidatesFor,
  hitblow,
  isValidNumber,
  judge,
  type HitBlowMove,
  type HitBlowState,
  type HitBlowView,
} from "./games/hitblow.ts";
import { auction, type AuctionState } from "./games/auction.ts";
import { bluff, ROUNDS, type BluffAction, type BluffState } from "./games/bluff.ts";

/** 同じ種から同じ並びを返す乱数（mulberry32）。失敗したときに同じ対局を再現できるようにする */
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

/** これを超えても終わらなければ、終局しないとみなす */
const MAX_PLIES = 500;

/** コンピュータ同士で最後まで遊ぶ。続けて指すゲームもあるので、指す人は status().turn に従う */
function selfPlay<S, M>(def: GameDefinition<S, M>, rng: Rng, onMove?: (state: S, seat: Seat, move: M) => void): S {
  let state = def.initialState(rng);
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const st = def.status(state);
    if (st.kind === "finished") return state;
    const move = botMove(def, state, st.turn, rng);
    if (move === null) throw new Error(`${def.id}: ${ply} 手目でコンピュータが手を選べなかった`);
    onMove?.(state, st.turn, move);
    state = def.applyMove(state, move, st.turn);
  }
  throw new Error(`${def.id}: ${MAX_PLIES} 手で終わらなかった`);
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** 盤面が全部見えるゲームの、形の上でありうる手すべて（このうち applyMove で通るものが指せる手） */
const everyMove: Record<string, unknown[]> = {
  tictactoe: range(9).map((index) => ({ index })),
  fading: range(9).map((index) => ({ index })),
  gobble: [
    ...range(3).flatMap((size) => range(9).map((to) => ({ from: { kind: "hand", size }, to }))),
    ...range(9).flatMap((index) => range(9).map((to) => ({ from: { kind: "board", index }, to }))),
  ],
  nim: range(4).flatMap((row) => range(7).map((i) => ({ row, count: i + 1 }))),
  tateyoko: range(25).map((cell) => ({ cell })),
  bridge: [...range(25).map((cell) => ({ cell })), { swap: true }],
  connect4: range(7).map((col) => ({ col })),
  tapioca: range(5).flatMap((col) => [
    { col, piece: "pearl" },
    { col, piece: "ice" },
  ]),
  boxes: range(24).map((edge) => ({ edge })),
  othello: range(64).map((i) => ({ row: Math.floor(i / 8), col: i % 8 })),
  korokoro: range(16).map((to) => ({ to })),
};
const fullInfo = Object.keys(everyMove);
const hidden = ["hitblow", "auction", "bluff", "pour", "pourhard", "balloon", "stopwatch", "quickdraw", "freehand", "doors", "memory", "tsubo", "shopping", "soda", "tilt"];

/** 盤面は全部見えるが、人間らしくまちがえるように botMove で手を選ぶゲーム */
const humanlike = ["chain"];
/** 盤面は全部見えるが、手が多すぎるので legalMoves の代わりに botMove で手を選ぶゲーム */
const simulated = ["artillery"];

const keys = (moves: unknown[]) => moves.map((m) => JSON.stringify(m)).sort();

describe("盤面が全部見えるゲームの手の一覧（legalMoves）", () => {
  it("盤面が全部見えるゲームは legalMoves を、隠す情報があるゲームは botMove を持つ", () => {
    for (const id of fullInfo) expect(games[id]!.legalMoves, id).toBeTypeOf("function");
    for (const id of [...hidden, ...humanlike]) expect(games[id]!.botMove, id).toBeTypeOf("function");
  });

  it.each(fullInfo)("%s: 手はすべて applyMove で通り、通る手はもれなく入っている。手番でない席・終局後は空", (id) => {
    const def = games[id]!;
    for (let game = 0; game < 5; game++) {
      const end = selfPlay(def, seeded(100 + game), (state, seat) => {
        const moves = def.legalMoves!(state, seat);
        const accepted = everyMove[id]!.filter((m) => {
          try {
            def.applyMove(state, m, seat);
            return true;
          } catch {
            return false;
          }
        });
        expect(keys(moves)).toEqual(keys(accepted));
        // 画面やサーバから送り直しても同じ手として読める
        for (const m of moves) expect(def.parseMove(JSON.parse(JSON.stringify(m)))).toEqual(m);
        expect(def.legalMoves!(state, other(seat))).toEqual([]);
      });
      expect(def.legalMoves!(end, 0)).toEqual([]);
      expect(def.legalMoves!(end, 1)).toEqual([]);
    }
  });

  it("最初の手の数", () => {
    const first = (id: string) => {
      const def = games[id]!;
      return def.legalMoves!(def.initialState(Math.random), 0).length;
    };
    expect(fullInfo.map((id) => [id, first(id)])).toEqual([
      ["tictactoe", 9],
      ["fading", 9],
      ["gobble", 27],
      ["nim", 16],
      ["tateyoko", 20],
      ["bridge", 25],
      ["connect4", 7],
      ["tapioca", 10],
      ["boxes", 24],
      ["othello", 4],
      ["korokoro", 6],
    ]);
  });

  it("gobble: 手持ちから置く手と、盤上の自分のコマを動かす手の両方がある", () => {
    let s = gobble.applyMove(gobble.initialState(Math.random), { from: { kind: "hand", size: 2 }, to: 4 }, 0);
    s = gobble.applyMove(s, { from: { kind: "hand", size: 0 }, to: 0 }, 1);
    const moves = gobble.legalMoves!(s, 0);
    // 大を 4 から、大より小さいコマしかないマス（空き 7 つと相手の小がある 0）へ動かせる
    expect(moves.filter((m) => m.from.kind === "board")).toHaveLength(8);
    expect(moves).toContainEqual({ from: { kind: "hand", size: 1 }, to: 0 });
    expect(moves).not.toContainEqual({ from: { kind: "hand", size: 0 }, to: 0 });
  });

  it("bridge: 後手の最初の手番だけ入れ替えを選べる", () => {
    const s = bridge.applyMove(bridge.initialState(Math.random), { cell: 3 }, 0);
    expect(bridge.legalMoves!(s, 1)).toContainEqual({ swap: true });
    expect(bridge.legalMoves!(s, 1)).toHaveLength(25);
    const next = bridge.applyMove(s, { cell: 12 }, 1);
    expect(bridge.legalMoves!(next, 0)).not.toContainEqual({ swap: true });
    const later = bridge.applyMove(next, { cell: 0 }, 0);
    expect(bridge.legalMoves!(later, 1)).not.toContainEqual({ swap: true });
  });

  it("othello: 相手がパスになったら、同じ側の手が続く（パスの手はない）", () => {
    const rows = ["BW......", ...Array(OTHELLO_SIZE - 2).fill("........"), "BWW....."];
    const board: OthelloCell[] = rows.join("").split("").map((ch) => (ch === "B" ? 0 : ch === "W" ? 1 : null));
    const s = { board, turn: 0 as const, finished: false, lastMove: null, passedSeat: null };
    const next = othello.applyMove(s, { row: 0, col: 2 }, 0);
    expect(next.passedSeat).toBe(1);
    expect(othello.legalMoves(next, 0)).toEqual([{ row: 7, col: 3 }]);
    expect(othello.legalMoves(next, 1)).toEqual([]);
    // 席を省くと手番の側（画面はこちらを使う）
    expect(othello.legalMoves(next)).toEqual([{ row: 7, col: 3 }]);
  });
});

describe("コンピュータ同士の対局", () => {
  it.each([...fullInfo, ...hidden, ...humanlike, ...simulated])("%s: 20 局とも途中で止まらずに終局する", (id) => {
    const def = games[id]!;
    for (let game = 0; game < 20; game++) {
      const end = selfPlay(def, seeded(game));
      expect(def.status(end).kind).toBe("finished");
    }
  });
});

describe("hitblow のコンピュータ", () => {
  it("秘密の数字は rng でつくる", () => {
    const view = hitblow.viewState!(hitblow.initialState(Math.random), 0, false);
    const a = hitblow.botMove!(view, 0, () => 0) as HitBlowMove;
    const b = hitblow.botMove!(view, 0, () => 0.9999) as HitBlowMove;
    expect(a.kind).toBe("secret");
    expect(isValidNumber(a.value) && isValidNumber(b.value)).toBe(true);
    expect(a.value).not.toBe(b.value);
    expect(hitblow.botMove!(view, 1, Math.random)).toBeNull();
  });

  it("推理は、これまでのヒット・ブローの結果と矛盾しない", () => {
    let guessed = 0;
    for (let game = 0; game < 20; game++) {
      selfPlay(hitblow, seeded(200 + game), (state: HitBlowState, seat, move) => {
        if (move.kind !== "guess") return;
        guessed++;
        for (const g of state.guesses[seat]) expect(judge(move.value, g.value)).toEqual({ hit: g.hit, blow: g.blow });
      });
    }
    expect(guessed).toBeGreaterThan(40);
  });

  it("相手の秘密の数字を見なくても、候補には相手の数字がかならず残る", () => {
    let s = hitblow.initialState(Math.random);
    s = hitblow.applyMove(s, { kind: "secret", value: "123" }, 0);
    s = hitblow.applyMove(s, { kind: "secret", value: "456" }, 1);
    s = hitblow.applyMove(s, { kind: "guess", value: "465" }, 0);
    s = hitblow.applyMove(s, { kind: "guess", value: "789" }, 1);
    const view = hitblow.viewState!(s, 0, false) as HitBlowView;
    expect(view.secrets[1]).toBeNull();
    // 465 で 1 ヒット 2 ブロー → 4・5・6 の並べ替えのうち、ちょうど 1 つの位置が合うもの
    expect(candidatesFor(view.guesses[0])).toEqual(["456", "564", "645"]);
    const move = hitblow.botMove!(view, 0, Math.random) as HitBlowMove;
    expect(candidatesFor(view.guesses[0])).toContain(move.value);
  });
});

describe("auction のコンピュータ", () => {
  // 得点カードの山を決めた状態（rng が常に 0.999… なら 1..9 の順のまま）
  const withDeck = (deck: number[]): AuctionState => ({ ...auction.initialState(() => 0.9999), deck });
  const cardFor = (s: AuctionState, r: number) =>
    (auction.botMove!(auction.viewState!(s, s.turn, false), s.turn, () => r) as { card: number }).card;
  const wobble = [0, 0.25, 0.5, 0.75, 0.9999];

  it("大きい得点には大きめ、小さい得点には小さめのカードを出す（ゆらぎあり）", () => {
    const big = wobble.map((r) => cardFor(withDeck([9, 1, 2, 3, 4, 5, 6, 7, 8]), r));
    const small = wobble.map((r) => cardFor(withDeck([1, 2, 3, 4, 5, 6, 7, 8, 9]), r));
    for (const c of big) expect(c).toBeGreaterThanOrEqual(8);
    for (const c of small) expect(c).toBeLessThanOrEqual(3);
    expect(new Set(small).size).toBeGreaterThan(1);
  });

  it("持ち越しがあると、そのぶん大きめに出す", () => {
    // 1 ラウンド目が引き分けで、得点 1 が持ち越された状態。今の得点は 2 + 1 = 3 で、残りの中で 2 番目に小さい
    const rest = [2, 3, 4, 5, 6, 7, 8, 9];
    const s: AuctionState = { ...withDeck(rest), carried: [1], hands: [[...rest], [...rest]] };
    expect(cardFor(s, 0.5)).toBe(3);
    expect(cardFor({ ...s, carried: [9] }, 0.5)).toBe(9);
  });

  it("手札にあるカードだけを出し、自分の番でなければ null", () => {
    let s = withDeck([5, 1, 2, 3, 4, 6, 7, 8, 9]);
    s = auction.applyMove(s, { card: 5 }, 0);
    const view = auction.viewState!(s, 1, false);
    const move = auction.botMove!(view, 1, Math.random) as { card: number };
    expect(s.hands[1]).toContain(move.card);
    expect(auction.botMove!(auction.viewState!(s, 0, false), 0, Math.random)).toBeNull();
  });
});

describe("bluff のコンピュータ", () => {
  /** 1 回戦目の配り方を決め、手を進めた状態で、手番の人のコンピュータが選ぶ手 */
  const actionFor = (cards: [number, number], acts: BluffAction[], r: number) => {
    let s: BluffState = { ...bluff.initialState(Math.random), deals: Array(ROUNDS).fill(cards) };
    acts.forEach((action) => (s = bluff.applyMove(s, { action }, s.turn)));
    return (bluff.botMove!(bluff.viewState!(s, s.turn, false), s.turn, () => r) as { action: BluffAction }).action;
  };
  const both = (cards: [number, number], acts: BluffAction[]) => [actionFor(cards, acts, 0), actionFor(cards, acts, 0.9999)];

  it("3 なら上乗せし、上乗せされたら受ける", () => {
    expect(both([3, 1], [])).toEqual(["bet", "bet"]);
    expect(both([1, 3], ["pass"])).toEqual(["bet", "bet"]);
    expect(both([2, 3], ["bet"])).toEqual(["call", "call"]);
  });

  it("1 ならときどきはったりで上乗せし、上乗せされたらおりる", () => {
    expect(both([1, 3], [])).toEqual(["bet", "pass"]);
    expect(both([3, 1], ["bet"])).toEqual(["fold", "fold"]);
  });

  it("2 ならパスし、上乗せされたらときどき受ける", () => {
    expect(both([2, 1], [])).toEqual(["pass", "pass"]);
    expect(both([3, 2], ["bet"])).toEqual(["call", "fold"]);
  });

  it("自分の番でなければ null", () => {
    const s = bluff.initialState(Math.random);
    expect(bluff.botMove!(bluff.viewState!(s, 1, false), 1, Math.random)).toBeNull();
  });
});
