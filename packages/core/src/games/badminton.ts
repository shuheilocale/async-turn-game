import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * バドミントン（シングルス、横から見た 1 本の線の上で打ち合う簡略版）。5 点先取（ラリーポイント。デュースはしない）。
 * シャトルを 1 回打つのが 1 手。相手が打ったシャトルは、こちらが開くまで空中で待っている。
 * 開くと飛んでくるので、指で選手を走らせ、届く所に来たら、はじいた向きと強さで打ち返す。
 * サーブは点を取った人が打つ（最初は先手）。
 *
 * シャトルの飛び方（重さと、速いほど強くかかる空気のブレーキ）はここで計算する。手には、相手のシャトルのどのコマで打ったか・
 * そのときの選手の位置・打ち出した速さ（向きつき）を入れて送る。ここで同じ計算をして、本当に届いたか
 * （走れる速さで間に合ったか、ラケットの届く所にシャトルがあったか）を確かめる。
 *
 * 座標はメートル単位で、コートを横から見た平面。ネットの真下を原点に、x は先手から後手の方向、y は上。
 * 先手のコートは x < 0、後手のコートは x > 0。時間はゲームの秒（本物よりすこしゆっくり）
 */

/** ネットからバックラインまで */
export const HALF = 6.7;
/** ネットからショートサービスラインまで。サーブはこれより奥に入れる */
export const SHORT_LINE = 1.98;
/** ネットの高さ（上の端） */
export const NET_H = 1.55;
/** 何点先に取ったら勝ちか */
export const TARGET = 5;

/** 重さ（m/s²）と、空気のブレーキの強さ（1/m）。速さの 2 乗に比例するブレーキで、強く打っても急に失速する */
export const GRAVITY = 6.3;
export const DRAG = 0.12;
/** 計算の 1 コマの時間（秒）と、計算するのは最大で何コマまでか */
export const DT = 1 / 120;
export const MAX_FRAMES = 8 * 120;

/** 打ち出す速さの上限（m/s）。サーブはこれより遅い */
export const SPEED_MAX = 24;
export const SERVE_SPEED_MAX = 15;

/** 選手が走る速さ（m/s）。打ったあと、真ん中へ戻るのも同じ速さ */
export const RUN = 3.6;
/** ラケットが届く、選手からの横の距離と、高さ（とんだときの上の端） */
export const REACH = 1.0;
export const REACH_H = 3.0;
/** 選手が戻る、コートの真ん中（ネットからの距離） */
export const HOME = 3.3;
/** 選手が動ける範囲（ネットからの距離） */
export const PLAYER_MIN = 0.3;
export const PLAYER_MAX = HALF + 0.8;
/** サーブ：打つ所（ネットからの距離と高さ）・サーブする人が立つ所・受ける人が待つ所 */
export const SERVE_X = 2.4;
export const SERVE_Y = 1.0;
export const SERVER_PX = 2.7;
export const RECEIVE_PX = 3.2;

/** ネット・アウト・サーブが手前すぎる・相手が返せなかった（決まった） */
export type Reason = "net" | "out" | "short" | "in";

/** 1 回打ったこと */
export interface Hit {
  seat: Seat;
  /** 相手のシャトルの何コマ目で打ったか（サーブは 0） */
  f: number;
  /** 打ったときの選手の位置 */
  px: number;
  /** 打った所（シャトルの位置） */
  x: number;
  y: number;
  /** 打ち出した速さ（m/s、向きつき） */
  vx: number;
  vy: number;
}

/** 終わったラリー（相手の画面で、最後の 1 打を再生するのに使う） */
export interface Rally {
  winner: Seat;
  reason: Reason;
  /** そのラリーで打ったすべて。最後が決まった（または失敗した）1 打 */
  hits: Hit[];
  /** 返せなかったときの、選手の最後の位置 */
  missPx?: number;
}

export interface BadmintonState {
  /** [先手, 後手] の点 */
  score: [number, number];
  /** 今のラリーでサーブする人 */
  server: Seat;
  /** 今のラリーで打ったもの。空ならサーブを待っている */
  hits: Hit[];
  /** 直前に終わったラリー */
  last: Rally | null;
}

export type BadmintonMove =
  | { kind: "serve"; vx: number; vy: number }
  /** x・y は打った所（確かめるためと、知らせの文を作るため） */
  | { kind: "hit"; f: number; px: number; x: number; y: number; vx: number; vy: number }
  /** 返せなかった。px は選手の最後の位置 */
  | { kind: "miss"; px: number };

/** その人から見た、相手のコートの向き（先手は +1） */
export const dirOf = (seat: Seat): 1 | -1 => (seat === 0 ? 1 : -1);
/** その人のコートの、ネットから d の所の x */
export const sideX = (seat: Seat, d: number) => -dirOf(seat) * d;

/** シャトルの飛んだ道筋。x[i]・y[i] は打ってから i コマ目の位置で、最後（end）は落ちた所かネットに当たった所 */
export interface Flight {
  x: number[];
  y: number[];
  end: number;
  /** ネットに当たった */
  net: boolean;
}

/** 1 コマ進める（重さと、速さの 2 乗に比例するブレーキ）。端末をまたいで同じ答えになるよう、四則と平方根だけを使う */
function step(p: { x: number; y: number; vx: number; vy: number }) {
  const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  p.vx += -DRAG * v * p.vx * DT;
  p.vy += (-GRAVITY - DRAG * v * p.vy) * DT;
  p.x += p.vx * DT;
  p.y += p.vy * DT;
}

/** (x, y) から (vx, vy) で打ったシャトルの道筋。noNet ならネットを通り抜けて床まで（ねらいの計算用） */
export function flight(x: number, y: number, vx: number, vy: number, noNet = false): Flight {
  const xs = [x];
  const ys = [y];
  const p = { x, y, vx, vy };
  for (let i = 1; i <= MAX_FRAMES; i++) {
    const px = p.x;
    const py = p.y;
    step(p);
    if (!noNet && px !== 0 && (px < 0) !== (p.x < 0)) {
      // ネットの真上を通るときの高さ
      const ny = py + ((p.y - py) * (0 - px)) / (p.x - px);
      if (ny < NET_H) {
        xs.push(0);
        ys.push(Math.max(0, ny));
        return { x: xs, y: ys, end: i, net: true };
      }
    }
    if (p.y <= 0) {
      xs.push(px + ((p.x - px) * py) / (py - p.y));
      ys.push(0);
      return { x: xs, y: ys, end: i, net: false };
    }
    xs.push(p.x);
    ys.push(p.y);
  }
  return { x: xs, y: ys, end: MAX_FRAMES, net: false };
}

export const flightOf = (h: Pick<Hit, "x" | "y" | "vx" | "vy">) => flight(h.x, h.y, h.vx, h.vy);

/** 打った人 seat から見た、そのシャトルの結果 */
export function judge(fl: Flight, seat: Seat, serve: boolean): Reason {
  if (fl.net) return "net";
  const d = fl.x[fl.end]! * dirOf(seat);
  if (d <= 0) return "net";
  if (d > HALF) return "out";
  if (serve && d < SHORT_LINE) return "short";
  return "in";
}

/** a から b へ、長さ len だけ近づいた所 */
export const moveToward = (a: number, b: number, len: number) => (Math.abs(b - a) <= len ? b : a + Math.sign(b - a) * len);

/** その人の選手が動ける範囲に収める */
export function clampPlayer(seat: Seat, px: number): number {
  const d = Math.max(PLAYER_MIN, Math.min(PLAYER_MAX, -px * dirOf(seat)));
  return sideX(seat, d);
}

/** 手の値を 0.001 単位にそろえることによる差を、どこまで許すか */
const EPS = 2e-3;

/** その人の位置 px が、動ける範囲の中か */
const inRange = (seat: Seat, px: number) => Math.abs(clampPlayer(seat, px) - px) < EPS;

/** 今のラリーで、次に打つ人 */
export function turnOf(s: BadmintonState): Seat | null {
  if (finished(s)) return null;
  const last = s.hits[s.hits.length - 1];
  return last ? other(last.seat) : s.server;
}

/**
 * 次に打つ人の選手が、相手が打った瞬間にいる所。前に自分が打った所から、相手が打つまでの間に真ん中へ戻る。
 * サーブを受ける人は、受ける所で待っている
 */
export function startPx(s: Pick<BadmintonState, "hits">): number {
  const last = s.hits[s.hits.length - 1]!;
  const seat = other(last.seat);
  const mine = s.hits[s.hits.length - 2];
  if (!mine) return sideX(seat, RECEIVE_PX);
  return moveToward(mine.px, sideX(seat, HOME), RUN * last.f * DT);
}

/**
 * fl の f コマ目のシャトルを、seat の選手が px で打てるか。start は相手が打った瞬間の選手の位置。
 * react は動き出すまでの時間（コンピュータ用。人は 0）
 */
export function canHit(fl: Flight, f: number, seat: Seat, px: number, start: number, react = 0): boolean {
  if (!Number.isInteger(f) || f < 1 || f >= fl.end) return false;
  const sx = fl.x[f]!;
  const sy = fl.y[f]!;
  if (sx * dirOf(seat) > 0 || sy > REACH_H) return false;
  // 手の値は 0.001 単位にそろえるので、そのぶんだけ甘く見る
  if (!inRange(seat, px) || Math.abs(sx - px) > REACH + EPS) return false;
  return Math.abs(px - start) <= RUN * Math.max(0, f * DT - react) + EPS;
}

/** ショットの種類（知らせの文と画面に出すだけ。ルールには使わない） */
export type Shot = "smash" | "clear" | "drop" | "lift" | "net" | "drive" | "serveHigh" | "serveLow";

export function shotOf(h: Pick<Hit, "seat" | "f" | "x" | "y" | "vx" | "vy">): Shot {
  const fl = flightOf(h);
  let apex = h.y;
  for (const y of fl.y) apex = Math.max(apex, y);
  if (h.f === 0) return apex > 3.2 ? "serveHigh" : "serveLow";
  const depth = fl.x[fl.end]! * dirOf(h.seat);
  const speed = Math.sqrt(h.vx * h.vx + h.vy * h.vy);
  if (h.y >= 2 && h.vy < 0 && speed >= 12) return "smash";
  if (h.y >= 1.9) return depth <= 3 ? "drop" : "clear";
  if (apex >= 3.5) return "lift";
  if (depth <= 2.2 && Math.abs(h.x) <= 2.6) return "net";
  return "drive";
}

/**
 * (x, y) から angle（ラジアン。相手のコートの方へ、上向きが正）の向きに打って、相手のコートのネットから depth の所に
 * 落とすための速さ（ネットは考えない）。届かなければ max
 */
export function speedFor(seat: Seat, x: number, y: number, angle: number, depth: number, max = SPEED_MAX): number {
  const c = Math.cos(angle) * dirOf(seat);
  const s = Math.sin(angle);
  const land = (v: number) => {
    const fl = flight(x, y, c * v, s * v, true);
    return fl.x[fl.end]! * dirOf(seat);
  };
  let lo = 0.5;
  let hi = max;
  if (land(hi) <= depth) return hi;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (land(mid) < depth) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 0.001 単位にそろえる。-0 は 0 にする */
export const round3 = (v: number) => Math.round(v * 1e3) / 1e3 || 0;

function finished(s: BadmintonState): GameStatus | null {
  const [a, b] = s.score;
  if (a >= TARGET || b >= TARGET) return { kind: "finished", winner: a > b ? 0 : 1 };
  return null;
}

/** ラリーを終える。点を取った人が次にサーブする */
function endRally(s: BadmintonState, winner: Seat, reason: Reason, hits: Hit[], missPx?: number): BadmintonState {
  const score: [number, number] = [s.score[0], s.score[1]];
  score[winner]++;
  return { score, server: winner, hits: [], last: { winner, reason, hits, ...(missPx !== undefined ? { missPx } : {}) } };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const speedOk = (vx: number, vy: number, max: number) => Math.sqrt(vx * vx + vy * vy) <= max + 0.01;


/** お試しのコンピュータが打つショット：[ショット, 上向きの角度, 落とす所（ネットからの距離）の範囲] */
type Plan = [Shot, number, number, number];
const HIGH_PLANS: [number, Plan][] = [
  [0.35, ["smash", -0.22, 0, 0]],
  [0.35, ["clear", 0.85, 5.8, 6.5]],
  [0.3, ["drop", 0.25, 0.8, 1.8]],
];
const LOW_PLANS: [number, Plan][] = [
  [0.5, ["lift", 1.0, 5.6, 6.5]],
  [0.3, ["net", 0.6, 0.5, 1.4]],
  [0.2, ["drive", 0.12, 4.0, 5.6]],
];

function pickPlan(plans: [number, Plan][], rng: Rng): Plan {
  let r = rng();
  for (const [w, p] of plans) {
    if (r < w) return p;
    r -= w;
  }
  return plans[plans.length - 1]![1];
}

/** コンピュータの、動き出すまでの時間と、届いても返しそこなう割合 */
const BOT_REACT = 0.3;
const BOT_FUMBLE = 0.1;
/** コンピュータのスマッシュの速さ（人が返せるよう、上限より遅い） */
const BOT_SMASH = 19;

function botShot(seat: Seat, x: number, y: number, rng: Rng, serve: boolean): { vx: number; vy: number } {
  for (let tries = 0; tries < 8; tries++) {
    const plan: Plan = serve
      ? rng() < 0.6
        ? ["serveHigh", 0.95, 5.6, 6.4]
        : ["serveLow", 0.35, 2.2, 2.8]
      : pickPlan(y >= 2.1 ? HIGH_PLANS : LOW_PLANS, rng);
    const [, base, lo, hi] = plan;
    const angle = base + (rng() - 0.5) * 0.12;
    const v =
      plan[0] === "smash"
        ? BOT_SMASH * (0.85 + rng() * 0.15)
        : speedFor(seat, x, y, angle, lo + (hi - lo) * rng(), serve ? SERVE_SPEED_MAX : SPEED_MAX);
    const vx = round3(Math.cos(angle) * v * dirOf(seat));
    const vy = round3(Math.sin(angle) * v);
    // たまに失敗する（ネット・アウトでも、そのまま打つ）
    if (judge(flight(x, y, vx, vy), seat, serve) === "in" || tries >= 7 || rng() < 0.05) return { vx, vy };
  }
  return { vx: 0, vy: 0 };
}

export const badminton: GameDefinition<BadmintonState, BadmintonMove> = {
  id: "badminton",

  initialState() {
    return { score: [0, 0], server: 0, hits: [], last: null };
  },

  status(state): GameStatus {
    return finished(state) ?? { kind: "playing", turn: turnOf(state)! };
  },

  applyMove(state, move, seat) {
    if (finished(state)) throw new IllegalMoveError("game_over");
    if (seat !== turnOf(state)) throw new IllegalMoveError("not_your_turn");
    const dir = dirOf(seat);

    if (state.hits.length === 0) {
      if (move.kind !== "serve") throw new IllegalMoveError("badminton_serve");
      if (move.vx * dir <= 0 || !speedOk(move.vx, move.vy, SERVE_SPEED_MAX)) throw new IllegalMoveError("badminton_speed");
      const hit: Hit = { seat, f: 0, px: sideX(seat, SERVER_PX), x: sideX(seat, SERVE_X), y: SERVE_Y, vx: move.vx, vy: move.vy };
      const reason = judge(flightOf(hit), seat, true);
      if (reason !== "in") return endRally(state, other(seat), reason, [hit]);
      return { ...state, hits: [hit] };
    }

    if (move.kind === "serve") throw new IllegalMoveError("badminton_serve");
    if (!inRange(seat, move.px)) throw new IllegalMoveError("badminton_reach");
    if (move.kind === "miss") {
      return endRally(state, other(seat), "in", state.hits, move.px);
    }

    const incoming = flightOf(state.hits[state.hits.length - 1]!);
    if (!canHit(incoming, move.f, seat, move.px, startPx(state))) throw new IllegalMoveError("badminton_reach");
    const x = incoming.x[move.f]!;
    const y = incoming.y[move.f]!;
    if (Math.abs(move.x - x) > 1e-3 || Math.abs(move.y - y) > 1e-3) throw new IllegalMoveError("badminton_sync");
    if (move.vx * dir <= 0 || !speedOk(move.vx, move.vy, SPEED_MAX)) throw new IllegalMoveError("badminton_speed");
    const hit: Hit = { seat, f: move.f, px: move.px, x, y, vx: move.vx, vy: move.vy };
    const hits = [...state.hits, hit];
    const reason = judge(flightOf(hit), seat, false);
    if (reason !== "in") return endRally(state, other(seat), reason, hits);
    return { ...state, hits };
  },

  parseMove(raw) {
    const m = raw as Record<string, unknown> | null;
    if (!m || typeof m !== "object") return null;
    const r = (v: unknown) => (finite(v) && Math.abs(v) < 100 ? round3(v) : null);
    if (m.kind === "miss") {
      const px = r(m.px);
      return px === null ? null : { kind: "miss", px };
    }
    const vx = r(m.vx);
    const vy = r(m.vy);
    if (vx === null || vy === null) return null;
    if (m.kind === "serve") return { kind: "serve", vx, vy };
    if (m.kind !== "hit") return null;
    const px = r(m.px);
    const x = r(m.x);
    const y = r(m.y);
    const f = m.f;
    if (px === null || x === null || y === null || typeof f !== "number" || !Number.isInteger(f) || f < 1 || f > MAX_FRAMES) {
      return null;
    }
    return { kind: "hit", f, px, x, y, vx, vy };
  },

  botMove(view, seat, rng) {
    const s = view as BadmintonState;
    if (turnOf(s) !== seat) return null;
    if (s.hits.length === 0) return { kind: "serve", ...botShot(seat, sideX(seat, SERVE_X), SERVE_Y, rng, true) };

    const incoming = flightOf(s.hits[s.hits.length - 1]!);
    const start = startPx(s);
    // 届くコマを探す。いちばん高い所で打てるコマを選ぶ（上から打てればスマッシュもできる）
    let best: { f: number; px: number } | null = null;
    for (let f = 1; f < incoming.end; f++) {
      const sx = incoming.x[f]!;
      const px = clampPlayer(seat, sx + Math.max(-REACH * 0.9, Math.min(REACH * 0.9, start - sx)));
      if (!canHit(incoming, f, seat, px, start, BOT_REACT)) continue;
      if (!best || incoming.y[f]! > incoming.y[best.f]! + 0.05) best = { f, px };
    }
    if (!best || rng() < BOT_FUMBLE) {
      const land = incoming.x[incoming.end]!;
      const run = RUN * Math.max(0, incoming.end * DT - BOT_REACT);
      return { kind: "miss", px: round3(clampPlayer(seat, moveToward(start, land, run))) };
    }
    const x = incoming.x[best.f]!;
    const y = incoming.y[best.f]!;
    return { kind: "hit", f: best.f, px: round3(best.px), x: round3(x), y: round3(y), ...botShot(seat, x, y, rng, false) };
  },
};
