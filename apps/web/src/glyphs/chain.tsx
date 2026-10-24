/**
 * まねっこチェーン：2×2 のパッド。左上の青い丸のパッドが光っていて、右上はオレンジの三角、
 * 下の 2 つ（四角と星）は消えている
 */
export default () => (
  <>
    {/* 光っているパッド */}
    <rect x="6" y="6" width="24" height="24" rx="6.5" className="g-p0" />
    <circle cx="18" cy="18" r="6.5" className="g-rim" />
    {/* 消えているパッド */}
    <rect x="34" y="6" width="24" height="24" rx="6.5" className="g-p1-stroke" strokeWidth="2.5" />
    <path d="M46 12l6.5 11.5h-13z" className="g-p1" />
    <rect x="6" y="34" width="24" height="24" rx="6.5" className="g-line" strokeWidth="2.5" />
    <rect x="13" y="41" width="10" height="10" rx="1.5" className="g-ink-stroke" strokeWidth="2.4" />
    <rect x="34" y="34" width="24" height="24" rx="6.5" className="g-line" strokeWidth="2.5" />
    <path
      d="M46 39.2l2 4.6 5 .4-3.8 3.3 1.2 4.9-4.4-2.6-4.4 2.6 1.2-4.9-3.8-3.3 5-.4z"
      className="g-ink-stroke"
      strokeWidth="2.2"
    />
  </>
);
