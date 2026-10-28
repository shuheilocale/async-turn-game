import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import {
  AIM_MAX,
  BACK_Y,
  countingStones,
  curling,
  ENDS,
  EXTRA_ENDS,
  MAX_FRAMES,
  MAX_SWEEPS,
  HOG_Y,
  HOUSE_R,
  inPlay,
  scoreEnd,
  SHEET_W,
  SPEED_MAX,
  SPEED_MIN,
  STONE_R,
  TEE_Y,
  THROWS,
  totals,
  turnOf,
  type CurlingMove,
  type CurlingState,
  type CurlingStone,
  type Placed,
} from "./curling.ts";

const rng = () => 0.5;

/** 石を置く。d はハウスの中心からの距離、angle は中心から見た向き（0 なら手前） */
const at = (d: number, angle = 0): [number, number] => [d * Math.sin(angle), TEE_Y - d * Math.cos(angle)];

/** 前に投げた石はそのままで、投げた石を (x, y) に止めた手。null なら投げた石は取り除かれたことにする */
function throwTo(s: CurlingState, pos: [number, number] | null, moved: Placed[] = []): CurlingMove {
  const keep: Placed[] = s.stones
    .filter((st) => !moved.some((m) => m[0] === st.id))
    .map((st) => [st.id, st.x, st.y, st.angle]);
  const thrown: Placed[] = pos ? [[s.thrown, pos[0], pos[1], 0.5]] : [];
  return { aim: 0, speed: 6.6, spin: 1, stones: [...keep, ...moved, ...thrown] };
}

/** 今の手番の人が投げる */
function play(s: CurlingState, move: CurlingMove): CurlingState {
  const st = curling.status(s);
  if (st.kind !== "playing") throw new Error("finished");
  return curling.applyMove(s, move, st.turn);
}

/**
 * 1 エンドを投げきる。places[i] は i 投目の石を止める場所（null なら取り除かれる）。
 * 前の石は動かさない
 */
function playEnd(s: CurlingState, places: ([number, number] | null)[]): CurlingState {
  expect(places).toHaveLength(THROWS);
  return places.reduce((st, p) => play(st, throwTo(st, p)), s);
}

/** 8 投とも取り除かれるエンド（得点なし） */
const blank = Array.from({ length: THROWS }, () => null);

/** 先に投げる人の石を、中心から近い順に n 個ハウスに入れ、ハンマーの人の石はハウスの外に出す */
function firstScores(n: number): ([number, number] | null)[] {
  return Array.from({ length: THROWS }, (_, i) => (i % 2 === 0 && i / 2 < n ? at(0.3 + 0.35 * (i / 2), 0.5 * i) : null));
}

/** ハンマーの人の石を n 個ハウスに入れる */
function hammerScores(n: number): ([number, number] | null)[] {
  return Array.from({ length: THROWS }, (_, i) =>
    i % 2 === 1 && (i - 1) / 2 < n ? at(0.3 + 0.35 * ((i - 1) / 2), 0.5 * i) : null,
  );
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof IllegalMoveError ? e.code : "other";
  }
}

const stone = (id: number, seat: Seat, d: number, angle = 0): CurlingStone => {
  const [x, y] = at(d, angle);
  return { id, seat, x, y, angle: 0 };
};

describe("curling", () => {
  describe("はじめ", () => {
    it("1 エンド目は後手がハンマー（最後の 1 投）を持ち、先手から投げる", () => {
      const s = curling.initialState(rng);
      expect(s).toEqual({ hammer: 1, thrown: 0, stones: [], ends: [], last: null });
      expect(curling.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("手番", () => {
    it("1 エンドに 1 人 4 投ずつ交互に投げ、最後の 1 投はハンマーの人", () => {
      let s = curling.initialState(rng);
      const turns: Seat[] = [];
      for (let i = 0; i < THROWS; i++) {
        turns.push(turnOf(s)!);
        s = play(s, throwTo(s, null));
      }
      expect(turns).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
      expect(s.ends).toHaveLength(1);
    });

    it("手番でなければ投げられない", () => {
      const s = curling.initialState(rng);
      expect(codeOf(() => curling.applyMove(s, throwTo(s, at(0)), 1))).toBe("not_your_turn");
    });

    it("投げた石は、投げた人の色の石として置かれる", () => {
      const s1 = play(curling.initialState(rng), throwTo(curling.initialState(rng), at(0.5)));
      expect(s1.stones).toEqual([{ id: 0, seat: 0, x: 0, y: TEE_Y - 0.5, angle: 0.5 }]);
      const s2 = play(s1, throwTo(s1, at(1, 0.4)));
      expect(s2.stones.map((st) => [st.id, st.seat])).toEqual([
        [0, 0],
        [1, 1],
      ]);
      expect(s2.thrown).toBe(2);
    });

    it("直前の 1 投を覚えておく（相手の画面で再生する）", () => {
      const s0 = curling.initialState(rng);
      const s1 = play(s0, throwTo(s0, at(0.5)));
      const move = { ...throwTo(s1, at(0.2)), aim: -0.0123456, speed: 6.543219, spin: -1 as const };
      const s2 = play(s1, move);
      expect(s2.last).toEqual({
        seat: 1,
        end: 0,
        id: 1,
        aim: -0.0123,
        speed: 6.5432,
        spin: -1,
        before: s1.stones,
        after: s2.stones,
      });
    });

    it("位置は 0.1 mm 単位にそろえて保存する", () => {
      const s0 = curling.initialState(rng);
      const s1 = play(s0, { aim: 0, speed: 6.6, spin: 1, stones: [[0, 0.123456, 21.0000049, -0.30000049]] });
      expect(s1.stones[0]).toEqual({ id: 0, seat: 0, x: 0.1235, y: 21, angle: -0.3 });
    });
  });

  describe("取り除かれる石", () => {
    it("投げた石も、はじかれた前の石も、手に入っていなければ取り除く", () => {
      const s0 = curling.initialState(rng);
      const s1 = play(s0, throwTo(s0, at(0.5)));
      const s2 = play(s1, throwTo(s1, at(1)));
      // 3 投目が 0 番の石をはじき出し、自分も外へ出た
      const s3 = play(s2, { aim: 0, speed: 9, spin: 1, stones: [[1, ...at(1), 0.5]] });
      expect(s3.stones.map((st) => st.id)).toEqual([1]);
      expect(s3.last!.before.map((st) => st.id)).toEqual([0, 1]);
      expect(s3.last!.after.map((st) => st.id)).toEqual([1]);
    });

    it("シートの外（横・奥）や、ホッグラインを越えていない場所にある石は受け付けない", () => {
      const s = curling.initialState(rng);
      const where = (x: number, y: number) => codeOf(() => play(s, { aim: 0, speed: 6, spin: 1, stones: [[0, x, y, 0]] }));
      expect(where(0, TEE_Y)).toBeNull();
      // 横の線に触れたら外
      expect(where(SHEET_W / 2 - STONE_R - 0.01, TEE_Y)).toBeNull();
      expect(where(SHEET_W / 2 - STONE_R + 0.01, TEE_Y)).toBe("curling_out");
      expect(where(-(SHEET_W / 2 - STONE_R + 0.01), TEE_Y)).toBe("curling_out");
      // 奥の線（バックライン）は、完全に越えたら外
      expect(where(0, BACK_Y + STONE_R - 0.01)).toBeNull();
      expect(where(0, BACK_Y + STONE_R + 0.01)).toBe("curling_out");
      // ホッグラインは、完全に越えていなければ外
      expect(where(0, HOG_Y + STONE_R + 0.01)).toBeNull();
      expect(where(0, HOG_Y + STONE_R - 0.01)).toBe("curling_out");
      expect(where(0, HOG_Y - 3)).toBe("curling_out");
    });

    it("場所の判定", () => {
      expect(inPlay(0, TEE_Y)).toBe(true);
      expect(inPlay(0, HOG_Y)).toBe(false);
      expect(inPlay(SHEET_W / 2, TEE_Y)).toBe(false);
      expect(inPlay(0, BACK_Y + 1)).toBe(false);
    });

    it("知らない石・同じ石を 2 回入れた手は受け付けない", () => {
      const s0 = curling.initialState(rng);
      const s1 = play(s0, throwTo(s0, at(0.5)));
      // まだ投げていない石（2 番）
      expect(codeOf(() => play(s1, { aim: 0, speed: 6, spin: 1, stones: [[2, ...at(0), 0]] }))).toBe("curling_stone");
      expect(
        codeOf(() =>
          play(s1, {
            aim: 0,
            speed: 6,
            spin: 1,
            stones: [
              [0, ...at(0.5), 0],
              [0, ...at(1), 0],
            ],
          }),
        ),
      ).toBe("curling_stone");
      // 一度取り除かれた石は戻せない
      const s2 = play(s1, throwTo(s1, null, []));
      const s3 = play(s2, { aim: 0, speed: 6, spin: 1, stones: [] });
      expect(codeOf(() => play(s3, { aim: 0, speed: 6, spin: 1, stones: [[1, ...at(0), 0]] }))).toBe("curling_stone");
    });
  });

  describe("エンドの得点", () => {
    it("ハウスに石がなければ、どちらも点にならない", () => {
      expect(scoreEnd([])).toEqual({ scorer: null, points: 0 });
      expect(scoreEnd([stone(0, 0, HOUSE_R + STONE_R + 0.05), stone(1, 1, 3)])).toEqual({ scorer: null, points: 0 });
    });

    it("相手の石がハウスになければ、ハウスにある自分の石が全部点になる", () => {
      expect(scoreEnd([stone(0, 0, 0.2), stone(2, 0, 1.5, 1), stone(1, 1, 4)])).toEqual({ scorer: 0, points: 2 });
    });

    it("相手のいちばん近い石より中心に近い石の数だけ点になる", () => {
      // 近い順に 後・後・先・後
      const stones = [stone(0, 0, 0.9), stone(1, 1, 0.1), stone(3, 1, 0.5, 2), stone(5, 1, 1.2, -1)];
      expect(scoreEnd(stones)).toEqual({ scorer: 1, points: 2 });
      // 近い順に 先・後・先・先
      expect(scoreEnd([stone(0, 0, 0), stone(1, 1, 0.3), stone(2, 0, 0.6, 1), stone(4, 0, 1.6, -2)])).toEqual({
        scorer: 0,
        points: 1,
      });
    });

    it("8 個ともハウスにあって、片方が全部近ければ 4 点", () => {
      const stones = Array.from({ length: 8 }, (_, i) => stone(i, (i % 2) as Seat, i % 2 === 0 ? 0.3 * (i / 2) : 1.2 + 0.1 * i, i));
      expect(scoreEnd(stones)).toEqual({ scorer: 0, points: 4 });
    });

    it("ハウスの線に少しでもかかっていれば数える", () => {
      expect(scoreEnd([stone(0, 1, HOUSE_R + STONE_R - 0.005)])).toEqual({ scorer: 1, points: 1 });
      expect(scoreEnd([stone(0, 1, HOUSE_R + STONE_R + 0.005)])).toEqual({ scorer: null, points: 0 });
    });

    it("いちばん近い石が 2 人とも同じ近さなら、どちらも点にならない", () => {
      expect(scoreEnd([stone(0, 0, 0.8, 1), stone(1, 1, 0.8, -1), stone(2, 0, 1.5)])).toEqual({ scorer: null, points: 0 });
    });

    it("点になる石を、中心に近い順に返す（画面で印を付ける）", () => {
      const stones = [stone(0, 0, 0.9), stone(1, 1, 0.5, 2), stone(3, 1, 0.1), stone(5, 1, 1.2, -1)];
      expect(countingStones(stones).map((s) => s.id)).toEqual([3, 1]);
      expect(countingStones([])).toEqual([]);
    });

    it("エンドの 8 投目で得点を記録し、石を片付けて次のエンドへ進む", () => {
      const places = [at(0.4), at(1.5, 1), null, at(0.1, 2), at(1.0, -1), null, null, at(3)];
      const s = playEnd(curling.initialState(rng), places);
      expect(s.ends).toHaveLength(1);
      expect(s.ends[0]).toMatchObject({ hammer: 1, scorer: 1, points: 1 });
      expect(s.ends[0]!.stones.map((st) => st.id)).toEqual([0, 1, 3, 4, 7]);
      expect(s.stones).toEqual([]);
      expect(s.thrown).toBe(0);
      // 最後の 1 投の再生のために、エンドの最後の並びも覚えておく
      expect(s.last!.end).toBe(0);
      expect(s.last!.after).toEqual(s.ends[0]!.stones);
    });
  });

  describe("ハンマーの交代", () => {
    it("ハンマーの人が点を取ったら、次のエンドは相手がハンマー", () => {
      const s = playEnd(curling.initialState(rng), hammerScores(2));
      expect(s.ends[0]).toMatchObject({ scorer: 1, points: 2 });
      expect(s.hammer).toBe(0);
      expect(turnOf(s)).toBe(1);
    });

    it("先に投げた人が点を取ったら（スチール）、ハンマーはそのまま", () => {
      const s = playEnd(curling.initialState(rng), firstScores(1));
      expect(s.ends[0]).toMatchObject({ scorer: 0, points: 1 });
      expect(s.hammer).toBe(1);
      expect(turnOf(s)).toBe(0);
    });

    it("どちらも点を取らなければ（ブランクエンド）、ハンマーはそのまま", () => {
      const s = playEnd(curling.initialState(rng), blank);
      expect(s.ends[0]).toMatchObject({ scorer: null, points: 0 });
      expect(s.hammer).toBe(1);
    });

    it("2 エンド目は、ハンマーを持つ人が最後に投げる", () => {
      let s = playEnd(curling.initialState(rng), hammerScores(1));
      const turns: Seat[] = [];
      for (let i = 0; i < THROWS; i++) {
        turns.push(turnOf(s)!);
        s = play(s, throwTo(s, null));
      }
      expect(turns).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
      expect(s.ends[1]!.hammer).toBe(0);
    });
  });

  describe("勝敗", () => {
    it(`${ENDS} エンドの合計が多い方の勝ち`, () => {
      const s1 = playEnd(curling.initialState(rng), hammerScores(2));
      expect(curling.status(s1).kind).toBe("playing");
      // 2 エンド目：ハンマーは先手。後手（先に投げる人）が 1 点スチール → 後手 3 : 先手 0
      const s2 = playEnd(s1, firstScores(1));
      expect(totals(s2)).toEqual([0, 3]);
      expect(curling.status(s2)).toEqual({ kind: "finished", winner: 1 });
      expect(codeOf(() => curling.applyMove(s2, throwTo(s2, null), 0))).toBe("game_over");
    });

    it("同点なら延長 1 エンドで決める", () => {
      const s2 = playEnd(playEnd(curling.initialState(rng), hammerScores(1)), hammerScores(1));
      expect(totals(s2)).toEqual([1, 1]);
      // 延長：ハンマーは後手（2 エンド目にハンマーの先手が点を取ったので）。先手から投げる
      expect(s2.hammer).toBe(1);
      expect(curling.status(s2)).toEqual({ kind: "playing", turn: 0 });
      const s3 = playEnd(s2, hammerScores(3));
      expect(s3.ends).toHaveLength(ENDS + EXTRA_ENDS);
      expect(totals(s3)).toEqual([1, 4]);
      expect(curling.status(s3)).toEqual({ kind: "finished", winner: 1 });
    });

    it("延長でも同点なら引き分け", () => {
      const s2 = playEnd(playEnd(curling.initialState(rng), blank), blank);
      expect(curling.status(s2).kind).toBe("playing");
      const s3 = playEnd(s2, blank);
      expect(totals(s3)).toEqual([0, 0]);
      expect(curling.status(s3)).toEqual({ kind: "finished", winner: null });
    });

    it("延長に入らずに決まれば、延長はしない", () => {
      const s = playEnd(playEnd(curling.initialState(rng), blank), firstScores(2));
      expect(curling.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(turnOf(s)).toBeNull();
    });
  });

  describe("parseMove", () => {
    const ok = { aim: 0.05, speed: 6.6, spin: -1, stones: [[0, 0.1, 21.5, 1.2]] };

    it("形と範囲が正しい手だけ受け付ける", () => {
      expect(curling.parseMove(ok)).toEqual(ok);
      expect(curling.parseMove({ ...ok, spin: 1, stones: [] })).toEqual({ ...ok, spin: 1, stones: [] });
      expect(curling.parseMove({ ...ok, aim: AIM_MAX + 0.01 })).toBeNull();
      expect(curling.parseMove({ ...ok, aim: -AIM_MAX - 0.01 })).toBeNull();
      expect(curling.parseMove({ ...ok, aim: Number.NaN })).toBeNull();
      expect(curling.parseMove({ ...ok, speed: SPEED_MIN - 0.1 })).toBeNull();
      expect(curling.parseMove({ ...ok, speed: SPEED_MAX + 0.1 })).toBeNull();
      expect(curling.parseMove({ ...ok, speed: "6" })).toBeNull();
      expect(curling.parseMove({ ...ok, spin: 0 })).toBeNull();
      expect(curling.parseMove({ ...ok, spin: 2 })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: "[]" })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[0, 0.1, 21]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[0, 0.1, 21, Math.PI + 0.01]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[0.5, 0.1, 21, 0]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[-1, 0.1, 21, 0]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[THROWS, 0.1, 21, 0]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[0, Number.POSITIVE_INFINITY, 21, 0]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: [[0, 1e6, 21, 0]] })).toBeNull();
      expect(curling.parseMove({ ...ok, stones: Array.from({ length: THROWS + 1 }, (_, i) => [i, 0, 21, 0]) })).toBeNull();
      expect(curling.parseMove(null)).toBeNull();
      expect(curling.parseMove({ aim: 0, speed: 6 })).toBeNull();
    });

    it("こすったコマの番号は、1〜MAX_FRAMES の整数を小さい順に MAX_SWEEPS 個まで。空なら持たない", () => {
      expect(curling.parseMove({ ...ok, sweeps: [3, 10, 11] })).toEqual({ ...ok, sweeps: [3, 10, 11] });
      expect(curling.parseMove({ ...ok, sweeps: [] })).toEqual(ok);
      expect(curling.parseMove({ ...ok, sweeps: [MAX_FRAMES] })).toEqual({ ...ok, sweeps: [MAX_FRAMES] });
      expect(curling.parseMove({ ...ok, sweeps: [0] })).toBeNull();
      expect(curling.parseMove({ ...ok, sweeps: [MAX_FRAMES + 1] })).toBeNull();
      expect(curling.parseMove({ ...ok, sweeps: [5, 5] })).toBeNull();
      expect(curling.parseMove({ ...ok, sweeps: [6, 5] })).toBeNull();
      expect(curling.parseMove({ ...ok, sweeps: [1.5] })).toBeNull();
      expect(curling.parseMove({ ...ok, sweeps: "1" })).toBeNull();
      expect(curling.parseMove({ ...ok, sweeps: Array.from({ length: MAX_SWEEPS + 1 }, (_, i) => i + 1) })).toBeNull();
    });

    it("こすったコマは直前の 1 投に残す（相手の画面で同じように再生する）", () => {
      const s = curling.applyMove(curling.initialState(() => 0), { aim: 0, speed: 6.6, spin: 1, sweeps: [4, 9], stones: [[0, 0, 22, 0]] }, 0);
      expect(s.last?.sweeps).toEqual([4, 9]);
      const plain = curling.applyMove(curling.initialState(() => 0), { aim: 0, speed: 6.6, spin: 1, stones: [[0, 0, 22, 0]] }, 0);
      expect(plain.last && "sweeps" in plain.last).toBe(false);
    });
  });
});
