import { Fragment } from "react";
import { Boxes, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./BoxesBoard.css";

/** 箱 1 個の大きさ（盤の幅に対する %）。点のまわりに半マスずつ余白を取るので、盤は SIZE + 1 マス分 */
const CELL = 100 / (Boxes.SIZE + 1);
const DOTS = Boxes.SIZE + 1;
/** 左上が (x, y) で 1 マス分の正方形 */
const at = (x: number, y: number) => ({ left: `${x}%`, top: `${y}%`, width: `${CELL}%`, height: `${CELL}%` });

/** 線をタップして選ぶ。引いた線は引いた人の色、取った箱は持ち主の色で薄く塗る */
export function BoxesBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Boxes.BoxesState;
  const sel = selected as Boxes.BoxesMove | null;
  // 選んだ線で閉じる箱は、決定する前に薄く見せておく
  const willClose = sel ? Boxes.boxesClosedBy(s.edges, sel.edge) : [];
  const preview = new Set(willClose);
  const recent = new Set(s.closed);
  const left = s.edges.filter((e) => e === null).length;
  const count = (seat: Seat) => s.boxes.filter((b) => b === seat).length;
  // 直前の手で箱を取った人が、続けてもう 1 本引く番
  const again = !s.finished && s.closed.length > 0;

  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp: Seat = me === 0 ? 1 : 0;
  const score = (seat: Seat) =>
    you === null
      ? t("game.boxes.player", { name: names[seat] || t(`game.boxes.seat${seat}`), n: count(seat) })
      : t(seat === you ? "game.boxes.you" : "game.boxes.them", { n: count(seat) });

  const note =
    willClose.length > 0
      ? t(`game.boxes.willTake${willClose.length}`)
      : again
        ? you === s.turn
          ? t("game.boxes.again")
          : t("game.boxes.againOther", { name: names[s.turn] })
        : interactive
          ? t("game.boxes.pick")
          : "";

  return (
    <div className="boxes stack-sm">
      <div className="boxes-score">
        {([me, opp] as Seat[]).map((seat) => (
          <span key={seat} className={`seat${seat}`}>
            {score(seat)}
          </span>
        ))}
      </div>

      <div className={["boxes-board", `seat${s.turn}`, interactive && "interactive"].filter(Boolean).join(" ")}>
        {s.boxes.map((owner, i) => {
          const shown = owner ?? (preview.has(i) ? s.turn : null);
          if (shown === null) return null;
          const row = Math.floor(i / Boxes.SIZE);
          const col = i % Boxes.SIZE;
          return (
            <span
              key={i}
              className={["boxes-cell", `seat${shown}`, owner === null && "preview", recent.has(i) && "recent"]
                .filter(Boolean)
                .join(" ")}
              style={at(CELL / 2 + col * CELL, CELL / 2 + row * CELL)}
              aria-hidden
            />
          );
        })}

        {s.edges.map((owner, e) => {
          const { dir, row, col } = Boxes.edgeAt(e);
          // 線の始点（左端か上端の点）
          const x = CELL / 2 + col * CELL;
          const y = CELL / 2 + row * CELL;
          const label = t(dir === "h" ? "game.boxes.hLine" : "game.boxes.vLine", { row: row + 1, col: col + 1 });
          return (
            <Fragment key={e}>
              {/* 当たり判定は、線を対角線とするひし形（ボタンはその外枠の正方形） */}
              <button
                type="button"
                className="boxes-edge"
                style={dir === "h" ? at(x, y - CELL / 2) : at(x - CELL / 2, y)}
                disabled={!interactive || owner !== null}
                onClick={() => onSelect({ edge: e })}
                aria-label={owner === null ? label : `${label} ${t(`game.boxes.seat${owner}`)}`}
              />
              {/* 見えている線。ひし形で切り抜かれないようボタンの外に置き、:hover は + で受け取る */}
              <span
                className={[
                  "boxes-line",
                  dir,
                  owner === null ? "open" : `seat${owner}`,
                  sel?.edge === e && "selected",
                  s.lastMove?.edge === e && "last",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: `${x}%`, top: `${y}%`, [dir === "h" ? "width" : "height"]: `${CELL}%` }}
                aria-hidden
              />
            </Fragment>
          );
        })}

        {Array.from({ length: DOTS * DOTS }, (_, i) => (
          <span
            key={i}
            className="boxes-dot"
            style={{ left: `${CELL / 2 + (i % DOTS) * CELL}%`, top: `${CELL / 2 + Math.floor(i / DOTS) * CELL}%` }}
            aria-hidden
          />
        ))}
      </div>

      <p className="board-note">
        <span>{note}</span>
        {!s.finished && <span className="muted">{t("game.boxes.left", { n: left })}</span>}
      </p>
    </div>
  );
}
