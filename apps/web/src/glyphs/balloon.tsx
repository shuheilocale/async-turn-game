/** ふうせん：ふくらんだ風船と結び目、垂れたひも。横に空気を入れた印 */
export default () => (
  <>
    <path d="M32 5C42.5 5 50 13 50 24c0 11-8.5 20-15.5 21.5L32 46l-2.5-.5C22.5 44 14 35 14 24 14 13 21.5 5 32 5z" className="g-p1" />
    <ellipse cx="24.5" cy="17" rx="3.6" ry="6.5" transform="rotate(-28 24.5 17)" className="g-rim" />
    <path d="M29 49.5h6l-3-3.5z" className="g-p1" />
    <path d="M32 49.5c-3.5 3.5 3.5 6.5 0 11" className="g-ink-stroke" strokeWidth="2" />
    {/* 空気を入れた印 */}
    <path d="M54 14.5l4-2.5M55 23h4.5M54 31.5l4 2.5" className="g-line" strokeWidth="2.4" />
  </>
);
