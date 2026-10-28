/**
 * ふたりのボス戦のアイコン：大きな目覚まし時計のボス（月曜日の朝）に、青とオレンジの 2 人が並んで向かう
 */
export default () => (
  <>
    {/* ボス：2 つのベルと、ふきげんな顔の時計 */}
    <circle cx="31" cy="11" r="5" className="g-ink" />
    <circle cx="53" cy="11" r="5" className="g-ink" />
    <path d="M37 50l-3 6M49 50l3 6" className="g-ink-stroke" strokeWidth="3" />
    <circle cx="42" cy="31" r="19" className="g-ink" />
    <path d="M33 27l6 2.6M51 27l-6 2.6" className="g-cut" strokeWidth="2.6" />
    <circle cx="36.5" cy="32" r="2.2" className="g-hole" />
    <circle cx="47.5" cy="32" r="2.2" className="g-hole" />
    <path d="M37 41q5-3.5 10 0" className="g-cut" strokeWidth="2.4" />
    {/* 2 人 */}
    <circle cx="10" cy="40" r="4.4" className="g-p0" />
    <path d="M4.5 60v-9.5a5.5 5.5 0 0 1 11 0V60z" className="g-p0" />
    <circle cx="22" cy="43" r="4.4" className="g-p1" />
    <path d="M16.5 61v-8.5a5.5 5.5 0 0 1 11 0V61z" className="g-p1" />
  </>
);
