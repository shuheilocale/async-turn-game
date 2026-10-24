/** わなの扉：上が丸い扉が 3 つ。上の丸は扉の点（1・2・3）で、まん中は開いていて、右の扉の前に落とし穴 */
const ARCH = (x: number) => `M${x} 46V24a7.5 7.5 0 0 1 15 0V46z`;

export default () => (
  <>
    <path d="M4 46.5h56" className="g-line" strokeWidth="2.5" />
    {/* 点の印 */}
    <circle cx="11.5" cy="9" r="1.9" className="g-ink" />
    <circle cx="28.8" cy="9" r="1.9" className="g-ink" />
    <circle cx="35.2" cy="9" r="1.9" className="g-ink" />
    <circle cx="46" cy="9" r="1.9" className="g-ink" />
    <circle cx="52.5" cy="9" r="1.9" className="g-ink" />
    <circle cx="49.25" cy="3.6" r="1.9" className="g-ink" />
    {/* 左と右は閉じた扉 */}
    <path d={ARCH(4)} className="g-card-back" />
    <circle cx="15.5" cy="36" r="1.6" className="g-ink" />
    <path d={ARCH(41.5)} className="g-card-back" />
    <circle cx="53" cy="36" r="1.6" className="g-ink" />
    {/* まん中は開いて、奥が暗い。開いた板は手前に見える */}
    <path d={ARCH(24.5)} className="g-rack" />
    <path d="M24.5 46V20.5l6 -2.6V49.5z" className="g-p0" />
    {/* 右の扉の前の落とし穴 */}
    <ellipse cx="49" cy="54" rx="10" ry="4" className="g-ink" />
    <path d="M41 54.5q8 -2.6 16 0" className="g-p1-stroke" strokeWidth="2" />
  </>
);
