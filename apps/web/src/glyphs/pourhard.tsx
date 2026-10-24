/** みずそそぎ・ハード：みずそそぎのコップの上半分に霧がかかって、水の高さが「？」になっている */
const CLOUD =
  "M12 33 C7.5 33 6.5 25.5 11.5 24 C11 17.5 18 14 23.5 16.5 C26.5 11.5 37.5 11.5 40.5 16.5 C46 14 53 17.5 52.5 24 C57.5 25.5 56.5 33 52 33 Q47 36 42 33 Q37 36 32 33 Q27 36 22 33 Q17 36 12 33 Z";

export default () => (
  <>
    {/* 水。ふちの上は表面張力で丸く盛り上がる */}
    <path d="M16.6 17 Q32 9.5 47.4 17 L44 53 H20 Z" className="g-p0" />
    {/* コップ（下すぼまり）と、底の厚み */}
    <path d="M15 15 19 55H45L49 15" className="g-frame-stroke" strokeWidth="2.6" />
    <path d="M20.5 50.5H43.5" className="g-cut" strokeWidth="1.6" />
    {/* 霧と、水の高さが分からない「？」。暗い画面でも霧が白っぽく見えるよう、白を少し重ねる */}
    <path d={CLOUD} className="g-frame" />
    <path d={CLOUD} className="g-rim" />
    <path d={CLOUD} className="g-line" strokeWidth="2" />
    <text x="32" y="29.5" className="g-num">?</text>
    {/* 落ちてくる水 */}
    <path d="M32 1.2c1.8 2.4 2.8 3.9 2.8 5.2a2.8 2.8 0 0 1-5.6 0c0-1.3 1-2.8 2.8-5.2z" className="g-p0" />
  </>
);
