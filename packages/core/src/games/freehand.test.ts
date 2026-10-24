import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  analyzeDrawing,
  CANVAS,
  freehand,
  MAX_POINTS,
  ROUNDS,
  scoreDrawing,
  SHAPES,
  tally,
  thinStroke,
  turnOf,
  type FreehandMove,
  type FreehandRound,
  type FreehandState,
  type FreehandView,
  type Point,
  type Shape,
} from "./freehand.ts";

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

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (cx: number, cy: number, r: number, deg: number): Point => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];

/** 円（aspect を 1 より小さくすると縦につぶれただ円）。start は描き始めの角度、turns は回る量（1 で 1 周） */
function circle({ cx = 500, cy = 500, r = 300, n = 120, start = 0, dir = 1, turns = 1, aspect = 1 } = {}): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const [x, y] = polar(0, 0, r, start + dir * turns * (360 * i) / n);
    return [cx + x, cy + y * aspect] as Point;
  });
}

/** 頂点を順に結んで、closed なら最初の頂点に戻る折れ線（辺ごとに perSide 点） */
function path(vertices: Point[], { perSide = 30, closed = true } = {}): Point[] {
  const vs = closed ? [...vertices, vertices[0]!] : vertices;
  const out: Point[] = [vertices[0]!];
  for (let i = 1; i < vs.length; i++) {
    const [ax, ay] = vs[i - 1]!;
    const [bx, by] = vs[i]!;
    for (let k = 1; k <= perSide; k++) out.push([ax + ((bx - ax) * k) / perSide, ay + ((by - ay) * k) / perSide]);
  }
  return out;
}

/** 正多角形の頂点。rot は最初の頂点の角度 */
const regular = (k: number, { cx = 500, cy = 500, r = 300, rot = -90 } = {}) =>
  Array.from({ length: k }, (_, i) => polar(cx, cy, r, rot + (360 * i) / k));

/** 一筆書きの星（頂点を 1 つとばしに結ぶ） */
const pentagram = (opts: { cx?: number; cy?: number; r?: number; rot?: number } = {}) => {
  const v = regular(5, opts);
  return path([v[0]!, v[2]!, v[4]!, v[1]!, v[3]!], { perSide: 24 });
};

/** まわりをなぞる星（とがった角 5 つと、へこんだ角 5 つ） */
const starOutline = ({ cx = 500, cy = 500, r = 300, inner = 0.382 } = {}) =>
  path(
    Array.from({ length: 10 }, (_, i) => polar(cx, cy, i % 2 === 0 ? r : r * inner, -90 + 36 * i)),
    { perSide: 12 },
  );

const square = (opts: { cx?: number; cy?: number; r?: number; rot?: number } = {}) =>
  path(regular(4, { rot: -45, ...opts }));
const triangle = (opts: { cx?: number; cy?: number; r?: number; rot?: number } = {}) => path(regular(3, opts), { perSide: 40 });
const line = (from: Point = [150, 300], to: Point = [850, 700], n = 60) => path([from, to], { perSide: n, closed: false });

/** 点を (cx, cy) のまわりに回して、大きさを変えて、ずらす */
function transform(points: Point[], { deg = 0, scale = 1, dx = 0, dy = 0, cx = 500, cy = 500 } = {}): Point[] {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return points.map(([x, y]) => {
    const u = (x - cx) * scale;
    const v = (y - cy) * scale;
    return [cx + u * c - v * s + dx, cy + u * s + v * c + dy];
  });
}

/** 描き始めの場所を k 点ずらす（閉じた形用。最後の点は最初の点と同じなので落としてからずらす） */
function rotateStart(points: Point[], k: number): Point[] {
  const ring = points.slice(0, -1);
  const moved = [...ring.slice(k), ...ring.slice(0, k)];
  return [...moved, moved[0]!];
}

/** 手のふるえ：点ごとにまわりへ少しずらす（amount は座標のずれの大きさ） */
function shaky(points: Point[], amount: number, seed = 1): Point[] {
  const rng = seeded(seed);
  return points.map(([x, y]) => [x + (rng() * 2 - 1) * amount, y + (rng() * 2 - 1) * amount]);
}

/** 画面から送る形（0〜1000 の整数、200 点まで） */
const int = (points: Point[]): Point[] => thinStroke(points);

const score = (shape: Shape, points: Point[]) => scoreDrawing(shape, int(points));

// ---------- 対局を進める ----------

const C = int(circle());
const SQ = int(square());

const setMove = (shape: Shape, points: Point[] = C, blind = false): FreehandMove => ({ shape, blind, points });
const drawMove = (points: Point[] = C): FreehandMove => ({ points });

/** 手番の人が順に指す */
const play = (s: FreehandState, moves: FreehandMove[]) =>
  moves.reduce((st, m) => freehand.applyMove(st, m, turnOf(st.rounds)!), s);

const start = () => freehand.initialState(Math.random);
const view = (s: FreehandState, viewer: Seat | null, revealAll = false) =>
  freehand.viewState!(s, viewer, revealAll) as FreehandView;

/** 点数だけを決めた回戦（勝ち負けの数え方を確かめる用） */
const decided = (setter: Seat, shape: Shape, s0: number, s1: number): FreehandRound => ({
  setter,
  shape,
  blind: false,
  drawings: [
    { points: [], score: s0 },
    { points: [], score: s1 },
  ],
});

describe("freehand", () => {
  describe("採点", () => {
    it("きれいな形は 90 点以上", () => {
      expect(score("circle", circle())).toBeGreaterThanOrEqual(95);
      expect(score("line", line())).toBeGreaterThanOrEqual(95);
      expect(score("triangle", triangle())).toBeGreaterThanOrEqual(95);
      expect(score("square", square())).toBeGreaterThanOrEqual(95);
      expect(score("star", pentagram())).toBeGreaterThanOrEqual(95);
      // 星は、まわりをなぞって描いてもよい
      expect(score("star", starOutline())).toBeGreaterThanOrEqual(95);
    });

    it("少し手がふるえても 85 点以上", () => {
      expect(score("circle", shaky(circle(), 6))).toBeGreaterThanOrEqual(85);
      expect(score("line", shaky(line(), 6))).toBeGreaterThanOrEqual(85);
      expect(score("triangle", shaky(triangle(), 6))).toBeGreaterThanOrEqual(85);
      expect(score("square", shaky(square(), 6))).toBeGreaterThanOrEqual(85);
      expect(score("star", shaky(pentagram(), 6))).toBeGreaterThanOrEqual(85);
    });

    it("ゆがんだ形は明らかに低い", () => {
      const clean = (shape: Shape, points: Point[]) => score(shape, points);
      const cases: [Shape, Point[], Point[]][] = [
        // だ円（縦が 7 割）
        ["circle", circle(), circle({ aspect: 0.7 })],
        // 横長の長方形（1.6 : 1）
        ["square", square(), path([[200, 350], [800, 350], [800, 725], [200, 725]])],
        // 背の低い二等辺三角形
        ["triangle", triangle(), path([[200, 650], [800, 650], [500, 420]], { perSide: 40 })],
        // 弓なりに曲がった線（真ん中で長さの 1 割ふくらむ）
        ["line", line(), Array.from({ length: 61 }, (_, i) => [150 + (700 * i) / 60, 500 - 280 * Math.sin((Math.PI * i) / 60)] as Point)],
        // とがった角の長さがばらばらの星
        [
          "star",
          pentagram(),
          path(
            Array.from({ length: 10 }, (_, i) => polar(500, 500, i % 2 === 0 ? [300, 180, 330, 200, 260][i / 2]! : 115, -90 + 36 * i)),
            { perSide: 12 },
          ),
        ],
        // ぐにゃぐにゃの円
        ["circle", circle(), circle().map(([x, y], i) => {
          const k = 1 + 0.08 * Math.sin((i / 120) * Math.PI * 2 * 5);
          return [500 + (x - 500) * k, 500 + (y - 500) * k] as Point;
        })],
      ];
      for (const [shape, good, bad] of cases) {
        const g = clean(shape, good);
        const b = score(shape, bad);
        expect(b, shape).toBeLessThan(70);
        expect(g - b, shape).toBeGreaterThanOrEqual(25);
      }
    });

    it("大きさ・位置・回転を変えても同じ点", () => {
      const shapes: [Shape, Point[]][] = [
        ["circle", shaky(circle(), 8, 3)],
        ["line", shaky(line(), 8, 4)],
        ["triangle", shaky(triangle(), 8, 5)],
        ["square", shaky(square(), 8, 6)],
        ["star", shaky(pentagram(), 8, 7)],
      ];
      for (const [shape, points] of shapes) {
        const base = score(shape, points);
        for (const t of [
          { scale: 0.5 },
          { scale: 1.4 },
          { dx: -180, dy: 120, scale: 0.6 },
          { deg: 17 },
          { deg: 90 },
          { deg: 200, scale: 0.8 },
          { deg: -33, scale: 0.55, dx: 150, dy: -170 },
        ]) {
          expect(Math.abs(score(shape, transform(points, t)) - base), `${shape} ${JSON.stringify(t)}`).toBeLessThanOrEqual(1);
        }
      }
    });

    it("描き始めの場所と、回る向きを変えても同じ点", () => {
      // 少しゆがんだ形（点数が真ん中あたりのほうが、ずれに気づきやすい）
      const shapes: [Shape, Point[]][] = [
        ["circle", circle({ aspect: 0.9 })],
        ["triangle", path([[200, 720], [800, 720], [530, 230]], { perSide: 40 })],
        ["square", path([[200, 250], [800, 250], [800, 800], [200, 800]])],
        ["star", starOutline({ inner: 0.5 })],
      ];
      for (const [shape, points] of shapes) {
        const base = score(shape, points);
        expect(base, shape).toBeGreaterThan(40);
        expect(base, shape).toBeLessThan(95);
        for (const k of [7, 23, 50, 101]) expect(Math.abs(score(shape, rotateStart(points, k)) - base), `${shape} ${k}`).toBeLessThanOrEqual(1);
        expect(Math.abs(score(shape, [...points].reverse()) - base), shape).toBeLessThanOrEqual(1);
      }
      expect(score("line", [...line()].reverse())).toBe(score("line", line()));
      const bent = shaky(line(), 10, 2);
      expect(score("line", [...bent].reverse())).toBe(score("line", bent));
    });

    it("お題とちがう形は低い", () => {
      expect(score("circle", square())).toBeLessThan(50);
      expect(score("circle", triangle())).toBeLessThan(30);
      expect(score("square", circle())).toBeLessThan(50);
      expect(score("triangle", square())).toBeLessThan(30);
      expect(score("square", triangle())).toBeLessThan(30);
      expect(score("line", circle())).toBe(0);
      expect(score("star", circle())).toBeLessThan(20);
      expect(score("circle", pentagram())).toBeLessThan(20);
      expect(score("circle", line())).toBeLessThan(5);
    });

    it("小さすぎる絵・短すぎる線は低い", () => {
      expect(score("circle", circle({ r: 300 }))).toBeGreaterThanOrEqual(95);
      expect(score("circle", circle({ r: 90 }))).toBeGreaterThanOrEqual(95);
      expect(score("circle", circle({ r: 40 }))).toBeLessThan(50);
      expect(score("circle", circle({ r: 15 }))).toBe(0);
      expect(score("square", square({ r: 25 }))).toBe(0);
      expect(score("line", line([400, 500], [700, 500]))).toBeGreaterThanOrEqual(95);
      expect(score("line", line([450, 500], [550, 500]))).toBeLessThan(50);
      expect(score("line", line([495, 500], [530, 500]))).toBe(0);
    });

    it("閉じていない円は低く、少し行き過ぎて閉じた円はそのまま高い", () => {
      expect(score("circle", circle({ turns: 0.75 }))).toBeLessThan(40);
      expect(score("circle", circle({ turns: 0.92 }))).toBeLessThan(80);
      expect(score("circle", circle({ turns: 1.1 }))).toBeGreaterThanOrEqual(90);
      // 2 周ぐるぐる描くのは一筆の円ではない
      expect(score("circle", circle({ turns: 2, n: 199 }))).toBeLessThan(30);
      expect(score("square", path(regular(4, { rot: -45 }).slice(0, 3), { closed: false }))).toBeLessThan(40);
    });

    it("点数は 0〜100 の整数。点が 1 つ・同じ点ばかりでも 0 点", () => {
      for (const shape of SHAPES) {
        expect(scoreDrawing(shape, [[500, 500]])).toBe(0);
        expect(scoreDrawing(shape, [[500, 500], [500, 500], [500, 500]])).toBe(0);
        const rng = seeded(shape.length);
        for (let i = 0; i < 20; i++) {
          const pts = Array.from({ length: 2 + Math.floor(rng() * 150) }, () => [Math.floor(rng() * 1001), Math.floor(rng() * 1001)] as Point);
          const s = scoreDrawing(shape, pts);
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(100);
        }
      }
    });

    it("でたらめな線はほとんど点が出ない", () => {
      const rng = seeded(9);
      const scribble = Array.from({ length: 80 }, () => [100 + rng() * 800, 100 + rng() * 800] as Point);
      for (const shape of SHAPES) expect(score(shape, scribble), shape).toBeLessThan(10);
    });

    it("理想の形を描いた絵に重ね、点ごとのずれも返す（ずれた所ほど大きい）", () => {
      // 円の右側だけ外へふくらませる
      const bumped = circle().map(([x, y], i) => {
        const near = Math.abs(i - 0) <= 8 || Math.abs(i - 120) <= 8;
        return near ? ([x + 60, y] as Point) : ([x, y] as Point);
      });
      const a = analyzeDrawing("circle", int(bumped));
      expect(a.score).toBe(score("circle", bumped));
      expect(a.deviations).toHaveLength(int(bumped).length);
      expect(a.ideal.closed).toBe(true);
      expect(a.ideal.points.length).toBeGreaterThan(20);
      // いちばんずれた点は、ふくらませたあたり（右側）にある
      const worst = a.deviations.indexOf(Math.max(...a.deviations));
      expect(int(bumped)[worst]![0]).toBeGreaterThan(780);
      // 理想の円の中心は、だいたい描いた円の中心
      const xs = a.ideal.points.map((p) => p[0]);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeGreaterThan(480);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeLessThan(540);

      const l = analyzeDrawing("line", int(line()));
      expect(l.ideal.closed).toBe(false);
      expect(Math.max(...l.deviations)).toBeLessThan(0.01);
    });
  });

  describe("画面で点を間引く（thinStroke）", () => {
    it("200 点までに間引き、始点と終点は残す。座標は 0〜1000 の整数", () => {
      const raw = circle({ n: 900 }).map(([x, y]) => [x + 0.37, y - 0.21] as Point);
      const thin = thinStroke(raw);
      expect(thin.length).toBeLessThanOrEqual(MAX_POINTS);
      expect(thin.length).toBeGreaterThan(100);
      expect(thin[0]).toEqual([Math.round(raw[0]![0]), Math.round(raw[0]![1])]);
      expect(thin.at(-1)).toEqual([Math.round(raw.at(-1)![0]), Math.round(raw.at(-1)![1])]);
      for (const [x, y] of thin) {
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      }
      // 間引いても点数はほとんど変わらない
      expect(Math.abs(scoreDrawing("circle", thin) - scoreDrawing("circle", thinStroke(circle({ n: 150 }))))).toBeLessThanOrEqual(1);
    });

    it("枠の外へはみ出した点は枠のふちにおさめ、同じ点が続いたら 1 つにする", () => {
      expect(thinStroke([[-20, 500], [-20, 500], [500.4, 1200], [500.4, 1200], [1003, -5]])).toEqual([
        [0, 500],
        [500, CANVAS],
        [CANVAS, 0],
      ]);
    });
  });

  describe("出題して描く", () => {
    it("はじめは先手が出題する番", () => {
      const s = start();
      expect(s.rounds).toEqual([]);
      expect(freehand.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("出題する人はお題と目隠しを選び、続けて描く。点数はサーバで計算し、手番は相手に移る", () => {
      const s = freehand.applyMove(start(), setMove("square", SQ, true), 0);
      expect(s.rounds).toHaveLength(1);
      const r = s.rounds[0]!;
      expect(r).toMatchObject({ setter: 0, shape: "square", blind: true });
      expect(r.drawings[0]).toEqual({ points: SQ, score: scoreDrawing("square", SQ) });
      expect(r.drawings[1]).toBeNull();
      expect(freehand.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("目隠しは省くとつけない", () => {
      const s = freehand.applyMove(start(), { shape: "circle", points: C }, 0);
      expect(s.rounds[0]!.blind).toBe(false);
    });

    it("お題は 5 つのどれか。お題がない・知らないお題は受け付けない", () => {
      expect(SHAPES).toEqual(["circle", "line", "triangle", "square", "star"]);
      for (const shape of SHAPES) expect(freehand.applyMove(start(), setMove(shape), 0).rounds[0]!.shape).toBe(shape);
      expect(() => freehand.applyMove(start(), drawMove(), 0)).toThrow(IllegalMoveError);
      expect(() => freehand.applyMove(start(), drawMove(), 0)).toThrow("freehand_shape");
      expect(() => freehand.applyMove(start(), { shape: "heart" as Shape, points: C }, 0)).toThrow("freehand_shape");
    });

    it("相手はお題を選べず、描くだけ", () => {
      const s = play(start(), [setMove("circle")]);
      expect(() => freehand.applyMove(s, setMove("line"), 1)).toThrow("freehand_already_set");
      expect(() => freehand.applyMove(s, { points: C, blind: true }, 1)).toThrow("freehand_already_set");
    });

    it("相手が描くと回戦が終わり、次の回戦は相手が出題する（2 回戦目は後手が続けて指す）", () => {
      let s = play(start(), [setMove("circle"), drawMove(SQ)]);
      expect(s.rounds).toHaveLength(1);
      expect(s.rounds[0]!.drawings[1]).toEqual({ points: SQ, score: scoreDrawing("circle", SQ) });
      expect(freehand.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = play(s, [setMove("line", int(line()))]);
      expect(s.rounds[1]).toMatchObject({ setter: 1, shape: "line" });
      expect(freehand.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [drawMove()]);
      // 3 回戦目は先手が出題する
      expect(freehand.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [setMove("star")]);
      expect(s.rounds[2]).toMatchObject({ setter: 0, shape: "star" });
      expect(freehand.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("同じお題は 1 局に 1 回まで", () => {
      const s = play(start(), [setMove("circle"), drawMove()]);
      expect(() => freehand.applyMove(s, setMove("circle"), 1)).toThrow("freehand_shape_used");
      expect(freehand.applyMove(s, setMove("square"), 1).rounds[1]!.shape).toBe("square");
    });

    it("手番でない人は描けない", () => {
      const s = start();
      expect(() => freehand.applyMove(s, setMove("circle"), 1)).toThrow("not_your_turn");
      const next = play(s, [setMove("circle")]);
      expect(() => freehand.applyMove(next, drawMove(), 0)).toThrow("not_your_turn");
    });

    it("3 回戦で終わり、もう描けない", () => {
      const s = play(start(), [setMove("circle"), drawMove(), setMove("line"), drawMove(), setMove("star"), drawMove()]);
      expect(s.rounds).toHaveLength(ROUNDS);
      expect(freehand.status(s).kind).toBe("finished");
      expect(turnOf(s.rounds)).toBeNull();
      expect(() => freehand.applyMove(s, setMove("square"), 0)).toThrow("game_over");
      expect(() => freehand.applyMove(s, drawMove(), 1)).toThrow("game_over");
    });
  });

  describe("点の列を確かめる", () => {
    it("2〜200 点。少なすぎても多すぎても受け付けない", () => {
      const at = (n: number) => Array.from({ length: n }, (_, i) => [i % 1000, 500] as Point);
      expect(freehand.applyMove(start(), setMove("line", at(2)), 0).rounds).toHaveLength(1);
      expect(freehand.applyMove(start(), setMove("line", at(MAX_POINTS)), 0).rounds).toHaveLength(1);
      for (const n of [0, 1, MAX_POINTS + 1, 5000]) {
        expect(() => freehand.applyMove(start(), setMove("line", at(n)), 0)).toThrow("freehand_points");
      }
    });

    it("座標は 0〜1000。枠の外の点は受け付けない", () => {
      expect(freehand.applyMove(start(), setMove("line", [[0, 0], [1000, 1000]]), 0).rounds).toHaveLength(1);
      for (const bad of [[-1, 500], [500, -1], [1001, 500], [500, 1001]] as Point[]) {
        expect(() => freehand.applyMove(start(), setMove("line", [[500, 500], bad]), 0)).toThrow("freehand_coords");
      }
    });

    it("parseMove は整数の点の列と、お題・目隠しだけを読む（送られた点数は使わない）", () => {
      expect(freehand.parseMove({ shape: "circle", blind: true, points: [[1, 2], [3, 4]] })).toEqual({
        shape: "circle",
        blind: true,
        points: [[1, 2], [3, 4]],
      });
      expect(freehand.parseMove({ points: [[1, 2], [3, 4]], score: 100 })).toEqual({ points: [[1, 2], [3, 4]] });
      // 範囲や数は applyMove で確かめる
      expect(freehand.parseMove({ points: [[-5, 2000]] })).toEqual({ points: [[-5, 2000]] });
      expect(freehand.parseMove({ shape: "heart", points: [[1, 2]] })).toEqual({ shape: "heart", points: [[1, 2]] });
      for (const raw of [
        null,
        42,
        {},
        { points: "1,2" },
        { points: [[1.5, 2]] },
        { points: [[1, 2, 3]] },
        { points: [[1]] },
        { points: [["1", 2]] },
        { points: [[1, Number.NaN]] },
        { points: [[Infinity, 2]] },
        { points: [{ x: 1, y: 2 }] },
        { shape: 3, points: [[1, 2]] },
        { blind: "yes", points: [[1, 2]] },
      ]) {
        expect(freehand.parseMove(raw), JSON.stringify(raw)).toBeNull();
      }
    });

    it("サーバに保存されるのは計算した点数", () => {
      const forged = { ...setMove("circle", SQ), score: 100 } as FreehandMove;
      const parsed = freehand.parseMove(JSON.parse(JSON.stringify(forged)))!;
      const s = freehand.applyMove(start(), parsed, 0);
      expect(s.rounds[0]!.drawings[0]!.score).toBe(scoreDrawing("circle", SQ));
      expect(s.rounds[0]!.drawings[0]!.score).toBeLessThan(60);
    });
  });

  describe("伏せる・見せ合う", () => {
    it("出題した人の絵と点数は、相手が描き終えるまで相手と観戦者には伏せる。自分には見える", () => {
      const s = play(start(), [setMove("triangle", int(triangle()), true)]);
      for (const viewer of [1, null] as const) {
        const v = view(s, viewer);
        expect(v.rounds[0]!.drawings[0]).toBe("hidden");
        expect(v.rounds[0]!.drawings[1]).toBeNull();
        // お題と目隠しは見える
        expect(v.rounds[0]).toMatchObject({ setter: 0, shape: "triangle", blind: true });
        expect(JSON.stringify(v)).not.toContain("points");
        expect(JSON.stringify(v)).not.toContain("score");
      }
      expect(view(s, 0).rounds[0]!.drawings[0]).toEqual(s.rounds[0]!.drawings[0]);
    });

    it("相手が描き終えたら、2 人の絵と点数を見せ合う", () => {
      const s = play(start(), [setMove("circle"), drawMove(SQ)]);
      for (const viewer of [0, 1, null] as const) expect(view(s, viewer).rounds).toEqual(s.rounds);
    });

    it("次の回戦の出題が伏せられても、終わった回戦は見えたまま", () => {
      const s = play(start(), [setMove("circle"), drawMove(SQ), setMove("square", SQ)]);
      const v = view(s, 0);
      expect(v.rounds[0]).toEqual(s.rounds[0]);
      expect(v.rounds[1]!.drawings[1]).toBe("hidden");
      expect(view(s, 1).rounds[1]!.drawings[1]).toEqual(s.rounds[1]!.drawings[1]);
    });

    it("終局後はすべて見える", () => {
      const s = play(start(), [setMove("circle"), drawMove(), setMove("line"), drawMove(), setMove("star"), drawMove()]);
      expect(view(s, 0, true).rounds).toEqual(s.rounds);
      expect(view(s, null, true).rounds).toEqual(s.rounds);
    });

    it("手の記録では、相手の点の列を伏せる（お題と目隠しは見える）", () => {
      const move = setMove("star", C, true);
      expect(freehand.viewMove!(move, 0, 0)).toEqual(move);
      expect(freehand.viewMove!(move, 0, 1)).toEqual({ shape: "star", blind: true, points: null });
      expect(freehand.viewMove!(drawMove(), 1, null)).toEqual({ points: null });
    });
  });

  describe("勝ち負け", () => {
    it("点数の高い方がその回戦の勝ち。同じ点なら引き分けの回戦", () => {
      let s = play(start(), [setMove("circle", C), drawMove(SQ)]);
      expect(tally(s.rounds).wins).toEqual([1, 0]);
      s = play(s, [setMove("square", SQ), drawMove(SQ)]);
      expect(s.rounds[1]!.drawings[0]!.score).toBe(s.rounds[1]!.drawings[1]!.score);
      expect(tally(s.rounds)).toMatchObject({ wins: [1, 0], draws: 1 });
    });

    it("3 回戦で多く勝った方の勝ち（合計点が低くても）", () => {
      const s: FreehandState = {
        rounds: [decided(0, "circle", 80, 79), decided(1, "line", 81, 80), decided(0, "star", 20, 99)],
      };
      expect(tally(s.rounds)).toEqual({ wins: [2, 1], draws: 0, totals: [181, 258] });
      expect(freehand.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("勝ち数が同じなら、点数の合計の多い方の勝ち", () => {
      const s: FreehandState = {
        rounds: [decided(0, "circle", 90, 60), decided(1, "line", 70, 71), decided(0, "star", 50, 50)],
      };
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], draws: 1, totals: [210, 181] });
      expect(freehand.status(s)).toEqual({ kind: "finished", winner: 0 });
      const t: FreehandState = {
        rounds: [decided(0, "circle", 60, 60), decided(1, "line", 70, 70), decided(0, "star", 50, 51)],
      };
      expect(freehand.status(t)).toEqual({ kind: "finished", winner: 1 });
    });

    it("勝ち数も合計も同じなら引き分け", () => {
      const s: FreehandState = {
        rounds: [decided(0, "circle", 90, 80), decided(1, "line", 70, 80), decided(0, "star", 66, 66)],
      };
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], draws: 1, totals: [226, 226] });
      expect(freehand.status(s)).toEqual({ kind: "finished", winner: null });
    });
  });

  describe("コンピュータ", () => {
    it("自分の番でなければ null。終わっていても null", () => {
      const s = start();
      expect(freehand.botMove!(view(s, 1), 1, Math.random)).toBeNull();
      const over = play(s, [setMove("circle"), drawMove(), setMove("line"), drawMove(), setMove("star"), drawMove()]);
      expect(freehand.botMove!(view(over, 0), 0, Math.random)).toBeNull();
      expect(freehand.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("出題するときは、まだ出ていないお題をでたらめに選び、点の列は範囲内", () => {
      const s = play(start(), [setMove("circle"), drawMove()]);
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const move = freehand.botMove!(view(s, 1), 1, seeded(i))!;
        expect(move.shape).toBeDefined();
        expect(move.shape).not.toBe("circle");
        seen.add(move.shape!);
        expect(typeof move.blind).toBe("boolean");
        // サーバに送っても通る手
        const parsed = freehand.parseMove(JSON.parse(JSON.stringify(move)))!;
        expect(() => freehand.applyMove(s, parsed, 1)).not.toThrow();
      }
      expect(seen.size).toBe(4);
    });

    it("相手の出題に描くときは、お題を送らない。相手の絵は見ない", () => {
      const s = play(start(), [setMove("star")]);
      const v = view(s, 1);
      expect(v.rounds[0]!.drawings[0]).toBe("hidden");
      const move = freehand.botMove!(v, 1, seeded(3))!;
      expect(move.shape).toBeUndefined();
      expect(move.blind).toBeUndefined();
      expect(() => freehand.applyMove(s, move, 1)).not.toThrow();
    });

    it("人間らしくゆがんだ絵で、だいたい 60〜85 点", () => {
      const scores: number[] = [];
      for (const shape of SHAPES) {
        for (let i = 0; i < 30; i++) {
          const s = play(start(), [setMove(shape)]);
          const move = freehand.botMove!(view(s, 1), 1, seeded(1000 + i * 7 + shape.length))!;
          expect(move.points.length).toBeLessThanOrEqual(MAX_POINTS);
          expect(move.points.length).toBeGreaterThanOrEqual(20);
          const sc = scoreDrawing(shape, move.points);
          scores.push(sc);
        }
        const mine = scores.slice(-30);
        const avg = mine.reduce((a, b) => a + b, 0) / mine.length;
        expect(avg, shape).toBeGreaterThanOrEqual(60);
        expect(avg, shape).toBeLessThanOrEqual(85);
      }
      // 大きく外れることはあまりない
      const off = scores.filter((s) => s < 45 || s > 95).length;
      expect(off / scores.length).toBeLessThan(0.1);
    });

    it("コンピュータ同士で 20 局とも 3 回戦まで遊べる", () => {
      for (let game = 0; game < 20; game++) {
        const rng = seeded(200 + game);
        let s = freehand.initialState(rng);
        for (let ply = 0; ply < 10 && freehand.status(s).kind === "playing"; ply++) {
          const st = freehand.status(s);
          if (st.kind !== "playing") break;
          const move = botMove(freehand, s, st.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = freehand.applyMove(s, freehand.parseMove(JSON.parse(JSON.stringify(move)))!, st.turn);
        }
        expect(freehand.status(s).kind).toBe("finished");
        expect(s.rounds).toHaveLength(ROUNDS);
        expect(new Set(s.rounds.map((r) => r.shape)).size).toBe(ROUNDS);
      }
    });
  });
});
