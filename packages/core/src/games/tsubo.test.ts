import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  capOf,
  CELLS,
  COLD,
  COLS,
  distance,
  foundOf,
  isRoundOver,
  KORI,
  levelOf,
  MAX_PRESSES,
  reading,
  ROUNDS,
  ROWS,
  tsubo,
  turnOf,
  type Level,
  type TsuboMove,
  type TsuboState,
  type TsuboView,
} from "./tsubo.ts";

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

/** 行と列（どちらも 0 から）からマスの番号 */
const at = (row: number, col: number) => row * COLS + col;

/** 手番の人が順に指す */
const play = (s: TsuboState, moves: TsuboMove[]) => moves.reduce((st, m) => tsubo.applyMove(st, m, turnOf(st.rounds)!), s);
const hide = (...cells: number[]): TsuboMove => ({ kind: "hide", cells });
const press = (...cells: number[]): TsuboMove[] => cells.map((cell) => ({ kind: "press", cell }));

/** 1 回戦目のこりを置いた状態 */
const hidden = (kori: number[]) => play(tsubo.initialState(Math.random), [hide(...kori)]);

const view = (s: TsuboState, viewer: Seat | null, revealAll = false) => tsubo.viewState!(s, viewer, revealAll) as TsuboView;

/** こりのないマスを、こりから遠い順に並べたもの（外れを押すのに使う） */
const misses = (kori: number[]) =>
  Array.from({ length: CELLS }, (_, i) => i)
    .filter((c) => !kori.includes(c))
    .sort((a, b) => Math.min(...kori.map((k) => distance(b, k))) - Math.min(...kori.map((k) => distance(a, k))));

// 1 回戦目のこり（左上・まん中・右下）と、2 回戦目のこり
const K1 = [at(0, 0), at(3, 2), at(6, 5)];
const K2 = [at(1, 4), at(4, 1), at(5, 5)];

describe("tsubo", () => {
  describe("はじめ", () => {
    it("背中のマスは 6 列 × 7 行。こりは 3 か所、押せるのは 18 回まで、2 回戦", () => {
      expect([COLS, ROWS, CELLS, KORI, MAX_PRESSES, ROUNDS]).toEqual([6, 7, 42, 3, 18, 2]);
    });

    it("1 回戦目は先手がお客さんで、先手がこりを置く番から始まる", () => {
      const s = tsubo.initialState(Math.random);
      expect(s.rounds).toEqual([{ customer: 0, kori: null, presses: [] }]);
      expect(tsubo.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("こりを隠す", () => {
    it("3 か所を置くと、施術する人（後手）が押す番になる。場所は小さい順に持つ", () => {
      const s = play(tsubo.initialState(Math.random), [hide(at(6, 5), at(0, 0), at(3, 2))]);
      expect(s.rounds[0]!.kori).toEqual(K1);
      expect(tsubo.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("3 か所ちょうど、別々のマス、背中の中（0〜41 の整数）でないと置けない", () => {
      const s = tsubo.initialState(Math.random);
      for (const cells of [[1, 2], [1, 2, 3, 4], [], [5, 5, 6], [0, 1, CELLS], [-1, 2, 3], [1.5, 2, 3]]) {
        expect(() => tsubo.applyMove(s, hide(...cells), 0)).toThrow(IllegalMoveError);
        expect(() => tsubo.applyMove(s, hide(...cells), 0)).toThrow("tsubo_kori");
      }
      expect(tsubo.applyMove(s, hide(0, 1, CELLS - 1), 0).rounds[0]!.kori).toEqual([0, 1, CELLS - 1]);
    });

    it("お客さんの番に押すことはできず、施術する人の番に置き直すことはできない", () => {
      const s = tsubo.initialState(Math.random);
      expect(() => tsubo.applyMove(s, press(0)[0]!, 0)).toThrow("bad_move");
      const h = hidden(K1);
      expect(() => tsubo.applyMove(h, hide(1, 2, 3), 1)).toThrow("bad_move");
    });

    it("手番でない人は置けない・押せない", () => {
      const s = tsubo.initialState(Math.random);
      expect(() => tsubo.applyMove(s, hide(...K1), 1)).toThrow("not_your_turn");
      expect(() => tsubo.applyMove(hidden(K1), press(1)[0]!, 0)).toThrow("not_your_turn");
    });
  });

  describe("近さの段階", () => {
    it("近さは、たて・よこに数えたマスの数（背骨をはさんだ左右のマスもとなり）", () => {
      expect(distance(at(0, 0), at(0, 1))).toBe(1);
      expect(distance(at(2, 2), at(2, 3))).toBe(1);
      expect(distance(at(0, 0), at(1, 1))).toBe(2);
      expect(distance(at(0, 0), at(6, 5))).toBe(11);
    });

    it("1 マスならあつい、2 マスならあたたかい、3 マスならぬるい、4 マス以上ならつめたい", () => {
      expect([0, 1, 2, 3, 4, 5, 11].map(levelOf)).toEqual([0, 1, 2, 3, COLD, COLD, COLD]);
    });

    it("返る近さは、まだほぐれていないこりのうち、いちばん近いものまで", () => {
      expect(reading(K1, [], at(0, 1))).toBe(1);
      expect(reading(K1, [], at(3, 4))).toBe(2);
      expect(reading(K1, [], at(0, 3))).toBe(3);
      expect(reading(K1, [], at(0, 5))).toBe(COLD);
      // 左上がほぐれたら、そのとなりはもうあつくない（まん中のこりまで 3 マス）
      expect(reading(K1, [at(0, 0)], at(1, 1))).toBe(3);
      expect(reading(K1, [], at(3, 2))).toBe(0);
    });
  });

  describe("押す", () => {
    it("外れなら近さが返り、押した記録に残る。押しても手番は施術する人のまま", () => {
      const s = play(hidden(K1), press(at(0, 1), at(0, 5)));
      expect(s.rounds[0]!.presses).toEqual([
        { cell: at(0, 1), level: 1 },
        { cell: at(0, 5), level: COLD },
      ]);
      expect(tsubo.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("こりを押したら「ほぐれた」（段階 0）。そのあとの近さは残りのこりで決まる", () => {
      let s = play(hidden(K1), press(at(0, 0)));
      expect(s.rounds[0]!.presses).toEqual([{ cell: at(0, 0), level: 0 }]);
      expect(foundOf(s.rounds[0]!)).toBe(1);
      // ほぐれた左上のとなりでも、残りのこりからは遠いのでつめたい
      s = play(s, press(at(1, 0)));
      expect(s.rounds[0]!.presses[1]).toEqual({ cell: at(1, 0), level: COLD });
      s = play(s, press(at(1, 1)));
      expect(s.rounds[0]!.presses[2]).toEqual({ cell: at(1, 1), level: 3 });
    });

    it("同じマスは 2 回押せない。背中の外は押せない", () => {
      const s = play(hidden(K1), press(at(2, 2), at(0, 0)));
      expect(() => tsubo.applyMove(s, press(at(2, 2))[0]!, 1)).toThrow("tsubo_pressed");
      expect(() => tsubo.applyMove(s, press(at(0, 0))[0]!, 1)).toThrow("tsubo_pressed");
      for (const cell of [-1, CELLS, 2.5]) expect(() => tsubo.applyMove(s, { kind: "press", cell }, 1)).toThrow("bad_move");
    });
  });

  describe("回戦の終わりと役の交代", () => {
    it("全部ほぐしたら回戦が終わり、施術した人（後手）がそのまま 2 回戦のお客さんになってこりを置く", () => {
      const s = play(hidden(K1), press(at(1, 1), ...K1));
      expect(isRoundOver(s.rounds, 0)).toBe(true);
      expect(s.rounds).toHaveLength(2);
      expect(s.rounds[1]).toEqual({ customer: 1, kori: null, presses: [] });
      expect(tsubo.status(s)).toEqual({ kind: "playing", turn: 1 });
      const next = play(s, [hide(...K2)]);
      // 2 回戦は先手が施術する
      expect(tsubo.status(next)).toEqual({ kind: "playing", turn: 0 });
      expect(() => tsubo.applyMove(next, press(0)[0]!, 1)).toThrow("not_your_turn");
    });

    it("押せるのは 18 回まで。ほぐしきれなくても、18 回押したら回戦が終わる", () => {
      const ms = misses(K1);
      let s = play(hidden(K1), press(...ms.slice(0, MAX_PRESSES - 1)));
      expect(s.rounds).toHaveLength(1);
      expect(isRoundOver(s.rounds, 0)).toBe(false);
      s = play(s, press(K1[0]!));
      expect(s.rounds[0]!.presses).toHaveLength(MAX_PRESSES);
      expect(foundOf(s.rounds[0]!)).toBe(1);
      expect(isRoundOver(s.rounds, 0)).toBe(true);
      expect(tsubo.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("2 回戦で押せるのは、1 回戦でほぐしきった回数まで（それより多く押すと勝てないので）", () => {
      const s = play(hidden(K1), [...press(at(1, 1), at(2, 2), ...K1), hide(...K2)]);
      expect(capOf(s.rounds, 0)).toBe(MAX_PRESSES);
      expect(capOf(s.rounds, 1)).toBe(5);
      // 1 回戦でほぐしきれなかったら、2 回戦も 18 回まで
      const failed = play(hidden(K1), [...press(...misses(K1).slice(0, MAX_PRESSES)), hide(...K2)]);
      expect(capOf(failed.rounds, 1)).toBe(MAX_PRESSES);
    });

    it("2 回戦が終わったら終局。もう指せない", () => {
      const s = play(hidden(K1), [...press(...K1), hide(...K2), ...press(...K2)]);
      expect(tsubo.status(s).kind).toBe("finished");
      expect(turnOf(s.rounds)).toBeNull();
      expect(() => tsubo.applyMove(s, press(0)[0]!, 0)).toThrow("game_over");
      expect(() => tsubo.applyMove(s, hide(1, 2, 3), 1)).toThrow("game_over");
    });
  });

  describe("勝ち負け", () => {
    /**
     * 1 回戦（後手が施術）と 2 回戦（先手が施術）で、外れを n 回押してから全部ほぐす。
     * 2 回戦は 1 回戦の回数までしか押せないので、そこで打ち切る
     */
    const game = (miss1: number, miss2: number) =>
      play(hidden(K1), [
        ...press(...misses(K1).slice(0, miss1), ...K1),
        hide(...K2),
        ...press(...misses(K2).slice(0, miss2), ...K2).slice(0, miss1 + KORI),
      ]);

    it("ほぐしきるまでに押した回数が少ない方の勝ち", () => {
      expect(tsubo.status(game(4, 2))).toEqual({ kind: "finished", winner: 0 });
      expect(tsubo.status(game(0, 1))).toEqual({ kind: "finished", winner: 1 });
      expect(tsubo.status(game(2, 3))).toEqual({ kind: "finished", winner: 1 });
    });

    it("同じ回数なら引き分け", () => {
      expect(tsubo.status(game(3, 3))).toEqual({ kind: "finished", winner: null });
    });

    it("2 回戦で、1 回戦の回数までにほぐしきれなければ、そこで後手の勝ち", () => {
      let s = play(hidden(K1), [...press(at(1, 1), ...K1), hide(...K2)]);
      s = play(s, press(K2[0]!, ...misses(K2).slice(0, 2)));
      expect(tsubo.status(s).kind).toBe("playing");
      s = play(s, press(K2[1]!));
      expect(s.rounds[1]!.presses).toHaveLength(4);
      expect(foundOf(s.rounds[1]!)).toBe(2);
      expect(tsubo.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("ほぐしきれなかったときは、ほぐした数が多い方の勝ち。数も回数も同じなら引き分け", () => {
      const ms1 = misses(K1).slice(0, MAX_PRESSES - 2);
      const ms2 = misses(K2).slice(0, MAX_PRESSES - 2);
      const round1 = [...press(...ms1, K1[0]!, K1[1]!), hide(...K2)];
      // 1 回戦は 2 か所。2 回戦で 3 か所ほぐせば（回数が多くても）先手の勝ち
      const won = play(hidden(K1), [...round1, ...press(...ms2.slice(0, MAX_PRESSES - 3), ...K2)]);
      expect(tsubo.status(won)).toEqual({ kind: "finished", winner: 0 });
      // 2 回戦も 18 回で 2 か所なら引き分け
      const even = play(hidden(K1), [...round1, ...press(...ms2, K2[0]!, K2[1]!)]);
      expect(tsubo.status(even)).toEqual({ kind: "finished", winner: null });
      // 2 回戦が 1 か所なら後手の勝ち
      const lost = play(hidden(K1), [...round1, ...press(...misses(K2).slice(0, MAX_PRESSES - 1), K2[0]!)]);
      expect(tsubo.status(lost)).toEqual({ kind: "finished", winner: 1 });
    });
  });

  describe("見せる情報", () => {
    it("置く前は、こりはだれにも null", () => {
      const s = tsubo.initialState(Math.random);
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).rounds[0]!.kori).toBeNull();
    });

    it("こりの場所はお客さんにだけ見え、施術する人と観戦者には伏せる（置いたことだけ分かる）", () => {
      const s = play(hidden(K1), press(at(0, 1)));
      expect(view(s, 0).rounds[0]!.kori).toEqual(K1);
      expect(view(s, 1).rounds[0]!.kori).toBe("hidden");
      expect(view(s, null).rounds[0]!.kori).toBe("hidden");
      // 押した場所と近さは全員に見える
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).rounds[0]!.presses).toEqual(s.rounds[0]!.presses);
      expect(JSON.stringify(view(s, 1))).not.toContain(JSON.stringify(K1));
    });

    it("終わった回戦のこりは 2 人に見える。2 回戦のこりは先手に伏せる", () => {
      const s = play(hidden(K1), [...press(...K1), hide(...K2), ...press(at(0, 0))]);
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).rounds[0]!.kori).toEqual(K1);
      expect(view(s, 1).rounds[1]!.kori).toEqual(K2);
      expect(view(s, 0).rounds[1]!.kori).toBe("hidden");
      expect(view(s, null).rounds[1]!.kori).toBe("hidden");
    });

    it("1 回戦が上限で終わったときも、こりを見せる", () => {
      const s = play(hidden(K1), press(...misses(K1).slice(0, MAX_PRESSES)));
      expect(view(s, 1).rounds[0]!.kori).toEqual(K1);
    });

    it("終局後は全部見える", () => {
      const s = play(hidden(K1), [...press(...K1), hide(...K2)]);
      expect(view(s, 0, true).rounds[1]!.kori).toEqual(K2);
      expect(view(s, null, true).rounds[1]!.kori).toEqual(K2);
    });

    it("手の記録：置いた場所は本人にだけ見える。押した場所は全員に見える", () => {
      const m = hide(...K1);
      expect(tsubo.viewMove!(m, 0, 0)).toEqual(m);
      expect(tsubo.viewMove!(m, 0, 1)).toEqual({ kind: "hide", cells: null });
      expect(tsubo.viewMove!(m, 0, null)).toEqual({ kind: "hide", cells: null });
      expect(tsubo.viewMove!({ kind: "press", cell: 5 }, 1, 0)).toEqual({ kind: "press", cell: 5 });
    });
  });

  describe("parseMove", () => {
    it("置く手と押す手を読む。よけいな項目は捨てる", () => {
      expect(tsubo.parseMove({ kind: "hide", cells: [1, 2, 3], x: 1 })).toEqual({ kind: "hide", cells: [1, 2, 3] });
      expect(tsubo.parseMove({ kind: "press", cell: 7, level: 0 })).toEqual({ kind: "press", cell: 7 });
      expect(tsubo.parseMove(JSON.parse(JSON.stringify(hide(...K1))))).toEqual(hide(...K1));
    });

    it("形が違えば null（数や範囲は applyMove で確かめる）", () => {
      for (const raw of [
        null,
        undefined,
        7,
        "press",
        {},
        { kind: "poke", cell: 1 },
        { kind: "press" },
        { kind: "press", cell: "3" },
        { kind: "press", cell: 1.5 },
        { kind: "hide", cells: "1,2,3" },
        { kind: "hide", cells: [1, "2", 3] },
        { kind: "hide", cells: [1, 2.5, 3] },
        { kind: "hide", cells: Array(100).fill(0) },
      ]) {
        expect(tsubo.parseMove(raw), JSON.stringify(raw)).toBeNull();
      }
    });
  });

  describe("コンピュータ", () => {
    const botView = (s: TsuboState, seat: Seat) => view(s, seat);

    it("お客さんのときは、こりをでたらめに 3 か所置く", () => {
      const s = tsubo.initialState(Math.random);
      const a = tsubo.botMove!(botView(s, 0), 0, seeded(1)) as TsuboMove & { kind: "hide" };
      const b = tsubo.botMove!(botView(s, 0), 0, seeded(2)) as TsuboMove & { kind: "hide" };
      for (const m of [a, b]) {
        expect(m.kind).toBe("hide");
        expect(new Set(m.cells).size).toBe(KORI);
        for (const c of m.cells) expect(Number.isInteger(c) && c >= 0 && c < CELLS).toBe(true);
        expect(() => tsubo.applyMove(s, m, 0)).not.toThrow();
      }
      expect(a.cells).not.toEqual(b.cells);
    });

    it("自分の番でなければ・終局後は null", () => {
      const s = tsubo.initialState(Math.random);
      expect(tsubo.botMove!(botView(s, 1), 1, Math.random)).toBeNull();
      const end = play(hidden(K1), [...press(...K1), hide(...K2), ...press(...K2)]);
      expect(tsubo.botMove!(botView(end, 0), 0, Math.random)).toBeNull();
      expect(tsubo.botMove!(botView(end, 1), 1, Math.random)).toBeNull();
    });

    it("押していないマスで、これまでの近さと食い違わないマスを押す（こりの場所は見ない）", () => {
      let checked = 0;
      for (let game = 0; game < 20; game++) {
        const rng = seeded(300 + game);
        let s = tsubo.initialState(rng);
        while (tsubo.status(s).kind === "playing") {
          const seat = turnOf(s.rounds)!;
          const v = botView(s, seat);
          const move = tsubo.botMove!(v, seat, rng)!;
          const r = s.rounds.at(-1)!;
          if (move.kind === "press") {
            checked++;
            expect(v.rounds.at(-1)!.kori).toBe("hidden");
            expect(r.presses.map((p) => p.cell)).not.toContain(move.cell);
            // 外れの近さより近くには、残りのこりはない
            for (const p of r.presses) if (p.level > 0) expect(distance(move.cell, p.cell)).toBeGreaterThanOrEqual(p.level);
            // 最後に押したのがつめたくない外れなら、その近さちょうどのマスを押す
            const last = r.presses.at(-1);
            if (last && last.level > 0 && last.level < COLD) expect(distance(move.cell, last.cell)).toBe(last.level);
          }
          s = tsubo.applyMove(s, move, seat);
        }
      }
      expect(checked).toBeGreaterThan(200);
    });

    it("コンピュータ同士で最後まで遊べて、1 回戦はたいてい上限までにほぐしきる", () => {
      let cleared = 0;
      const presses: number[] = [];
      for (let game = 0; game < 40; game++) {
        const rng = seeded(game);
        let s = tsubo.initialState(rng);
        for (let ply = 0; ply < 100 && tsubo.status(s).kind === "playing"; ply++) {
          const seat = (tsubo.status(s) as { turn: Seat }).turn;
          s = tsubo.applyMove(s, botMove(tsubo, s, seat, rng)!, seat);
        }
        expect(tsubo.status(s).kind).toBe("finished");
        expect(s.rounds).toHaveLength(ROUNDS);
        // 2 回戦は 1 回戦の回数までしか押せないので、上限が 18 回の 1 回戦で数える
        const first = s.rounds[0]!;
        if (foundOf(first) === KORI) {
          cleared++;
          presses.push(first.presses.length);
        }
      }
      expect(cleared / 40).toBeGreaterThan(0.9);
      // でたらめに押す（平均 30 回ほど）よりずっと少ない回数でほぐす
      expect(presses.reduce((a, b) => a + b, 0) / presses.length).toBeLessThan(14);
    });
  });
});

// 型の確かめ（Level は 0〜4）
const _levels: Level[] = [0, 1, 2, 3, 4];
void _levels;
