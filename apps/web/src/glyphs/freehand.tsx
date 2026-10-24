/** ひとふでチャレンジ：理想の円（うすい点線）と、少しゆがんだ手描きの円。描き終わりにペン先がある */
export default () => (
  <>
    <circle cx="27" cy="31.5" r="19.5" className="g-line" strokeWidth="2.4" strokeDasharray="3.5 4" />
    {/* 手描きの円。右から描き始めて 1 周し、始めを少し行き過ぎて終わる */}
    <path d="M45 38C47.5 25 40 14.5 28 14 16 13.5 6.5 21 6.8 32.5 7 44 16 50.8 26.5 50.2 37.5 49.6 44.6 42 45.6 31.5L45.4 25" className="g-p0-stroke" strokeWidth="3.4" />
    {/* ペン。先が描き終わりにある */}
    <g transform="rotate(-45 45.4 24.6)">
      <path d="M45.4 24.6 52 21V28.2Z" className="g-card-back" strokeWidth="2" />
      <path d="M45.4 24.6 47.9 23.3V25.9Z" className="g-ink" />
      <rect x="52" y="21" width="16" height="7.2" rx="1.6" className="g-p1" />
    </g>
  </>
);
