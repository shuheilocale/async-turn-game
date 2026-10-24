import { Mochi } from "@atg/core";
import type { SnapCell, Snapshot } from "../snapshot.ts";

/**
 * LINE のカードに、今のもちを小さなドット絵で描く（14 × 10 マス。1 マス 8px で、カードでは 112px になる）。
 * 段階ごとの形に、おとなは姿のしるし（芽・花かざり・三日月・耳）を重ねる。体の色は 2 人のお世話の回数で混ぜた色。
 * 同じ色が横に続くところは 1 つの箱にまとめて、カードの大きさを小さくする
 */

const CELL = 8;

/** マスの記号：. 壁 _ 床 O 体のふち B 体 H つや E 目 C ほお M 口 G 卵 a b 卵の模様 L 葉 P Q 花 Y 月 */
const SHAPES: Record<Mochi.Stage, string[]> = {
  egg: [
    "..............",
    "......OO......",
    ".....OGGO.....",
    "....OGHGaO....",
    "....OGGGGO....",
    "...OGbGGGGO...",
    "...OGGGGaGO...",
    "....OGGGGO....",
    "_____OOOO_____",
    "______________",
  ],
  baby: [
    "..............",
    "..............",
    "..............",
    ".....OOOO.....",
    "....OHBBBO....",
    "...OBEBBEBO...",
    "...OCBMMBCO...",
    "...OBBBBBBO...",
    "____OOOOOO____",
    "______________",
  ],
  child: [
    "..............",
    "..............",
    ".....OOOO.....",
    "....OHBBBO....",
    "...OBHBBBBO...",
    "...OBEBBEBO...",
    "..OBCBMMBCBO..",
    "..OBBBBBBBBO..",
    "___OOOOOOOO___",
    "______________",
  ],
  adult: [
    "..............",
    ".....OOOO.....",
    "...OOHBBBOO...",
    "..OBHBBBBBBO..",
    "..OBBEBBEBBO..",
    ".OBBCBBBBCBBO.",
    ".OBBBBMMBBBBO.",
    ".OBBBBBBBBBBO.",
    "__OOOOOOOOOO__",
    "______________",
  ],
};

/** おとなの姿のしるし（[行, 列, 記号] を上から重ねる） */
const MARKS: Partial<Record<Mochi.Form, [number, number, string][]>> = {
  explorer: [
    [0, 6, "L"],
    [0, 7, "L"],
  ],
  harmony: [
    [1, 5, "P"],
    [1, 6, "Q"],
    [1, 7, "P"],
    [1, 8, "Q"],
  ],
  dreamy: [[3, 7, "Y"]],
  ears: [
    [3, 1, "O"],
    [4, 1, "B"],
    [5, 0, "O"],
    [3, 12, "O"],
    [4, 12, "B"],
    [5, 13, "O"],
  ],
  hop: [[0, 7, "O"]],
  // まんまるは、ふくらんだおなかのつや
  round: [
    [6, 5, "H"],
    [7, 6, "H"],
  ],
  fluffy: [
    [1, 4, "O"],
    [1, 9, "O"],
  ],
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

export default (s: Mochi.MochiState): Snapshot => {
  const stage = s.form !== null ? "adult" : Mochi.stageOf(Math.min(s.growth, Mochi.ADULT - 1e-6));
  const body = Mochi.bodyColor(s.bySeat);
  const colors: Record<string, string> = {
    ".": "#f6efe6",
    _: "#e8d6c1",
    O: mix(body, "#4a3c58", 0.5),
    B: body,
    H: mix(body, "#ffffff", 0.6),
    E: "#3b3142",
    C: "#f3a0ae",
    M: "#c95a68",
    G: "#fbf3e8",
    a: Mochi.SOFT[0],
    b: Mochi.SOFT[1],
    L: "#7fbf7e",
    P: "#86a3f3",
    Q: "#f6a868",
    Y: "#f3c86a",
  };
  const grid = SHAPES[stage].map((row) => row.split(""));
  if (stage === "adult" && s.form) for (const [r, c, ch] of MARKS[s.form] ?? []) grid[r]![c] = ch;
  // 卵のふちは体の色ではなく、卵の殻の色
  if (stage === "egg") colors.O = "#d6c4ae";

  const rows = grid.map((row) => {
    const cells: SnapCell[] = [];
    for (let i = 0; i < row.length; ) {
      let j = i + 1;
      while (j < row.length && row[j] === row[i]) j++;
      cells.push({ w: (j - i) * CELL, h: CELL, fill: colors[row[i]!] });
      i = j;
    }
    return { cells };
  });
  return { gap: 0, radius: 12, background: colors["."], rows };
};
