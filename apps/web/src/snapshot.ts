import { getGame } from "@atg/core";

/**
 * LINE のカードに載せる「今の局面」。画像は使わず、Flex Message の箱（色付きの四角・丸）を並べて描く。
 * ゲームごとに snapshots/<ゲームID>.ts の default export で、state から Snapshot を作る関数を置く（置くだけで読み込まれる）。
 * 相手に隠す情報があるゲーム（viewState を持つゲーム）では、送る人の秘密が描かれないよう使わない
 */

/** 1 マス。大きさは px（カードの幅は 250px ほど） */
export interface SnapCell {
  w: number;
  h: number;
  fill?: string;
  radius?: number;
  /** 枠の色（最後に指した場所など） */
  border?: string;
  /** 中に置く丸（石・コマ）。size は直径 */
  dot?: { size: number; fill: string; border?: string };
  /** 中に書く印（○ や ×） */
  mark?: { text: string; color: string; size: number };
}

export interface SnapRow {
  cells: SnapCell[];
  /** 左の余白（六角の盤で行をずらすときなど） */
  offset?: number;
}

export interface Snapshot {
  rows: SnapRow[];
  /** マスの間 */
  gap: number;
  /** 盤の地の色 */
  background?: string;
  padding?: number;
  radius?: number;
}

/** 画面の明るい配色と同じ色（LINE のカードは画面の CSS 変数を使えないので値で持つ） */
export const C = {
  p0: "#2b59f0",
  p1: "#f27a12",
  p0Soft: "#dfe6fd",
  p1Soft: "#fde7d3",
  ink: "#171c28",
  muted: "#8891a3",
  line: "#d3d8e2",
  surface: "#ffffff",
  surface2: "#f2f4f8",
  felt: "#2f7a5c",
  feltLine: "#225a44",
  rack: "#263047",
  white: "#ffffff",
} as const;

export const seatColor = (seat: 0 | 1) => (seat === 0 ? C.p0 : C.p1);

type SnapshotFn = (state: any) => Snapshot | null;
const files = import.meta.glob<{ default: SnapshotFn }>("./snapshots/*.ts", { eager: true });

/** 今の局面。描き方がないゲームや、隠す情報があるゲームなら null */
export function snapshotOf(gameType: string, state: unknown): Snapshot | null {
  if (getGame(gameType)?.viewState) return null;
  return files[`./snapshots/${gameType}.ts`]?.default(state) ?? null;
}

/** 0 は 0 のまま、それ以外は 1px 以上に丸める */
const round = (n: number) => (n <= 0 ? 0 : Math.max(1, Math.round(n)));
const px = (n: number) => `${round(n)}px`;

/** 盤の縦横の大きさ（縮める前） */
function sizeOf(s: Snapshot) {
  const pad = (s.padding ?? 0) * 2;
  const rowWidth = (r: SnapRow) => (r.offset ?? 0) + r.cells.reduce((sum, c) => sum + c.w, 0) + s.gap * (r.cells.length - 1);
  const rowHeight = (r: SnapRow) => Math.max(...r.cells.map((c) => c.h));
  return {
    width: Math.max(...s.rows.map(rowWidth)) + pad,
    height: s.rows.reduce((sum, r) => sum + rowHeight(r), 0) + s.gap * (s.rows.length - 1) + pad,
  };
}

function cellBox(c: SnapCell, k: number): object {
  const contents: object[] = [];
  const line = k < 0.7 ? "1px" : "2px";
  if (c.dot) {
    contents.push({
      type: "box",
      layout: "vertical",
      width: px(c.dot.size * k),
      height: px(c.dot.size * k),
      cornerRadius: px((c.dot.size * k) / 2),
      backgroundColor: c.dot.fill,
      ...(c.dot.border ? { borderWidth: line, borderColor: c.dot.border } : {}),
      contents: [{ type: "filler" }],
    });
  }
  if (c.mark) {
    contents.push({
      type: "text",
      text: c.mark.text,
      size: px(Math.max(9, c.mark.size * k)),
      weight: "bold",
      color: c.mark.color,
      align: "center",
    });
  }
  if (contents.length === 0) contents.push({ type: "filler" });
  return {
    type: "box",
    layout: "vertical",
    width: px(c.w * k),
    height: px(c.h * k),
    flex: 0,
    justifyContent: "center",
    alignItems: "center",
    ...(c.fill ? { backgroundColor: c.fill } : {}),
    ...(c.radius ? { cornerRadius: px(c.radius * k) } : {}),
    ...(c.border ? { borderWidth: line, borderColor: c.border } : {}),
    contents,
  };
}

/**
 * Snapshot を Flex Message の箱にする。縦横の長い方が maxSize（px）に収まるよう全体を縮める。
 * カードの左に小さく置く想定（文字は右に並べる）
 */
export function snapshotToFlex(s: Snapshot, maxSize = 112): object {
  const { width, height } = sizeOf(s);
  const k = Math.min(1, maxSize / Math.max(width, height));
  // マスごとに丸めた大きさを足し合わせて盤の幅にする（丸める前の幅だと端の列がはみ出す）
  const r = (n: number) => round(n * k);
  const boardWidth =
    Math.max(
      ...s.rows.map((row) => (row.offset ? r(row.offset) : 0) + row.cells.reduce((sum, c) => sum + r(c.w), 0) + r(s.gap) * (row.cells.length - 1)),
    ) + (s.padding ? r(s.padding) * 2 : 0);
  return {
    type: "box",
    layout: "vertical",
    width: `${boardWidth}px`,
    flex: 0,
    spacing: px(s.gap * k),
    paddingAll: px((s.padding ?? 0) * k),
    ...(s.background ? { backgroundColor: s.background } : {}),
    ...(s.radius ? { cornerRadius: px(s.radius * k) } : {}),
    contents: s.rows.map((r) => ({
      type: "box",
      layout: "horizontal",
      spacing: px(s.gap * k),
      ...(r.offset ? { paddingStart: px(r.offset * k) } : {}),
      contents: r.cells.map((c) => cellBox(c, k)),
    })),
  };
}
