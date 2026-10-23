import type { KeyboardEvent } from "react";
import { Bridge } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./BridgeBoard.css";

/*
 * 盤の形（SVG の座標）。六角形はとがった方が上で、R は中心から頂点までの長さ。
 * 行が 1 つ下がるごとに半マス右へずらして、全体をひし形に並べる。
 */
const N = Bridge.SIZE;
const R = 20;
const W = Math.sqrt(3) * R;
/** 外側の色の縁取りが見える太さ */
const EDGE = 6;
const PAD = EDGE + 2;
const STONE_R = R * 0.6;
const VIEW_W = PAD * 2 + W * (N + (N - 1) / 2);
const VIEW_H = PAD * 2 + R * (2 + 1.5 * (N - 1));

type Point = { x: number; y: number };
const CENTERS: Point[] = Array.from({ length: N * N }, (_, i) => ({
  x: PAD + W / 2 + (Bridge.colOf(i) + Bridge.rowOf(i) / 2) * W,
  y: PAD + R + Bridge.rowOf(i) * 1.5 * R,
}));

/** 六角形の頂点。k = 0 が真上で、時計回りに 1 右上・2 右下・3 真下・4 左下・5 左上 */
const corner = (i: number, k: number): Point => {
  const { x, y } = CENTERS[i]!;
  const a = (Math.PI / 3) * k - Math.PI / 2;
  return { x: x + R * Math.cos(a), y: y + R * Math.sin(a) };
};
const toPoints = (ps: Point[]) => ps.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
const HEXES = CENTERS.map((_, i) => toPoints([0, 1, 2, 3, 4, 5].map((k) => corner(i, k))));

/** 外周を 4 つに分けた縁取り。上下は青（先手）、左右はオレンジ（後手）。角でちょうど出会う */
const range = Array.from({ length: N }, (_, n) => n);
const EDGES: { seat: 0 | 1; points: string }[] = [
  { seat: 0, points: toPoints(range.flatMap((c) => [5, 0, 1].map((k) => corner(Bridge.indexOf(0, c), k)))) },
  { seat: 0, points: toPoints(range.flatMap((c) => [4, 3, 2].map((k) => corner(Bridge.indexOf(N - 1, c), k)))) },
  { seat: 1, points: toPoints(range.flatMap((r) => [5, 4].map((k) => corner(Bridge.indexOf(r, 0), k)))) },
  { seat: 1, points: toPoints(range.flatMap((r) => [1, 2].map((k) => corner(Bridge.indexOf(r, N - 1), k)))) },
];

/** 入れ替えの折り返しの線（(0,0) から (N-1,N-1) へのななめ）。少しはみ出させる */
const FOLD = (() => {
  const a = CENTERS[0]!;
  const b = CENTERS[N * N - 1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = ((b.x - a.x) / len) * R;
  const dy = ((b.y - a.y) / len) * R;
  return { x1: a.x - dx, y1: a.y - dy, x2: b.x + dx, y2: b.y + dy };
})();

/** 勝った道を、両はしの辺まで伸ばした線にする */
function pathPoints(path: number[], seat: 0 | 1): string {
  const ps = path.map((i) => CENTERS[i]!);
  const first = ps[0]!;
  const last = ps[ps.length - 1]!;
  const ends =
    seat === 0
      ? [{ x: first.x, y: first.y - R }, { x: last.x, y: last.y + R }]
      : [{ x: first.x - W / 2, y: first.y }, { x: last.x + W / 2, y: last.y }];
  return toPoints([ends[0]!, ...ps, ends[1]!]);
}

/** マスをタップすると影の石が出る。後手の最初の手番だけ「入れ替える」も選べる */
export function BridgeBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Bridge.BridgeState;
  const sel = selected as Bridge.BridgeMove | null;
  const selCell = sel && "cell" in sel ? sel.cell : null;
  const swapOk = interactive && Bridge.canSwap(s);
  const swapping = swapOk && !!sel && "swap" in sel;
  const swapTo = swapping ? Bridge.mirror(s.lastMove!) : null;
  const onPath = new Set(s.winPath ?? []);
  const justSwapped = s.swapped && s.moveCount === 2;

  const keyPick = (e: KeyboardEvent, cell: number) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onSelect({ cell });
  };

  return (
    <div className={`bridge stack-sm ${s.finished ? "finished" : ""}`}>
      <svg
        className="bridge-board"
        viewBox={`0 0 ${VIEW_W.toFixed(2)} ${VIEW_H.toFixed(2)}`}
        role="group"
        aria-label={t("game.bridge.goals")}
      >
        {EDGES.map((e, n) => (
          <polyline key={n} points={e.points} className={`bridge-edge seat${e.seat}`} />
        ))}

        {s.board.map((cell, i) => {
          const can = interactive && cell === null;
          const label = t("game.bridge.cell", { row: Bridge.rowOf(i) + 1, col: Bridge.colOf(i) + 1 });
          return (
            <polygon
              key={i}
              points={HEXES[i]}
              className={[
                "bridge-hex",
                can && "can",
                selCell === i && `selected seat${s.turn}`,
                onPath.has(i) && `won seat${s.winner}`,
              ]
                .filter(Boolean)
                .join(" ")}
              role="button"
              tabIndex={can ? 0 : undefined}
              aria-disabled={!can}
              aria-label={cell === null ? label : `${label} ${t(`game.bridge.seat${cell}`)}`}
              onClick={can ? () => onSelect({ cell: i }) : undefined}
              onKeyDown={can ? (e) => keyPick(e, i) : undefined}
            />
          );
        })}

        {/* ここから下は飾り。タップはその下のマスに通す */}
        <g className="bridge-marks">
          {swapping && <line {...FOLD} className="bridge-fold" />}
          {s.winPath && s.winner !== null && (
            <polyline points={pathPoints(s.winPath, s.winner)} className={`bridge-path seat${s.winner}`} />
          )}
          {s.board.map((cell, i) => {
            const { x, y } = CENTERS[i]!;
            const leaving = swapping && i === s.lastMove;
            const ghost = selCell === i ? s.turn : swapTo === i ? 1 : null;
            return (
              <g key={i}>
                {cell !== null && (
                  <circle
                    cx={x}
                    cy={y}
                    r={STONE_R}
                    className={[
                      `bridge-stone seat${cell}`,
                      i === s.lastMove && "placed",
                      onPath.has(i) && "on-path",
                      leaving && "leaving",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                )}
                {ghost !== null && <circle cx={x} cy={y} r={STONE_R} className={`bridge-stone seat${ghost} ghost`} />}
                {cell !== null && i === s.lastMove && !leaving && <circle cx={x} cy={y} r={R * 0.17} className="bridge-last" />}
              </g>
            );
          })}
        </g>
      </svg>

      <p className="board-note">
        {justSwapped && <span>{t("game.bridge.swapped", { name: names[1] })}</span>}
        {interactive && <span>{t(swapOk ? "game.bridge.placeOrSwap" : "game.bridge.place")}</span>}
        {!s.finished && (
          <span className="muted">{you === null ? t("game.bridge.goals") : t(`game.bridge.goal${you}`)}</span>
        )}
      </p>

      {swapOk && (
        <div className="bridge-swap">
          <button
            type="button"
            className={`seat1 ${swapping ? "picked" : ""}`}
            aria-pressed={swapping}
            onClick={() => onSelect(swapping ? null : { swap: true })}
          >
            {t("game.bridge.swap")}
          </button>
          <p className="muted small">{t("game.bridge.swapHint")}</p>
        </div>
      )}
    </div>
  );
}
