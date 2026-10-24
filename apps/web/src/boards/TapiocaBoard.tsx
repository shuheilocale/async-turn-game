import { useEffect, useId, useState, type CSSProperties } from "react";
import { Tapioca, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./TapiocaBoard.css";

type State = Tapioca.TapiocaState;
type Move = Tapioca.TapiocaMove;
type Piece = Tapioca.Piece;

const { COLS, ROWS } = Tapioca;

/*
 * グラスの絵の寸法。1 マスを 100 とした座標で、SVG の viewBox と、その上に重ねるマス目の位置の両方に使う。
 * 上から順に、ストローの先 → ふち → 空いているグラス → お茶の表面 → マス目 → 底
 */
const CELL = 100;
const GRID_W = COLS * CELL;
const GRID_H = ROWS * CELL;
/** 底での、マス目とグラスの内側のすき間（片側） */
const SIDE = 16;
/** ふちでは底よりこれだけ内側が広い（片側）。下が少しすぼまって見える */
const TAPER = 30;
/** グラスの厚み */
const WALL = 9;
/** ストローがふちから出ている高さ */
const STRAW_UP = 96;
const RIM_Y = STRAW_UP;
/** お茶の表面（ふちから少し下） */
const TEA_Y = RIM_Y + 52;
const GRID_Y = TEA_Y + 14;
const BOTTOM_Y = GRID_Y + GRID_H + 22;
const VW = GRID_W + 2 * (SIDE + TAPER + WALL + 8);
const VH = BOTTOM_Y + WALL + 14;
const GRID_X = (VW - GRID_W) / 2;
const CX = VW / 2;

/** 高さ y での、グラスの内側の幅の半分 */
const innerHalf = (y: number) => GRID_W / 2 + SIDE + (TAPER * (BOTTOM_Y - y)) / (BOTTOM_Y - RIM_Y);

/** グラスの形（ふちから底まで、底の角は丸い）。grow だけ外にふくらませる（外側の線に使う） */
function cupPath(top: number, grow: number): string {
  const r = 34 + grow;
  const bottom = BOTTOM_Y + grow;
  const lt = CX - innerHalf(top) - grow;
  const rt = CX + innerHalf(top) + grow;
  const lb = CX - innerHalf(BOTTOM_Y) - grow;
  const rb = CX + innerHalf(BOTTOM_Y) + grow;
  // 底の角は、壁の傾きに沿って丸める（傾きは小さいので、真下に向かうとみなしてよい）
  return [
    `M${lt} ${top}`,
    `L${lb} ${bottom - r}`,
    `Q${lb} ${bottom} ${lb + r} ${bottom}`,
    `L${rb - r} ${bottom}`,
    `Q${rb} ${bottom} ${rb} ${bottom - r}`,
    `L${rt} ${top}Z`,
  ].join(" ");
}

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
/** マス目の位置（グラス全体に対する割合） */
const GRID_BOX: CSSProperties = {
  left: pct(GRID_X / VW),
  top: pct(GRID_Y / VH),
  width: pct(GRID_W / VW),
  height: pct(GRID_H / VH),
};
const centerOf = (i: number): [number, number] => [
  GRID_X + (Tapioca.colOf(i) + 0.5) * CELL,
  GRID_Y + (Tapioca.rowOf(i) + 0.5) * CELL,
];
/** 氷は少しずつ傾けて置く（マスごとに決まった角度。手が進んでも同じ） */
const tiltOf = (i: number) => `${((i * 37) % 11) - 5}deg`;

/** 入れたものが動いて止まるまでの秒数。動いたマスの数に応じて長くする（氷はゆっくり浮かぶ） */
const moveSeconds = (piece: Piece, travel: number) => (piece === "pearl" ? 0.32 + travel * 0.11 : 0.4 + travel * 0.13);

/** その列の空きの数 */
const roomOf = (board: State["board"], col: number) =>
  Array.from({ length: ROWS }, (_, r) => board[r * COLS + col]).filter((c) => c === null).length;

/**
 * しずむタピオカ・うかぶ氷の盤。ミルクティーの入ったグラス（SVG）に、マス目（列ごとのボタン）を重ねる。
 * 自分の番は、列をタップ → 下の「タピオカ」「氷」で入れるものを選ぶ → 止まる位置に影が出る →
 * 画面下の「これで決定」。選んでいない方が止まる位置も、うすい枠で出す。
 * 最後に入れたものは、タピオカなら上から沈み、氷なら下から浮かんで止まる（reduce-motion では動かさない）
 */
export function TapiocaBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  // グラデーションなどの id。useId の ":" は url(#…) で読めないブラウザがあるので除く
  const id = `tapioca${useId().replace(/:/g, "")}`;
  const s = state as State;
  const sel = selected as Move | null;
  const mover: Seat = you ?? s.turn;
  const iceLeft = s.ice[s.turn];

  // 列を選ぶ前に入れるものを選んでおけるよう、選んだものは盤でも覚えておく
  const [pending, setPending] = useState<Piece>("pearl");
  const filled = s.board.filter((c) => c !== null).length;
  // 手が進んだら、次はタピオカから（氷は数が限られているので、うっかり使わないように）
  useEffect(() => setPending("pearl"), [filled]);
  const piece: Piece = sel?.piece ?? (pending === "ice" && iceLeft === 0 ? "pearl" : pending);

  const canPick = interactive && !s.finished;
  const ghost = canPick && sel ? Tapioca.landingIndex(s.board, sel.col, sel.piece) : null;
  const otherPiece: Piece = sel?.piece === "pearl" ? "ice" : "pearl";
  // 選んでいない方の止まる位置（氷が残っていないときは出さない）
  const hint =
    canPick && sel && (otherPiece === "pearl" || iceLeft > 0) ? Tapioca.landingIndex(s.board, sel.col, otherPiece) : null;
  // 影まで動いてくる道（タピオカは空きの一番上から、氷は空きの一番下から）
  const path = new Set<number>();
  if (ghost !== null && sel) {
    const step = sel.piece === "pearl" ? -COLS : COLS;
    for (let i = ghost + step; i >= 0 && i < s.board.length && s.board[i] === null; i += step) path.add(i);
  }

  const win = new Set(s.winLine ?? []);
  const winner = s.finished && s.winLine ? s.board[s.winLine[0]!]!.seat : null;
  const colorName = (seat: Seat) => t(`game.tapioca.color${seat}`);

  const pickColumn = (col: number) => onSelect({ col, piece });
  const choose = (p: Piece) => {
    setPending(p);
    if (sel) onSelect({ col: sel.col, piece: p });
  };

  // 最後に入れたものが止まってから、勝った並びを見せる
  const lastCell = s.lastMove === null ? null : s.board[s.lastMove];
  const travel = lastCell ? Tapioca.travelOf(s.board, s.lastMove!) : 0;
  const settle = lastCell ? moveSeconds(lastCell.piece, travel) : 0;

  const winEnds = s.winLine ? [centerOf(s.winLine[0]!), centerOf(s.winLine[s.winLine.length - 1]!)] : null;
  const tea = `${id}-tea`;
  const clip = `${id}-cup`;
  const strawX = CX + GRID_W * 0.2;

  return (
    <div className="tapioca stack-sm">
      <div
        className={`tapioca-glass seat${s.turn}`}
        style={{ "--ratio": (VW / VH).toFixed(4), "--settle": `${settle.toFixed(2)}s` } as CSSProperties}
        role="group"
        aria-label={t("game.tapioca.board", { cols: COLS, rows: ROWS })}
      >
        <svg className="tapioca-back" viewBox={`0 0 ${VW} ${VH}`} aria-hidden>
          <defs>
            <linearGradient id={tea} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="tapioca-tea-top" />
              <stop offset="0.55" className="tapioca-tea-mid" />
              <stop offset="1" className="tapioca-tea-bottom" />
            </linearGradient>
            <clipPath id={clip}>
              <path d={cupPath(TEA_Y, 0)} />
            </clipPath>
          </defs>
          {/* グラスの中（空いているところもうっすら見える） */}
          <path d={cupPath(RIM_Y, 0)} className="tapioca-inside" />
          {/* ストロー。お茶の中は、お茶を通して見えるので後ろに描く */}
          <line x1={strawX + 74} y1={30} x2={strawX - 6} y2={BOTTOM_Y - 26} className="tapioca-straw-edge" />
          <line x1={strawX + 74} y1={30} x2={strawX - 6} y2={BOTTOM_Y - 26} className="tapioca-straw" />
          <line x1={strawX + 62} y1={32} x2={strawX - 18} y2={BOTTOM_Y - 30} className="tapioca-straw-shine" />
          {/* ミルクティー。底のほうは黒糖のすじ */}
          <path d={cupPath(TEA_Y, 0)} fill={`url(#${tea})`} className="tapioca-tea" />
          <g clipPath={`url(#${clip})`} className="tapioca-syrup">
            <path d={`M${CX - innerHalf(BOTTOM_Y) - 4} ${BOTTOM_Y - 40} q60 -90 10 -190 q-40 -80 30 -170`} />
            <path d={`M${CX + innerHalf(BOTTOM_Y) + 4} ${BOTTOM_Y - 60} q-70 -80 -20 -170 q40 -70 -10 -150`} />
            <path d={`M${CX - 40} ${BOTTOM_Y + 10} q-50 -60 0 -120`} />
          </g>
          <path d={`M${CX - innerHalf(TEA_Y)} ${TEA_Y} L${CX + innerHalf(TEA_Y)} ${TEA_Y}`} className="tapioca-surface" />
          {/* グラスの厚い底と、外側の線・ふち */}
          <path d={`M${CX - innerHalf(BOTTOM_Y) + 20} ${BOTTOM_Y + WALL * 0.6} H${CX + innerHalf(BOTTOM_Y) - 20}`} className="tapioca-base" />
          <path d={cupPath(RIM_Y, WALL / 2)} className="tapioca-cup" />
          <rect
            x={CX - innerHalf(RIM_Y) - WALL - 6}
            y={RIM_Y - 9}
            width={2 * (innerHalf(RIM_Y) + WALL + 6)}
            height={16}
            rx={8}
            className="tapioca-rim"
          />
        </svg>

        <div className="tapioca-grid" style={{ ...GRID_BOX, "--cols": COLS, "--rows": ROWS } as CSSProperties}>
          {Array.from({ length: COLS }, (_, col) => {
            const room = roomOf(s.board, col);
            const can = canPick && room > 0;
            return (
              <button
                key={col}
                type="button"
                className={["tapioca-col", sel?.col === col && canPick && "selected"].filter(Boolean).join(" ")}
                disabled={!can}
                aria-pressed={canPick ? sel?.col === col : undefined}
                aria-label={t(room > 0 ? "game.tapioca.col" : "game.tapioca.colFull", { n: col + 1, room })}
                onClick={() => pickColumn(col)}
              >
                {Array.from({ length: ROWS }, (_, row) => {
                  const i = row * COLS + col;
                  const cell = s.board[i] ?? null;
                  return (
                    <span key={row} className={["tapioca-cell", path.has(i) && `path ${sel?.piece}`].filter(Boolean).join(" ")}>
                      {cell && (
                        <span
                          className={[
                            "tapioca-piece",
                            cell.piece,
                            `seat${cell.seat}`,
                            s.lastMove === i && "last",
                            win.has(i) && "win",
                            winner !== null && !win.has(i) && "dim",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={
                            {
                              "--tilt": cell.piece === "ice" ? tiltOf(i) : "0deg",
                              "--travel": s.lastMove === i ? travel : 0,
                            } as CSSProperties
                          }
                        />
                      )}
                      {ghost === i && sel && (
                        <span className={`tapioca-piece ${sel.piece} seat${s.turn} ghost`} style={{ "--tilt": tiltOf(i) } as CSSProperties} />
                      )}
                      {hint === i && (
                        <span className={`tapioca-piece ${otherPiece} seat${s.turn} hint`} style={{ "--tilt": tiltOf(i) } as CSSProperties} />
                      )}
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>

        {/* 手前：グラスのつやと、勝った並びの線（指の操作は通す） */}
        <svg className="tapioca-front" viewBox={`0 0 ${VW} ${VH}`} aria-hidden>
          <path
            d={`M${CX - innerHalf(RIM_Y + 30) + 18} ${RIM_Y + 30} L${CX - innerHalf(BOTTOM_Y - 60) + 14} ${BOTTOM_Y - 60}`}
            className="tapioca-shine"
          />
          <path
            d={`M${CX + innerHalf(RIM_Y + 40) - 16} ${RIM_Y + 40} L${CX + innerHalf(RIM_Y + 150) - 14} ${RIM_Y + 150}`}
            className="tapioca-shine small"
          />
          {winEnds && (
            <g className="tapioca-winline">
              <line x1={winEnds[0]![0]} y1={winEnds[0]![1]} x2={winEnds[1]![0]} y2={winEnds[1]![1]} className="under" />
              <line x1={winEnds[0]![0]} y1={winEnds[0]![1]} x2={winEnds[1]![0]} y2={winEnds[1]![1]} />
            </g>
          )}
        </svg>
      </div>

      {you !== null && !s.finished && (
        <div className={`tapioca-pick seat${mover}`} role="radiogroup" aria-label={t("game.tapioca.pickLabel")}>
          {(["pearl", "ice"] as const).map((p) => {
            const left = s.ice[mover];
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={canPick && piece === p}
                className={canPick && piece === p ? "on" : ""}
                disabled={!canPick || (p === "ice" && left === 0)}
                onClick={() => choose(p)}
              >
                <span className={`tapioca-mini ${p} seat${mover}`} aria-hidden />
                <span className="tapioca-pick-text">
                  <span className="tapioca-pick-name">{p === "pearl" ? t("game.tapioca.pearl") : t("game.tapioca.iceLeft", { n: left })}</span>
                  <span className="tapioca-pick-sub">{t(p === "pearl" ? "game.tapioca.sinks" : "game.tapioca.floats")}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="board-note">
        <span className="tapioca-ice-left" aria-label={t("game.tapioca.iceLeftOf", { c0: colorName(0), n0: s.ice[0], c1: colorName(1), n1: s.ice[1] })}>
          <span className="muted">{t("game.tapioca.iceLeftLabel")}</span>
          {([0, 1] as Seat[]).map((seat) => (
            <span key={seat} className={`tapioca-ice-count seat${seat}`} aria-hidden>
              {Array.from({ length: Tapioca.ICE[seat] }, (_, k) => (
                <i key={k} className={k < s.ice[seat] ? "" : "used"} />
              ))}
              <b className="num">{s.ice[seat]}</b>
            </span>
          ))}
        </span>
        <span className={noteMuted() ? "muted" : ""}>{noteText()}</span>
      </p>
    </div>
  );

  function noteMuted() {
    return !canPick && !s.finished;
  }

  /** 盤の下の案内の 2 行目 */
  function noteText(): string {
    if (s.finished) {
      if (winner !== null) return t("game.tapioca.lined", { color: colorName(winner) });
      return t("game.tapioca.full");
    }
    if (canPick) {
      if (!sel) return t("game.tapioca.pickCol");
      return t(sel.piece === "pearl" ? "game.tapioca.willPearl" : "game.tapioca.willIce", { n: sel.col + 1 });
    }
    const last = s.lastMove;
    const cell = last === null ? null : s.board[last];
    if (last === null || !cell) return t("game.tapioca.intro");
    const key = cell.piece === "pearl" ? "Pearl" : "Ice";
    return cell.seat === you
      ? t(`game.tapioca.put${key}You`, { n: Tapioca.colOf(last) + 1 })
      : t(`game.tapioca.put${key}`, { name: names[cell.seat], n: Tapioca.colOf(last) + 1 });
  }
}
