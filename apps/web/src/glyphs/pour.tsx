/** みずそそぎ：ふちより少し盛り上がるまで水が入ったコップと、上から落ちてくる 1 滴 */
export default () => (
  <>
    {/* 水。ふちの上は表面張力で丸く盛り上がる */}
    <path d="M16.6 17 Q32 9.5 47.4 17 L44 53 H20 Z" className="g-p0" />
    {/* コップ（下すぼまり）と、底の厚み */}
    <path d="M15 15 19 55H45L49 15" className="g-frame-stroke" strokeWidth="2.6" />
    <path d="M20.5 50.5H43.5" className="g-cut" strokeWidth="1.6" />
    {/* 落ちてくる水 */}
    <path d="M32 1.8c2 2.7 3.1 4.4 3.1 5.8a3.1 3.1 0 0 1-6.2 0c0-1.4 1.1-3.1 3.1-5.8z" className="g-p0" />
  </>
);
