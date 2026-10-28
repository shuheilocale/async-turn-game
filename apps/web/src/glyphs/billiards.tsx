/**
 * ビリヤードのアイコン：三角形に並んだ 3 つの球（先頭が青のソリッド、奥に黒の 8 とオレンジのストライプ）と、
 * 手前の手球（白）から先頭の球へ向かうねらいの点線
 */
export default () => (
  <>
    <path d="M18.5 45.5 25 39" className="g-line" strokeWidth="2.5" strokeDasharray="0.1 5" />
    <circle cx="12.5" cy="51.5" r="7" className="g-stone-white" strokeWidth="2.2" />
    <circle cx="32" cy="34" r="9.5" className="g-p0" />
    <circle cx="32" cy="34" r="3.8" className="g-rim" />
    {/* 8 は画面の明暗に関係なく黒。暗い画面でも形がわかるよう縁を描く */}
    <circle cx="52" cy="27.5" r="9.5" className="g-stone-black" />
    <circle cx="52" cy="27.5" r="3.8" className="g-rim" />
    <circle cx="52" cy="27.5" r="9.5" className="g-line" strokeWidth="1.6" />
    {/* ストライプ：オレンジの球の上下を白くして帯にし、白い所が見えるよう縁を描く */}
    <circle cx="38.5" cy="14" r="9.5" className="g-p1" />
    <path d="M30.42 9A9.5 9.5 0 0 1 46.58 9ZM30.42 19A9.5 9.5 0 0 0 46.58 19Z" className="g-stone-white" strokeWidth="0" />
    <circle cx="38.5" cy="14" r="9.5" className="g-line" strokeWidth="1.6" />
  </>
);
