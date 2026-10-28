import { Billiards } from "@atg/core";

/**
 * ねらいのガイド（React・planck・canvas を使わない）。手球からまっすぐ進んだとき、最初に当たる球（ゴーストの球の位置）か
 * クッションを探し、当たった球と手球が進む向きを出す。手球の大きさの円を光線のように進めて調べる
 */

const { BALL_R, HALF_L, HALF_W, CUE } = Billiards;

export interface Guide {
  /** 線の終わり（ゴーストの球の中心か、クッションに当たる所の手球の中心） */
  end: [number, number];
  /** 最初に当たる球。なければ null（クッションに当たる） */
  target: number | null;
  /** 当たった球が進む向き（長さ 1） */
  targetDir?: [number, number];
  /** 当てたあと手球が進む向き（回転なしのとき。まっすぐ当てると止まるので null） */
  cueDir?: [number, number] | null;
  /** クッションに当たったら、はね返る向き */
  bounceDir?: [number, number];
}

export function aimGuide(balls: readonly Billiards.Ball[], cue: { x: number; y: number }, angle: number): Guide {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // クッションまで（手球の中心が動ける長方形の端）
  const tx = ux > 1e-12 ? (HALF_L - BALL_R - cue.x) / ux : ux < -1e-12 ? (-HALF_L + BALL_R - cue.x) / ux : Infinity;
  const ty = uy > 1e-12 ? (HALF_W - BALL_R - cue.y) / uy : uy < -1e-12 ? (-HALF_W + BALL_R - cue.y) / uy : Infinity;
  const tWall = Math.max(0, Math.min(tx, ty));
  let best = tWall;
  let target: Billiards.Ball | null = null;
  for (const b of balls) {
    if (b.id === CUE) continue;
    // |cue + t u - b| = 2R を解く
    const dx = b.x - cue.x;
    const dy = b.y - cue.y;
    const along = dx * ux + dy * uy;
    if (along <= 0) continue;
    const perp2 = dx * dx + dy * dy - along * along;
    const rr = 4 * BALL_R * BALL_R;
    if (perp2 >= rr) continue;
    const t = along - Math.sqrt(rr - perp2);
    if (t >= 0 && t < best) {
      best = t;
      target = b;
    }
  }
  const end: [number, number] = [cue.x + ux * best, cue.y + uy * best];
  if (target) {
    const nx = target.x - end[0];
    const ny = target.y - end[1];
    const l = Math.hypot(nx, ny) || 1;
    const n: [number, number] = [nx / l, ny / l];
    // 手球は、当たった球の向きと直角に進む（まっすぐ当てたら止まる）
    const dot = ux * n[0] + uy * n[1];
    const cx = ux - dot * n[0];
    const cy = uy - dot * n[1];
    const cl = Math.hypot(cx, cy);
    return { end, target: target.id, targetDir: n, cueDir: cl > 0.05 ? [cx / cl, cy / cl] : null };
  }
  const bounceDir: [number, number] = tx < ty ? [-ux, uy] : [ux, -uy];
  return { end, target: null, bounceDir };
}

/**
 * 手球を置ける近くの場所。ほかの球に重なっていれば押し出し、クッションの内側（ブレイクならヘッドストリングより手前）に収める。
 * 置ける所が見つからなければ null
 */
export function placeNear(
  x: number,
  y: number,
  balls: readonly Billiards.Ball[],
  breaking: boolean,
): [number, number] | null {
  const maxX = breaking ? Billiards.HEAD_X : HALF_L - BALL_R;
  const clampX = (v: number) => Math.max(-HALF_L + BALL_R, Math.min(maxX, v));
  const clampY = (v: number) => Math.max(-HALF_W + BALL_R, Math.min(HALF_W - BALL_R, v));
  let px = clampX(x);
  let py = clampY(y);
  const gap = 2 * BALL_R + 0.0015;
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (const b of balls) {
      if (b.id === CUE) continue;
      const dx = px - b.x;
      const dy = py - b.y;
      const d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      const [nx, ny] = d > 1e-9 ? [dx / d, dy / d] : [1, 0];
      px = clampX(b.x + nx * gap);
      py = clampY(b.y + ny * gap);
      moved = true;
    }
    if (!moved) break;
  }
  return Billiards.canPlaceCue(px, py, balls, breaking) ? [px, py] : null;
}
