/** タテヨコ置きのアイコン：3×3 のマスに縦の棒（青）と横の棒（オレンジ）が 2 本ずつ。まん中は置けない空き */
export default () => (
  <>
    <path d="M24 8v48M40 8v48M8 24h48M8 40h48" className="g-line" strokeWidth="2.5" />
    <rect x="11" y="11" width="10" height="26" rx="5" className="g-p0" />
    <rect x="43" y="27" width="10" height="26" rx="5" className="g-p0" />
    <rect x="27" y="11" width="26" height="10" rx="5" className="g-p1" />
    <rect x="11" y="43" width="26" height="10" rx="5" className="g-p1" />
  </>
);
