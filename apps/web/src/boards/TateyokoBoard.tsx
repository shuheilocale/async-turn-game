import { other, Tateyoko, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./TateyokoBoard.css";

const { SIZE } = Tateyoko;

/** 棒を置く位置（CSS grid の行・列）。先手は縦に、後手は横に 2 マスへまたがせる */
function barArea(seat: Seat, cell: number) {
  const row = Math.floor(cell / SIZE) + 1;
  const col = (cell % SIZE) + 1;
  return seat === 0 ? { gridRow: `${row} / span 2`, gridColumn: col } : { gridRow: row, gridColumn: `${col} / span 2` };
}

function Bar({ seat, cell, className = "" }: { seat: Seat; cell: number; className?: string }) {
  return <span className={`tateyoko-bar seat${seat} ${className}`} style={barArea(seat, cell)} aria-hidden />;
}

/** マスをタップすると、そこを上端（後手は左端）にした棒の影が出る。置けなければ上（左）のマスを起点にする */
export function TateyokoBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Tateyoko.TateyokoState;
  const sel = selected as Tateyoko.TateyokoMove | null;
  const step = s.turn === 0 ? SIZE : 1;

  /** タップしたマスから棒の起点を決める。どちらも置けなければ null */
  const originFor = (i: number): number | null => {
    if (Tateyoko.canPlace(s.board, s.turn, i)) return i;
    // 一番上の段の上や、左端の列の左（前の段の右端）は canPlace が false を返す
    return Tateyoko.canPlace(s.board, s.turn, i - step) ? i - step : null;
  };

  const counts = [Tateyoko.placeable(s.board, 0).length, Tateyoko.placeable(s.board, 1).length] as const;
  const room =
    you === null
      ? t("game.tateyoko.roomOf", { name0: names[0], n0: counts[0], name1: names[1], n1: counts[1] })
      : t("game.tateyoko.room", { me: counts[you], opp: counts[other(you)] });
  // 終局したのは、最後に指した人の相手が置けなくなったから
  const loser = s.finished && s.lastMove ? other(s.lastMove.seat) : null;
  const isLast = (bar: Tateyoko.Bar) => s.lastMove?.seat === bar.seat && s.lastMove.cell === bar.cell;

  return (
    <div className="tateyoko stack-sm">
      <div className={`grid-board tateyoko-grid seat${s.turn}`} role="grid">
        {s.board.map((cell, i) => {
          const row = Math.floor(i / SIZE);
          const col = i % SIZE;
          const origin = interactive && cell === null ? originFor(i) : null;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={["cell", interactive && cell === null && origin === null && "dead"].filter(Boolean).join(" ")}
              // 棒も同じ grid に置くので、マスの位置は明示する（自動配置だと棒をよけて並んでしまう）
              style={{ gridRow: row + 1, gridColumn: col + 1 }}
              disabled={origin === null}
              onClick={() => origin !== null && onSelect({ cell: origin })}
              aria-label={`${row + 1}-${col + 1}${cell === null ? "" : ` ${t(`game.tateyoko.seat${cell}`)}`}`}
            />
          );
        })}
        {s.bars.map((bar) => (
          <Bar key={`${bar.seat}-${bar.cell}`} seat={bar.seat} cell={bar.cell} className={isLast(bar) ? "last" : ""} />
        ))}
        {sel && <Bar seat={s.turn} cell={sel.cell} className="ghost" />}
      </div>

      <p className="board-note">
        {interactive && <span>{t(`game.tateyoko.pick${s.turn}`)}</span>}
        {loser !== null && (
          <span>{loser === you ? t("game.tateyoko.noRoomYou") : t("game.tateyoko.noRoom", { name: names[loser] })}</span>
        )}
        <span className="muted">{room}</span>
      </p>
    </div>
  );
}
