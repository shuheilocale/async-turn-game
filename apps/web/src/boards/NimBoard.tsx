import { Nim } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";

/** 棒をタップすると、その棒から右端までを取る手を選ぶ */
export function NimBoard({ state, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Nim.NimState;
  const sel = selected as Nim.NimMove | null;
  const total = s.rows.reduce((a, b) => a + b, 0);

  return (
    <div className="nim stack-sm">
      <div className="nim-rows">
        {Nim.ROWS.map((size, row) => {
          const left = s.rows[row]!;
          const justTaken = s.lastMove?.row === row ? s.lastMove.count : 0;
          return (
            <div key={row} className="nim-row">
              {Array.from({ length: size }, (_, i) => {
                const present = i < left;
                const taking = sel?.row === row && i >= left - sel.count && present;
                const recent = !present && i < left + justTaken;
                return (
                  <button
                    key={i}
                    type="button"
                    className={["stick", !present && "gone", recent && "recent", taking && `taking seat${s.turn}`]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={!interactive || !present}
                    onClick={() => onSelect({ row, count: left - i })}
                    aria-label={`${row + 1}-${i + 1}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="board-note">
        <span>
          {sel
            ? t("nim.taking", { n: sel.count })
            : interactive
              ? t("nim.pick")
              : s.lastMove
                ? t("nim.last", { name: names[s.lastMove.seat], n: s.lastMove.count })
                : ""}
        </span>
        {!s.finished && <span className="muted">{t("nim.left", { n: total })}</span>}
      </p>
    </div>
  );
}
