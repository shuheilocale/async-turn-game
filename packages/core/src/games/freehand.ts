import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * ひとふでチャレンジ：お題の形を指で一筆で描き、形のきれいさ（0〜100 点）を比べる。
 * 3 回戦で、回戦ごとに「出題する人」が交代する（1 回戦目は先手）。
 * 出題する人はお題（円・まっすぐな線・正三角形・正方形・星）と「目隠し（描いている間は線が見えない）」を選び、
 * 続けて自分が描く（出題と描くのは 1 手）。その絵と点数は、相手が描き終えるまで相手には伏せる。
 * 相手が描いたら 2 人の絵と点数を並べて見せ、点数の高い方がその回戦の勝ち（同点は引き分けの回戦）。
 * 3 回戦で多く勝った方の勝ち。勝ち数が同じなら点数の合計で、それも同じなら引き分け。
 * 同じお題は 1 局に 1 回まで（得意な形ばかり出せないので、どれをいつ出すかを考える）。
 *
 * 採点は AI を使わずに計算する（scoreDrawing）。画面が送るのは描いた点の列だけで、点数はサーバの applyMove で決める。
 */

export const ROUNDS = 3;
export const SHAPES = ["circle", "line", "triangle", "square", "star"] as const;
export type Shape = (typeof SHAPES)[number];

/** 座標の範囲。キャンバスの左上が (0, 0)、右下が (CANVAS, CANVAS)。画面の大きさによらずこの範囲にそろえて送る */
export const CANVAS = 1000;
/** 1 回に送れる点の数。画面はこれ以下に間引いてから送る */
export const MAX_POINTS = 200;
export const MIN_POINTS = 2;

/** [x, y]。送るときは 0〜CANVAS の整数 */
export type Point = [number, number];

export interface FreehandMove {
  /** 出題する人だけが送る。相手は省く */
  shape?: Shape;
  /** 出題する人だけが送る。省くと目隠しなし */
  blind?: boolean;
  points: Point[];
}

/** 描いた絵。score はサーバが points から計算したもの */
export interface Drawing {
  points: Point[];
  score: number;
}

/** 1 回戦分。D は絵の形（画面に渡すときは、伏せた絵が "hidden" になる） */
export interface Round<D = Drawing | null> {
  setter: Seat;
  shape: Shape;
  blind: boolean;
  /** 席ごとの絵。まだ描いていなければ null */
  drawings: [D, D];
}

export type FreehandRound = Round;

export interface FreehandState {
  /** これまでの回戦。最後の 1 つは、出題した人だけが描いて相手を待っていることがある */
  rounds: FreehandRound[];
}

/** 画面に渡す形。相手がまだ描いていない回戦の、出題した人の絵は（出題した本人以外には）"hidden" */
export type DrawingView = Drawing | "hidden" | null;
export type RoundView = Round<DrawingView>;
export interface FreehandView {
  rounds: RoundView[];
}

type AnyRound = Round<DrawingView>;

/** その回戦の出題する人（1 回戦目は先手、あとは交代） */
export const setterOf = (index: number): Seat => (index % 2 === 0 ? 0 : 1);

/** 2 人とも描き終えた回戦か */
export const isComplete = (r: AnyRound) => r.drawings[0] !== null && r.drawings[1] !== null;

const scoreOf = (d: DrawingView) => (d !== null && d !== "hidden" ? d.score : null);

/** 回戦の勝ち。引き分けなら null、まだ決まっていなければ undefined */
export function roundWinner(r: AnyRound): Seat | null | undefined {
  const a = scoreOf(r.drawings[0]);
  const b = scoreOf(r.drawings[1]);
  if (a === null || b === null) return undefined;
  return a === b ? null : a > b ? 0 : 1;
}

/** 終わった回戦の勝ち数・引き分けの数・点数の合計 */
export function tally(rounds: readonly AnyRound[]) {
  const wins: [number, number] = [0, 0];
  const totals: [number, number] = [0, 0];
  let draws = 0;
  for (const r of rounds) {
    const w = roundWinner(r);
    if (w === undefined) continue;
    if (w === null) draws++;
    else wins[w]++;
    totals[0] += scoreOf(r.drawings[0])!;
    totals[1] += scoreOf(r.drawings[1])!;
  }
  return { wins, draws, totals };
}

/** 今描く人。終局していれば null */
export function turnOf(rounds: readonly AnyRound[]): Seat | null {
  const last = rounds.at(-1);
  if (last && !isComplete(last)) return other(last.setter);
  return rounds.length >= ROUNDS ? null : setterOf(rounds.length);
}

/** もう出たお題 */
export const usedShapes = (rounds: readonly AnyRound[]): Shape[] => rounds.map((r) => r.shape);

const isShape = (v: unknown): v is Shape => typeof v === "string" && (SHAPES as readonly string[]).includes(v);

// ---------- 採点 ----------

/** 採点のときに、描いた線と理想の形を並べ直す点の数（3・4・5・10 で割り切れる数） */
const N = 120;
/** 描き始めの場所のずらし方を、はじめに何点おきに比べるか */
const COARSE = 4;
/**
 * ずれ（0 = ぴったり）を点数に直すときの、お題ごとの許しの幅。大きいほど甘い。
 * 円と線は少しのゆがみでも目立つので厳しめ、角のある形はやや甘め、星は角が多くむずかしいのでいちばん甘め。
 * 手描きらしい絵がだいたい 60〜90 点になるよう、テスト（freehand.test.ts）の例で合わせてある
 */
const TOLERANCE: Record<Shape, number> = { circle: 0.1, line: 0.11, triangle: 0.14, square: 0.14, star: 0.19 };
/** 絵の大きさ（重心からの距離の二乗平均の平方根）がこれ以上なら満点まで出る。これ以下なら 0 点 */
const SIZE_FULL = 80;
const SIZE_ZERO = 25;
/** 閉じた形で、描き終わりのこの割合の中で始点にいちばん近い所までを使う（少し行き過ぎて閉じたぶんを切る） */
const TAIL = 0.25;

export const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pathLength(points: readonly Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  return total;
}

/** 線にそって等間隔に n 点を並べ直す（始点と終点を含む） */
export function resample(points: readonly Point[], n: number): Point[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + dist(points[i - 1]!, points[i]!));
  const total = cum.at(-1)!;
  const out: Point[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const at = n === 1 ? 0 : (total * k) / (n - 1);
    while (seg < points.length - 2 && cum[seg + 1]! < at) seg++;
    const a = points[seg]!;
    const b = points[Math.min(seg + 1, points.length - 1)]!;
    const len = cum[Math.min(seg + 1, points.length - 1)]! - cum[seg]!;
    const t = len > 0 ? Math.min(1, Math.max(0, (at - cum[seg]!) / len)) : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** 閉じた形の周りに等間隔に n 点（始点に戻る点は含めない） */
const resampleLoop = (points: readonly Point[], n: number) => resample(points, n + 1).slice(0, n);

const polar = (r: number, deg: number): Point => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

/** 理想の形。outline は重ねて描くための頂点（閉じた形は最初の頂点に戻らない並び）、sample は採点用に並べ直した点 */
interface Template {
  closed: boolean;
  outline: Point[];
  sample: Point[];
  /** sample の重心からの距離の二乗の和 */
  energy: number;
  /**
   * 描き始めの場所をずらして比べるための並び。sample を 2 回つなげたもの（x と y を別々に）と、
   * 逆回りに並べて 2 回つなげたもの。i 番目からの N 点が、i だけずらした（逆回りの）理想の形になる
   */
  fx: Float64Array;
  fy: Float64Array;
  rx: Float64Array;
  ry: Float64Array;
}

/** 一筆書きの星の、へこんだ角の半径（とがった角の半径を 1 として） */
const STAR_INNER = Math.cos((72 * Math.PI) / 180) / Math.cos((36 * Math.PI) / 180);

function makeTemplate(outline: Point[], closed: boolean): Template {
  const raw = closed ? resampleLoop([...outline, outline[0]!], N) : resample(outline, N);
  const [cx, cy] = centroid(raw);
  const sample = raw.map(([x, y]) => [x - cx, y - cy] as Point);
  const twice = (pick: (k: number) => number) => Float64Array.from({ length: 2 * N }, (_, k) => pick(k % N));
  // 逆回りの k 番目は、もとの (N - k) % N 番目
  const back = (k: number) => sample[(N - k) % N]!;
  return {
    closed,
    outline: outline.map(([x, y]) => [x - cx, y - cy] as Point),
    sample,
    energy: sample.reduce((s, [x, y]) => s + x * x + y * y, 0),
    fx: twice((k) => sample[k]![0]),
    fy: twice((k) => sample[k]![1]),
    rx: twice((k) => back(k)[0]),
    ry: twice((k) => back(k)[1]),
  };
}

/** 理想の形の頂点（大きさ 1 のもの）。星は「一筆書きの星」と「まわりをなぞる星」のどちらでもよい */
const OUTLINES: Record<Shape, () => { points: Point[]; closed: boolean }[]> = {
  circle: () => [{ points: Array.from({ length: 96 }, (_, i) => polar(1, (360 * i) / 96)), closed: true }],
  line: () => [{ points: [[-1, 0], [1, 0]], closed: false }],
  triangle: () => [{ points: [0, 1, 2].map((i) => polar(1, -90 + 120 * i)), closed: true }],
  square: () => [{ points: [[-1, -1], [1, -1], [1, 1], [-1, 1]], closed: true }],
  star: () => [
    { points: [0, 2, 4, 1, 3].map((i) => polar(1, -90 + 72 * i)), closed: true },
    { points: Array.from({ length: 10 }, (_, i) => polar(i % 2 === 0 ? 1 : STAR_INNER, -90 + 36 * i)), closed: true },
  ],
};

const templateCache: Partial<Record<Shape, Template[]>> = {};

/** お題の理想の形（使うお題の分だけ作って覚えておく） */
const templates = (shape: Shape): Template[] =>
  (templateCache[shape] ??= OUTLINES[shape]().map((o) => makeTemplate(o.points, o.closed)));

export function centroid(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** 閉じた形で、少し行き過ぎて描き終えたぶんを切る（描き終わりの 1/4 の中で始点にいちばん近い所まで） */
function trimOvershoot(path: Point[]): Point[] {
  const first = path[0]!;
  let best = path.length - 1;
  let bestDist = dist(path[best]!, first);
  for (let i = Math.floor(path.length * (1 - TAIL)); i < path.length - 1; i++) {
    const d = dist(path[i]!, first);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return path.slice(0, best + 1);
}

/** 0〜1 になめらかにつなぐ（lo 以下で 0、hi 以上で 1） */
export function smoothstep(lo: number, hi: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** 点から線分までの距離 */
function segmentDist(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** 描いた線と理想の形の合わせ方。理想の形の点 z を、複素数 a = (re, im) をかけて (cx, cy) へ動かすと描いた線に重なる */
interface Fit {
  score: number;
  template: Template;
  re: number;
  im: number;
  cx: number;
  cy: number;
  /** 採点に使った、描いた線を並べ直した点 */
  drawn: Point[];
}

/**
 * 描いた絵を採点する。
 * 1. 描いた線を等間隔の 120 点に並べ直す（閉じた形は、少し行き過ぎて閉じたぶんを切ってから）
 * 2. 理想の形も等間隔の 120 点にして、描き始めの場所（ずらし方 120 通り）と回る向き（2 通り）をためし、
 *    それぞれ、いちばん合う回転・大きさ・位置に合わせたときのずれを求める（複素数の最小二乗。回転と大きさは問わない）
 * 3. いちばん小さいずれ e（描いた絵の大きさに対する割合）を、お題ごとの幅で 0〜100 点に直す
 * 4. 小さすぎる絵（短すぎる線）は点を下げる
 * 閉じていない・2 周描いた・辺の長さがちがう などは、並べ直した点どうしの位置がずれるので、そのまま点が下がる
 */
function fitDrawing(shape: Shape, points: readonly Point[]): Fit | null {
  if (points.length < 2 || pathLength(points) < 1) return null;
  const closed = shape !== "line";
  const drawn = closed ? resampleLoop(trimOvershoot(resample(points, 4 * N)), N) : resample(points, N);
  const [cx, cy] = centroid(drawn);
  const wx = Float64Array.from(drawn, (p) => p[0] - cx);
  const wy = Float64Array.from(drawn, (p) => p[1] - cy);
  let energy = 0;
  for (let i = 0; i < N; i++) energy += wx[i]! * wx[i]! + wy[i]! * wy[i]!;
  if (energy < 1e-9) return null;

  let best = { fit: -1, re: 0, im: 0, template: templates(shape)[0]! };
  for (const t of templates(shape)) {
    // 閉じた形は、描き始めの場所 N 通り × 回る向き 2 通り。線はずらさない（逆向きは回転で合う）
    for (const [zx, zy] of t.closed ? [[t.fx, t.fy], [t.rx, t.ry]] : [[t.fx, t.fy]]) {
      /** shift だけずらした理想の形との合い方（相関の二乗。1 = ぴったり） */
      const fitAt = (shift: number) => {
        let re = 0;
        let im = 0;
        for (let i = 0; i < N; i++) {
          const ax = zx![shift + i]!;
          const ay = zy![shift + i]!;
          // 描いた点 · conj(理想の点)
          re += wx[i]! * ax + wy[i]! * ay;
          im += wy[i]! * ax - wx[i]! * ay;
        }
        const fit = (re * re + im * im) / (energy * t.energy);
        if (fit > best.fit) best = { fit, re: re / t.energy, im: im / t.energy, template: t };
        return fit;
      };
      if (!t.closed) {
        fitAt(0);
        continue;
      }
      // 計算を減らすため、まず COARSE 点おきに比べ、よかった 2 か所のまわりだけを 1 点ずつ比べる
      const coarse: { shift: number; fit: number }[] = [];
      for (let shift = 0; shift < N; shift += COARSE) coarse.push({ shift, fit: fitAt(shift) });
      coarse.sort((a, b) => b.fit - a.fit);
      for (const { shift } of coarse.slice(0, 2)) {
        for (let d = 1; d < COARSE; d++) {
          fitAt((shift + d) % N);
          fitAt((shift - d + N) % N);
        }
      }
    }
  }

  const e = Math.sqrt(Math.max(0, 1 - best.fit));
  const quality = Math.exp(-((e / TOLERANCE[shape]) ** 1.5));
  const size = Math.sqrt(energy / N);
  const score = Math.min(100, Math.max(0, Math.round(100 * quality * smoothstep(SIZE_ZERO, SIZE_FULL, size))));
  return { score, template: best.template, re: best.re, im: best.im, cx, cy, drawn };
}

/** 描いた絵の点数（0〜100 の整数） */
export const scoreDrawing = (shape: Shape, points: readonly Point[]) => fitDrawing(shape, points)?.score ?? 0;

export interface Analysis {
  /** 0〜100 の整数（scoreDrawing と同じ） */
  score: number;
  /** 理想の形を、描いた絵にいちばん近い向き・大きさ・位置に合わせたもの（重ねて描く用）。点がなければ空 */
  ideal: { points: Point[]; closed: boolean };
  /** 描いた点ごとの、理想の形からのずれ（理想の形の大きさに対する割合。0 = ぴったり） */
  deviations: number[];
}

/** 重ねて見せる理想の形を合わせ直す回数と、そのときに使わない（ずれの大きい）点の割合 */
const REFINE_STEPS = 8;
const REFINE_DROP = 0.2;

/**
 * 結果の画面用：点数に加えて、重ねて見せる理想の形と、点ごとのずれを返す。
 * 採点は並べ直した点の順番どうしで比べるが、見せるときは「形として近い所」に重ねたほうがどこがずれたか分かりやすいので、
 * いちばん近い点どうしで合わせ直すのを数回くり返してから重ねる
 */
export function analyzeDrawing(shape: Shape, points: readonly Point[]): Analysis {
  const fit = fitDrawing(shape, points);
  if (!fit) return { score: 0, ideal: { points: [], closed: shape !== "line" }, deviations: points.map(() => 0) };
  const t = fit.template;
  const outline = t.closed ? [...t.outline, t.outline[0]!] : t.outline;
  const dense = resample(outline, 4 * N);
  let { re, im, cx, cy } = fit;
  const place = ([x, y]: Point): Point => [cx + re * x - im * y, cy + re * y + im * x];

  for (let step = 0; step < REFINE_STEPS; step++) {
    const placed = dense.map(place);
    // 描いた点ごとに、いちばん近い理想の形の点。大きくずれた点（はみ出した所）は合わせるのに使わない
    const pairs = fit.drawn
      .map((p) => {
        let bestIndex = 0;
        let bestDist = Infinity;
        placed.forEach((q, j) => {
          const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
          if (d < bestDist) {
            bestDist = d;
            bestIndex = j;
          }
        });
        return { p, z: dense[bestIndex]!, d: bestDist };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.ceil(fit.drawn.length * (1 - REFINE_DROP)));
    const [wx, wy] = centroid(pairs.map((q) => q.p));
    const [zx, zy] = centroid(pairs.map((q) => q.z));
    let nre = 0;
    let nim = 0;
    let den = 0;
    for (const { p, z } of pairs) {
      const ux = p[0] - wx;
      const uy = p[1] - wy;
      const vx = z[0] - zx;
      const vy = z[1] - zy;
      nre += ux * vx + uy * vy;
      nim += uy * vx - ux * vy;
      den += vx * vx + vy * vy;
    }
    if (den < 1e-9) break;
    re = nre / den;
    im = nim / den;
    cx = wx - (re * zx - im * zy);
    cy = wy - (re * zy + im * zx);
  }

  const ideal = t.outline.map(place);
  const ring = t.closed ? [...ideal, ideal[0]!] : ideal;
  // 理想の形の大きさ（重心からの距離の二乗平均の平方根）
  const idealSize = Math.hypot(re, im) * Math.sqrt(t.energy / N) || 1;
  const deviations = points.map((p) => {
    let d = Infinity;
    for (let i = 1; i < ring.length; i++) d = Math.min(d, segmentDist(p, ring[i - 1]!, ring[i]!));
    return d / idealSize;
  });
  return { score: fit.score, ideal: { points: ideal, closed: t.closed }, deviations };
}

/**
 * 画面で描いた点を、送れる形にする：0〜CANVAS の整数におさめ、同じ点が続いたら 1 つにし、
 * MAX_POINTS より多ければ線にそって等間隔に並べ直す（始点と終点は残る）
 */
export function thinStroke(raw: readonly Point[], max = MAX_POINTS): Point[] {
  const clamp = (v: number) => Math.min(CANVAS, Math.max(0, Math.round(v)));
  const snap = (p: Point): Point => [clamp(p[0]), clamp(p[1])];
  const dedupe = (list: Point[]) => list.filter((p, i) => i === 0 || p[0] !== list[i - 1]![0] || p[1] !== list[i - 1]![1]);
  const points = dedupe(raw.map(snap));
  if (points.length <= max) return points;
  return dedupe(resample(points, max).map(snap));
}

// ---------- コンピュータの絵 ----------

/** 理想の形の頂点を、なめらかに等間隔の点にする（閉じた形は始点に戻る） */
function idealStroke(shape: Shape, rng: Rng, n: number): Point[] {
  const list = templates(shape);
  const t = list[Math.floor(rng() * list.length)]!;
  if (!t.closed) return resample(t.outline, n);
  const loop = resampleLoop([...t.outline, t.outline[0]!], n);
  // 描き始めの場所と向きをでたらめに
  const shift = Math.floor(rng() * n);
  const dir = rng() < 0.5 ? 1 : -1;
  const ring = loop.map((_, i) => loop[(((shift + dir * i) % n) + n) % n]!);
  return [...ring, ring[0]!];
}

/** コンピュータの絵のゆがみの大きさ（お題ごと）。どのお題でもだいたい 60〜85 点になるようにそろえてある */
const BOT_SHAKE: Record<Shape, number> = { circle: 1.17, line: 2.2, triangle: 1.12, square: 1.4, star: 1 };

/**
 * 人間らしくゆがめた絵：全体のゆがみ（縦横の伸び縮み・ななめのずれ）、ゆっくりした波のようなゆらぎ、
 * 点ごとの小さなふるえ、閉じるときの行き過ぎ・足りなさ を足す。目隠しのときはゆがみを大きくする
 */
function humanStroke(shape: Shape, blind: boolean, rng: Rng): Point[] {
  const n = 140;
  const amp = BOT_SHAKE[shape] * (blind ? 1.5 : 1);
  const wob = (k: number) => (rng() * 2 - 1) * k * amp;
  let points = idealStroke(shape, rng, n);

  // 閉じた形は、終わりを少し行き過ぎるか、少し手前で止める
  if (shape !== "line") {
    const cut = Math.round(wob(0.03) * n);
    points = cut >= 0 ? [...points, ...points.slice(1, 1 + cut)] : points.slice(0, points.length + cut);
  }

  // 全体のゆがみ
  const sx = 1 + wob(0.09);
  const sy = 1 + wob(0.09);
  const shear = wob(0.07);
  // ゆっくりした波（線の長さにそって、2〜3 回うねる）
  const waves = Array.from({ length: 2 }, () => ({ k: 1 + Math.floor(rng() * 3), phase: rng() * Math.PI * 2, a: wob(0.022) }));
  const jitter = 0.006 * amp;
  const len = points.length;
  points = points.map(([x, y], i) => {
    const u = i / Math.max(1, len - 1);
    const bend = waves.reduce((s, wv) => s + wv.a * Math.sin(Math.PI * 2 * wv.k * u + wv.phase), 0);
    const gx = x * sx + y * shear;
    const gy = y * sy;
    // 波は中心からの向きにふくらませる（線はその垂直の向き）
    const r = Math.hypot(gx, gy) || 1;
    const [nx, ny] = shape === "line" ? [0, 1] : [gx / r, gy / r];
    return [gx + nx * bend + (rng() * 2 - 1) * jitter, gy + ny * bend + (rng() * 2 - 1) * jitter] as Point;
  });

  // 大きさ・向き・位置はでたらめに（いちばん外の点が中心から 300〜430 になるようにして、枠からはみ出さないように）
  const reach = Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
  const radius = (300 + rng() * 130) / reach;
  const turn = rng() * Math.PI * 2;
  const c = Math.cos(turn) * radius;
  const s = Math.sin(turn) * radius;
  const ox = CANVAS / 2 + (rng() * 2 - 1) * 40;
  const oy = CANVAS / 2 + (rng() * 2 - 1) * 40;
  return thinStroke(points.map(([x, y]) => [ox + x * c - y * s, oy + x * s + y * c]));
}

/** コンピュータが目隠しをつける割合 */
const BOT_BLIND = 0.25;

export const freehand: GameDefinition<FreehandState, FreehandMove> = {
  id: "freehand",

  initialState() {
    return { rounds: [] };
  },

  status(state): GameStatus {
    const turn = turnOf(state.rounds);
    if (turn !== null) return { kind: "playing", turn };
    const { wins, totals } = tally(state.rounds);
    if (wins[0] !== wins[1]) return { kind: "finished", winner: wins[0] > wins[1] ? 0 : 1 };
    if (totals[0] !== totals[1]) return { kind: "finished", winner: totals[0] > totals[1] ? 0 : 1 };
    return { kind: "finished", winner: null };
  },

  applyMove(state, move, seat) {
    const turn = turnOf(state.rounds);
    if (turn === null) throw new IllegalMoveError("game_over");
    if (seat !== turn) throw new IllegalMoveError("not_your_turn");
    const { points } = move;
    if (points.length < MIN_POINTS || points.length > MAX_POINTS) throw new IllegalMoveError("freehand_points");
    for (const [x, y] of points) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > CANVAS || y > CANVAS) {
        throw new IllegalMoveError("freehand_coords");
      }
    }

    const last = state.rounds.at(-1);
    const waiting = last && !isComplete(last) ? last : null;
    const copy = points.map(([x, y]) => [x, y] as Point);

    if (!waiting) {
      // 出題する人：お題を選んで、続けて描く
      if (!isShape(move.shape)) throw new IllegalMoveError("freehand_shape");
      if (usedShapes(state.rounds).includes(move.shape)) throw new IllegalMoveError("freehand_shape_used");
      const drawings: Round["drawings"] = [null, null];
      drawings[seat] = { points: copy, score: scoreDrawing(move.shape, copy) };
      return { rounds: [...state.rounds, { setter: seat, shape: move.shape, blind: move.blind === true, drawings }] };
    }

    // 相手：同じお題・同じ目隠しで描くだけ
    if (move.shape !== undefined || move.blind !== undefined) throw new IllegalMoveError("freehand_already_set");
    const drawings: Round["drawings"] = [...waiting.drawings];
    drawings[seat] = { points: copy, score: scoreDrawing(waiting.shape, copy) };
    return { rounds: [...state.rounds.slice(0, -1), { ...waiting, drawings }] };
  },

  parseMove(raw) {
    if (raw === null || typeof raw !== "object") return null;
    const r = raw as { shape?: unknown; blind?: unknown; points?: unknown };
    if (!Array.isArray(r.points)) return null;
    const points: Point[] = [];
    for (const p of r.points) {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) return null;
      points.push([p[0] as number, p[1] as number]);
    }
    const move: FreehandMove = { points };
    if (r.shape !== undefined) {
      if (typeof r.shape !== "string") return null;
      move.shape = r.shape as Shape;
    }
    if (r.blind !== undefined) {
      if (typeof r.blind !== "boolean") return null;
      move.blind = r.blind;
    }
    return move;
  },

  viewState(state, viewer, revealAll): FreehandView {
    if (revealAll) return state;
    return {
      rounds: state.rounds.map((r) => {
        if (isComplete(r) || viewer === r.setter) return r;
        // 相手がまだ描いていない：出題した人の絵と点数は、出題した本人にしか見せない
        const drawings: RoundView["drawings"] = [...r.drawings];
        drawings[r.setter] = "hidden";
        return { ...r, drawings };
      }),
    };
  },

  viewMove(move, mover, viewer) {
    // 絵は回戦の結果（rounds）で見せる。手の記録では相手の点の列を伏せる
    return mover === viewer ? move : { ...move, points: null };
  },

  botMove(view, seat, rng) {
    const v = view as FreehandView;
    if (turnOf(v.rounds) !== seat) return null;
    const last = v.rounds.at(-1);
    if (last && !isComplete(last)) return { points: humanStroke(last.shape, last.blind, rng) };
    // 出題する：まだ出ていないお題をでたらめに選ぶ
    const left = SHAPES.filter((s) => !usedShapes(v.rounds).includes(s));
    const shape = left[Math.floor(rng() * left.length)]!;
    const blind = rng() < BOT_BLIND;
    return { shape, blind, points: humanStroke(shape, blind, rng) };
  },
};
