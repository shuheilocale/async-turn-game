/** 線とり陣取りのアイコン：3×3 の点と、引いた線と、青が取った左上の箱 */
const P = [14, 32, 50];

export default () => (
  <>
    <rect x="14" y="14" width="18" height="18" className="g-p0" opacity="0.22" />
    {/* 左上の箱の 4 辺。最後の右の辺を青が引いて閉じた */}
    <path d="M14 14H32M32 14V32" className="g-p0-stroke" strokeWidth="3.4" />
    <path d="M14 14V32H32" className="g-p1-stroke" strokeWidth="3.4" />
    <path d="M32 14H50" className="g-p1-stroke" strokeWidth="3.4" />
    <path d="M50 14V32M32 32V50" className="g-p0-stroke" strokeWidth="3.4" />
    {/* まだ引いていない線は点線 */}
    <path d="M32 32H50M14 32V50M14 50H32M50 32V50M32 50H50" className="g-line" strokeWidth="2.4" strokeDasharray="0.1 4.5" />
    {P.flatMap((y) => P.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" className="g-ink" />))}
  </>
);
