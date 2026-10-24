/** ぴったりストップ：文字盤の真ん中を目隠しの布で覆ったストップウォッチ。布は横で結んで、端が垂れている */
export default () => (
  <>
    {/* 上のつまみと、横のボタン */}
    <path d="M27 5h10" className="g-ink-stroke" strokeWidth="3.6" />
    <path d="M32 6v7" className="g-ink-stroke" strokeWidth="3.2" />
    <path d="M47.5 16.2l3.6-3.6" className="g-ink-stroke" strokeWidth="3.2" />
    {/* 本体と目盛り */}
    <circle cx="32" cy="37" r="21.5" className="g-frame-stroke" strokeWidth="3" />
    <path d="M32 19.5v3.6M32 50.9v3.6M14.5 37h3.6M45.9 37h3.6" className="g-line" strokeWidth="2.6" />
    {/* 目隠しの布と、結んだ端 */}
    <path d="M6.5 31.8Q32 27.2 57.5 31.8V42.2Q32 37.6 6.5 42.2Z" className="g-p0" />
    <path d="M56.5 34.5l6-4.5M56.5 40.5l6.5 3.5" className="g-p0-stroke" strokeWidth="3" />
  </>
);
