import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  CARDS,
  lastTurnStart,
  memory,
  openCard,
  ownersAt,
  PAIRS,
  pairsOf,
  type MemoryMove,
  type MemoryState,
  type MemoryView,
} from "./memory.ts";

/** 同じ種から同じ並びを返す乱数（mulberry32） */
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

/** 札 2k と 2k+1 が同じ絵になる並び（0,0,1,1,…,5,5） */
const SORTED = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];

/** 絵の並びを決めた、並べた直後の状態 */
const laid = (faces: number[] = SORTED): MemoryState => ({ ...memory.initialState(Math.random), faces });

/** [席, 札] の順にめくる */
const flip = (s: MemoryState, moves: [Seat, number][]): MemoryState =>
  moves.reduce((st, [seat, card]) => memory.applyMove(st, { card }, seat), s);

const view = (s: MemoryState, viewer: Seat | null, revealAll = false) =>
  memory.viewState!(s, viewer, revealAll) as MemoryView;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

describe("memory", () => {
  describe("並べ方", () => {
    it("6 組 12 枚を裏向きに並べ、先手から始める", () => {
      const s = memory.initialState(Math.random);
      expect(s.faces).toHaveLength(CARDS);
      expect([...s.faces].sort((a, b) => a - b)).toEqual(SORTED);
      expect(s.owners).toEqual(Array(CARDS).fill(null));
      expect(s.flips).toEqual([]);
      expect(memory.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(PAIRS * 2).toBe(CARDS);
    });

    it("並びは rng で決まる（同じ rng なら同じ並び）", () => {
      // 常に 0.999… なら混ぜても動かない。常に 0 なら毎回いちばん前と入れ替わる
      expect(memory.initialState(() => 0.9999).faces).toEqual(SORTED);
      expect(memory.initialState(() => 0).faces).not.toEqual(SORTED);
      expect(memory.initialState(seeded(1)).faces).toEqual(memory.initialState(seeded(1)).faces);
      const orders = new Set(Array.from({ length: 20 }, (_, i) => memory.initialState(seeded(i)).faces.join()));
      expect(orders.size).toBeGreaterThan(15);
    });
  });

  describe("見せ方（viewState）", () => {
    it("並べた直後は、2 人にも観戦者にも絵が見えない", () => {
      const s = memory.initialState(seeded(3));
      for (const viewer of [0, 1, null] as const) {
        expect(view(s, viewer).faces).toEqual(Array(CARDS).fill(null));
      }
    });

    it("めくっている札だけ見える。ちがう絵で裏に戻したら、また見えなくなる", () => {
      let s = flip(laid(), [[0, 3]]);
      for (const viewer of [0, 1, null] as const) {
        const faces = view(s, viewer).faces;
        expect(faces[3]).toBe(1);
        expect(faces.filter((f) => f !== null)).toHaveLength(1);
      }
      s = flip(s, [[0, 4]]);
      expect(view(s, 1).faces).toEqual(Array(CARDS).fill(null));
      // めくった札は 2 人とも見ていたので、記録としては残る（画面の再生とコンピュータが使う）
      expect(view(s, 1).flips).toEqual([
        { seat: 0, card: 3, face: 1 },
        { seat: 0, card: 4, face: 2 },
      ]);
    });

    it("取られた札は見える", () => {
      const s = flip(laid(), [
        [0, 0],
        [0, 1],
      ]);
      const faces = view(s, 1).faces;
      expect(faces[0]).toBe(0);
      expect(faces[1]).toBe(0);
      expect(faces.filter((f) => f !== null)).toHaveLength(2);
    });

    it("終局後（revealAll）は全部見える", () => {
      const s = flip(laid(), [[0, 5]]);
      expect(view(s, 0, true).faces).toEqual(SORTED);
      expect(view(s, null, true).faces).toEqual(SORTED);
    });

    it("まだめくられていない札の並びが違っても、見える形は同じ（のぞき見できない）", () => {
      // 0・1 だけ同じで、残りの並びがちがう 2 つの盤
      const a = laid(SORTED);
      const b = laid([0, 0, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1]);
      const moves: [Seat, number][] = [
        [0, 0],
        [0, 1],
      ];
      expect(view(flip(a, moves), 1)).toEqual(view(flip(b, moves), 1));
      expect(view(a, 0)).toEqual(view(b, 0));
    });

    it("めくった手の記録はそのまま見せてよい", () => {
      expect(memory.viewMove!({ card: 7 }, 0, 1)).toEqual({ card: 7 });
    });
  });

  describe("手番", () => {
    it("1 枚目をめくっても手番は移らず、2 枚目を待つ", () => {
      const s = flip(laid(), [[0, 2]]);
      expect(memory.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(openCard(s.flips)).toBe(2);
      expect(codeOf(() => flip(s, [[1, 5]]))).toBe("not_your_turn");
    });

    it("同じ絵ならその 2 枚をもらい、続けてめくる", () => {
      const s = flip(laid(), [
        [0, 2],
        [0, 3],
      ]);
      expect(s.owners[2]).toBe(0);
      expect(s.owners[3]).toBe(0);
      expect(pairsOf(s.owners, 0)).toBe(1);
      expect(memory.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(openCard(s.flips)).toBeNull();
      // もう一度めくれる
      expect(() => flip(s, [[0, 5]])).not.toThrow();
    });

    it("ちがう絵なら裏に戻して相手の番", () => {
      const s = flip(laid(), [
        [0, 2],
        [0, 4],
      ]);
      expect(s.owners).toEqual(Array(CARDS).fill(null));
      expect(memory.status(s)).toEqual({ kind: "playing", turn: 1 });
      expect(openCard(s.flips)).toBeNull();
      expect(codeOf(() => flip(s, [[0, 6]]))).toBe("not_your_turn");
    });

    it("取られた札・いまめくっている札はめくれない", () => {
      const s = flip(laid(), [
        [0, 0],
        [0, 1],
        [0, 6],
      ]);
      expect(codeOf(() => flip(s, [[0, 0]]))).toBe("memory_taken");
      expect(codeOf(() => flip(s, [[0, 1]]))).toBe("memory_taken");
      expect(codeOf(() => flip(s, [[0, 6]]))).toBe("memory_open");
    });

    it("1 枚目は記録に残り、取り消せない（同じ札をめくり直すことはできない）", () => {
      const s = flip(laid(), [[0, 8]]);
      expect(s.flips).toEqual([{ seat: 0, card: 8, face: 4 }]);
      expect(codeOf(() => flip(s, [[0, 8]]))).toBe("memory_open");
    });
  });

  describe("終局", () => {
    it("全部取ったら、多くもらった方の勝ち。終局後はめくれない", () => {
      // 先手が 4 組、外して、後手が 2 組
      const s = flip(laid(), [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 6],
        [0, 7],
        [0, 8],
        [0, 10],
        [1, 8],
        [1, 9],
        [1, 10],
        [1, 11],
      ]);
      expect(pairsOf(s.owners, 0)).toBe(4);
      expect(pairsOf(s.owners, 1)).toBe(2);
      expect(memory.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(codeOf(() => flip(s, [[1, 0]]))).toBe("game_over");
    });

    it("同じ数なら引き分け", () => {
      const s = flip(laid(), [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 6],
        [0, 8],
        [1, 6],
        [1, 7],
        [1, 8],
        [1, 9],
        [1, 10],
        [1, 11],
      ]);
      expect(pairsOf(s.owners, 0)).toBe(3);
      expect(pairsOf(s.owners, 1)).toBe(3);
      expect(memory.status(s)).toEqual({ kind: "finished", winner: null });
    });

    it("最後の 1 組まで残っているうちは続く", () => {
      const s = flip(laid(), [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 6],
        [0, 7],
        [0, 8],
        [0, 9],
        [0, 10],
      ]);
      expect(memory.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("記録から分かること", () => {
    it("ownersAt：記録の途中までで、誰がどの札を取っていたか", () => {
      const s = flip(laid(), [
        [0, 0],
        [0, 2],
        [1, 2],
        [1, 3],
        [1, 4],
      ]);
      expect(ownersAt(s.flips, s.flips.length)).toEqual(s.owners);
      expect(ownersAt(s.flips, 2)).toEqual(Array(CARDS).fill(null));
      // 2 枚目まで進めて初めて取ったことになる
      expect(ownersAt(s.flips, 3)[2]).toBeNull();
      expect(ownersAt(s.flips, 4)[2]).toBe(1);
    });

    it("lastTurnStart：その人の最後の番が記録の何番目から始まったか", () => {
      const s = flip(laid(), [
        [0, 0],
        [0, 2],
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 6],
        [0, 1],
      ]);
      expect(lastTurnStart(s.flips, 1)).toBe(2);
      expect(lastTurnStart(s.flips, 0)).toBe(6);
      expect(lastTurnStart([], 0)).toBeNull();
      expect(lastTurnStart(s.flips.slice(0, 2), 1)).toBeNull();
    });
  });

  describe("parseMove", () => {
    it("0〜11 の整数の札だけを手として読む", () => {
      expect(memory.parseMove({ card: 0 })).toEqual({ card: 0 });
      expect(memory.parseMove({ card: 11, extra: true })).toEqual({ card: 11 });
      for (const raw of [{ card: 12 }, { card: -1 }, { card: 1.5 }, { card: "3" }, {}, null, 4, { cards: [1, 2] }]) {
        expect(memory.parseMove(raw)).toBeNull();
      }
    });
  });
});

describe("memory のコンピュータ", () => {
  const always = (r: number): Rng => () => r;
  const choose = (s: MemoryState, seat: Seat, rng: Rng) => memory.botMove!(view(s, seat, false), seat, rng) as MemoryMove | null;

  // 先手が 0（丸）と 4（月）、後手が 8（月）と 1（丸）をめくって、どちらも外した。先手の番
  const seenBoth = () =>
    flip(laid(), [
      [0, 0],
      [0, 8],
      [1, 9],
      [1, 1],
    ]);

  it("自分の番でなければ・終局後は null", () => {
    const s = flip(laid(), [
      [0, 0],
      [0, 2],
    ]);
    expect(choose(s, 0, Math.random)).toBeNull();
    const done = { ...laid(), owners: Array(CARDS).fill(0) as Seat[] };
    expect(choose(done, 0, Math.random)).toBeNull();
  });

  it("よく覚えているときは、場所の分かっている組をめくる", () => {
    let s = seenBoth();
    const first = choose(s, 0, always(0))!;
    // 丸（0・1）か月（8・9）のどちらかの組
    expect([0, 1, 8, 9]).toContain(first.card);
    s = memory.applyMove(s, first, 0);
    const second = choose(s, 0, always(0))!;
    expect(s.faces[second.card]).toBe(s.faces[first.card]);
    expect(second.card).not.toBe(first.card);
  });

  it("1 枚目と同じ絵を覚えていれば、2 枚目にそれをめくる", () => {
    // 後手が 5（1 の絵）を見せて外したあと、先手が 4 をめくった（相方は 5）
    const s = flip(laid(), [
      [0, 0],
      [0, 5],
      [1, 6],
      [1, 8],
      [0, 4],
    ]);
    expect(choose(s, 0, always(0))).toEqual({ card: 5 });
  });

  it("忘れてしまうと、まだ一度もめくられていない札を選ぶ", () => {
    // rng が常に 0.999… なら、覚えている判定は全部外れる
    const move = choose(seenBoth(), 0, always(0.9999))!;
    expect([0, 1, 8, 9]).not.toContain(move.card);
  });

  it("取られた札と、いまめくっている札は選ばない", () => {
    // 先手が 0〜7 を取り、8 をめくったところ。残りは 9・10・11
    const s = flip(laid(), [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 6],
      [0, 7],
      [0, 8],
    ]);
    for (let i = 0; i < 30; i++) {
      const move = choose(s, 0, seeded(i))!;
      expect([9, 10, 11]).toContain(move.card);
    }
  });

  it("見えていない絵は使わない（並びがちがっても、見える形が同じなら同じ手）", () => {
    const moves: [Seat, number][] = [
      [0, 0],
      [0, 2],
    ];
    const a = flip(laid(SORTED), moves);
    const b = flip(laid([0, 3, 1, 5, 4, 2, 3, 0, 5, 1, 2, 4]), moves);
    // 0 と 2 の絵だけ同じにしてある
    expect(a.faces[0]).toBe(b.faces[0]);
    expect(a.faces[2]).toBe(b.faces[2]);
    for (let i = 0; i < 10; i++) expect(choose(a, 1, seeded(i))).toEqual(choose(b, 1, seeded(i)));
  });

  /** コンピュータ（または pick）同士で最後まで遊び、めくった枚数を返す */
  const playOut = (rng: Rng, pick?: (s: MemoryState, seat: Seat) => MemoryMove) => {
    let s = memory.initialState(rng);
    for (let ply = 0; ply < 1000; ply++) {
      const st = memory.status(s);
      if (st.kind === "finished") return s;
      const move = pick ? pick(s, st.turn) : botMove(memory, s, st.turn, rng);
      if (move === null) throw new Error("手を選べなかった");
      s = memory.applyMove(s, move, st.turn);
    }
    throw new Error("終わらなかった");
  };

  it("コンピュータ同士で最後まで遊べ、取った札はいつも同じ絵の組", () => {
    for (let game = 0; game < 30; game++) {
      const end = playOut(seeded(game));
      expect(memory.status(end).kind).toBe("finished");
      expect(pairsOf(end.owners, 0) + pairsOf(end.owners, 1)).toBe(PAIRS);
      for (let i = 0; i < end.flips.length - 1; i += 2) {
        const [a, b] = [end.flips[i]!, end.flips[i + 1]!];
        expect(a.seat).toBe(b.seat);
        if (a.face === b.face) expect(end.owners[a.card]).toBe(a.seat);
      }
    }
  });

  it("そこそこ覚えているので、でたらめにめくるより早く終わる", () => {
    const random = (s: MemoryState): MemoryMove => {
      const open = openCard(s.flips);
      const left = s.owners.flatMap((o, card) => (o === null && card !== open ? [card] : []));
      return { card: left[Math.floor(Math.random() * left.length)]! };
    };
    const average = (pick?: (s: MemoryState, seat: Seat) => MemoryMove) => {
      let total = 0;
      for (let game = 0; game < 40; game++) total += playOut(seeded(500 + game), pick).flips.length;
      return total / 40;
    };
    const bot = average();
    const blind = average(random);
    expect(bot).toBeLessThan(blind * 0.7);
    // 全部覚えていれば平均 18 枚ほどで終わる。ときどき忘れるので、それよりは多くめくる
    expect(bot).toBeGreaterThan(20);
  });
});
