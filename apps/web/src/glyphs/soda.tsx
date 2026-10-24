/** ふりふりソーダ：ふたが飛んで泡が吹き出すボトル。横に振った印 */
export default () => (
  <>
    {/* ボトルの体と、中の泡 */}
    <path d="M27 24v4c0 3-7 5-7 10v17c0 2.2 1.8 4 4 4h16c2.2 0 4-1.8 4-4V38c0-5-7-7-7-10v-4z" className="g-p0" />
    <circle cx="28" cy="48" r="2" className="g-rim" />
    <circle cx="35" cy="42" r="1.6" className="g-rim" />
    <circle cx="31" cy="35" r="1.3" className="g-rim" />
    {/* 吹き出す泡 */}
    <path d="M24.5 22c-3-1.5-3-5.5 0-6.5 0-3.5 4-5 6.5-3 2.5-2.5 7-1 7 2.5 3 .5 3.5 5 .5 6.5z" className="g-frame-stroke" strokeWidth="2.6" />
    {/* 飛んでいくふた */}
    <rect x="38" y="3" width="10" height="6" rx="1.6" transform="rotate(28 43 6)" className="g-p1" />
    {/* 振った印 */}
    <path d="M12 33c-2 3-2 7 0 10M52 33c2 3 2 7 0 10" className="g-line" strokeWidth="2.4" />
  </>
);
