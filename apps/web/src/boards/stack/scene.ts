import { Stack } from "@atg/core";

/**
 * いしつみの場面（台・地面・見える範囲）の形。物理演算（physics.ts）と描画（StackBoard.tsx）で共通に使う。
 * planck を読み込まなくても描けるよう、ここには planck を使うものを置かない
 */

const { PLATFORM_W, ROCK_H } = Stack;

/** 物理演算の 1 コマの時間（秒）。再生するときもこの間隔で 1 コマずつ進める */
export const STEP = 1 / 60;

/** 見える範囲の幅。台がその 4 割くらい */
export const VIEW_W = PLATFORM_W / 0.4;
/** 見える範囲の高さ。盤は幅 5 : 高さ 7 の縦長 */
export const VIEW_H = (VIEW_W * 7) / 5;
/** 地面の高さ */
export const GROUND_Y = -ROCK_H;
/** 塔が低いうちに見える範囲の下端（地面が少し見える） */
export const VIEW_BOTTOM = GROUND_Y - 0.22;

const half = PLATFORM_W / 2;
/** 台の下の端が、上面からどれだけ外へ広がっているか */
const SPREAD = 0.16;

/** 台（岩）の形。上面は平らで、下へ行くほど少し広がる台形。物理演算はこの形で計算する */
export const ROCK: Stack.Point[] = [
  [-half - SPREAD, GROUND_Y],
  [half + SPREAD, GROUND_Y],
  [half, 0],
  [-half, 0],
];

/**
 * 描くときの台の輪郭。上面は ROCK と同じ平らな線で、横の面にだけ 1〜2 cm のでこぼこを付ける。
 * 右の面を上から順に並べ、左の面は少し違う形にする
 */
const side = (dir: 1 | -1, bumps: number[]): Stack.Point[] =>
  bumps.map((bump, i) => {
    const t = i / (bumps.length - 1);
    return [dir * (half + SPREAD * t + bump), GROUND_Y * t];
  });

export const ROCK_OUTLINE: Stack.Point[] = [
  ...side(1, [0, 0.012, 0.018, 0.004, 0.016, 0.006, 0.012, 0]),
  ...side(-1, [0, 0.008, 0.016, 0.01, 0.002, 0.014, 0.01, 0]).reverse(),
];

/** 岩の表面の筋（ひび）。見た目だけ */
export const ROCK_CRACKS: Stack.Point[][] = [
  [
    [-0.62, -0.16],
    [-0.36, -0.2],
    [-0.14, -0.17],
  ],
  [
    [0.12, -0.38],
    [0.38, -0.33],
    [0.66, -0.4],
  ],
  [
    [-0.78, -0.55],
    [-0.5, -0.6],
    [-0.3, -0.56],
  ],
  [
    [0.2, -0.68],
    [0.46, -0.64],
  ],
];
