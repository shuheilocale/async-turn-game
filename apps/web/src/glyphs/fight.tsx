/** バックボーン・ファイト：向かい合う 2 つのボクシンググローブ（青とオレンジ）。こぶし同士が触れる手前 */
const GLOVE =
  "M6 22c0-8 5-13 12-13h4c6 0 10 4 10 10v6c0 4-2 7-5 8v6H11v-6c-3-2-5-6-5-11z";

export default () => (
  <>
    <g transform="translate(-1 6)">
      <path d={GLOVE} className="g-p0" />
      {/* 親指と、手首のひものふち */}
      <path d="M24 18c-4.5 1-6.5 5.5-5 11" className="g-cut" strokeWidth="2.2" />
      <path d="M11 33.5h16" className="g-cut" strokeWidth="2.2" />
    </g>
    <g transform="translate(65 6) scale(-1 1)">
      <path d={GLOVE} className="g-p1" />
      <path d="M24 18c-4.5 1-6.5 5.5-5 11" className="g-cut" strokeWidth="2.2" />
      <path d="M11 33.5h16" className="g-cut" strokeWidth="2.2" />
    </g>
    {/* ぶつかる瞬間の小さな線 */}
    <path d="M32 6v5M27 8l2 4M37 8l-2 4" className="g-ink-stroke" strokeWidth="2.2" />
  </>
);
