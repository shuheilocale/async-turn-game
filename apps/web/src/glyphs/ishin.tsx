/**
 * ふたりの以心伝心のアイコン：2 人の色の吹き出しが重なり、重なったところで左右の色が 1 つのハートになる
 */
const LEFT = "M16 9h14a12 12 0 0 1 12 12v6a12 12 0 0 1-12 12H19l-9 8 1.5-9.2A12 12 0 0 1 4 27v-6A12 12 0 0 1 16 9z";
const RIGHT = "M48 17H34a12 12 0 0 0-12 12v6a12 12 0 0 0 12 12h11l9 8-1.5-9.2A12 12 0 0 0 60 35v-6a12 12 0 0 0-12-12z";

export default () => (
  <>
    <path d={LEFT} className="g-hole" />
    <path d={LEFT} className="g-p0-stroke" strokeWidth="3" />
    <path d={RIGHT} className="g-hole" />
    <path d={RIGHT} className="g-p1-stroke" strokeWidth="3" />
    {/* ハートの左半分は先手の色、右半分は後手の色 */}
    <path d="M32 36.8C25.3 31.8 22 28.5 22 24.3a4.6 4.6 0 0 1 10-2.1z" className="g-p0" />
    <path d="M32 22.2a4.6 4.6 0 0 1 10 2.1c0 4.2-3.3 7.5-10 12.5z" className="g-p1" />
  </>
);
