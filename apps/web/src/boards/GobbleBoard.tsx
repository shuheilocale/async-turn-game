import { useEffect, useRef, useState } from "react";
import { Gobble, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";

type Move = Gobble.GobbleMove;
type From = Move["from"];
const SIZES: Gobble.Size[] = [2, 1, 0];

function GobblePiece({ seat, size, ghost = false }: { seat: Seat; size: Gobble.Size; ghost?: boolean }) {
  return <span className={`gobble-piece seat${seat} size${size} ${ghost ? "ghost" : ""}`} aria-hidden />;
}

const sameFrom = (a: From | null, b: From) =>
  !!a &&
  a.kind === b.kind &&
  (a.kind === "hand" ? a.size === (b as typeof a).size : a.index === (b as typeof a).index);

/** 手持ちか盤上の自分のコマを選び、次に置く場所を選ぶ 2 段階 */
export function GobbleBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Gobble.GobbleState;
  const sel = selected as Move | null;
  const [from, setFrom] = useState<From | null>(null);
  /** 置き場所まで選んだあとに別のコマを選び直したときは、選択の取り消しで from を消さない */
  const repicking = useRef(false);
  const me: Seat = you ?? 0;
  const opp: Seat = me === 0 ? 1 : 0;

  // 「やめる」で選択が消えたり、盤面が進んだりしたら、選びかけのコマも戻す
  useEffect(() => {
    if (sel !== null) return;
    if (repicking.current) repicking.current = false;
    else setFrom(null);
  }, [sel]);
  useEffect(() => setFrom(null), [s.moveCount]);

  const fromSize: Gobble.Size | null =
    from === null ? null : from.kind === "hand" ? from.size : (Gobble.top(s.board[from.index]!)?.size ?? null);
  const canDrop = (i: number) =>
    interactive && fromSize !== null && !(from?.kind === "board" && from.index === i) && Gobble.canCover(s.board[i]!, fromSize);

  const pick = (f: From) => {
    if (sel !== null) {
      repicking.current = true;
      onSelect(null);
    }
    setFrom(sameFrom(from, f) ? null : f);
  };

  const win = new Set(s.winLine ?? []);
  const last = s.lastMove?.to;
  const left = Gobble.MAX_MOVES - s.moveCount;

  return (
    <div className="gobble stack-sm">
      <Hand seat={opp} label={t("gobble.hand", { name: names[opp] })} counts={s.hands[opp]} />

      <div className="grid-board gobble-grid" role="grid">
        {s.board.map((stack, i) => {
          const topPiece = Gobble.top(stack);
          const mine = interactive && topPiece?.seat === s.turn;
          const isFrom = from?.kind === "board" && from.index === i;
          const target = canDrop(i);
          const lifted = isFrom || (sel?.from.kind === "board" && sel.from.index === i);
          const shown = lifted ? stack[stack.length - 2] : topPiece;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={[
                "cell",
                target && "target",
                isFrom && "picked",
                sel?.to === i && "selected",
                last === i && "last",
                win.has(i) && `win win${s.winner}`,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!mine && !target}
              onClick={() => (target ? onSelect({ from: from!, to: i }) : pick({ kind: "board", index: i }))}
              aria-label={`${i + 1}${topPiece ? ` ${t(`gobble.size${topPiece.size}`)}` : ""}`}
            >
              {stack.length > 1 && <span className="under">+{stack.length - 1}</span>}
              {shown && <GobblePiece seat={shown.seat} size={shown.size} />}
              {lifted && topPiece && <GobblePiece seat={topPiece.seat} size={topPiece.size} ghost />}
              {sel?.to === i && fromSize !== null && <GobblePiece seat={s.turn} size={fromSize} ghost />}
            </button>
          );
        })}
      </div>

      <Hand
        seat={me}
        label={you === null ? t("gobble.hand", { name: names[me] }) : t("gobble.yourHand")}
        counts={s.hands[me]}
        interactive={interactive}
        picked={from?.kind === "hand" ? from.size : null}
        onPick={(size) => pick({ kind: "hand", size })}
      />

      <p className="board-note">
        {interactive && <span>{t(from === null ? "gobble.pick" : "gobble.place")}</span>}
        {!s.finished && <span className="muted">{t("gobble.left", { n: left })}</span>}
      </p>
    </div>
  );
}

function Hand({
  seat,
  label,
  counts,
  interactive = false,
  picked = null,
  onPick,
}: {
  seat: Seat;
  label: string;
  counts: number[];
  interactive?: boolean;
  picked?: Gobble.Size | null;
  onPick?(size: Gobble.Size): void;
}) {
  const { t } = useI18n();
  return (
    <div className="gobble-hand">
      <span className="hand-label">{label}</span>
      <div className="hand-pieces">
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={`hand-slot ${picked === size ? "picked" : ""}`}
            disabled={!interactive || counts[size] === 0}
            onClick={() => onPick?.(size)}
            aria-label={`${t(`gobble.size${size}`)} ×${counts[size]}`}
          >
            {counts[size]! > 0 ? <GobblePiece seat={seat} size={size} /> : <span className={`gobble-piece empty size${size}`} />}
            <span className="count num">{counts[size]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
