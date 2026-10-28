import { Billiards } from "@atg/core";

/**
 * ビリヤードの台の形と、物理・操作で共通に使う値。物理演算（physics.ts）・描画（render.ts）・盤（BilliardsBoard.tsx）から読む。
 * planck を読み込まなくても使えるよう、ここには planck を使うものを置かない。
 * 数値はメートル単位で、座標は core（packages/core/src/games/billiards.ts）と同じ（台の中心が原点、x が長い辺）
 */

const { HALF_L, HALF_W, BALL_R } = Billiards;

/** 物理演算の 1 コマの時間（秒）。再生するときもこの間隔で 1 コマずつ進める */
export const STEP = 1 / 60;
/** 計算するのは最大で何コマまでか（30 秒） */
export const MAX_FRAMES = 30 * 60;

/** クッション（ゴムの部分）の奥行き。クッションの先（球が当たる所）からレール（木の部分）まで */
export const CUSHION_D = 0.04;
/** レール（木の枠）の幅。描くだけ */
export const RAIL_W = 0.075;
/** 角のポケットの口の幅（向かい合うナックルの間）。球の直径の 2.1 倍くらい */
export const CORNER_MOUTH = 0.132;
/** 中央のポケットの口の幅 */
export const SIDE_MOUTH = 0.142;
/** ナックル（ポケットの口の角）の丸み */
export const KNUCKLE_R = 0.008;
/** ポケットの奥へのクッションの切り口の向き。角は口から奥へ少しずつせまく、中央はほんの少しせまく */
const CORNER_JAW = 1.12;
const SIDE_JAW = 0.15;
/** 口の線から球の中心がこれだけ奥へ入ったら、ポケットに落ちたとする */
export const CAPTURE_DEPTH = 0.85 * BALL_R;

/** 角のポケットの口を、角から各辺に沿って何 m 切るか */
const CUT = CORNER_MOUTH / Math.SQRT2;
const SIDE_HALF = SIDE_MOUTH / 2;

export type Vec = [x: number, y: number];

export interface Pocket {
  /** 口の中央（向かい合うナックルを結ぶ線のまん中） */
  mouth: Vec;
  /** 口から奥へ向かう向き（長さ 1） */
  normal: Vec;
  /** 口の幅の半分 */
  half: number;
  /** 穴（描くもの）。中心と半径 */
  hole: Vec;
  holeR: number;
  corner: boolean;
}

const norm = (x: number, y: number): Vec => {
  const l = Math.sqrt(x * x + y * y);
  return [x / l, y / l];
};

/** 6 つのポケット。0〜3 が角（左下・右下・右上・左上）、4・5 が中央（下・上） */
export const POCKETS: Pocket[] = (() => {
  const corners: Pocket[] = ([
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const).map(([sx, sy]) => {
    const a: Vec = [sx * (HALF_L - CUT), sy * HALF_W];
    const b: Vec = [sx * HALF_L, sy * (HALF_W - CUT)];
    const normal = norm(sx, sy);
    return {
      mouth: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      normal,
      half: CORNER_MOUTH / 2,
      hole: [sx * (HALF_L + 0.012), sy * (HALF_W + 0.012)],
      holeR: 0.061,
      corner: true,
    };
  });
  const sides: Pocket[] = [-1, 1].map((sy) => ({
    mouth: [0, sy * HALF_W],
    normal: [0, sy],
    half: SIDE_HALF,
    hole: [0, sy * (HALF_W + 0.036)],
    holeR: 0.057,
    corner: false,
  }));
  return [...corners, ...sides];
})();

/** 球の中心がポケットに落ちたか。落ちたならポケットの番号、落ちていなければ -1 */
export function pocketOf(x: number, y: number): number {
  for (let i = 0; i < POCKETS.length; i++) {
    const p = POCKETS[i]!;
    const dx = x - p.mouth[0];
    const dy = y - p.mouth[1];
    const depth = dx * p.normal[0] + dy * p.normal[1];
    const side = Math.abs(-dx * p.normal[1] + dy * p.normal[0]);
    if (depth > CAPTURE_DEPTH && side < p.half + BALL_R) return i;
  }
  // 計算のずれで台の外へ抜けた球は、いちばん近いポケットに落ちたことにする（ふつうは起きない）
  if (Math.abs(x) > HALF_L + BALL_R || Math.abs(y) > HALF_W + BALL_R) {
    let best = 0;
    let bestD = Infinity;
    POCKETS.forEach((p, i) => {
      const d = (x - p.hole[0]) * (x - p.hole[0]) + (y - p.hole[1]) * (y - p.hole[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
  return -1;
}

/** クッション 1 本：ゴムの形（凸の多角形）と、口の角の丸み（ナックル） */
export interface Cushion {
  /** 多角形の頂点 */
  points: Vec[];
  /** ナックルの丸の中心（半径は KNUCKLE_R） */
  knuckles: Vec[];
  /** クッションの先の線（球が当たる所）の両端 */
  nose: [Vec, Vec];
}

/**
 * クッションの先の線 n1 → n2 と、台の外向き out から、クッションの形を作る。
 * j1・j2 は両端の切り口が奥へ行くほどポケットの側へ出る割合（奥行き 1 あたり）
 */
function cushion(n1: Vec, n2: Vec, out: Vec, j1: number, j2: number): Cushion {
  const t = norm(n2[0] - n1[0], n2[1] - n1[1]);
  const k1: Vec = [n1[0] + out[0] * CUSHION_D - t[0] * j1 * CUSHION_D, n1[1] + out[1] * CUSHION_D - t[1] * j1 * CUSHION_D];
  const k2: Vec = [n2[0] + out[0] * CUSHION_D + t[0] * j2 * CUSHION_D, n2[1] + out[1] * CUSHION_D + t[1] * j2 * CUSHION_D];
  const points: Vec[] = [];
  const knuckles: Vec[] = [];
  // 両端の角を丸める：角の 2 つの辺に接する半径 KNUCKLE_R の円
  for (const [corner, along, back] of [
    [n1, t, k1],
    [n2, [-t[0], -t[1]] as Vec, k2],
  ] as const) {
    const e2 = norm(back[0] - corner[0], back[1] - corner[1]);
    // 半角の公式で求める（三角関数は端末で末の桁がずれることがあるので、平方根だけを使う）
    const cos = Math.max(-1, Math.min(1, along[0] * e2[0] + along[1] * e2[1]));
    const sinHalf = Math.sqrt((1 - cos) / 2);
    const cosHalf = Math.sqrt((1 + cos) / 2);
    const tangent = (KNUCKLE_R * cosHalf) / sinHalf;
    const bis = norm(along[0] + e2[0], along[1] + e2[1]);
    const dist = KNUCKLE_R / sinHalf;
    knuckles.push([corner[0] + bis[0] * dist, corner[1] + bis[1] * dist]);
    points.push([corner[0] + along[0] * tangent, corner[1] + along[1] * tangent]);
    points.push([corner[0] + e2[0] * tangent, corner[1] + e2[1] * tangent]);
  }
  points.push(k2, k1);
  return { points, knuckles, nose: [n1, n2] };
}

/** 6 本のクッション（下の左・下の右・右・上の右・上の左・左） */
export const CUSHIONS: Cushion[] = [
  cushion([-HALF_L + CUT, -HALF_W], [-SIDE_HALF, -HALF_W], [0, -1], CORNER_JAW, SIDE_JAW),
  cushion([SIDE_HALF, -HALF_W], [HALF_L - CUT, -HALF_W], [0, -1], SIDE_JAW, CORNER_JAW),
  cushion([HALF_L, -HALF_W + CUT], [HALF_L, HALF_W - CUT], [1, 0], CORNER_JAW, CORNER_JAW),
  cushion([HALF_L - CUT, HALF_W], [SIDE_HALF, HALF_W], [0, 1], CORNER_JAW, SIDE_JAW),
  cushion([-SIDE_HALF, HALF_W], [-HALF_L + CUT, HALF_W], [0, 1], SIDE_JAW, CORNER_JAW),
  cushion([-HALF_L, HALF_W - CUT], [-HALF_L, -HALF_W + CUT], [-1, 0], CORNER_JAW, CORNER_JAW),
];

// ---------- 打ち方 ----------

/** 強さのつまみ（0〜1）から打つ速さ（m/s）。弱いところを細かく合わせやすいよう、曲線にする */
const SPEED_LO = 0.3;
const SPEED_HI = 7;
const CURVE = 1.7;
export const speedOf = (power: number) => SPEED_LO + (SPEED_HI - SPEED_LO) * Math.pow(Math.max(0, Math.min(1, power)), CURVE);
export const powerOfSpeed = (speed: number) =>
  Math.pow(Math.max(0, Math.min(1, (speed - SPEED_LO) / (SPEED_HI - SPEED_LO))), 1 / CURVE);

/** はじめの強さ。ブレイクは強め */
export const DEFAULT_POWER = 0.42;
export const BREAK_POWER = 0.92;

/** 角度を -π〜π にそろえる */
export const wrapAngle = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
