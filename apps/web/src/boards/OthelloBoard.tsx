import { Othello } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";

type State = Othello.OthelloState;
type Move = Othello.OthelloMove;

export function OthelloBoard({ state, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as State;
  const sel = selected as Move | null;
  const legal = interactive ? Othello.othello.legalMoves(s) : [];
  const isLegal = (row: number, col: number) => legal.some((m) => m.row === row && m.col === col);
  const preview = sel ? new Set(Othello.flipsFor(s.board, sel.row, sel.col, s.turn)) : new Set<number>();
  const [black, white] = Othello.countStones(s.board);

  return (
    <>
      <div className="summary">
        <span className="count"><span className="stone black mini" /> {black}</span>
        <span className="count"><span className="stone white mini" /> {white}</span>
        {s.passedSeat !== null && <span className="notice">{t("othello.pass", { name: names[s.passedSeat] })}</span>}
      </div>
      <div className="grid-board othello" role="grid">
        {s.board.map((cell, i) => {
          const row = Math.floor(i / Othello.SIZE);
          const col = i % Othello.SIZE;
          const canPlace = isLegal(row, col);
          const isSelected = sel?.row === row && sel?.col === col;
          const isLast = s.lastMove?.row === row && s.lastMove?.col === col;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={[
                "cell",
                canPlace && "can-place",
                isSelected && "selected",
                isLast && "last",
                preview.has(i) && "will-flip",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!canPlace}
              onClick={() => onSelect({ row, col })}
              aria-label={`${row + 1}-${col + 1}${cell === null ? "" : ` ${t(`game.othello.seat${cell}`)}`}`}
            >
              {cell !== null && <span className={`stone ${cell === 0 ? "black" : "white"}`} />}
              {isSelected && <span className={`stone ghost ${s.turn === 0 ? "black" : "white"}`} />}
            </button>
          );
        })}
      </div>
    </>
  );
}
