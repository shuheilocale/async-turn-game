import { Billiards } from "@atg/core";

/** 球の色。台の絵（render.ts）・小さな球（盤）・LINE のカード（snapshots/billiards.ts）で共通 */

/** 1〜8 の色（9〜15 は 1〜7 と同じ色の帯） */
const COLORS: Record<number, [number, number, number]> = {
  1: [242, 190, 26],
  2: [32, 78, 190],
  3: [214, 50, 42],
  4: [92, 46, 142],
  5: [238, 116, 30],
  6: [22, 128, 74],
  7: [124, 32, 36],
  8: [22, 23, 27],
};
export const BALL_WHITE: [number, number, number] = [246, 243, 234];

export const ballColor = (id: number): [number, number, number] =>
  id === Billiards.CUE ? BALL_WHITE : (COLORS[id > 8 ? id - 8 : id] ?? BALL_WHITE);

/** #rrggbb（LINE のカードは CSS の rgb() を読めないので 16 進で） */
export const ballHex = (id: number) => `#${ballColor(id).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
