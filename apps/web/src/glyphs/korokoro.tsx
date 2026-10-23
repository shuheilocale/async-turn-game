/**
 * ころころのアイコン：3×3 のマスに塗ったマスが 3 つ（青・オレンジ・青）。
 * 右下にキューブ（上の面は青、手前の面はオレンジ、右の面は青）
 */
export default () => (
  <>
    <rect x="8" y="8" width="48" height="48" rx="7" className="g-line" strokeWidth="2.5" />
    <path d="M24 8v48M40 8v48M8 24h48M8 40h48" className="g-line" strokeWidth="2.5" />
    <rect x="11" y="11" width="10" height="10" rx="2.5" className="g-p0" />
    <rect x="27" y="11" width="10" height="10" rx="2.5" className="g-p1" />
    <rect x="11" y="27" width="10" height="10" rx="2.5" className="g-p0" />
    {/* キューブ：手前の面・右の面・上の面。上の面は少し明るく */}
    <path d="M29 35h17v17H29z" className="g-p1" />
    <path d="M46 35l7-7v17l-7 7z" className="g-p0" />
    <path d="M29 35l7-7h17l-7 7z" className="g-p0" />
    <path d="M29 35l7-7h17l-7 7z" className="g-rim" />
    <path d="M29 35h17v17H29zM46 35l7-7M46 52l7-7V28H36l-7 7" className="g-cut" strokeWidth="1.6" />
  </>
);
