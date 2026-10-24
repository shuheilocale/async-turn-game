import { Artillery } from "@atg/core";
import { C, seatColor, type SnapCell, type SnapRow, type Snapshot } from "../snapshot.ts";

/** 柱 5 本を 1 マスにまとめる（横 32 マス） */
const PER = 5;
const COLS = Artillery.COLS / PER;
/** 1 行の高さ（単位） */
const BAND = 8;
const CW = 7;
const CH = 6;
/** 体力のバー 1 本の長さ（px）。2 本と間で、地形の幅（32 × 7 = 224px）にそろえる */
const BAR = 96;

const SKY = "#d4e8fa";
const SOIL = "#a8754a";
const GRASS = "#56a845";
const SCAR = "#d3a571";

/** 同じ色が続くマスを 1 つにまとめた行（カードの大きさの上限に収めるため） */
function runs(fills: string[]): SnapRow {
  const cells: SnapCell[] = [];
  for (const fill of fills) {
    const last = cells[cells.length - 1];
    if (last && last.fill === fill) last.w += CW;
    else cells.push({ w: CW, h: CH, fill });
  }
  return { cells };
}

/** 体力のバー（青は左から、オレンジは右から減る） */
function hpRow(hp: [number, number]): SnapRow {
  const len = (v: number) => Math.round((BAR * Math.max(0, Math.min(100, v))) / 100);
  const bar = (seat: 0 | 1): SnapCell[] => {
    const full = len(hp[seat]);
    const fill = { w: full, h: 8, fill: seatColor(seat) };
    const rest = { w: BAR - full, h: 8, fill: C.line };
    const parts = seat === 0 ? [fill, rest] : [rest, fill];
    return parts.filter((c) => c.w > 0);
  };
  return { cells: [...bar(0), { w: COLS * CW - BAR * 2, h: 8 }, ...bar(1)] };
}

/**
 * 地形の輪郭を、行ごとのマス目で荒く描く（いちばん上のマスは草、けずれた所は明るい土）。
 * 2 台の大砲は席の色（体力 0 なら灰色）、いちばん上に 2 人の体力のバー
 */
export default (s: Artillery.ArtilleryState): Snapshot => {
  const heights = Array.from({ length: COLS }, (_, c) => {
    const cols = s.terrain.slice(c * PER, (c + 1) * PER);
    return cols.reduce((a, b) => a + b, 0) / cols.length;
  });
  const grassy = Array.from({ length: COLS }, (_, c) => {
    let n = 0;
    for (let k = c * PER; k < (c + 1) * PER; k++) if (s.terrain[k]! >= s.ground[k]! - 0.05) n++;
    return n * 2 > PER;
  });
  const highest = Math.max(...heights, ...s.cannons.map((c) => c.y + 6));
  const top = Math.min(Math.ceil(Artillery.VIEW_H / BAND), Math.ceil(highest / BAND) + 1);
  const grid: string[][] = [];
  for (let r = top - 1; r >= 0; r--) {
    const mid = (r + 0.5) * BAND;
    grid.push(
      heights.map((h, c) => {
        if (h < mid) return SKY;
        // その上のマスが空なら表面
        return h < mid + BAND ? (grassy[c] ? GRASS : SCAR) : SOIL;
      }),
    );
  }
  s.cannons.forEach((cannon, seat) => {
    const row = top - 1 - Math.floor((cannon.y + 2) / BAND);
    const col = Math.floor(cannon.x / PER);
    const color = s.hp[seat]! <= 0 ? C.muted : seatColor(seat as 0 | 1);
    for (const c of [col - 1, col, col + 1]) if (c >= 0 && c < COLS && grid[row]) grid[row]![c] = color;
  });

  return {
    gap: 0,
    background: SKY,
    padding: 6,
    radius: 10,
    rows: [hpRow(s.hp), { cells: [{ w: COLS * CW, h: 5 }] }, ...grid.map(runs)],
  };
};
