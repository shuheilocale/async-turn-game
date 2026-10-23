import { Fading, type Seat } from "@atg/core";
import { OMark, XMark } from "../icons.tsx";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./FadingBoard.css";

const MARKS = ["○", "×"] as const;
const Mark = ({ seat, className = "" }: { seat: Seat; className?: string }) =>
  seat === 0 ? <OMark className={className} /> : <XMark className={className} />;

/**
 * 盤はマルバツと同じ。印が 3 つある人の一番古い印は薄い破線で描き、次に消えることを示す。
 * 直前に消えた印のマスには小さな点線の跡を残す（あとから開いても何が起きたか分かるように）
 */
export function FadingBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Fading.FadingState;
  const sel = selected as Fading.FadingMove | null;
  const board = Fading.boardOf(s.marks);
  const win = new Set(s.winLine ?? []);

  // 次に消える印の位置。終局後はもう消えないので薄くしない（勝ちの並びが薄く見えないように）
  const nextFade = ([0, 1] as Seat[]).map((seat) => (s.finished ? null : Fading.nextToFade(s.marks, seat)));
  const myFade = interactive ? nextFade[s.turn] : null;
  /** 直前に指した人。この手で消えた印はこの人のもの */
  const mover = s.lastMove === null ? null : board[s.lastMove]!;

  let note = "";
  if (interactive) note = t(myFade === null ? "game.fading.pick" : "game.fading.willFade");
  else if (s.removed !== null && mover !== null)
    note = mover === you ? t("game.fading.vanishedYou") : t("game.fading.vanished", { name: names[mover] });

  return (
    <div className="stack-sm">
      <div className="grid-board tictactoe fading-board" role="grid">
        {board.map((cell, i) => {
          const canPlace = interactive && cell === null;
          const isSelected = sel?.index === i;
          const fades = cell !== null && nextFade[cell] === i;
          // 置く場所を選んでいる間は、消える自分の印をさらに薄くして、置いたあとの盤を見せる
          const leaving = fades && sel !== null && i === myFade;
          const trace = cell === null && s.removed === i && mover !== null && !isSelected;
          const markClass = [fades && "fade-next", leaving && "fade-leaving"].filter(Boolean).join(" ");
          const label = [
            `${i + 1}`,
            cell !== null && MARKS[cell],
            fades && `(${t("game.fading.next")})`,
            trace && `(${t("game.fading.gone")})`,
          ];
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
              aria-label={label.filter(Boolean).join(" ")}
            >
              {cell !== null && <Mark seat={cell} className={markClass} />}
              {trace && <Mark seat={mover} className="fade-trace" />}
              {isSelected && <Mark seat={s.turn} className="ghost" />}
            </button>
          );
        })}
      </div>
      <p className="board-note">
        <span>{note}</span>
        {!s.finished && <span className="muted">{t("game.fading.left", { n: Fading.MAX_MOVES - s.moveCount })}</span>}
      </p>
    </div>
  );
}
