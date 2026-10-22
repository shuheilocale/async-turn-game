import { Connect4 } from "@atg/core";
import type { BoardProps } from "./index.ts";

export function Connect4Board({ state, interactive, selected, onSelect }: BoardProps) {
  const s = state as Connect4.Connect4State;
  const sel = selected as Connect4.Connect4Move | null;
  const ghost = sel ? Connect4.landingIndex(s.board, sel.col) : null;
  const win = new Set(s.winLine ?? []);

  // マスではなく「列」を選ぶゲームなので、どのマスを押してもその列を選んだことにする
  return (
    <div className="grid-board connect4" role="grid">
      {s.board.map((cell, i) => {
        const col = i % Connect4.COLS;
        const canDrop = interactive && Connect4.landingIndex(s.board, col) !== null;
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={["cell", sel?.col === col && "selected-col", s.lastMove === i && "last", win.has(i) && `win win${cell}`]
              .filter(Boolean)
              .join(" ")}
            disabled={!canDrop}
            onClick={() => onSelect({ col })}
            aria-label={`${col + 1}`}
          >
            {cell !== null && <span className={`disc seat${cell}`} />}
            {ghost === i && <span className={`disc ghost seat${s.turn}`} />}
          </button>
        );
      })}
    </div>
  );
}
