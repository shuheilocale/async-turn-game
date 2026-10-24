import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import { thinStroke } from "./freehand.ts";
import {
  CLEAR_AVERAGE,
  gradeOf,
  heart,
  leftSeatOf,
  MAX_POINTS,
  orient,
  ROUNDS,
  scoreHeart,
  summary,
  THEMES,
  turnOf,
  type HeartMove,
  type HeartRound,
  type HeartScore,
  type HeartState,
  type HeartView,
  type Point,
} from "./heart.ts";

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

// ---------- テスト用の絵 ----------

type Side = "left" | "right";

/**
 * よく知られたハートの式（x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t）の半分。
 * 左半分は、上のくぼみ（t = 0）から外へふくらんで、下のとがり（t = π）まで。幅 32・高さ 29 ほどを k 倍して置く
 */
function rawHalf(side: Side, n = 100, dip = 0): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (Math.PI * i) / n;
    const s = Math.sin(t);
    const x = 16 * s * s * s;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + dip * Math.exp(-4 * t);
    return [side === "left" ? -x : x, y - 2.5] as Point;
  });
}

interface HalfOptions {
  cx?: number;
  cy?: number;
  /** 大きさ（1 で幅 640） */
  scale?: number;
  /** 横だけ・縦だけの伸び縮み */
  w?: number;
  h?: number;
  /** とがりから描き始める */
  reverse?: boolean;
  /** くぼみを深くする量（ハートの式の単位） */
  dip?: number;
  /** 描いた点を少しずつ動かす（u は描き始めからの割合 0〜1） */
  warp?: (p: Point, u: number) => Point;
}

function half(side: Side, { cx = 500, cy = 500, scale = 1, w = 1, h = 1, reverse = false, dip = 0, warp }: HalfOptions = {}): Point[] {
  const k = 20 * scale;
  const raw = rawHalf(side, 100, dip);
  const points = raw.map(([x, y], i) => {
    let p: Point = [x * k * w, y * k * h];
    if (warp) {
      // warp は左半分の向きで考える（右半分は左右を入れかえて当てる）
      const flip = side === "right" ? -1 : 1;
      const q = warp([p[0] * flip, p[1]], i / (raw.length - 1));
      p = [q[0] * flip, q[1]];
    }
    return [cx + p[0], cy + p[1]] as Point;
  });
  return reverse ? points.reverse() : points;
}

/** 左右そろった 2 つの半分 */
const pair = (opts: HalfOptions = {}): [Point[], Point[]] => [half("left", opts), half("right", opts)];

const shift = (points: Point[], dx: number, dy: number) => points.map(([x, y]) => [x + dx, y + dy] as Point);
const scaleAbout = (points: Point[], [cx, cy]: Point, s: number) =>
  points.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s] as Point);

/** 手のふるえ */
function shaky(points: Point[], amount: number, seed = 1): Point[] {
  const rng = seeded(seed);
  return points.map(([x, y]) => [x + (rng() * 2 - 1) * amount, y + (rng() * 2 - 1) * amount]);
}

/** 画面から送る形（0〜1000 の整数、200 点まで） */
const int = (points: Point[]) => thinStroke(points);
const score = (left: Point[], right: Point[]): HeartScore => scoreHeart(int(left), int(right));
const total = (left: Point[], right: Point[]) => score(left, right).score;

/** 2 つの円と直線で描いた、手描きらしいまるいハートの半分 */
function roundHalf(side: Side): Point[] {
  const r = 160;
  const points: Point[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = -(Math.PI * 1.25 * i) / 60;
    points.push([-r + r * Math.cos(a), 330 + r * Math.sin(a)]);
  }
  const last = points.at(-1)!;
  for (let i = 1; i <= 40; i++) points.push([last[0] * (1 - i / 40), last[1] + (800 - last[1]) * (i / 40)]);
  return points.map(([x, y]) => [500 + (side === "left" ? x : -x), y] as Point);
}

// ---------- 対局を進める ----------

const [L, R] = pair().map(int) as [Point[], Point[]];
const move = (points: Point[]): HeartMove => ({ points });

/** 手番の人が順に描く。左の手番には左半分、右の手番には右半分を描く */
function play(s: HeartState, count: number, halves: [Point[], Point[]] = [L, R]): HeartState {
  for (let i = 0; i < count; i++) {
    const seat = turnOf(s.rounds)!;
    const last = s.rounds.at(-1);
    const drawingRight = last !== undefined && last.right === null;
    s = heart.applyMove(s, move(drawingRight ? halves[1] : halves[0]), seat);
  }
  return s;
}

const start = () => heart.initialState(Math.random);
const view = (s: HeartState, viewer: Seat | null, revealAll = false) => heart.viewState!(s, viewer, revealAll) as HeartView;

/** 点数だけを決めた、終わった回戦（合計の数え方を確かめる用） */
const decided = (index: number, value: number): HeartRound => ({
  leftSeat: leftSeatOf(index),
  theme: THEMES[index]!,
  left: [],
  right: [],
  result: { score: value, symmetry: value, joins: value, shape: value },
});

describe("heart", () => {
  describe("採点", () => {
    it("きれいに左右対称なハートは高い。3 つの見どころもそろって高い", () => {
      const s = score(...pair());
      expect(s.score).toBeGreaterThanOrEqual(97);
      expect(s.symmetry).toBeGreaterThanOrEqual(97);
      expect(s.joins).toBeGreaterThanOrEqual(97);
      expect(s.shape).toBeGreaterThanOrEqual(97);
      // 少し手がふるえても高い
      const [l, r] = pair();
      expect(total(shaky(l, 6, 1), shaky(r, 6, 2))).toBeGreaterThanOrEqual(92);
      expect(total(shaky(l, 12, 3), shaky(r, 12, 4))).toBeGreaterThanOrEqual(85);
    });

    it("点数は 0〜100 の整数。3 つの見どころも 0〜100 の整数", () => {
      const rng = seeded(5);
      const random = () => Array.from({ length: 2 + Math.floor(rng() * 150) }, () => [Math.floor(rng() * 1001), Math.floor(rng() * 1001)] as Point);
      for (let i = 0; i < 30; i++) {
        const s = scoreHeart(random(), random());
        for (const v of [s.score, s.symmetry, s.joins, s.shape]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
      // 点が 1 つ・同じ点ばかりは 0 点
      expect(scoreHeart([[500, 500]], R).score).toBe(0);
      expect(scoreHeart(L, [[500, 500], [500, 500]]).score).toBe(0);
    });

    it("描き始めがくぼみでもとがりでも同じ点", () => {
      const base = total(...pair());
      expect(total(half("left", { reverse: true }), half("right"))).toBe(base);
      expect(total(half("left"), half("right", { reverse: true }))).toBe(base);
      // ゆがんだ絵でも同じ
      const [l, r] = [shaky(half("left"), 10, 7), shaky(half("right", { w: 1.15 }), 10, 8)];
      const bent = total(l, r);
      expect(total([...l].reverse(), [...r].reverse())).toBe(bent);
      expect(orient([[500, 800], [300, 300], [500, 350]])).toEqual([[500, 350], [300, 300], [500, 800]]);
    });

    it("ハート全体の大きさ・位置は点数に関係ない（小さすぎなければ）", () => {
      const [l, r] = [shaky(half("left"), 8, 1), shaky(half("right", { w: 1.1 }), 8, 2)];
      const base = total(l, r);
      for (const t of [
        { s: 0.5, dx: 0, dy: 0 },
        { s: 1.3, dx: 0, dy: 0 },
        { s: 0.7, dx: -120, dy: 80 },
        { s: 1, dx: 60, dy: -90 },
      ]) {
        const move = (p: Point[]) => shift(scaleAbout(p, [500, 500], t.s), t.dx, t.dy);
        expect(Math.abs(total(move(l), move(r)) - base), JSON.stringify(t)).toBeLessThanOrEqual(1);
      }
    });

    it("小さすぎるハートは低い", () => {
      expect(total(...pair({ scale: 0.35 }))).toBeGreaterThanOrEqual(95);
      expect(total(...pair({ scale: 0.12 }))).toBeLessThan(50);
      expect(total(...pair({ scale: 0.05 }))).toBe(0);
    });

    it("大きさや位置の小さなずれには強い", () => {
      const [l, r] = pair();
      // 右半分だけ、少しずらす・少し大きさを変える
      expect(total(l, shift(r, 20, 0))).toBeGreaterThanOrEqual(95);
      expect(total(l, shift(r, -15, 0))).toBeGreaterThanOrEqual(95);
      expect(total(l, shift(r, 0, 20))).toBeGreaterThanOrEqual(92);
      expect(total(l, shift(r, 15, -15))).toBeGreaterThanOrEqual(92);
      expect(total(l, scaleAbout(r, r[0]!, 1.05))).toBeGreaterThanOrEqual(95);
      expect(total(l, scaleAbout(r, r[0]!, 0.95))).toBeGreaterThanOrEqual(95);
      expect(total(l, scaleAbout(r, r[0]!, 1.1))).toBeGreaterThanOrEqual(85);
      // 少し太め・細めの半分も（2 人の手のくせ）
      expect(total(l, half("right", { w: 1.1 }))).toBeGreaterThanOrEqual(90);
    });

    it("片方がずれると下がる", () => {
      const [l, r] = pair();
      const clean = total(l, r);
      const cases: [string, Point[]][] = [
        ["右へ 100", shift(r, 100, 0)],
        ["下へ 100", shift(r, 0, 100)],
        ["1.3 倍", scaleAbout(r, r[0]!, 1.3)],
        ["縦につぶれた", half("right", { h: 0.75 })],
      ];
      for (const [name, bad] of cases) {
        const b = total(l, bad);
        expect(b, name).toBeLessThan(60);
        expect(clean - b, name).toBeGreaterThanOrEqual(35);
      }
      // 右半分だけ横に太い：形のちがいとして「左右のそろい」が下がる
      const wide = score(l, half("right", { w: 1.35 }));
      expect(wide.symmetry).toBeLessThan(75);
      expect(wide.joins).toBeGreaterThanOrEqual(95);
      // ずれが大きいほど低い
      const shifted = [20, 50, 80, 120].map((d) => total(l, shift(r, 0, d)));
      for (let i = 1; i < shifted.length; i++) expect(shifted[i]!).toBeLessThan(shifted[i - 1]!);
    });

    it("つなぎ目（上のくぼみと下のとがり）が離れると下がる", () => {
      const [l, r] = pair();
      // 2 つの半分を左右に離す（形はそろっているので「左右のそろい」は高いまま）
      const apart = score(shift(l, -45, 0), shift(r, 45, 0));
      expect(apart.joins).toBeLessThan(50);
      expect(apart.symmetry).toBeGreaterThanOrEqual(97);
      expect(apart.score).toBeLessThan(75);
      // 右半分のとがりだけ 100 上で終わる
      const tip = score(l, half("right", { warp: ([x, y], u) => [x, y - 100 * u] }));
      expect(tip.joins).toBeLessThan(50);
      expect(tip.score).toBeLessThan(55);
      // 右半分のくぼみだけ 90 下から始まる
      const dip = score(l, half("right", { warp: ([x, y], u) => [x, y + 90 * (1 - u)] }));
      expect(dip.joins).toBeLessThan(50);
      expect(dip.score).toBeLessThan(65);
    });

    it("ハートらしくない形は低い（左右がそろっていても）", () => {
      // 半円 2 つ（合わせると円）
      const semi = (side: Side) =>
        Array.from({ length: 101 }, (_, i) => {
          const a = -Math.PI / 2 - (Math.PI * i) / 100;
          const x = 300 * Math.cos(a);
          return [500 + (side === "left" ? x : -x), 500 + 300 * Math.sin(a)] as Point;
        });
      const circle = score(semi("left"), semi("right"));
      expect(circle.symmetry).toBeGreaterThanOrEqual(97);
      expect(circle.shape).toBeLessThan(20);
      expect(circle.score).toBeLessThan(40);
      // 逆三角形
      const vee = (side: Side) => path([[500, 300], [side === "left" ? 200 : 800, 300], [500, 800]]);
      expect(total(vee("left"), vee("right"))).toBeLessThan(45);
      // 真ん中の線をなぞっただけ
      const line = path([[500, 200], [500, 800]]);
      expect(total(line, line)).toBeLessThan(10);
      // でたらめな線
      const rng = seeded(9);
      const scribble = () => Array.from({ length: 80 }, () => [100 + rng() * 800, 100 + rng() * 800] as Point);
      expect(total(scribble(), scribble())).toBeLessThan(15);
    });

    it("人によってちがうハートの描き方（まるい・太い・細い・くぼみが深い）でも高い", () => {
      expect(total(roundHalf("left"), roundHalf("right"))).toBeGreaterThanOrEqual(90);
      expect(total(...pair({ w: 1.3 }))).toBeGreaterThanOrEqual(90);
      expect(total(...pair({ w: 0.75 }))).toBeGreaterThanOrEqual(90);
      expect(total(...pair({ dip: 4 }))).toBeGreaterThanOrEqual(85);
      // 描き方のちがう 2 人（まるいハートと、とがったハート）は少し下がる
      const mixed = total(roundHalf("left"), half("right"));
      expect(mixed).toBeGreaterThanOrEqual(70);
      expect(mixed).toBeLessThan(total(roundHalf("left"), roundHalf("right")));
    });
  });

  describe("回戦と手番", () => {
    it("はじめは先手が左半分を描く番。お題は 1 回戦目から 目安あり・目安なし・目隠し", () => {
      const s = start();
      expect(s.rounds).toEqual([]);
      expect(heart.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(THEMES).toEqual(["guide", "free", "blind"]);
      expect(ROUNDS).toBe(3);
    });

    it("左半分の人が描くと、手番は右半分の人へ。まだ点数はない", () => {
      const s = heart.applyMove(start(), move(L), 0);
      expect(s.rounds).toEqual([{ leftSeat: 0, theme: "guide", left: L, right: null, result: null }]);
      expect(heart.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("右半分の人が描くと回戦が終わり、2 つを合わせた点数をサーバで計算する", () => {
      const s = play(start(), 2);
      expect(s.rounds[0]).toMatchObject({ left: L, right: R });
      expect(s.rounds[0]!.result).toEqual(scoreHeart(L, R));
      expect(s.rounds[0]!.result!.score).toBeGreaterThanOrEqual(95);
    });

    it("回戦ごとに左右を交代する。左半分の人が先に描くので、回戦の終わりは同じ人が続けて描く", () => {
      let s = play(start(), 2);
      // 2 回戦目は後手が左半分。1 回戦目を右で描き終えた後手が、続けて描く
      expect(heart.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, 1);
      expect(s.rounds[1]).toMatchObject({ leftSeat: 1, theme: "free", left: L, right: null });
      expect(heart.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, 1);
      // 3 回戦目は先手が左半分
      expect(heart.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, 1);
      expect(s.rounds[2]).toMatchObject({ leftSeat: 0, theme: "blind" });
      expect(heart.status(s)).toEqual({ kind: "playing", turn: 1 });
      expect([0, 1, 2].map(leftSeatOf)).toEqual([0, 1, 0]);
    });

    it("手番でない人は描けない", () => {
      const s = start();
      expect(() => heart.applyMove(s, move(L), 1)).toThrow(IllegalMoveError);
      expect(() => heart.applyMove(s, move(L), 1)).toThrow("not_your_turn");
      const next = play(s, 1);
      expect(() => heart.applyMove(next, move(R), 0)).toThrow("not_your_turn");
    });

    it("3 回戦で終わり、もう描けない", () => {
      const s = play(start(), 6);
      expect(s.rounds).toHaveLength(ROUNDS);
      expect(s.rounds.every((r) => r.result !== null)).toBe(true);
      expect(turnOf(s.rounds)).toBeNull();
      expect(heart.status(s).kind).toBe("finished");
      expect(() => heart.applyMove(s, move(L), 0)).toThrow("game_over");
      expect(() => heart.applyMove(s, move(L), 1)).toThrow("game_over");
    });
  });

  describe("3 回戦の合計と、クリア・失敗", () => {
    it("合計と平均は終わった回戦だけで数える", () => {
      expect(summary([])).toEqual({ scores: [], total: 0, average: 0 });
      const waiting: HeartRound = { leftSeat: 1, theme: "free", left: L, right: null, result: null };
      expect(summary([decided(0, 80), waiting])).toEqual({ scores: [80], total: 80, average: 80 });
      expect(summary([decided(0, 80), decided(1, 70), decided(2, 61)])).toEqual({ scores: [80, 70, 61], total: 211, average: 211 / 3 });
    });

    it("協力ゲームなので勝ち負けはなく、平均 60 点以上ならクリア、未満なら失敗", () => {
      expect(CLEAR_AVERAGE).toBe(60);
      const end = (...scores: number[]): HeartState => ({ rounds: scores.map((v, i) => decided(i, v)) });
      expect(heart.status(end(60, 60, 60))).toEqual({ kind: "finished", winner: null, coop: "cleared" });
      expect(heart.status(end(100, 40, 40))).toEqual({ kind: "finished", winner: null, coop: "cleared" });
      expect(heart.status(end(95, 90, 99))).toEqual({ kind: "finished", winner: null, coop: "cleared" });
      expect(heart.status(end(59, 60, 60))).toEqual({ kind: "finished", winner: null, coop: "failed" });
      expect(heart.status(end(0, 0, 0))).toEqual({ kind: "finished", winner: null, coop: "failed" });
      // 3 回戦そろうまでは終わらない
      expect(heart.status(end(90, 90))).toEqual({ kind: "playing", turn: 0 });
    });

    it("きれいなハートを 3 回描けばクリア、ハートでない形ばかりなら失敗", () => {
      expect(heart.status(play(start(), 6)).kind).toBe("finished");
      expect(heart.status(play(start(), 6))).toMatchObject({ coop: "cleared" });
      const line = path([[500, 200], [500, 800]]);
      expect(heart.status(play(start(), 6, [line, line]))).toMatchObject({ winner: null, coop: "failed" });
    });

    it("点数をやさしい言葉に直す（90 点以上はぴったり）", () => {
      expect([100, 90, 89, 75, 74, 60, 59, 40, 39, 0].map(gradeOf)).toEqual([
        "perfect",
        "perfect",
        "great",
        "great",
        "good",
        "good",
        "close",
        "close",
        "apart",
        "apart",
      ]);
    });
  });

  describe("描いた点の列を確かめる", () => {
    it("2〜200 点。少なすぎても多すぎても受け付けない", () => {
      const at = (n: number) => Array.from({ length: n }, (_, i) => [i % 1000, 500] as Point);
      expect(heart.applyMove(start(), move(at(2)), 0).rounds).toHaveLength(1);
      expect(heart.applyMove(start(), move(at(MAX_POINTS)), 0).rounds).toHaveLength(1);
      for (const n of [0, 1, MAX_POINTS + 1, 5000]) {
        expect(() => heart.applyMove(start(), move(at(n)), 0)).toThrow("heart_points");
      }
    });

    it("座標は 0〜1000 の整数。枠の外の点は受け付けない", () => {
      expect(heart.applyMove(start(), move([[0, 0], [1000, 1000]]), 0).rounds).toHaveLength(1);
      for (const bad of [[-1, 500], [500, -1], [1001, 500], [500, 1001], [500.5, 500]] as Point[]) {
        expect(() => heart.applyMove(start(), move([[500, 500], bad]), 0)).toThrow("heart_coords");
      }
    });

    it("画面は 200 点までに間引いてから送る（ひとふでチャレンジと同じ thinStroke）。間引いても点数はほとんど変わらない", () => {
      const dense = pair().map((p) => {
        const out: Point[] = [];
        for (let i = 1; i < p.length; i++) {
          for (let k = 0; k < 8; k++) {
            const a = p[i - 1]!;
            const b = p[i]!;
            out.push([a[0] + ((b[0] - a[0]) * k) / 8, a[1] + ((b[1] - a[1]) * k) / 8]);
          }
        }
        return out;
      }) as [Point[], Point[]];
      expect(dense[0].length).toBeGreaterThan(MAX_POINTS);
      const thin = dense.map((p) => thinStroke(p));
      expect(thin[0]!.length).toBeLessThanOrEqual(MAX_POINTS);
      expect(() => heart.applyMove(start(), move(thin[0]!), 0)).not.toThrow();
      expect(Math.abs(scoreHeart(thin[0]!, thin[1]!).score - scoreHeart(L, R).score)).toBeLessThanOrEqual(1);
    });

    it("parseMove は整数の点の列だけを読む（送られた点数は使わない）", () => {
      expect(heart.parseMove({ points: [[1, 2], [3, 4]] })).toEqual({ points: [[1, 2], [3, 4]] });
      expect(heart.parseMove({ points: [[1, 2], [3, 4]], score: 100, result: { score: 100 } })).toEqual({ points: [[1, 2], [3, 4]] });
      // 範囲や数は applyMove で確かめる
      expect(heart.parseMove({ points: [[-5, 2000]] })).toEqual({ points: [[-5, 2000]] });
      for (const raw of [
        null,
        42,
        "points",
        {},
        { points: "1,2" },
        { points: [[1.5, 2]] },
        { points: [[1, 2, 3]] },
        { points: [[1]] },
        { points: [["1", 2]] },
        { points: [[1, Number.NaN]] },
        { points: [[Infinity, 2]] },
        { points: [{ x: 1, y: 2 }] },
      ]) {
        expect(heart.parseMove(raw), JSON.stringify(raw)).toBeNull();
      }
    });

    it("サーバに保存されるのは計算した点数", () => {
      const line = int(path([[500, 200], [500, 800]]));
      const forged = { points: line, result: { score: 100, symmetry: 100, joins: 100, shape: 100 } };
      let s = heart.applyMove(start(), heart.parseMove(JSON.parse(JSON.stringify(forged)))!, 0);
      s = heart.applyMove(s, heart.parseMove(JSON.parse(JSON.stringify(forged)))!, 1);
      expect(s.rounds[0]!.result).toEqual(scoreHeart(line, line));
      expect(s.rounds[0]!.result!.score).toBeLessThan(10);
    });
  });

  describe("伏せる・見せ合う", () => {
    it("先に描いた左半分は、右半分の人が描き終えるまで、右半分の人と観戦者には伏せる。描いた本人には見える", () => {
      const s = play(start(), 1);
      for (const viewer of [1, null] as const) {
        const v = view(s, viewer);
        expect(v.rounds[0]).toEqual({ leftSeat: 0, theme: "guide", left: "hidden", right: null, result: null });
        expect(JSON.stringify(v)).not.toContain(JSON.stringify(L[0]));
      }
      expect(view(s, 0).rounds[0]).toEqual(s.rounds[0]);
    });

    it("2 人とも描いたら、2 つの半分と点数を見せ合う", () => {
      const s = play(start(), 2);
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).rounds).toEqual(s.rounds);
    });

    it("次の回戦の左半分が伏せられても、終わった回戦は見えたまま", () => {
      const s = play(start(), 3);
      // 2 回戦目の左半分は後手が描いた。先手には伏せる
      const v = view(s, 0);
      expect(v.rounds[0]).toEqual(s.rounds[0]);
      expect(v.rounds[1]!.left).toBe("hidden");
      expect(view(s, 1).rounds[1]).toEqual(s.rounds[1]);
    });

    it("終局後はすべて見える", () => {
      const s = play(start(), 6);
      expect(view(s, 0, true)).toEqual(s);
      expect(view(s, null, true)).toEqual(s);
      // 終局前でも、伏せる回戦がなければ同じ
      const mid = play(start(), 2);
      expect(view(mid, null, true)).toEqual(mid);
      expect(view(play(start(), 1), null, true)).toEqual(play(start(), 1));
    });

    it("手の記録では、相手の点の列を伏せる", () => {
      expect(heart.viewMove!(move(L), 0, 0)).toEqual(move(L));
      expect(heart.viewMove!(move(L), 0, 1)).toEqual({ points: null });
      expect(heart.viewMove!(move(R), 1, null)).toEqual({ points: null });
    });
  });
});

/** 頂点を順に結んだ折れ線（辺ごとに 30 点） */
function path(vertices: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!;
    const b = vertices[i]!;
    for (let k = 0; k < 30; k++) out.push([a[0] + ((b[0] - a[0]) * k) / 30, a[1] + ((b[1] - a[1]) * k) / 30]);
  }
  out.push(vertices.at(-1)!);
  return out;
}
