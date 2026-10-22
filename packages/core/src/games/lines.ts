import type { Seat } from "../types.ts";

/**
 * 盤（横 cols マス、行優先の 1 次元配列）の index に置かれた石を通る、
 * 同じ色が length 個以上並んだ列を探す。見つかればその位置の一覧、なければ null。
 */
export function findLine(board: (Seat | null)[], cols: number, index: number, length: number): number[] | null {
  const seat = board[index];
  if (seat === null || seat === undefined) return null;
  const rows = board.length / cols;
  const row0 = Math.floor(index / cols);
  const col0 = index % cols;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    const line = [index];
    for (const sign of [1, -1]) {
      let r = row0 + dr * sign;
      let c = col0 + dc * sign;
      while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === seat) {
        line.push(r * cols + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= length) return line.sort((a, b) => a - b);
  }
  return null;
}
