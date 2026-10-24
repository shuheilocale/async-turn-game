/** かたむけコロコロ：少し傾いた迷路の板。壁と穴、ゴールの旗、転がる玉 */
export default () => (
  <g transform="rotate(-8 32 32)">
    <rect x="11" y="7" width="42" height="50" rx="5" className="g-frame-stroke" strokeWidth="3" />
    {/* 壁 */}
    <path d="M11 24h22M31 40h22" className="g-ink-stroke" strokeWidth="3.2" />
    {/* 穴 */}
    <circle cx="42" cy="17" r="3.4" className="g-ink" />
    <circle cx="21" cy="33" r="3.4" className="g-ink" />
    <circle cx="26" cy="49" r="3.4" className="g-ink" />
    {/* ゴールの旗 */}
    <path d="M44 53V45l6 2.5-6 2.5" className="g-p0-stroke" strokeWidth="2.4" />
    {/* 玉 */}
    <circle cx="19" cy="15" r="4.6" className="g-p1" />
  </g>
);
