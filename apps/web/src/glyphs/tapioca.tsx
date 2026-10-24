/**
 * しずむタピオカ・うかぶ氷：下すぼまりのカップに太いストロー。上に浮かんだ氷が 2 つ（青・オレンジ）、
 * 底に沈んだタピオカが 4 つ（つやの点つき）
 */
export default () => (
  <>
    {/* ストロー（カップの後ろから、ふちの上へ） */}
    <path d="M44.5 3.5 37 50" className="g-line" strokeWidth="6.5" />
    {/* お茶の表面 */}
    <path d="M15.6 21c3.4-1.6 6.8 1.6 10.2 0s6.8 1.6 10.2 0 6.8 1.6 10.2 0 4.6 1 6.2.4" className="g-line" strokeWidth="2" />
    {/* 浮かんだ氷：半透明の四角に、その色の線 */}
    <rect x="18.5" y="23" width="10" height="10" rx="2.4" transform="rotate(-10 23.5 28)" className="g-p0" opacity="0.3" />
    <rect x="18.5" y="23" width="10" height="10" rx="2.4" transform="rotate(-10 23.5 28)" className="g-p0-stroke" strokeWidth="2.2" />
    <rect x="31.5" y="23.5" width="10" height="10" rx="2.4" transform="rotate(8 36.5 28.5)" className="g-p1" opacity="0.3" />
    <rect x="31.5" y="23.5" width="10" height="10" rx="2.4" transform="rotate(8 36.5 28.5)" className="g-p1-stroke" strokeWidth="2.2" />
    {/* 沈んだタピオカ */}
    <circle cx="25" cy="51" r="4.6" className="g-p1" />
    <circle cx="34.5" cy="51" r="4.6" className="g-p0" />
    <circle cx="29.8" cy="43" r="4.6" className="g-p0" />
    <circle cx="39.4" cy="43.4" r="4.6" className="g-p1" />
    <circle cx="23.6" cy="49.4" r="1.4" className="g-rim" />
    <circle cx="33.1" cy="49.4" r="1.4" className="g-rim" />
    <circle cx="28.4" cy="41.4" r="1.4" className="g-rim" />
    <circle cx="38" cy="41.8" r="1.4" className="g-rim" />
    {/* カップ（下すぼまり）と、ふち */}
    <path d="M13.5 15 17.6 54.6Q18 58 21.4 58H42.6Q46 58 46.4 54.6L50.5 15" className="g-frame-stroke" strokeWidth="2.6" />
    <path d="M10.5 15h43" className="g-frame-stroke" strokeWidth="3.6" />
  </>
);
