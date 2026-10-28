/**
 * きょうのおだい写真のアイコン：青とオレンジのふちの写真が 2 枚、少し傾いて重なる。どちらにも同じ山と太陽（同じお題）
 */
export default () => (
  <>
    <g transform="rotate(-9 22 33)">
      <rect x="6" y="13" width="32" height="38" rx="4" className="g-hole" />
      <rect x="6" y="13" width="32" height="38" rx="4" className="g-p0-stroke" strokeWidth="3" />
      <path d="M10.5 40l7-8 5 5 4-4 7 7" className="g-line" strokeWidth="2.4" />
      <circle cx="28" cy="23.5" r="3" className="g-p0" />
    </g>
    <g transform="rotate(8 42 31)">
      <rect x="26" y="11" width="32" height="38" rx="4" className="g-hole" />
      <rect x="26" y="11" width="32" height="38" rx="4" className="g-p1-stroke" strokeWidth="3" />
      <path d="M30.5 38l7-8 5 5 4-4 7 7" className="g-line" strokeWidth="2.4" />
      <circle cx="48" cy="21.5" r="3" className="g-p1" />
    </g>
  </>
);
