/**
 * ふたりのもちのアイコン：白いだいふくのようなもちの頭に、青とオレンジの 2 枚の葉の芽が出ている
 * （2 人で育てると、2 人の色の芽が伸びる）
 */
const BODY = "M9 46C9 31.5 18.5 22 32 22S55 31.5 55 46c0 4.6-2.8 8-7.4 8H16.4C11.8 54 9 50.6 9 46z";

export default () => (
  <>
    <path d="M32 22.5C32 18.5 32.6 15.4 33.6 13" className="g-ink-stroke" strokeWidth="2.4" />
    <path d="M33.2 14.2C28.6 7.6 20.6 7.4 17.6 11.6 21.8 16.6 28.4 17 33.2 14.2z" className="g-p0" />
    <path d="M33.6 13.6C37.4 6.4 45.4 5.2 48.8 9 45.2 14.6 38.6 15.8 33.6 13.6z" className="g-p1" />
    <path d={BODY} className="g-frame" strokeWidth="2.4" />
    <ellipse cx="22" cy="31.5" rx="4.2" ry="2.4" transform="rotate(-30 22 31.5)" className="g-line" strokeWidth="1.6" />
    <circle cx="25" cy="40" r="2.3" className="g-ink" />
    <circle cx="39" cy="40" r="2.3" className="g-ink" />
    <path d="M29.6 44.6q2.4 2.4 4.8 0" className="g-ink-stroke" strokeWidth="2" />
  </>
);
