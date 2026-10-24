/**
 * ツボさがしのアイコン：うつぶせの人を上から見た頭と背中（背骨の点線）、背中に残った指の跡
 * （青＝つめたい、オレンジ＝あたたかい）。右下から手をあてて、親指でこりを押している
 */
export default () => (
  <>
    {/* 頭と背中（えりから肩、腰まで） */}
    <circle cx="32" cy="8.5" r="5.5" className="g-line" strokeWidth="2.5" />
    <path
      d="M25.5 16c2 1.5 4.2 2.2 6.5 2.2s4.5-.7 6.5-2.2c6.5 1 11 2.8 13 5 1.4 1.7 1.6 4.4 1.3 7.5L51 59H13l-1.8-30.5c-.3-3.1-.1-5.8 1.3-7.5 2-2.2 6.5-4 13-5Z"
      className="g-line"
      strokeWidth="2.5"
    />
    <path d="M32 23v32" className="g-line" strokeWidth="2.2" strokeDasharray="0.1 4.5" />
    {/* 指の跡 */}
    <ellipse cx="21" cy="29" rx="3.3" ry="3.9" className="g-p0" />
    <ellipse cx="41" cy="27" rx="3.3" ry="3.9" className="g-p1" />
    {/* 親指で押しているところの波紋 */}
    <circle cx="37.6" cy="44.8" r="6.4" className="g-p1-stroke" strokeWidth="2.2" />
    {/* 手：親指と、指をそろえた手のひら */}
    <g transform="translate(49 44) rotate(-20)">
      <path d="M-3.8 3.6-8.8-4.4A2.6 2.6 0 0 0-13.2-1.6L-8.2 6.4Z" className="g-card-back" strokeWidth="2.2" />
      <path d="M-5.5 19-6.5 8V-6A6.5 6.5 0 0 1 6.5-6V8L5.5 19Z" className="g-card-back" strokeWidth="2.2" />
      <path d="M-2.2-9.4V-3.5M2.2-9.4V-3.5" className="g-ink-stroke" strokeWidth="1.6" />
    </g>
  </>
);
