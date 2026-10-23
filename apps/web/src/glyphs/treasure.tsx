/**
 * 宝と岩のアイコン：3×3 のマスに、左下のコマ、右上の宝（青＝先手にだけ見える）、
 * まん中の岩（オレンジ＝後手にだけ見える）。コマから宝へ向かう足あとの点
 */
export default () => (
  <>
    <rect x="8" y="8" width="48" height="48" rx="7" className="g-line" strokeWidth="2.5" />
    <path d="M24 8v48M40 8v48M8 24h48M8 40h48" className="g-line" strokeWidth="2.5" />
    {/* 足あと：上へ進んで、岩をよけて右へ */}
    <path d="M16 38V18H30" className="g-ink-stroke" strokeWidth="2.6" strokeDasharray="0.1 5" />
    {/* 岩：角ばった石と、面の境目の線 */}
    <path d="M24.5 38.5 26 30.5l5-4.5 5.5 1.5 3 5 .5 6z" className="g-p1" />
    <path d="M31 26l1.5 6.5 7.5.5M32.5 32.5l-3 6" className="g-cut" strokeWidth="1.3" />
    {/* 宝（横から見た宝石） */}
    <path d="M44 10h8l3 4-7 9-7-9z" className="g-p0" />
    <path d="M41 14h14M46 10l-1.5 4 3.5 9 3.5-9-1.5-4" className="g-cut" strokeWidth="1.3" />
    {/* コマ */}
    <circle cx="16" cy="48" r="6.5" className="g-ink" />
    <circle cx="16" cy="48" r="2.6" className="g-rim" />
  </>
);
