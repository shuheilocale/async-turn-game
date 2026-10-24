import type { Oekaki } from "@atg/core";

type Stroke = Oekaki.Stroke;
type Point = Oekaki.Point;

/**
 * おえかきクイズの絵の再生。描いた順・描いた速さで線を伸ばしていくが、全体は縮めて 5〜8 秒くらいに収める。
 * 1 筆の中は、描いていた時間（t0〜t1）のあいだ同じ速さで線が伸びるとみなす（点は間引いてあるので、点の数ではなく長さで割る）
 */

/** 線と線のあいだ（指を離していた時間）は、再生ではこれより長くしない（考えていた時間で待たされないように） */
const MAX_GAP_MS = 700;
/** 1 筆にかける時間の下限（点を置いただけの線も、少しは見えるように） */
const MIN_STROKE_MS = 60;
/** 描いた時間（あいだを縮めたあと）がこれ以下なら、そのままの速さで再生する */
export const PLAY_MIN_MS = 5000;
/** 再生の長さの上限 */
export const PLAY_MAX_MS = 8000;
/** PLAY_MIN_MS を超えたぶんを、再生ではこの割合に縮める（40 秒描いても 8 秒ほどになる） */
const SQUEEZE = 0.12;

export interface PlannedStroke {
  stroke: Stroke;
  /** 再生を始めてからのミリ秒。この線を描き始める時・描き終える時 */
  from: number;
  to: number;
  /** 始点から各点までの長さ */
  cum: number[];
}

export interface Plan {
  strokes: PlannedStroke[];
  /** 再生の長さ（ミリ秒）。線がなければ 0 */
  duration: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 再生の予定を立てる */
export function planPlayback(strokes: readonly Stroke[]): Plan {
  let clock = 0;
  let prevEnd: number | null = null;
  const planned = strokes.map((stroke): PlannedStroke => {
    const gap = prevEnd === null ? 0 : Math.min(MAX_GAP_MS, Math.max(0, stroke.t0 - prevEnd));
    const from = clock + gap;
    const to = from + Math.max(MIN_STROKE_MS, stroke.t1 - stroke.t0);
    clock = to;
    prevEnd = stroke.t1;
    const cum = [0];
    for (let i = 1; i < stroke.points.length; i++) cum.push(cum[i - 1]! + dist(stroke.points[i - 1]!, stroke.points[i]!));
    return { stroke, from, to, cum };
  });
  const real = clock;
  const duration = real <= PLAY_MIN_MS ? real : Math.min(PLAY_MAX_MS, PLAY_MIN_MS + (real - PLAY_MIN_MS) * SQUEEZE);
  const k = real > 0 ? duration / real : 1;
  return { strokes: planned.map((p) => ({ ...p, from: p.from * k, to: p.to * k })), duration };
}

export interface Visible {
  stroke: Stroke;
  /** 今見えている部分の点（描いている途中の線は、とちゅうの点で終わる） */
  points: Point[];
}

/** 再生を始めて at ミリ秒のときに見えている線 */
export function visibleAt(plan: Plan, at: number): Visible[] {
  const out: Visible[] = [];
  for (const { stroke, from, to, cum } of plan.strokes) {
    if (at < from) break;
    const { points } = stroke;
    const total = cum.at(-1)!;
    if (at >= to || points.length === 1 || total === 0) {
      out.push({ stroke, points });
      continue;
    }
    const length = (total * (at - from)) / (to - from);
    let i = 1;
    while (i < cum.length && cum[i]! < length) i++;
    const shown = points.slice(0, i);
    if (i < points.length) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const seg = cum[i]! - cum[i - 1]!;
      const f = seg > 0 ? (length - cum[i - 1]!) / seg : 0;
      shown.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    out.push({ stroke, points: shown });
  }
  return out;
}
