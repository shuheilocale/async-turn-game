/** きえるマルバツ：並んだ 3 つの ○ のうち、一番古い左端が盤と同じ薄い破線になって消えかけている */
export default () => (
  <>
    <circle cx="14" cy="24" r="7.5" className="g-p0-stroke" strokeWidth="3.4" strokeDasharray="2.1 5.75" opacity="0.5" />
    <circle cx="32" cy="24" r="7.5" className="g-p0-stroke" strokeWidth="3.4" />
    <circle cx="50" cy="24" r="7.5" className="g-p0-stroke" strokeWidth="3.4" />
    <path d="M18.5 39.5l9 9M27.5 39.5l-9 9M36.5 39.5l9 9M45.5 39.5l-9 9" className="g-p1-stroke" strokeWidth="3.4" />
  </>
);
