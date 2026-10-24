import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  doors,
  DOORS,
  POINTS,
  ROUNDS,
  safeCount,
  setterOf,
  walkerOf,
  type DoorsState,
  type DoorsView,
  type RoundResult,
} from "./doors.ts";

/** 手番どおりに扉を選んでいく（仕掛け → くぐり → 次の回戦の仕掛け → …） */
function play(doorList: number[], s: DoorsState = doors.initialState(Math.random)): DoorsState {
  for (const door of doorList) {
    const st = doors.status(s);
    if (st.kind !== "playing") throw new Error("終わっている");
    s = doors.applyMove(s, { door }, st.turn);
  }
  return s;
}

const view = (s: DoorsState, viewer: Seat | null, revealAll = false) => doors.viewState!(s, viewer, revealAll) as DoorsView;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

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

/** 0 から 1 まで均等に並べた乱数の値。コンピュータがどの扉を選びやすいかを数えるのに使う */
const sweep = Array.from({ length: 400 }, (_, i) => (i + 0.5) / 400);

/** 回戦の結果を手で作る（コンピュータのテスト用） */
const round = (setter: Seat, trap: number, door: number): RoundResult => {
  const safe = trap !== door;
  return { setter, trap, door, safe, points: safe ? POINTS[door]! : 0 };
};

/** これまでの回戦から、今の状態を作る（点数も history から数える） */
function after(history: RoundResult[], trap: number | null = null): DoorsState {
  const scores: [number, number] = [0, 0];
  history.forEach((r, i) => (scores[walkerOf(i)] += r.points));
  return { trap, scores, history };
}

describe("doors", () => {
  describe("はじまり", () => {
    it("3 つの扉の点は 1・2・3。1 回戦目は先手が仕掛ける", () => {
      expect(DOORS).toBe(3);
      expect(POINTS).toEqual([1, 2, 3]);
      const s = doors.initialState(Math.random);
      expect(s).toEqual({ trap: null, scores: [0, 0], history: [] });
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("仕掛ける人とくぐる人は回戦ごとに交代する", () => {
      expect([0, 1, 2, 3, 4, 5].map(setterOf)).toEqual([0, 1, 0, 1, 0, 1]);
      expect([0, 1, 2, 3, 4, 5].map(walkerOf)).toEqual([1, 0, 1, 0, 1, 0]);
    });
  });

  describe("仕掛けてくぐる", () => {
    it("仕掛けたら、くぐる人の番になる", () => {
      const s = play([2]);
      expect(s.trap).toBe(2);
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("わなのない扉をくぐればセーフで、扉の点をもらう", () => {
      const s = play([2, 1]);
      expect(s.history).toEqual([{ setter: 0, trap: 2, door: 1, safe: true, points: 2 }]);
      expect(s.scores).toEqual([0, 2]);
      expect(s.trap).toBeNull();
      expect(safeCount(s.history, 1)).toBe(1);
    });

    it("わなの扉をくぐるとアウトで、点はもらえない", () => {
      const s = play([2, 2]);
      expect(s.history).toEqual([{ setter: 0, trap: 2, door: 2, safe: false, points: 0 }]);
      expect(s.scores).toEqual([0, 0]);
      expect(safeCount(s.history, 1)).toBe(0);
    });

    it("扉ごとに点がちがう（1 点・2 点・3 点）", () => {
      expect(play([2, 0]).scores).toEqual([0, 1]);
      expect(play([0, 1]).scores).toEqual([0, 2]);
      expect(play([0, 2]).scores).toEqual([0, 3]);
    });

    it("くぐった人が続けて次の回戦の仕掛ける人になり、点はくぐった人に入る", () => {
      let s = play([0, 2]);
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play([1], s);
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play([2], s);
      expect(s.history[1]).toEqual({ setter: 1, trap: 1, door: 2, safe: true, points: 3 });
      expect(s.scores).toEqual([3, 3]);
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("手番", () => {
    it("手番は 仕掛け・くぐり の順で、くぐった人が続けて仕掛ける", () => {
      const turns: Seat[] = [];
      let s = doors.initialState(Math.random);
      for (let i = 0; i < ROUNDS * 2; i++) {
        const st = doors.status(s);
        if (st.kind !== "playing") throw new Error("早く終わった");
        turns.push(st.turn);
        s = doors.applyMove(s, { door: 0 }, st.turn);
      }
      expect(turns).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
      expect(doors.status(s).kind).toBe("finished");
    });

    it("手番でない人は動けない。仕掛けた人が自分でくぐることもできない", () => {
      const s = doors.initialState(Math.random);
      expect(codeOf(() => doors.applyMove(s, { door: 0 }, 1))).toBe("not_your_turn");
      const set = play([1], s);
      expect(codeOf(() => doors.applyMove(set, { door: 0 }, 0))).toBe("not_your_turn");
    });

    it("ない扉は選べない", () => {
      const s = doors.initialState(Math.random);
      for (const door of [-1, 3, 1.5, NaN]) {
        expect(codeOf(() => doors.applyMove(s, { door }, 0))).toBe("doors_no_such_door");
      }
      const set = play([1], s);
      expect(codeOf(() => doors.applyMove(set, { door: 3 }, 1))).toBe("doors_no_such_door");
    });
  });

  describe("決着", () => {
    it("6 回戦で終わり、点の合計が多い方の勝ち", () => {
      // 先手は 3 回とも 3 点の扉をくぐってセーフ、後手は 2 回アウトで 1 点の扉だけセーフ
      const s = play([2, 2, 0, 2, 1, 1, 1, 2, 1, 0, 0, 2]);
      expect(s.history).toHaveLength(ROUNDS);
      expect(s.scores).toEqual([9, 1]);
      expect(doors.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(codeOf(() => doors.applyMove(s, { door: 0 }, 0))).toBe("game_over");
      expect(codeOf(() => doors.applyMove(s, { door: 0 }, 1))).toBe("game_over");
    });

    it("後手が多ければ後手の勝ち", () => {
      const s = play([0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0]);
      expect(s.scores).toEqual([0, 9]);
      expect(doors.status(s)).toEqual({ kind: "finished", winner: 1 });
    });

    it("同じ点なら引き分け（セーフの回数がちがっても）", () => {
      // 先手は 3 点の扉で 1 回だけセーフ、後手は 1 点の扉で 3 回セーフ
      const s = play([2, 0, 0, 2, 2, 0, 1, 1, 1, 0, 0, 0]);
      expect(s.scores).toEqual([3, 3]);
      expect(safeCount(s.history, 0)).toBe(1);
      expect(safeCount(s.history, 1)).toBe(3);
      expect(doors.status(s)).toEqual({ kind: "finished", winner: null });
    });

    it("5 回戦目までは終わらない。6 回戦目は仕掛けただけでは終わらない", () => {
      let s = play(Array(10).fill(0));
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play([0], s);
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("見せる情報", () => {
    it("仕掛けた扉は、くぐる人と観戦者には伏せる（仕掛けた人には見える）", () => {
      const s = play([2]);
      expect(view(s, 0)).toMatchObject({ round: 0, setter: 0, turn: 1, trap: 2, trapSet: true });
      expect(view(s, 1)).toMatchObject({ round: 0, setter: 0, turn: 1, trap: null, trapSet: true });
      expect(view(s, null)).toMatchObject({ trap: null, trapSet: true });
      // 伏せた扉の番号がどこかに残っていないか、形ごと確かめる
      expect(Object.keys(view(s, 1)).sort()).toEqual(["history", "round", "scores", "setter", "trap", "trapSet", "turn"]);
    });

    it("仕掛ける前は、仕掛けたかどうかも false", () => {
      const s = doors.initialState(Math.random);
      expect(view(s, 0)).toMatchObject({ trap: null, trapSet: false, turn: 0 });
      expect(view(s, 1)).toMatchObject({ trap: null, trapSet: false });
    });

    it("くぐったら、わなの扉とくぐった扉を 2 人とも見られる", () => {
      const s = play([2, 1]);
      const shown = { setter: 0, trap: 2, door: 1, safe: true, points: 2 };
      expect(view(s, 0).history).toEqual([shown]);
      expect(view(s, 1).history).toEqual([shown]);
      expect(view(s, null).history).toEqual([shown]);
      expect(view(s, 1).scores).toEqual([0, 2]);
    });

    it("次の回戦の仕掛けはまた伏せる", () => {
      const s = play([2, 1, 0]);
      expect(view(s, 1)).toMatchObject({ round: 1, setter: 1, turn: 0, trap: 0, trapSet: true });
      expect(view(s, 0)).toMatchObject({ round: 1, trap: null, trapSet: true });
    });

    it("revealAll（終局後）なら隠さない", () => {
      const mid = play([2]);
      expect(view(mid, 1, true).trap).toBe(2);
      expect(view(mid, null, true).trap).toBe(2);
      const end = play(Array(12).fill(1));
      const all = view(end, 1, true);
      expect(all.round).toBe(ROUNDS);
      expect(all.history).toHaveLength(ROUNDS);
      expect(all.trap).toBeNull();
      expect(all.trapSet).toBe(false);
    });

    it("手の記録では、相手の手は伏せる（わなの扉は回戦の結果で公開される）", () => {
      expect(doors.viewMove!({ door: 2 }, 0, 0)).toEqual({ door: 2 });
      expect(doors.viewMove!({ door: 2 }, 0, 1)).toEqual({ door: null });
      expect(doors.viewMove!({ door: 2 }, 0, null)).toEqual({ door: null });
    });
  });

  it("parseMove は 0・1・2 の扉だけ受け付ける", () => {
    for (const door of [0, 1, 2]) expect(doors.parseMove({ door })).toEqual({ door });
    for (const raw of [{ door: 3 }, { door: -1 }, { door: 1.5 }, { door: "1" }, {}, null, 1, "door"]) {
      expect(doors.parseMove(raw)).toBeNull();
    }
  });

  describe("コンピュータ", () => {
    const pick = (s: DoorsState, seat: Seat, r: number) =>
      (doors.botMove!(view(s, seat), seat, () => r) as { door: number } | null)?.door;
    /** sweep の乱数で選ばせて、扉ごとに選んだ回数を数える */
    const counts = (s: DoorsState, seat: Seat) => {
      const c = [0, 0, 0];
      for (const r of sweep) c[pick(s, seat, r)!]! += 1;
      return c;
    };

    it("自分の番でなければ、終局後も null", () => {
      const s = doors.initialState(Math.random);
      expect(doors.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      expect(doors.botMove!(view(play([0]), 0), 0, Math.random)).toBeNull();
      const end = play(Array(12).fill(0));
      expect(doors.botMove!(view(end, 0), 0, Math.random)).toBeNull();
      expect(doors.botMove!(view(end, 1), 1, Math.random)).toBeNull();
    });

    it("いつもある扉を選び、乱数で選ぶ扉が変わる", () => {
      const s = doors.initialState(Math.random);
      const c = counts(s, 0);
      expect(c.reduce((a, b) => a + b)).toBe(sweep.length);
      expect(c.filter((n) => n > 0).length).toBeGreaterThan(1);
    });

    it("くぐるときは、相手がよく仕掛けてきた扉を避ける", () => {
      // 後手のコンピュータが 3 回戦目にくぐる。先手はこれまで 2 回とも 3 点の扉に仕掛けた
      const fresh = after([round(0, 1, 0), round(1, 0, 1)], 0);
      const biased = after([round(0, 2, 0), round(1, 0, 1)], 0);
      const twice = after([round(0, 2, 0), round(1, 0, 1), round(0, 2, 1), round(1, 1, 0)], 0);
      expect(counts(biased, 1)[2]).toBeLessThan(counts(fresh, 1)[2]!);
      expect(counts(twice, 1)[2]).toBeLessThan(counts(biased, 1)[2]!);
    });

    it("仕掛けるときは、相手がよくくぐってきた扉をねらう", () => {
      // 後手のコンピュータが 4 回戦目に仕掛ける。先手は 2 回戦目に 3 点の扉か 1 点の扉をくぐった
      const fresh = after([round(0, 2, 1), round(1, 0, 2), round(0, 1, 0)]);
      const biased = after([round(0, 2, 1), round(1, 2, 0), round(0, 1, 0)]);
      expect(doors.status(biased)).toEqual({ kind: "playing", turn: 1 });
      expect(counts(biased, 1)[0]).toBeGreaterThan(counts(fresh, 1)[0]!);
    });

    it("最後の回戦でくぐるときは、負けが決まる扉を選ばない", () => {
      // 先手が最後にくぐる。2 点負けているので、1 点の扉では負け（2 点で引き分け、3 点で勝ち）
      const hist = [round(0, 0, 1), round(1, 2, 2), round(0, 1, 1), round(1, 0, 0), round(0, 0, 0)];
      const s = after(hist, 1);
      expect(s.scores).toEqual([0, 2]);
      expect(doors.status(s)).toEqual({ kind: "playing", turn: 0 });
      const c = counts(s, 0);
      expect(c[0]).toBe(0);
      expect(c[2]).toBeGreaterThan(0);
    });

    it("伏せた扉は見ない（わなの場所がちがっても、同じ乱数なら同じ扉を選ぶ）", () => {
      const a = play([0]);
      const b = play([2]);
      expect(view(a, 1)).toEqual(view(b, 1));
      for (const r of [0.1, 0.5, 0.9]) expect(pick(a, 1, r)).toBe(pick(b, 1, r));
    });

    it("コンピュータ同士で最後まで遊べる", () => {
      for (let game = 0; game < 50; game++) {
        const rng = seeded(game);
        let s = doors.initialState(rng);
        for (let ply = 0; ply < ROUNDS * 2; ply++) {
          const st = doors.status(s);
          if (st.kind !== "playing") throw new Error("早く終わった");
          const move = doors.botMove!(view(s, st.turn), st.turn, rng);
          expect(move).not.toBeNull();
          // 画面やサーバから送り直しても同じ手として読める
          expect(doors.parseMove(JSON.parse(JSON.stringify(move)))).toEqual(move);
          s = doors.applyMove(s, move!, st.turn);
        }
        expect(doors.status(s).kind).toBe("finished");
        expect(s.history).toHaveLength(ROUNDS);
        const total = (seat: Seat) => s.history.filter((_, i) => walkerOf(i) === seat).reduce((n, r) => n + r.points, 0);
        expect(s.scores).toEqual([total(0), total(1)]);
      }
    });
  });
});
