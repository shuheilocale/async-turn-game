import { Curling } from "@atg/core";
import type { Shown } from "./playback.ts";

/**
 * WebGL が使えない端末で出す、シートを上から見た 2D の図（SVG）。ホッグラインからハウスの奥までを描く。
 * 投げる場所は図の下の外にあるので、ねらいの点線は図の下の端から描く。
 * 数値はメートル単位で、y を上向きにして（ハウスが上）描く
 */

const { STONE_R, SHEET_W, TEE_Y, HOG_Y, BACK_Y, RINGS } = Curling;

/** 見える範囲 */
const LEFT = -SHEET_W / 2 - 0.15;
const WIDTH = SHEET_W + 0.3;
export const VIEW_BOTTOM = HOG_Y - 0.5;
const VIEW_TOP = BACK_Y + 0.5;
export const VIEW_ASPECT = WIDTH / (VIEW_TOP - VIEW_BOTTOM);

export interface Aim2D {
  aim: number;
  power: number;
  spin: Curling.Spin;
  seat: 0 | 1;
}

export function Sheet2D({ stones, aim, label }: { stones: Shown[]; aim: Aim2D | null; label: string }) {
  // ねらいの点線：投げる場所（原点）からまっすぐ進んだ線が、図の下の端を通る所から
  const dots = aim
    ? Array.from({ length: Math.round(5 + aim.power * 9) }, (_, i) => {
        const d = VIEW_BOTTOM / Math.cos(aim.aim) + 0.15 + i * 0.32;
        return [Math.sin(aim.aim) * d, Math.cos(aim.aim) * d] as const;
      })
    : [];
  return (
    <svg
      className="curling-sheet2d"
      viewBox={`${LEFT} ${-VIEW_TOP} ${WIDTH} ${VIEW_TOP - VIEW_BOTTOM}`}
      role="img"
      aria-label={label}
    >
      <g transform="scale(1 -1)">
        <rect className="c2-ice" x={-SHEET_W / 2} y={VIEW_BOTTOM - 1} width={SHEET_W} height={VIEW_TOP - VIEW_BOTTOM + 2} />
        <circle className="c2-outer" cx={0} cy={TEE_Y} r={(RINGS[0] + RINGS[1]) / 2} strokeWidth={RINGS[0] - RINGS[1]} />
        <circle className="c2-inner" cx={0} cy={TEE_Y} r={(RINGS[2] + RINGS[3]) / 2} strokeWidth={RINGS[2] - RINGS[3]} />
        <line className="c2-hog" x1={-SHEET_W / 2} x2={SHEET_W / 2} y1={HOG_Y} y2={HOG_Y} />
        <line className="c2-line" x1={-SHEET_W / 2} x2={SHEET_W / 2} y1={TEE_Y} y2={TEE_Y} />
        <line className="c2-line" x1={-SHEET_W / 2} x2={SHEET_W / 2} y1={BACK_Y} y2={BACK_Y} />
        <line className="c2-line" x1={0} x2={0} y1={HOG_Y} y2={VIEW_TOP} />
        <rect className="c2-board" x={-SHEET_W / 2 - 0.08} y={VIEW_BOTTOM - 1} width={0.08} height={VIEW_TOP - VIEW_BOTTOM + 2} />
        <rect className="c2-board" x={SHEET_W / 2} y={VIEW_BOTTOM - 1} width={0.08} height={VIEW_TOP - VIEW_BOTTOM + 2} />

        {dots.map(([x, y], i) => (
          <circle key={i} className={`c2-dot seat${aim!.seat}`} cx={x} cy={y} r={0.045 * (1 - (0.4 * i) / dots.length)} />
        ))}

        {stones.map((s) => (
          <g
            key={s.id}
            className={`seat${s.seat}`}
            opacity={s.opacity}
            transform={`translate(${s.x} ${s.y}) rotate(${(s.angle * 180) / Math.PI})`}
          >
            {s.counts && <circle className="c2-count" r={STONE_R + 0.06} />}
            <circle className="c2-stone" r={STONE_R} />
            <circle className="c2-cap" r={0.075} />
            {/* 取っ手（3D と同じく、向きが 0 なら奥を向く。回っているのがわかるように） */}
            <line className="c2-handle" x1={0} y1={-0.035} x2={0} y2={0.11} />
          </g>
        ))}
      </g>
    </svg>
  );
}
