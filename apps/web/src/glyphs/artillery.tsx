/**
 * たまうちバトルのアイコン：まん中に山のある地形の左右に大砲（青・オレンジ）。
 * 青の大砲から、山を越えてオレンジへ向かう弾の軌跡（点線）と弾
 */
export default () => (
  <>
    <path d="M4 49H15C21 49 25 29 32.5 29S43 49 49 49H60" className="g-line" strokeWidth="2.5" />
    {/* 弾の軌跡 */}
    <path d="M25 33.5Q35 -1 46 29" className="g-p0-stroke" strokeWidth="2.4" strokeDasharray="0.1 5" />
    <circle cx="46.8" cy="31.8" r="2.8" className="g-p0" />
    {/* 大砲：長い砲身と丸い車体 */}
    <path d="M13.5 45 23 35.5" className="g-p0-stroke" strokeWidth="3" />
    <path d="M7.5 49a6 6 0 0 1 12 0z" className="g-p0" />
    <path d="M50.5 45 41 35.5" className="g-p1-stroke" strokeWidth="3" />
    <path d="M44.5 49a6 6 0 0 1 12 0z" className="g-p1" />
  </>
);
