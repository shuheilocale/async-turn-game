/** ブランド爆買いオークション：持ち手の付いたショッピングバッグと、ひもで下がった ¥ の値札 */
export default () => (
  <>
    {/* 紙袋（下が少し広い）と、上の折り返し */}
    <path d="M11 25h30l3.5 31h-37Z" className="g-p0" />
    <path d="M11.4 29.5h29.2" className="g-cut" strokeWidth="1.8" />
    <path d="M18.5 25v-4.5a7.5 7.5 0 0 1 15 0V25" className="g-ink-stroke" strokeWidth="3" />
    {/* 値札をつるすひも */}
    <path d="M33.5 22.5C38 21 43 22.5 46.5 27" className="g-ink-stroke" strokeWidth="1.6" />
    {/* 値札：とがった頭に穴があり、¥ の印 */}
    <g transform="rotate(16 47 39)">
      <path d="M47 26.5 54 33v18.5a2 2 0 0 1-2 2H42a2 2 0 0 1-2-2V33Z" className="g-card-back" />
      <circle cx="47" cy="32.6" r="1.8" className="g-ink" />
      <path d="M43.6 38.2 47 43l3.4-4.8M47 43v6.5M43.8 45h6.4M43.8 47.8h6.4" className="g-ink-stroke" strokeWidth="1.7" />
    </g>
  </>
);
