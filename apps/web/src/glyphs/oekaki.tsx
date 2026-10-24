/**
 * おえかきクイズのアイコン：少し傾いた紙に描いたタピオカのカップと、右下から伸びる絵筆、
 * 右上に「？」のふきだし（青）。何の絵かを当てるゲームなので
 */
export default () => (
  <>
    <g transform="rotate(-7 25 34)">
      <rect x="5" y="14" width="40" height="40" rx="6" className="g-frame" />
      {/* カップ・ふた・ストロー・底のタピオカ */}
      <path d="M15.5 26h19l-2.8 20h-13.4z" className="g-ink-stroke" strokeWidth="2.6" />
      <path d="M14 26h22" className="g-ink-stroke" strokeWidth="2.6" />
      <path d="M27.5 26 31 17" className="g-p1-stroke" strokeWidth="2.8" />
      {[
        [20.5, 42],
        [25, 42.6],
        [29.5, 42],
        [22.8, 38.4],
        [27.4, 38.4],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" className="g-ink" />
      ))}
    </g>
    {/* 絵筆：持ち手（オレンジ）・金具・穂先 */}
    <path d="M59 59 47.5 47.5" className="g-p1-stroke" strokeWidth="6" />
    <path d="M47.5 47.5 44.5 44.5" className="g-line" strokeWidth="6.4" />
    <path d="M44.6 41.3c-2.8-2.6-6.6-2.6-8.1.2-.9 1.7-1.2 3.6-3 5.4 3.8.4 7.8-.4 10.3-2.4z" className="g-ink" />
    {/* 「？」のふきだし */}
    <circle cx="50" cy="15" r="11" className="g-p0" />
    <path d="M44 24.5 41.5 29l6.2-2.6" className="g-p0" />
    <path d="M46.4 12.3a3.7 3.7 0 1 1 5.3 3.4c-1.2.6-1.7 1.4-1.7 2.8" className="g-cut" strokeWidth="2.8" />
    <path d="M50 21.9v.1" className="g-cut" strokeWidth="3.2" />
  </>
);
