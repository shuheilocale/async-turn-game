import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import { adderOf, chain, MAX_LENGTH, PADS, recallChance, showTiming, type ChainState } from "./chain.ts";

/** 並びを決めた局面。手番は並びの長さで決まる（先手から交互に足すので） */
const withSeq = (seq: number[]): ChainState => ({ seq, turn: (seq.length % 2) as Seat, miss: null });

/** 手番の人が、今の並びを正しくまねして pad を足す */
const extend = (s: ChainState, pad: number) => chain.applyMove(s, { taps: [...s.seq, pad] }, s.turn);

/** 手番の人が、順に正しくまねして足していく */
const grow = (s: ChainState, pads: number[]) => pads.reduce(extend, s);

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

describe("chain", () => {
  describe("はじめ", () => {
    it("並びは空で、先手から。まだ誰もまちがえていない", () => {
      const s = chain.initialState(Math.random);
      expect(s).toEqual({ seq: [], turn: 0, miss: null });
      expect(chain.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("最初の手は、好きなパッドを 1 つ選ぶだけ", () => {
      const s = chain.applyMove(chain.initialState(Math.random), { taps: [2] }, 0);
      expect(s.seq).toEqual([2]);
      expect(chain.status(s)).toEqual({ kind: "playing", turn: 1 });
    });
  });

  describe("まねして足す", () => {
    it("並びを最初から正しくまねして 1 つ足すと、並びが 1 つ伸びて手番が移る", () => {
      let s = grow(chain.initialState(Math.random), [2, 0]);
      expect(s.seq).toEqual([2, 0]);
      expect(chain.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = chain.applyMove(s, { taps: [2, 0, 3] }, 0);
      expect(s.seq).toEqual([2, 0, 3]);
      expect(s.miss).toBeNull();
      expect(chain.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = chain.applyMove(s, { taps: [2, 0, 3, 3] }, 1);
      expect(s.seq).toEqual([2, 0, 3, 3]);
      expect(chain.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("同じパッドを続けて足してもよい", () => {
      expect(grow(chain.initialState(Math.random), [1, 1, 1]).seq).toEqual([1, 1, 1]);
    });

    it("i 個目を足したのは、先手から交互（0 個目は先手）", () => {
      expect([0, 1, 2, 3, 4].map(adderOf)).toEqual([0, 1, 0, 1, 0]);
    });
  });

  describe("まちがえる", () => {
    it("途中でまちがえたら、まちがえた人の負け。並びはそのまま残る", () => {
      const s = withSeq([2, 0, 3, 1]);
      const end = chain.applyMove(s, { taps: [2, 0, 1] }, 0);
      expect(end.miss).toEqual({ seat: 0, index: 2, pad: 1 });
      expect(end.seq).toEqual([2, 0, 3, 1]);
      expect(chain.status(end)).toEqual({ kind: "finished", winner: 1 });
    });

    it("1 個目でまちがえても、まねの最後の 1 個でまちがえても負け", () => {
      const s = withSeq([2, 0, 3]);
      const first = chain.applyMove(s, { taps: [0] }, 1);
      expect(first.miss).toEqual({ seat: 1, index: 0, pad: 0 });
      expect(chain.status(first)).toEqual({ kind: "finished", winner: 0 });
      const last = chain.applyMove(s, { taps: [2, 0, 2] }, 1);
      expect(last.miss).toEqual({ seat: 1, index: 2, pad: 2 });
      expect(chain.status(last)).toEqual({ kind: "finished", winner: 0 });
    });

    it("まちがえたら終わり。もう指せない", () => {
      const end = chain.applyMove(withSeq([2, 0]), { taps: [1] }, 0);
      expect(() => chain.applyMove(end, { taps: [2, 0, 1] }, 1)).toThrow("game_over");
      expect(() => chain.applyMove(end, { taps: [2, 0, 1] }, 0)).toThrow("game_over");
    });

    it("まちがえたタップより後ろは送れない（まちがえた時点で止める）", () => {
      const s = withSeq([2, 0, 3]);
      for (const taps of [
        [2, 1, 3],
        [2, 1, 3, 0],
        [0, 0],
      ]) {
        expect(() => chain.applyMove(s, { taps }, 1)).toThrow(IllegalMoveError);
        expect(() => chain.applyMove(s, { taps }, 1)).toThrow("chain_taps");
      }
    });
  });

  describe("足さずに送る・足しすぎる", () => {
    it("まねしただけで足していない手は不正", () => {
      expect(() => chain.applyMove(withSeq([2, 0, 3]), { taps: [2, 0, 3] }, 1)).toThrow("chain_add");
      expect(() => chain.applyMove(chain.initialState(Math.random), { taps: [] }, 0)).toThrow("chain_add");
    });

    it("まねの途中で止めた手も不正（まちがえていなければ、最後までまねして足す）", () => {
      const s = withSeq([2, 0, 3]);
      for (const taps of [[], [2], [2, 0]]) expect(() => chain.applyMove(s, { taps }, 1)).toThrow("chain_add");
    });

    it("足せるのは 1 つだけ", () => {
      expect(() => chain.applyMove(withSeq([2, 0, 3]), { taps: [2, 0, 3, 1, 1] }, 1)).toThrow("chain_taps");
      expect(() => chain.applyMove(chain.initialState(Math.random), { taps: [1, 2] }, 0)).toThrow("chain_taps");
    });

    it("パッドの番号は 0〜3 の整数だけ", () => {
      const s = withSeq([2, 0]);
      for (const pad of [-1, PADS, 1.5, Number.NaN]) {
        expect(() => chain.applyMove(s, { taps: [2, 0, pad] }, 0)).toThrow("chain_taps");
      }
    });
  });

  describe("上限", () => {
    it(`並びが ${MAX_LENGTH} 個に届いたら引き分けで終わる（1 つ手前ではまだ続く）`, () => {
      const pads = Array.from({ length: MAX_LENGTH - 1 }, (_, i) => i % PADS);
      let s = grow(chain.initialState(Math.random), pads);
      expect(s.seq).toHaveLength(MAX_LENGTH - 1);
      expect(chain.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = extend(s, 2);
      expect(s.seq).toHaveLength(MAX_LENGTH);
      expect(chain.status(s)).toEqual({ kind: "finished", winner: null });
      expect(() => extend(s, 0)).toThrow("game_over");
    });

    it("上限の 1 つ手前でまちがえれば、その人の負け", () => {
      const pads = Array.from({ length: MAX_LENGTH - 1 }, (_, i) => (i * 3) % PADS);
      const s = grow(chain.initialState(Math.random), pads);
      const wrong = (s.seq[0]! + 1) % PADS;
      expect(chain.status(chain.applyMove(s, { taps: [wrong] }, 1))).toEqual({ kind: "finished", winner: 0 });
    });
  });

  it("手番でない人は指せない", () => {
    expect(() => chain.applyMove(chain.initialState(Math.random), { taps: [0] }, 1)).toThrow("not_your_turn");
    const s = withSeq([2]);
    expect(() => chain.applyMove(s, { taps: [2, 1] }, 0)).toThrow("not_your_turn");
    // 手番でない人がまちがえた手を送っても、負けにはならない
    expect(() => chain.applyMove(s, { taps: [0] }, 0)).toThrow("not_your_turn");
  });

  it("parseMove は 0〜3 の整数の並びだけ受け付ける（長さが合うかは applyMove で確かめる）", () => {
    expect(chain.parseMove({ taps: [0, 1, 2, 3] })).toEqual({ taps: [0, 1, 2, 3] });
    expect(chain.parseMove({ taps: [] })).toEqual({ taps: [] });
    expect(chain.parseMove({ taps: Array(MAX_LENGTH).fill(1) })).toEqual({ taps: Array(MAX_LENGTH).fill(1) });
    // 上限より長い並びは、どの局面でも指せない
    expect(chain.parseMove({ taps: Array(MAX_LENGTH + 1).fill(1) })).toBeNull();
    for (const taps of [[4], [-1], [1.5], ["1"], [null], [Number.NaN], "0123", 3, null]) {
      expect(chain.parseMove({ taps })).toBeNull();
    }
    expect(chain.parseMove({})).toBeNull();
    expect(chain.parseMove(null)).toBeNull();
    expect(chain.parseMove([0, 1])).toBeNull();
    // 余計な値は捨てる
    expect(chain.parseMove({ taps: [1], extra: true })).toEqual({ taps: [1] });
  });

  describe("並びの見せ方", () => {
    it("長い並びほど 1 つずつを速く光らせる。最後の 1 つ（相手が足したもの）は長め", () => {
      for (let n = 2; n <= MAX_LENGTH; n++) {
        const a = showTiming(n - 1);
        const b = showTiming(n);
        expect(b.flashMs + b.gapMs).toBeLessThanOrEqual(a.flashMs + a.gapMs);
        expect(b.lastMs).toBeGreaterThan(b.flashMs);
      }
      expect(showTiming(1).flashMs).toBeGreaterThan(showTiming(MAX_LENGTH).flashMs);
    });

    it("目で追える速さを保ち、いちばん長い並びでも 10 秒ほどで見終わる", () => {
      for (let n = 1; n < MAX_LENGTH; n++) {
        const { flashMs, gapMs, lastMs } = showTiming(n);
        expect(flashMs).toBeGreaterThanOrEqual(280);
        expect(gapMs).toBeGreaterThanOrEqual(100);
        const total = (flashMs + gapMs) * (n - 1) + lastMs;
        expect(total).toBeLessThan(10_000);
      }
    });
  });

  describe("コンピュータ", () => {
    const moveFor = (seq: number[], rng: Rng) => chain.botMove!(withSeq(seq), (seq.length % 2) as Seat, rng) as { taps: number[] };

    it("自分の番でなければ null。終わっていても null", () => {
      expect(chain.botMove!(withSeq([1]), 0, Math.random)).toBeNull();
      const missed = chain.applyMove(withSeq([1]), { taps: [0] }, 1);
      expect(chain.botMove!(missed, 0, Math.random)).toBeNull();
      const full = withSeq(Array(MAX_LENGTH).fill(0));
      expect(chain.botMove!(full, 0, Math.random)).toBeNull();
    });

    it("覚えていれば並びを正しくまねして、でたらめに 1 つ足す", () => {
      const seq = [3, 1, 2, 0, 0];
      expect(moveFor(seq, () => 0).taps).toEqual([...seq, 0]);
      // 正しくまねできるかの抽選と、足すパッドの抽選
      const draws = [0, 0.8];
      expect(moveFor(seq, () => draws.shift()!).taps).toEqual([...seq, 3]);
    });

    it("短い並び（2 個まで）はかならず正しくまねする", () => {
      for (const seq of [[], [2], [2, 1]]) {
        for (const r of [0, 0.5, 0.9999]) {
          const taps = moveFor(seq, () => r).taps;
          expect(taps.slice(0, seq.length)).toEqual(seq);
          expect(taps).toHaveLength(seq.length + 1);
        }
      }
    });

    it("まちがえるときは、まちがえたタップで止めた手になる（applyMove で負けになる）", () => {
      const seq = [3, 1, 2, 0, 0, 1, 3, 2, 2, 1];
      /** 最初の抽選（正しくまねできるか）だけ外れにして、あとは rng に任せる */
      const forget = (rng: Rng): Rng => {
        let first = true;
        return () => (first ? ((first = false), 0.9999) : rng());
      };
      const misses = new Set<string>();
      for (let game = 0; game < 50; game++) {
        const move = moveFor(seq, forget(seeded(game)));
        const end = chain.applyMove(withSeq(seq), move, 0);
        expect(end.miss?.seat).toBe(0);
        expect(move.taps).toHaveLength(end.miss!.index + 1);
        expect(end.miss!.pad).not.toBe(seq[end.miss!.index]);
        misses.add(`${end.miss!.index}:${end.miss!.pad}`);
      }
      // まちがえる場所とパッドは毎回同じではない
      expect(misses.size).toBeGreaterThan(5);
    });

    it("並びが長いほど、正しくまねできる割合が少しずつ下がる", () => {
      for (let n = 1; n < MAX_LENGTH; n++) expect(recallChance(n + 1)).toBeLessThanOrEqual(recallChance(n));
      expect(recallChance(4)).toBeGreaterThan(0.95);
      expect(recallChance(MAX_LENGTH - 1)).toBeGreaterThan(0);

      const rate = (n: number) => {
        const rng = seeded(n);
        const seq = Array.from({ length: n }, (_, i) => (i * 7) % PADS);
        let ok = 0;
        for (let i = 0; i < 400; i++) {
          const end = chain.applyMove(withSeq(seq), moveFor(seq, rng), (n % 2) as Seat);
          if (end.miss === null) ok++;
        }
        return ok / 400;
      };
      const [r4, r8, r12, r16] = [rate(4), rate(8), rate(12), rate(16)];
      expect(r4).toBeGreaterThan(0.9);
      expect(r8).toBeLessThan(r4);
      expect(r12).toBeLessThan(r8);
      expect(r16).toBeLessThan(r12);
      expect(r16).toBeLessThan(0.35);
    });

    it("コンピュータ同士で 20 局とも途中で止まらずに終わる（上限で引き分けか、どちらかがまちがえる）", () => {
      const lengths: number[] = [];
      for (let game = 0; game < 20; game++) {
        const rng = seeded(100 + game);
        let s = chain.initialState(rng);
        for (let ply = 0; ply <= MAX_LENGTH && chain.status(s).kind === "playing"; ply++) {
          const st = chain.status(s);
          if (st.kind !== "playing") break;
          const move = botMove(chain, s, st.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = chain.applyMove(s, move, st.turn);
        }
        expect(chain.status(s).kind).toBe("finished");
        expect(s.seq.length).toBeLessThanOrEqual(MAX_LENGTH);
        lengths.push(s.seq.length);
      }
      // ほとんどは上限の前にどちらかがまちがえて終わる
      expect(lengths.filter((n) => n < MAX_LENGTH).length).toBeGreaterThan(15);
    });
  });
});
