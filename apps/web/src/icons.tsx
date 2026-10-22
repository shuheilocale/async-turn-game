import type { ReactNode } from "react";
import type { Seat } from "@atg/core";

/**
 * ゲームのアイコンと駒の絵（SVG）。色は CSS の変数（--p0 / --p1 / --ink など）で決まるので、
 * ダークモードでもそのまま使える。
 */

export function OMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`piece-svg o-mark ${className}`} aria-hidden>
      <circle cx="20" cy="20" r="13" />
    </svg>
  );
}

export function XMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`piece-svg x-mark ${className}`} aria-hidden>
      <path d="M9 9 31 31M31 9 9 31" />
    </svg>
  );
}

/** 対局者を表す小さな印。ゲームの駒に合わせる */
export function SeatToken({ gameType, seat }: { gameType: string; seat: Seat }) {
  if (gameType === "tictactoe") return seat === 0 ? <OMark className="token" /> : <XMark className="token" />;
  if (gameType === "othello") return <span className={`token stone ${seat === 0 ? "black" : "white"}`} aria-hidden />;
  return <span className={`token dot seat${seat}`} aria-hidden />;
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="logo-svg" aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" className="g-frame" />
      <circle cx="11" cy="16" r="4.6" className="g-p0-stroke" strokeWidth="2.6" />
      <path d="M18 11.4 26.2 20.6M26.2 11.4 18 20.6" className="g-p1-stroke" strokeWidth="2.6" />
    </svg>
  );
}

const glyphs: Record<string, () => ReactNode> = {
  tictactoe: () => (
    <>
      <path d="M23.5 10v44M40.5 10v44M10 23.5h44M10 40.5h44" className="g-line" strokeWidth="2.5" />
      <circle cx="15.5" cy="15.5" r="4.6" className="g-p0-stroke" strokeWidth="3.4" />
      <path d="M28 28l8 8M36 28l-8 8" className="g-p1-stroke" strokeWidth="3.4" />
      <circle cx="49" cy="49" r="4.6" className="g-p0-stroke" strokeWidth="3.4" />
    </>
  ),
  gobble: () => (
    <>
      <circle cx="20" cy="42" r="9" className="g-p0" />
      <circle cx="20" cy="42" r="4.5" className="g-rim" />
      <circle cx="38" cy="28" r="18" className="g-p1" />
      <circle cx="38" cy="28" r="10" className="g-rim" />
      <circle cx="38" cy="28" r="18" className="g-cut" strokeWidth="3" />
    </>
  ),
  nim: () => (
    <>
      {[1, 3, 5, 7].flatMap((n, row) =>
        Array.from({ length: n }, (_, i) => {
          const x = 32 + (i - (n - 1) / 2) * 7.2;
          const y = 9 + row * 13;
          const taken = row === 3 && i >= 5;
          return (
            <path
              key={`${row}-${i}`}
              d={`M${x} ${y}v9`}
              className={taken ? "g-p0-stroke" : "g-ink-stroke"}
              strokeWidth="3.2"
            />
          );
        }),
      )}
    </>
  ),
  connect4: () => (
    <>
      <rect x="8" y="12" width="48" height="44" rx="7" className="g-rack" />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => {
          const fill = r === 2 ? (c === 1 ? "g-p1" : "g-p0") : r === 1 && c === 1 ? "g-p0" : r === 1 && c === 2 ? "g-p1" : "g-hole";
          return <circle key={`${r}-${c}`} cx={19 + c * 13} cy={23 + r * 12.5} r="4.8" className={fill} />;
        }),
      )}
    </>
  ),
  othello: () => (
    <>
      <circle cx="24" cy="36" r="15" className="g-stone-black" />
      <circle cx="41" cy="27" r="15" className="g-stone-white" strokeWidth="2.5" />
    </>
  ),
  hitblow: () => (
    <>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={8 + i * 17} y="10" width="14" height="19" rx="4" className="g-frame-stroke" strokeWidth="2.5" />
      ))}
      <text x="15" y="25" className="g-num">3</text>
      <text x="32" y="25" className="g-num">7</text>
      <text x="49" y="25" className="g-num">1</text>
      <circle cx="17" cy="46" r="5" className="g-p0" />
      <circle cx="32" cy="46" r="5" className="g-p0" />
      <circle cx="47" cy="46" r="4" className="g-p1-stroke" strokeWidth="2.5" />
    </>
  ),
  auction: () => (
    <>
      <rect x="12" y="13" width="24" height="34" rx="4" transform="rotate(-12 24 30)" className="g-card-back" />
      <rect x="27" y="15" width="26" height="36" rx="4" transform="rotate(9 40 33)" className="g-card" />
      <text x="40" y="39" transform="rotate(9 40 33)" className="g-num big">9</text>
    </>
  ),
};

/** ゲームを表すアイコン。そのゲームの盤や駒をそのまま図にしたもの */
export function GameGlyph({ id, className = "" }: { id: string; className?: string }) {
  const draw = glyphs[id];
  return (
    <svg viewBox="0 0 64 64" className={`glyph ${className}`} aria-hidden>
      {draw ? draw() : <rect x="12" y="12" width="40" height="40" rx="8" className="g-frame-stroke" strokeWidth="3" />}
    </svg>
  );
}
