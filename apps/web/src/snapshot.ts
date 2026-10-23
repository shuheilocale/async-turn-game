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

const px = (n: number) => `${Math.round(n)}px`;

function cellBox(c: SnapCell): object {
  const contents: object[] = [];
  if (c.dot) {
    contents.push({
      type: "box",
      layout: "vertical",
      width: px(c.dot.size),
      height: px(c.dot.size),
      cornerRadius: px(c.dot.size / 2),
      backgroundColor: c.dot.fill,
      ...(c.dot.border ? { borderWidth: "2px", borderColor: c.dot.border } : {}),
      contents: [{ type: "filler" }],
    });
  }
  if (c.mark) {
    contents.push({ type: "text", text: c.mark.text, size: px(c.mark.size), weight: "bold", color: c.mark.color, align: "center" });
  }
  if (contents.length === 0) contents.push({ type: "filler" });
  return {
    type: "box",
    layout: "vertical",
    width: px(c.w),
    height: px(c.h),
    flex: 0,
    justifyContent: "center",
    alignItems: "center",
    ...(c.fill ? { backgroundColor: c.fill } : {}),
    ...(c.radius ? { cornerRadius: px(c.radius) } : {}),
    ...(c.border ? { borderWidth: "2px", borderColor: c.border } : {}),
    contents,
  };
}

/** Snapshot を Flex Message の箱にする。盤はカードの中央に置く */
export function snapshotToFlex(s: Snapshot): object {
  const pad = s.padding ?? 0;
  const rowWidth = (r: SnapRow) => (r.offset ?? 0) + r.cells.reduce((sum, c) => sum + c.w, 0) + s.gap * (r.cells.length - 1);
  const width = Math.max(...s.rows.map(rowWidth)) + pad * 2;
  const board = {
    type: "box",
    layout: "vertical",
    width: px(width),
    spacing: px(s.gap),
    paddingAll: px(pad),
    ...(s.background ? { backgroundColor: s.background } : {}),
    ...(s.radius ? { cornerRadius: px(s.radius) } : {}),
    contents: s.rows.map((r) => ({
      type: "box",
      layout: "horizontal",
      spacing: px(s.gap),
      ...(r.offset ? { paddingStart: px(r.offset) } : {}),
      contents: r.cells.map(cellBox),
    })),
  };
  return { type: "box", layout: "vertical", alignItems: "center", margin: "md", contents: [board] };
}
