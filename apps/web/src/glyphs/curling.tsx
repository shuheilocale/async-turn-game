/** 3D カーリングのアイコン：上から見たハウス（同心円）に、取っ手の付いた石が 2 つ。青い石はすべってきた跡つき */
export default () => (
  <>
    <circle cx="35" cy="27" r="22" className="g-line" strokeWidth="2.5" />
    <circle cx="35" cy="27" r="13.5" className="g-line" strokeWidth="2.5" />
    <circle cx="35" cy="27" r="4.5" className="g-line" strokeWidth="2.5" />
    <path d="M14 61c1-8 4-14 9.5-19" className="g-line" strokeWidth="2.5" strokeDasharray="0.1 5.5" />
    <circle cx="44.5" cy="18.5" r="7.5" className="g-rack" />
    <path d="M41 18.5h7" className="g-p1-stroke" strokeWidth="3.4" />
    <circle cx="29" cy="35.5" r="7.5" className="g-rack" />
    <path d="M29 32v7" className="g-p0-stroke" strokeWidth="3.4" />
  </>
);
