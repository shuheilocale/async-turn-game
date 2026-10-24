import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";
import { CANVAS, centroid, dist, MAX_POINTS, MIN_POINTS, pathLength, resample, smoothstep, thinStroke, type Point } from "./freehand.ts";

/**
 * はんぶんこハート：2 人で 1 つのハートを半分ずつ描く協力ゲーム。全部で 3 回戦。
 * 毎回戦、1 人が左半分、もう 1 人が右半分を描く。左半分の人が先に描き、右半分の人は相手の半分を見ずに描く。
 * 回戦ごとに左右を交代する（1 回戦目は先手が左）。左半分の人が先に描くので、手番は
 * 先手 → 後手 → 後手 → 先手 → 先手 → 後手 と進む（回戦を描き終えた人が、結果を見てから次の回戦の左半分を描く）。
 * 2 人とも描いたら、2 つの半分を合わせたハートを 0〜100 点で採点する（scoreHeart）。
 * 回戦ごとのお題：1 回戦目は目安の点あり、2 回戦目は目安なし、3 回戦目は目隠し（描いている線も見えない）。
 * 3 回戦の平均が 60 点以上なら 2 人でクリア、未満なら失敗。
 *
 * 画面が送るのは描いた点の列だけで、点数はサーバの applyMove で決める。キャンバスの座標・点の数の上限・
 * 間引き方（thinStroke）は、ひとふでチャレンジ（freehand.ts）と同じ
 */

export { CANVAS, MAX_POINTS, MIN_POINTS, thinStroke };
export type { Point };

export const ROUNDS = 3;
/** 3 回戦の平均がこれ以上ならクリア */
export const CLEAR_AVERAGE = 60;

/** 回戦ごとのお題（1 回戦目から順に）。guide = 目安の点あり、free = 目安なし、blind = 目隠し */
export const THEMES = ["guide", "free", "blind"] as const;
export type Theme = (typeof THEMES)[number];

/** 1 回戦目の目安の点（上のくぼみと下のとがり）。理想のハートを幅 640 でキャンバスの真ん中に置いたときの位置 */
export const GUIDE = { dip: [500, 350] as Point, tip: [500, 790] as Point };

export interface HeartMove {
  points: Point[];
}

/** 2 つの半分を合わせた点数。どれも 0〜100 の整数 */
export interface HeartScore {
  /** 総合点 */
  score: number;
  /** 左右のそろい（右半分を鏡に映して左半分と比べる） */
  symmetry: number;
  /** つなぎ目（上のくぼみと下のとがり）が合っているか */
  joins: number;
  /** 合わせた形のハートらしさ */
  shape: number;
}

/** 1 回戦分。H は半分の絵の形（画面に渡すときは、伏せた半分が "hidden" になる） */
export interface Round<H = Point[] | null> {
  /** 左半分を描く席（この席が先に描く）。右半分はもう 1 人 */
  leftSeat: Seat;
  theme: Theme;
  /** 描いた点の列。まだ描いていなければ null */
  left: H;
  right: H;
  /** 2 人とも描いたら、サーバが計算した点数 */
  result: HeartScore | null;
}

export type HeartRound = Round;

export interface HeartState {
  /** これまでの回戦。最後の 1 つは、左半分だけ描いて右半分を待っていることがある */
  rounds: HeartRound[];
}

/** 画面に渡す形。右半分がまだの回戦の左半分は、左半分を描いた本人以外には "hidden" */
export type HalfView = Point[] | "hidden" | null;
export type RoundView = Round<HalfView>;
export interface HeartView {
  rounds: RoundView[];
}

type AnyRound = Round<HalfView>;

/** その回戦で左半分を描く（先に描く）席。1 回戦目は先手、あとは交代 */
export const leftSeatOf = (index: number): Seat => (index % 2 === 0 ? 0 : 1);

/** 2 人とも描き終えた回戦か */
export const isComplete = (r: AnyRound) => r.result !== null;

/** その席がその回戦で描く側 */
export const sideOf = (r: AnyRound, seat: Seat): "left" | "right" => (seat === r.leftSeat ? "left" : "right");

/** 今描く人。終局していれば null */
export function turnOf(rounds: readonly AnyRound[]): Seat | null {
  const last = rounds.at(-1);
  if (last && !isComplete(last)) return other(last.leftSeat);
  return rounds.length >= ROUNDS ? null : leftSeatOf(rounds.length);
}

/** 終わった回戦の点数・合計・平均（まだ 1 つもなければ平均は 0） */
export function summary(rounds: readonly AnyRound[]) {
  const scores = rounds.flatMap((r) => (r.result ? [r.result.score] : []));
  const total = scores.reduce((a, b) => a + b, 0);
  return { scores, total, average: scores.length > 0 ? total / scores.length : 0 };
}

/** 点数をやさしい言葉に分ける段階（画面で game.heart.grade.<段階> に直す） */
export type Grade = "perfect" | "great" | "good" | "close" | "apart";

export function gradeOf(score: number): Grade {
  if (score >= 90) return "perfect";
  if (score >= 75) return "great";
  if (score >= CLEAR_AVERAGE) return "good";
  if (score >= 40) return "close";
  return "apart";
}

// ---------- 採点 ----------

/** 採点のときに、半分ずつを並べ直す点の数 */
const M = 64;
/**
 * ずれ（0 = ぴったり）を 0〜1 に直すときの許しの幅。大きいほど甘い。
 * 2 人で別々に描くので、ひとふでチャレンジよりやさしめ。手描きらしい 2 人のハートがだいたい 60〜95 点になるよう、
 * テスト（heart.test.ts）の例で合わせてある
 */
const TOLERANCE = { symmetry: 0.2, joins: 0.2, shape: 0.12 };
/** 総合点は 3 つを掛け合わせる。そのときの重み（指数。合計 1）。ハートらしさを少し重く */
const WEIGHT = { symmetry: 0.3, joins: 0.3, shape: 0.4 };
/** 2 つの半分の大きさのちがいは、形のちがいの半分の重さで数える（少しの大きさのちがいにやさしく） */
const SCALE_WEIGHT = 0.5;
/** つなぎ目の離れ方は、ハートの大きさのこの割合までは数えない（指でぴったり同じ所に置くのはむずかしい） */
const JOIN_FREE = 0.04;
/** ハートの縦横の比は、理想の形からこの倍率までは問わない（太いハートも細いハートもよい） */
const ASPECT_FREE = 1.3;
/** ハートの大きさ（重心からの距離の二乗平均の平方根）がこれ以上なら満点まで出る。これ以下なら 0 点 */
const SIZE_FULL = 80;
const SIZE_ZERO = 30;

/** 点の列を、上の端（くぼみ）から下の端（とがり）へ向かう順にする。とがりから描いても同じに扱う */
export const orient = (points: readonly Point[]): Point[] =>
  points.length > 1 && points[0]![1] > points.at(-1)![1] ? [...points].reverse() : [...points];

/** 重心を原点に動かす */
function centered(points: readonly Point[]): Point[] {
  const [cx, cy] = centroid(points);
  return points.map(([x, y]) => [x - cx, y - cy] as Point);
}

/** 原点からの距離の二乗の和 */
const energy = (points: readonly Point[]) => points.reduce((s, [x, y]) => s + x * x + y * y, 0);

/**
 * 理想のハートの左半分（くぼみ → 外へふくらむ → とがり）。大きさはばらばらでよい（合わせるときにそろえる）。
 * 人によって描き方がちがうので 3 つ用意し、いちばん近いものと比べる：
 * よく知られたハートの式（x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t）、そのくぼみを深くしたもの、
 * 2 つの円と直線で描くまるいハート
 */
function idealHalves(): Point[][] {
  const formula = (deep: number) =>
    Array.from({ length: 401 }, (_, i) => {
      const t = (Math.PI * i) / 400;
      const s = Math.sin(t);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [-16 * s * s * s, -y + deep * Math.exp(-4 * t)] as Point;
    });
  const round: Point[] = [];
  // 半径 1 の円を、くぼみ（円の右端）から上へ 1/8 周の 5 倍まわり、そこからとがり（くぼみの 2.9 下）へまっすぐ
  for (let i = 0; i <= 120; i++) {
    const a = -(Math.PI * 1.25 * i) / 120;
    round.push([Math.cos(a) - 1, Math.sin(a)]);
  }
  const [ex, ey] = round.at(-1)!;
  for (let i = 1; i <= 60; i++) round.push([ex * (1 - i / 60), ey + (2.9 - ey) * (i / 60)]);
  return [formula(0), formula(3.5), round];
}

/** 合わせたハートの一周（左半分をくぼみからとがりへ、続けて右半分をとがりからくぼみへ）。半分ずつ M 点に並べ直す */
const loopOf = (left: readonly Point[], right: readonly Point[]) => [...resample(left, M), ...resample(right, M).reverse()];

/** 理想のハートの一周（重心が原点）。使うときに作って覚えておく */
let idealLoops: Point[][] | null = null;
const ideals = () => (idealLoops ??= idealHalves().map((h) => centered(loopOf(h, h.map(([x, y]) => [-x, y] as Point)))));

/** ずれ e を 0〜1 にする（小さなずれはほとんど下げない） */
const quality = (e: number, tolerance: number) => Math.exp(-((e / tolerance) ** 2));

/**
 * 2 つの半分を合わせたハートを採点する。
 * 1. それぞれの半分を、くぼみからとがりへ向かう順に、線にそって等間隔の 64 点に並べ直す
 * 2. 左右のそろい：右半分を鏡に映し（左右を入れかえ）、位置をそろえて左半分と比べる。
 *    形のちがい（回すと合う向きのちがいも含む）と、大きさのちがい（半分の重さ）を数える
 * 3. つなぎ目：2 つの半分の上の端どうし（くぼみ）、下の端どうし（とがり）の離れ方。ハートの大きさの 4% までは数えない
 * 4. ハートらしさ：合わせた一周を、理想のハートの一周と比べる。縦と横は別々に伸び縮みさせて合わせ（太さは問わない）、
 *    縦横の比が理想から 1.3 倍を超えたぶんだけ少し下げる
 * 5. それぞれのずれ（ハートの大きさに対する割合）を 0〜1 に直し、重みをつけて掛け合わせて 0〜100 点にする。小さすぎるハートは点を下げる
 * ハート全体の大きさと位置は点数に関係ない。2 つの半分どうしの、大きさや位置の小さなずれには少しやさしい
 */
export function scoreHeart(leftPoints: readonly Point[], rightPoints: readonly Point[]): HeartScore {
  const zero: HeartScore = { score: 0, symmetry: 0, joins: 0, shape: 0 };
  if (leftPoints.length < 2 || rightPoints.length < 2) return zero;
  if (pathLength(leftPoints) < 1 || pathLength(rightPoints) < 1) return zero;
  const left = resample(orient(leftPoints), M);
  const right = resample(orient(rightPoints), M);
  const size = Math.sqrt(energy(centered([...left, ...right])) / (2 * M));
  if (size < 1e-6) return zero;

  // 左右のそろい
  const a = centered(left);
  const b = centered(right.map(([x, y]) => [-x, y] as Point));
  let dot = 0;
  for (let i = 0; i < M; i++) dot += a[i]![0] * b[i]![0] + a[i]![1] * b[i]![1];
  const ea = energy(a);
  const eb = energy(b);
  const cos = ea > 0 && eb > 0 ? dot / Math.sqrt(ea * eb) : 0;
  const shapeOff = cos > 0 ? Math.sqrt(Math.max(0, 1 - cos * cos)) : 1;
  const scaleOff = ea > 0 && eb > 0 ? Math.abs(Math.log(Math.sqrt(ea / eb))) : 1;
  const symmetry = quality(Math.hypot(shapeOff, SCALE_WEIGHT * scaleOff), TOLERANCE.symmetry);

  // つなぎ目
  const gap = (p: Point, q: Point) => Math.max(0, dist(p, q) / size - JOIN_FREE);
  const top = gap(left[0]!, right[0]!);
  const bottom = gap(left.at(-1)!, right.at(-1)!);
  const joins = quality(Math.sqrt((top * top + bottom * bottom) / 2), TOLERANCE.joins);

  // ハートらしさ（縦と横を別々に合わせる最小二乗）
  const loop = centered(loopOf(left, right));
  const loopEnergy = energy(loop);
  let shapeErr = 1;
  for (const ideal of ideals()) {
    let xx = 0;
    let xi = 0;
    let yy = 0;
    let yi = 0;
    for (let i = 0; i < loop.length; i++) {
      xx += loop[i]![0] * ideal[i]![0];
      xi += ideal[i]![0] ** 2;
      yy += loop[i]![1] * ideal[i]![1];
      yi += ideal[i]![1] ** 2;
    }
    const sx = xx / xi;
    const sy = yy / yi;
    // 裏返し（くぼみが下・左右が逆）でしか合わないものはハートではない
    if (!(sx > 0 && sy > 0) || loopEnergy <= 0) continue;
    let residual = 0;
    for (let i = 0; i < loop.length; i++) {
      residual += (loop[i]![0] - sx * ideal[i]![0]) ** 2 + (loop[i]![1] - sy * ideal[i]![1]) ** 2;
    }
    const aspectOff = Math.max(0, Math.abs(Math.log(sx / sy)) - Math.log(ASPECT_FREE));
    shapeErr = Math.min(shapeErr, Math.hypot(Math.sqrt(residual / loopEnergy), 0.5 * aspectOff));
  }
  const shape = quality(shapeErr, TOLERANCE.shape);

  const overall =
    symmetry ** WEIGHT.symmetry * joins ** WEIGHT.joins * shape ** WEIGHT.shape * smoothstep(SIZE_ZERO, SIZE_FULL, size);
  const pct = (v: number) => Math.min(100, Math.max(0, Math.round(100 * v)));
  return { score: pct(overall), symmetry: pct(symmetry), joins: pct(joins), shape: pct(shape) };
}

// ---------- ルール ----------

export const heart: GameDefinition<HeartState, HeartMove> = {
  id: "heart",

  initialState() {
    return { rounds: [] };
  },

  status(state): GameStatus {
    const turn = turnOf(state.rounds);
    if (turn !== null) return { kind: "playing", turn };
    // 協力ゲームなので勝ち負けはない。平均で 2 人のクリア・失敗を決める
    const { average } = summary(state.rounds);
    return { kind: "finished", winner: null, coop: average >= CLEAR_AVERAGE ? "cleared" : "failed" };
  },

  applyMove(state, move, seat) {
    const turn = turnOf(state.rounds);
    if (turn === null) throw new IllegalMoveError("game_over");
    if (seat !== turn) throw new IllegalMoveError("not_your_turn");
    const { points } = move;
    if (points.length < MIN_POINTS || points.length > MAX_POINTS) throw new IllegalMoveError("heart_points");
    for (const [x, y] of points) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > CANVAS || y > CANVAS) {
        throw new IllegalMoveError("heart_coords");
      }
    }
    const copy = points.map(([x, y]) => [x, y] as Point);

    const last = state.rounds.at(-1);
    if (last && !isComplete(last)) {
      // 右半分：描いたら 2 つを合わせて採点する
      return {
        rounds: [...state.rounds.slice(0, -1), { ...last, right: copy, result: scoreHeart(last.left!, copy) }],
      };
    }
    // 左半分：新しい回戦を始める
    const index = state.rounds.length;
    return {
      rounds: [...state.rounds, { leftSeat: seat, theme: THEMES[index]!, left: copy, right: null, result: null }],
    };
  },

  parseMove(raw) {
    if (raw === null || typeof raw !== "object") return null;
    const r = raw as { points?: unknown };
    if (!Array.isArray(r.points)) return null;
    const points: Point[] = [];
    for (const p of r.points) {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) return null;
      points.push([p[0] as number, p[1] as number]);
    }
    return { points };
  },

  viewState(state, viewer, revealAll): HeartView {
    if (revealAll) return state;
    return {
      rounds: state.rounds.map((r) =>
        // 右半分がまだ：左半分は、描いた本人にしか見せない
        isComplete(r) || viewer === r.leftSeat || r.left === null ? r : { ...r, left: "hidden" },
      ),
    };
  },

  viewMove(move, mover, viewer) {
    // 絵は回戦の結果（rounds）で見せる。手の記録では相手の点の列を伏せる
    return mover === viewer ? move : { points: null };
  },
};
