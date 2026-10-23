/** はったり三枚：伏せたカード 1 枚と、場に出した 2 人のチップ */
export default () => (
  <>
    <g transform="rotate(-10 24 30)">
      <rect x="11" y="10" width="26" height="38" rx="4" className="g-card" />
      <rect x="15" y="14" width="18" height="30" rx="2" className="g-cut" strokeWidth="1.5" />
      <path d="M24 21.5l5 7.5-5 7.5-5-7.5z" className="g-cut" strokeWidth="1.8" />
    </g>
    {/* チップは上から見た形。ふちの切れ目で丸い駒と見分けられるようにする */}
    <circle cx="39" cy="47" r="10" className="g-p0" />
    <circle cx="39" cy="47" r="7.5" className="g-cut" strokeWidth="2.6" strokeDasharray="3.2 2.7" />
    <circle cx="50" cy="36" r="10" className="g-p1" />
    <circle cx="50" cy="36" r="7.5" className="g-cut" strokeWidth="2.6" strokeDasharray="3.2 2.7" />
  </>
);
