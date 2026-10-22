import type { TicTacToe } from "@atg/core";
import type { Seat } from "@atg/core";
import { OMark, XMark } from "../icons.tsx";
import type { BoardProps } from "./index.ts";

const MARKS = ["○", "×"] as const;
const Mark = ({ seat, ghost = false }: { seat: Seat; ghost?: boolean }) =>
  seat === 0 ? <OMark className={ghost ? "ghost" : ""} /> : <XMark className={ghost ? "ghost" : ""} />;

export function TicTacToeBoard({ state, interactive, selected, onSelect }: BoardProps) {
  const s = state as TicTacToe.TicTacToeState;
  const sel = selected as TicTacToe.TicTacToeMove | null;
  const win = new Set(s.winLine ?? []);

  return (
    <div className="grid-board tictactoe" role="grid">
      {s.board.map((cell, i) => {
        const canPlace = interactive && cell === null;
        const isSelected = sel?.index === i;
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={["cell", isSelected && "selected", s.lastMove === i && "last", win.has(i) && `win win${cell}`]
              .filter(Boolean)
              .join(" ")}
            disabled={!canPlace}
            onClick={() => onSelect({ index: i })}
            aria-label={`${i + 1}${cell === null ? "" : ` ${MARKS[cell]}`}`}
          >
            {cell !== null && <Mark seat={cell} />}
            {isSelected && <Mark seat={s.turn} ghost />}
          </button>
        );
      })}
    </div>
  );
}
