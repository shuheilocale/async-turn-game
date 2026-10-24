import type { ReactNode } from "react";

/*
 * ふたりの以心伝心の、選択肢の絵。言葉がちがっても絵で分かるように、選択肢 1 つに 1 枚ずつ描く。
 * viewBox は 0 0 32 32。線は .ishin-pic の色、塗りはクラスで決める（IshinBoard.css）。
 *   f = やわらかい桃色、w = 白（画面の地の色）、d = 線と同じ濃い色、tan = きつね色、
 *   y・o・r・g・b・br・gy・pu = 黄・だいだい・赤・緑・水色・茶・灰・むらさき、s0・s1 = 2 人の色、
 *   n = 線なし、thin・thick = 線の太さ、ws = 白い線、bs・rs・gs・ys = 水色・赤・緑・黄の線
 */

const f2 = (n: number) => +n.toFixed(2);

/** ハートの形。cx・cy はまん中、r は横の半分の幅 */
export function heart(cx: number, cy: number, r: number) {
  const k = r / 12;
  const p = (n: number) => f2(n * k);
  return `M${f2(cx)} ${f2(cy + 10 * k)}C${f2(cx - 8 * k)} ${f2(cy + 4 * k)} ${f2(cx - 12 * k)} ${f2(cy)} ${f2(cx - 12 * k)} ${f2(cy - 5 * k)}a${p(5.5)} ${p(5.5)} 0 0 1 ${p(12)} ${p(-2.5)}A${p(5.5)} ${p(5.5)} 0 0 1 ${f2(cx + 12 * k)} ${f2(cy - 5 * k)}c0 ${p(5)} ${p(-4)} ${p(9)} ${p(-12)} ${p(15)}z`;
}

/** 星（とがりの数 n、外側 R・内側 r） */
function star(cx: number, cy: number, R: number, r: number, n = 5) {
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = ((-90 + (i * 180) / n) * Math.PI) / 180;
    const d = i % 2 === 0 ? R : r;
    return `${f2(cx + d * Math.cos(a))} ${f2(cy + d * Math.sin(a))}`;
  });
  return `M${pts.join("L")}z`;
}

/** 波の線（x0 から x1 まで、高さ y） */
function wave(y: number, x0 = 3, x1 = 29) {
  const n = Math.round((x1 - x0) / 2.6);
  const w = f2((x1 - x0) / n);
  return `M${x0} ${y}q${f2(w / 2)} -1.6 ${w} 0${`t${w} 0`.repeat(n - 1)}`;
}

/** 海や水面：上が波で、下は 28.5 まで塗る */
const water = (y: number) => `${wave(y)}V28.5H3z`;

/** しずく（cx・cy はまん中あたり、s は大きさ） */
function drop(cx: number, cy: number, s = 1) {
  return `M${f2(cx)} ${f2(cy - 2.4 * s)}C${f2(cx + 1.2 * s)} ${f2(cy - 0.8 * s)} ${f2(cx + 1.7 * s)} ${f2(cy)} ${f2(cx + 1.7 * s)} ${f2(cy + 0.8 * s)}a${f2(1.7 * s)} ${f2(1.7 * s)} 0 0 1 ${f2(-3.4 * s)} 0C${f2(cx - 1.7 * s)} ${f2(cy)} ${f2(cx - 1.2 * s)} ${f2(cy - 0.8 * s)} ${f2(cx)} ${f2(cy - 2.4 * s)}z`;
}

/** 雪の結晶（6 本の腕と、腕の先の V） */
function snowflake(cx: number, cy: number, R: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((90 + i * 60) * Math.PI) / 180;
    const at = (d: number, da = 0) => {
      const b = a + (da * Math.PI) / 180;
      return `${f2(cx + d * Math.cos(b))} ${f2(cy - d * Math.sin(b))}`;
    };
    // V の先は、腕の 6 割のところから斜め外へ
    const v = R * 0.62;
    const wing = (side: number) => {
      const b = a + (side * 45 * Math.PI) / 180;
      const [x, y] = [cx + v * Math.cos(a), cy - v * Math.sin(a)];
      return `${f2(x + R * 0.32 * Math.cos(b))} ${f2(y - R * 0.32 * Math.sin(b))}`;
    };
    return `M${f2(cx)} ${f2(cy)}L${at(R)}M${wing(1)}L${at(v)}L${wing(-1)}`;
  }).join("");
}

/** 5 枚の花びらの花 */
function Flower({ cx, cy, d, r, cls }: { cx: number; cy: number; d: number; r: number; cls: string }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => {
        const a = ((-90 + i * 72) * Math.PI) / 180;
        return <circle key={i} className={cls} cx={f2(cx + d * Math.cos(a))} cy={f2(cy + d * Math.sin(a))} r={r} />;
      })}
      <circle className="y" cx={cx} cy={cy} r={r * 0.62} />
    </>
  );
}

/** 雲。dx・dy でずらす */
const cloud = (dx = 0, dy = 0) =>
  `M${9 + dx} ${24 + dy}h14.5a5.5 5.5 0 0 0 .8-10.9A7.5 7.5 0 0 0 ${10 + dx} ${12 + dy}a6 6 0 0 0-1 12z`;

/* ---------- よく使う形 ---------- */

const BOWL = "M4 15h24c0 6.6-5.4 11.5-12 11.5S4 21.6 4 15z";
const MUG = "M7 11.5h15V21a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6z";
const STEAM = (y = 8.5) => `M12 ${y}c-1.3-1.5 1.3-2.5 0-4.3M16.5 ${y}c-1.3-1.5 1.3-2.5 0-4.3`;
const HAND =
  "M10 27.5v-7.3L6.6 15a1.9 1.9 0 0 1 3.1-2.2l1.8 2.2V7.2a1.8 1.8 0 0 1 3.6 0v-1.6a1.8 1.8 0 0 1 3.6 0V7a1.8 1.8 0 0 1 3.6 0v3a1.8 1.8 0 0 1 3.6 0v9.5c0 4.5-3.2 8-7.5 8z";
const HAND_LINES = "M15.1 13.5V8M18.7 13.5V7.5M22.3 14V10.5";
const PHONE = <rect className="w" x="9.5" y="3" width="13" height="26" rx="3" />;
const TSHIRT = "M11 5 4.5 8.5 2.5 14 7 16v11.5h18V16l4.5-2-2-5.5L21 5c-.5 2-2.5 3.5-5 3.5S11.5 7 11 5z";
const STALL = (
  <>
    <path className="thin" d="M3 4c4.3 2.6 8.7 2.6 13 0s8.7-2.6 13 0" />
    {[
      [6.2, 5.4],
      [12.8, 5.4],
      [19.2, 2.6],
      [25.8, 2.6],
    ].map(([x, y]) => (
      <circle key={x} className="y" cx={x} cy={y! + 1.2} r="1.3" />
    ))}
    <path d="M6 15v12.5M26 15v12.5M3.5 27.5h25" />
    <path className="f" d="M4 14 6.5 9h19l2.5 5z" />
    <path className="w" d="M4 14h24c0 1.6-1.5 2.4-3 2.4S22 15.6 22 14c0 1.6-1.5 2.4-3 2.4S16 15.6 16 14c0 1.6-1.5 2.4-3 2.4S10 15.6 10 14c0 1.6-1.5 2.4-3 2.4S4 15.6 4 14z" />
    <path className="w" d="M5 20.5h22v4H5z" />
  </>
);

/** バブルティー。pearls はタピオカの数、cubes は角砂糖（-1 なら砂糖なしの印） */
function Tea({ pearls, cubes }: { pearls: number; cubes: number }) {
  const spots = [
    [12.5, 25.5],
    [15.5, 25.8],
    [18.2, 25.3],
    [11.8, 22.8],
    [14.6, 23],
    [17.5, 22.6],
    [12.4, 20.2],
    [15.3, 20.4],
    [18.2, 20],
  ].slice(0, pearls);
  return (
    <>
      <path d="M16.5 8 19 2.5" className="thick" />
      <path className="f" d="M9 10.5h12l-1.6 17.5h-8.8z" />
      {spots.map(([x, y]) => (
        <circle key={`${x}${y}`} className="d n" cx={x} cy={y} r="1.2" />
      ))}
      <rect className="w" x="8" y="8.2" width="14" height="2.6" rx="1.3" />
      {Array.from({ length: Math.max(cubes, 0) }, (_, i) => (
        <rect key={i} className="w" x="23.5" y={23 - i * 5.5} width="5" height="5" rx="1" />
      ))}
      {cubes < 0 && (
        <>
          <rect className="w dash" x="23.5" y="23" width="5" height="5" rx="1" />
          <path d="M22.5 29.5 29.5 21.5" />
        </>
      )}
      {pearls > 6 && <path className="thick" d="M26 12.5v6M23 15.5h6" />}
    </>
  );
}

/** 唐辛子 1 本。x・y はまん中、a は傾き、s は大きさ */
function Chili({ x, y, a = 0, s = 1, cls = "r" }: { x: number; y: number; a?: number; s?: number; cls?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
      <path className={cls} d="M3-9c2 1 3 4 2 8-1.4 5-5 8-9 9 2.5-2.5 4-6 3.5-10C-.8-5 .5-9 3-9z" />
      <path className="gs" d="M3-9c0-1.6 1-2.6 2.6-3" />
    </g>
  );
}

/** 強さの目盛り（4 本のうち n 本を塗る）。hot なら赤 */
function Meter({ n, hot = false }: { n: number; hot?: boolean }) {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          className={i < n ? (hot ? "r" : "d") : "w"}
          x={20 + i * 2.6}
          y={28 - (i + 1) * 3.4}
          width="1.8"
          height={(i + 1) * 3.4}
          rx=".6"
        />
      ))}
    </>
  );
}

/** エアコン本体と、風・雪 */
function Aircon({ wind, snow = false }: { wind: number; snow?: boolean }) {
  const lines = ["M9.5 18c1.5 1.5 1.5 3.5 0 5", "M16 18c1.5 1.5 1.5 3.5 0 5.5", "M22.5 18c1.5 1.5 1.5 3.5 0 5"];
  const pick = wind === 1 ? [lines[1]!] : lines;
  return (
    <>
      <rect className="w" x="4" y="5" width="24" height="9.5" rx="2.5" />
      <path className="thin" d="M7 11.5h18" />
      <circle className="g n" cx="24.5" cy="8" r=".9" />
      {pick.map((d) => (
        <path key={d} className="bs" d={d} />
      ))}
      {snow && <path className="bs thin" d={`${snowflake(7, 26, 2.6)}${snowflake(25.5, 25.5, 2.6)}`} />}
    </>
  );
}

/** スマホケース。kind で柄を変える */
function PhoneCase({ kind }: { kind: "cute" | "simple" | "flip" | "bare" }) {
  if (kind === "flip")
    return (
      <>
        <rect className="br" x="3" y="4" width="12.5" height="24" rx="2.5" />
        <path className="thin" d="M6 9h6.5" />
        <rect className="w" x="16.5" y="4" width="12.5" height="24" rx="2.5" />
        <rect className="f n" x="18.3" y="7" width="9" height="16" rx="1" />
      </>
    );
  return (
    <>
      <rect className={kind === "cute" ? "f" : kind === "simple" ? "gy" : "w"} x="8.5" y="3" width="15" height="26" rx="3.5" />
      <rect className="d" x="10.5" y="5" width="4.5" height="5" rx="1.4" />
      {kind === "cute" &&
        [
          [19.5, 8],
          [13, 15],
          [19, 19],
          [12.5, 23.5],
          [19.5, 25.5],
        ].map(([x, y]) => <path key={`${x}${y}`} className="w n" d={heart(x!, y!, 2.4)} />)}
      {kind === "bare" && <path className="ys" d="M25.5 4.5v4M23.5 6.5h4M5 22v3M3.5 23.5h3" />}
    </>
  );
}

/** 「どっちが？」の人。seat の色で塗る */
const person = (cx: number, cls: string, head = 5, body = 9) => (
  <>
    <circle className={`${cls} n`} cx={cx} cy={16 - body * 0.6} r={head} />
    <path className={`${cls} n`} d={`M${cx - body} ${16 + body * 1.2}a${body} ${body} 0 0 1 ${body * 2} 0z`} />
  </>
);

export const PICS: Record<string, ReactNode> = {
  /* ---------- どっちが？ ---------- */
  p0: person(16, "s0"),
  p1: person(16, "s1"),
  both: (
    <>
      {person(11, "s0", 3.8, 6.5)}
      {person(21, "s1", 3.8, 6.5)}
      <path className="a n" d={heart(16, 6, 3.2)} />
    </>
  ),
  neither: (
    <>
      <circle className="dash" cx="10.5" cy="14.5" r="3.6" />
      <path className="dash" d="M4 27a6.5 6.5 0 0 1 13 0z" />
      <circle className="dash" cx="21.5" cy="14.5" r="3.6" />
      <path className="dash" d="M15 27a6.5 6.5 0 0 1 13 0z" />
      <path className="thick" d="M13.5 3l5 5M18.5 3l-5 5" />
    </>
  ),

  /* ---------- たべもの ---------- */
  tea3: <Tea pearls={3} cubes={3} />,
  tea1: <Tea pearls={3} cubes={1} />,
  tea0: <Tea pearls={3} cubes={-1} />,
  teaPearls: <Tea pearls={9} cubes={0} />,
  ramen: (
    <>
      <path d="M8 3.5l5.5 10M12 2.5l4.5 10.5" />
      <path d="M7.5 15c1.2-2 2.4-2 3.6 0s2.4 2 3.6 0 2.4-2 3.6 0" />
      <circle className="w" cx="22.5" cy="12.5" r="3.4" />
      <circle className="y n" cx="22.5" cy="12.5" r="1.6" />
      <path className="f" d={BOWL} />
      <path d="M12 28.5h8" />
    </>
  ),
  udon: (
    <>
      <path className="thick" d="M8.5 15c0-5 3.5-5 3.5 0M13 15c0-6 3.5-6 3.5 0M17.5 15c0-5 3.5-5 3.5 0" />
      <circle className="w" cx="24" cy="12" r="3" />
      <path className="rs thin" d="M24 12a.9.9 0 1 1 .9.9 1.8 1.8 0 1 1 .9-1.9" />
      <path className="f" d={BOWL} />
      <path className="gs" d="M9 19.5h1M13 21h1M18 19.5h1" />
      <path d="M12 28.5h8" />
    </>
  ),
  padthai: (
    <>
      <ellipse className="w" cx="16" cy="22.5" rx="13" ry="5.5" />
      <path className="tan" d="M6.5 22c.5-6.5 18.5-6.5 19 0-2 2-17 2-19 0z" />
      <path className="thin" d="M9.5 19.5c1.3-1.2 2.7 1.2 4 0s2.7 1.2 4 0 2.7 1.2 4 0" />
      <path className="g" d="M20 16.5a6 6 0 0 1 6-6v6z" />
      <circle className="br n" cx="11" cy="16.5" r=".9" />
      <circle className="br n" cx="14" cy="15.5" r=".9" />
      <circle className="br n" cx="16.5" cy="17" r=".9" />
    </>
  ),
  pasta: (
    <>
      <ellipse className="w" cx="14" cy="22.5" rx="11.5" ry="5" />
      <path className="y" d="M6 22c0-6.5 16-6.5 16 0-2 2-14 2-16 0z" />
      <path className="thin" d="M9 20.5c2-3 8-3 10 0M11 18.5c1.5-1.5 4.5-1.5 6 0" />
      <path className="r" d="M11 17c1-2 5-2 6 0-1.5 1.5-4.5 1.5-6 0z" />
      <path d="M25 3v4.5a2 2 0 0 0 4 0V3M27 3v4.5M27 9.5V27" />
    </>
  ),
  iceCream: (
    <>
      <path className="tan" d="M10.5 15.5 16 29l5.5-13.5z" />
      <path className="thin" d="M12.5 19.5l5.5 3M14 23.5l2.8 1.6M19.5 18l-5 6" />
      <path className="f" d="M9.5 15.5a6.5 6.5 0 0 1 13 0c0 1.2-1 1.7-2 1-1 1-2 1-3 0-1 1-2 1-3 0-1 1-2 1-3 0-1 .7-2 .2-2-1z" />
      <circle className="r" cx="16" cy="7" r="2" />
      <path d="M16 5c0-1.5 1-2.5 2.5-3" />
    </>
  ),
  cake: (
    <>
      <path className="w" d="M6 16h20v9.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 6 25.5z" />
      <path className="thin" d="M6 22h20" />
      <path className="f" d="M6 16h20v2.5c-1.7 1.5-3.3 1.5-5 0-1.7 1.5-3.3 1.5-5 0-1.7 1.5-3.3 1.5-5 0-1.7 1.5-3.3 1.5-5 0z" />
      <path className="r" d="M16 7.5c-2.6 0-3.6 2.4-3 4.4.6 2 3 3.6 3 3.6s2.4-1.6 3-3.6c.6-2-.4-4.4-3-4.4z" />
      <path className="gs" d="M14 7.8c1 .3 1.5 0 2-1.5.5 1.5 1 1.8 2 1.5" />
    </>
  ),
  kakigori: (
    <>
      <path d="M21 10 25.5 3" />
      <path className="f" d="M7.5 17a8.5 8 0 0 1 17 0z" />
      <path className="ws" d="M11.5 12.5c1.2-1.4 2.6-2.1 4.5-2.3" />
      <path className="w" d="M6 17h20l-3.5 5.5h-13z" />
      <path d="M13 22.5v4h6v-4M11 27h10" />
    </>
  ),
  pudding: (
    <>
      <path d="M4.5 27h23" />
      <path className="y" d="M9 26.5 11.5 13h9L23 26.5z" />
      <path className="br" d="M11.5 13h9l.7 3.6c-3.2 1.6-7.2 1.6-10.4 0z" />
      <circle className="r" cx="16" cy="10" r="2.2" />
      <path d="M16 7.8c0-1.6.8-2.8 2.4-3.3" />
    </>
  ),
  chili0: (
    <>
      <Chili x={16} y={17} a={20} cls="w" />
      <path className="thick" d="M6 26 26 6" />
    </>
  ),
  chili1: <Chili x={16} y={17} a={20} />,
  chili2: (
    <>
      <Chili x={11} y={17} a={-5} s={0.9} />
      <Chili x={21} y={16} a={25} s={0.9} />
    </>
  ),
  chili3: (
    <>
      <Chili x={8.5} y={18} a={-20} s={0.75} />
      <Chili x={16} y={15} a={5} s={0.75} />
      <Chili x={23.5} y={18} a={30} s={0.75} />
      <path className="o" d="M14 29c-2-1.5-1.5-4 .5-5 0 1 .5 1.5 1.2 1.5-.2-1.5.5-3 1.8-3.5-.2 1.6.6 2.2 1.3 3 .4-.4.5-1 .4-1.6 1.6 1.4 1.4 4.6-1.2 5.6z" />
    </>
  ),
  rice: (
    <>
      <path className="w" d="M6.5 15.5c0-6.5 19-6.5 19 0z" />
      <path className="f" d={BOWL} />
      <path d="M13.5 12.5 29 6.5M14.5 14.5 29.5 9.5" />
    </>
  ),
  bread: (
    <>
      <path className="tan" d="M8 27.5V15.2C5.3 14.3 4.5 11.8 5.4 9.6 6.6 6.8 9.5 5.5 13 5.5h6c3.5 0 6.4 1.3 7.6 4.1.9 2.2.1 4.7-2.6 5.6v12.3z" />
      <path className="w n" d="M10 25.5V13.9c-2-.6-2.7-2.2-2-3.7.8-1.9 3-2.7 5-2.7h6c2 0 4.2.8 5 2.7.7 1.5 0 3.1-2 3.7v11.6z" />
    </>
  ),
  porridge: (
    <>
      <path d={STEAM(11)} />
      <path className="f" d={BOWL} />
      <ellipse className="w" cx="16" cy="15" rx="12" ry="2" />
      <circle className="y n" cx="13" cy="15" r="1.4" />
      <path className="gs" d="M17.5 14.6h1M20 15.4h1" />
      <path d="M21.5 15.5 27.5 5.5" className="thick" />
      <path d="M12 28.5h8" />
    </>
  ),
  coffee: (
    <>
      <path d={STEAM()} />
      <path d="M22 14h1.8a3.7 3.7 0 0 1 0 7.4H21.5" />
      <path className="f" d={MUG} />
      <path className="br n" d="M8.5 13h12v1.8h-12z" />
    </>
  ),
  tea: (
    <>
      <path d={STEAM(9)} />
      <path d="M24 14.5h.8a3 3 0 0 1 0 6H23" />
      <path className="w" d="M5.5 12.5h19v2a9.5 9.5 0 0 1-19 0z" />
      <ellipse className="tan" cx="15" cy="12.8" rx="9.5" ry="1.6" />
      <path className="w" d="M4.5 25.5h21a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2z" />
    </>
  ),
  juice: (
    <>
      <path d="M16.5 11 20 3h3" />
      <path className="w" d="M9 9h13l-1.8 19h-9.4z" />
      <path className="o" d="M9.5 14h12l-1.3 14h-9.4z" />
      <circle className="y" cx="22.5" cy="9.5" r="3.8" />
      <path className="thin" d="M22.5 9.5V5.7M22.5 9.5l3.3 1.9M22.5 9.5l-3.3 1.9" />
    </>
  ),
  cocoa: (
    <>
      <path d={STEAM(7.5)} />
      <path d="M22 14h1.8a3.7 3.7 0 0 1 0 7.4H21.5" />
      <path className="br" d={MUG} />
      <rect className="w" x="9.5" y="9" width="4.5" height="4.5" rx="1.2" transform="rotate(-12 11.75 11.25)" />
      <rect className="w" x="15" y="9.5" width="4.5" height="4.5" rx="1.2" transform="rotate(10 17.25 11.75)" />
    </>
  ),
  onigiri: (
    <>
      <path className="w" d="M16 4.5c-1.8 0-3 .9-4 2.5L5.4 18.8C3.4 22.6 5.6 27 10 27h12c4.4 0 6.6-4.4 4.6-8.2L20 7c-1-1.6-2.2-2.5-4-2.5z" />
      <path className="d" d="M11.5 19.5h9V27h-9z" />
    </>
  ),
  cupcake: (
    <>
      <path className="f" d="M8.5 18h15l-2 9.5h-11z" />
      <path className="thin" d="M12.5 18l.6 9.5M16 18v9.5M19.5 18l-.6 9.5" />
      <path className="w" d="M7.5 18.5c-1.8-3.5 1-6.5 4-6 .8-4 8.2-4 9 0 3-.5 5.8 2.5 4 6z" />
      <circle className="r" cx="16" cy="7.5" r="2.2" />
    </>
  ),
  karaage: (
    <>
      <path d="M20 9.5 25 3" />
      <path className="tan" d="M8.5 16.5c-2.2-3 0-6.8 3.5-6.2.5-3.2 5.5-3.6 6.8-1 2.6-2 7.2-.4 6.5 3.2 2 1 1.6 3.4.5 4z" />
      <path className="thin" d="M12 12.5l1 1M17 11l.8 1.2M21.5 13l1 .8" />
      <path className="w" d="M7 16h18l-2.5 11.5h-13z" />
      <path className="rs" d="M8 19.5h16" />
    </>
  ),
  bottle: (
    <>
      <path className="b" d="M13.5 6.5h5l2.5 4V26a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V10.5z" />
      <rect className="w" x="13" y="3" width="6" height="3.5" rx="1" />
      <path className="w" d="M11 14h10v6H11z" />
    </>
  ),
  yakiniku: (
    <>
      <path d="M8 28l2.5-4.5M24 28l-2.5-4.5" />
      <ellipse className="w" cx="16" cy="17" rx="13" ry="7" />
      <path className="thin" d="M5 14.5h22M4 17h24M5 19.5h22" />
      <path className="r" d="M7.5 14.5c2-2 6-2 7.5 0s-1 3.5-4 3.5-5-1.5-3.5-3.5z" />
      <path className="r" d="M17 17.5c2-2 6-2 7.5 0s-1 3.5-4 3.5-5-1.5-3.5-3.5z" />
      <path d="M23 3.5l-4 8.5M26.5 4.5l-5.5 8" />
    </>
  ),
  sushi: (
    <>
      <rect className="w" x="6" y="16" width="20" height="9" rx="4.5" />
      <path className="o" d="M4.5 15.5c2-4.5 21-4.5 23 0 .3 1.8-1.5 3-4 3h-15c-2.5 0-4.3-1.2-4-3z" />
      <path className="ws" d="M10 13l1.6 4.5M15 12l1.6 5.5M20 12.5l1.6 5" />
    </>
  ),
  thai: (
    <>
      <path d={STEAM(9.5)} />
      <path className="f" d={BOWL} />
      <ellipse className="o" cx="16" cy="15" rx="12" ry="2" />
      <path className="g" d="M19 14.5c1-2.5 4-3.5 6-3-1 2.5-3.5 3.5-6 3z" />
      <path className="rs thick" d="M10 14.8a2.4 2.4 0 1 1 3.6 1" />
      <path d="M12 28.5h8" />
    </>
  ),
  hotpot: (
    <>
      <path d="M12 6.5c-1.2-1.4 1.2-2.4 0-4M16 6.5c-1.2-1.4 1.2-2.4 0-4M20 6.5c-1.2-1.4 1.2-2.4 0-4" />
      <path className="thick" d="M3 17h3.5M25.5 17H29" />
      <path className="f" d="M6 15.5h20V21a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" />
      <path className="w" d="M5 15.5a11 6 0 0 1 22 0z" />
      <rect className="d" x="14" y="8.2" width="4" height="2" rx="1" />
    </>
  ),
  mango: (
    <>
      <path className="y" d="M9.5 9.5c5.5-4 16-1 16.5 7.5.4 6.5-5 10.5-10.5 9.5C9 25.5 5 20.5 5.5 15.5c.2-2.5 1.5-4.5 4-6z" />
      <path className="o n" d="M23.5 21c-1.5 3-4.5 4.5-8 4.5 3-1.5 5.5-3.5 6.5-6.5z" />
      <path className="g" d="M14 8c-.5-3 2-5.5 5.5-5.5-.5 3-2.5 5.5-5.5 5.5z" />
    </>
  ),
  strawberry: (
    <>
      <path className="r" d="M16 10c6.5 0 10.5 2 9.5 6.5C24.5 21.5 20 26.5 16 27.5c-4-1-8.5-6-9.5-11C5.5 12 9.5 10 16 10z" />
      {[
        [12, 15],
        [16, 14.5],
        [20, 15],
        [14, 19],
        [18, 19],
        [16, 23],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} className="y n" cx={x} cy={y} r=".8" />
      ))}
      <path className="g" d="M9.5 10.5c2.5-.3 4.5-1 6.5-4 2 3 4 3.7 6.5 4-2 1.5-4.5 1.8-6.5 1-2 .8-4.5.5-6.5-1z" />
    </>
  ),
  watermelon: (
    <>
      <path className="g" d="M3 12.5a13 13 0 0 0 26 0z" />
      <path className="r" d="M5.5 12.5a10.5 10.5 0 0 0 21 0z" />
      {[
        [11, 15.5],
        [16, 17.5],
        [21, 15.5],
        [13.5, 20],
        [18.5, 20],
      ].map(([x, y]) => (
        <ellipse key={`${x}${y}`} className="d n" cx={x} cy={y} rx=".8" ry="1.2" />
      ))}
    </>
  ),
  grapes: (
    <>
      <path d="M15.5 9.5c0-2 .5-4 2-5.5" />
      <path className="g" d="M17 7c1-3 4.5-4.5 7.5-3.5-1 3-4.5 4.5-7.5 3.5z" />
      {[
        [10, 12.5],
        [16, 12.5],
        [22, 12.5],
        [13, 17.7],
        [19, 17.7],
        [16, 22.9],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} className="pu" cx={x} cy={y} r="3.2" />
      ))}
    </>
  ),

  /* ---------- おでかけ ---------- */
  sea: (
    <>
      <circle className="y" cx="22" cy="9" r="4.5" />
      <path className="b" d={water(17.5)} />
      <path className="ws" d={wave(22.5, 6, 26)} />
    </>
  ),
  mountain: (
    <>
      <path className="g" d="M2.5 26.5 12 10l4.8 8.3 3.4-4.8 9.3 13z" />
      <path className="w" d="M9.3 14.7 12 10l2.7 4.7-1.3 1-1.4-1.1-1.4 1.1z" />
    </>
  ),
  city: (
    <>
      <path d="M3 27.5h26" />
      <rect className="f" x="5" y="13" width="7" height="14.5" rx="1" />
      <rect className="w" x="12" y="6" width="9" height="21.5" rx="1" />
      <rect className="f" x="21" y="15" width="6.5" height="12.5" rx="1" />
      <path className="thin" d="M15 10h3M15 14h3M15 18h3M15 22h3M7.5 17h2M7.5 21h2M23 19h2M23 23h2" />
    </>
  ),
  sofa: (
    <>
      <path className="f" d="M7 16v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4z" />
      <path className="f" d="M4 16.5a2.5 2.5 0 0 1 5 0V19h14v-2.5a2.5 2.5 0 0 1 5 0V25H4z" />
      <path d="M6.5 25v2.5M25.5 25v2.5" />
    </>
  ),
  sofaZz: (
    <>
      <path className="f" d="M7 19v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4z" />
      <path className="f" d="M4 19.5a2.5 2.5 0 0 1 5 0V22h14v-2.5a2.5 2.5 0 0 1 5 0V27H4z" />
      <path d="M6.5 27v2M25.5 27v2" />
      <path d="M17 2.5h4.5l-4.5 4.5h4.5M23.5 6.5h3l-3 3h3" />
    </>
  ),
  dish: (
    <>
      <circle className="w" cx="16" cy="16" r="8" />
      <circle className="f" cx="16" cy="16" r="5" />
      <path d="M4 6v5a2 2 0 0 0 4 0V6M6 6v20" />
      <path d="M26 26V6c-2 1.5-3 5-3 9.5h3" />
    </>
  ),
  view: (
    <>
      <rect className="w" x="4" y="7" width="24" height="18" rx="2.5" />
      <path className="g" d="M5 24l7-9 4 5 3-3 8 7z" />
      <circle className="y" cx="21.5" cy="12" r="2.4" />
    </>
  ),
  shopping: (
    <>
      <path className="f" d="M7 11h18l-1.4 16.5H8.4z" />
      <path d="M12 14V9.5a4 4 0 0 1 8 0V14" />
      <path className="ws thick" d="M8 20h16" />
    </>
  ),
  bed: (
    <>
      <path d="M4 10v17.5M28 17v10.5" />
      <path className="w" d="M4 17h24v6H4z" />
      <rect className="f" x="5.5" y="13.5" width="7" height="4" rx="2" />
      <path className="f" d="M14 15.5h12a2 2 0 0 1 2 2V23H12v-5.5a2 2 0 0 1 2-2z" />
      <path className="thick" d="M4 23h24" />
    </>
  ),
  walk: (
    <>
      <path className="f" d="M10 4c2.2 0 3.3 2.5 3.3 5.5 0 2.5-1 4.5-3.3 4.5S6.7 12 6.7 9.5c0-3 1.1-5.5 3.3-5.5z" />
      <ellipse className="f" cx="10" cy="17" rx="2.4" ry="1.9" />
      <path className="f" d="M21.5 12c2.2 0 3.3 2.5 3.3 5.5 0 2.5-1 4.5-3.3 4.5s-3.3-2-3.3-4.5c0-3 1.1-5.5 3.3-5.5z" />
      <ellipse className="f" cx="21.5" cy="25" rx="2.4" ry="1.9" />
    </>
  ),
  bike: (
    <>
      <circle className="w" cx="8" cy="21" r="5" />
      <circle className="w" cx="24" cy="21" r="5" />
      <path d="M8 21l5-9.5h8M16.5 21 13 11.5M16.5 21l4.5-9.5 3 9.5M8 21h8.5M11 10.5h4M19.5 9h3.5l-2 2.5" />
    </>
  ),
  train: (
    <>
      <path d="M11 24l-3 4M21 24l3 4M9.5 28h13" />
      <rect className="f" x="7.5" y="4" width="17" height="20" rx="4.5" />
      <rect className="w" x="10" y="7" width="12" height="7" rx="1.6" />
      <circle className="y" cx="11.8" cy="19" r="1.5" />
      <circle className="y" cx="20.2" cy="19" r="1.5" />
    </>
  ),
  car: (
    <>
      <path className="f" d="M3.5 22.5v-4.3a2 2 0 0 1 1.6-2l2.9-.7 3.3-5a2 2 0 0 1 1.7-.9h8.4a2 2 0 0 1 1.6.8l3.8 5 1.7.5a2 2 0 0 1 1.5 2v4.6z" />
      <path className="w" d="M12 11.5h3.5v4H9.6zM18 11.5h3l3 4h-6z" />
      <circle className="w" cx="9.5" cy="22.5" r="3.2" />
      <circle className="w" cx="22.5" cy="22.5" r="3.2" />
    </>
  ),
  cinema: (
    <>
      <rect className="w" x="5" y="13.5" width="22" height="14" rx="2" />
      <path className="d" d="M4.4 9.8 25.6 5l.9 4-21.2 4.8z" />
      <path className="ws" d="M9.5 8.8l2.4 3.5M14.7 7.6l2.4 3.5M19.9 6.4l2.4 3.5" />
      <path className="d" d="M5 13.5h22V17H5z" />
      <path className="ws" d="M10 13.5 8 17M15.5 13.5l-2 3.5M21 13.5l-2 3.5M26.5 13.5l-2 3.5" />
    </>
  ),
  fish: (
    <>
      <circle cx="7.5" cy="8" r="1.6" />
      <circle cx="11.5" cy="5" r="1.1" />
      <path className="b" d="M21.5 16l6-5v10z" />
      <path className="b" d="M4.5 16c3.5-5.5 12.5-6.5 17.5 0-5 6.5-14 5.5-17.5 0z" />
      <circle className="d n" cx="9.5" cy="15" r="1.1" />
      <path className="thin" d="M14 12.5c1.5 2 1.5 5 0 7" />
      <path className="thin" d="M3 26c2.2 0 2.2 1.5 4.4 1.5S9.6 26 11.8 26M20 26c2.2 0 2.2 1.5 4.4 1.5S26.6 26 28.8 26" />
    </>
  ),
  mall: (
    <>
      <path d="M16 7.5V3l4 1.2-4 1.2" />
      <path className="f" d="M3.5 14h25v13.5h-25z" />
      <path className="w" d="M2.5 14 6 7.5h20l3.5 6.5z" />
      <path className="w" d="M13 27.5V20h6v7.5" />
      <rect className="w" x="6" y="17" width="4.5" height="4" rx=".6" />
      <rect className="w" x="21.5" y="17" width="4.5" height="4" rx=".6" />
    </>
  ),
  stall: STALL,
  nightView: (
    <>
      <path className="y" d="M23.5 3.5a5 5 0 1 0 5 7.5 4 4 0 0 1-5-7.5z" />
      <path className="y n" d={star(9, 6.5, 1.8, 0.7, 4)} />
      <path className="y n" d={star(15.5, 4, 1.4, 0.5, 4)} />
      <path className="d" d="M3 27.5V18h4.5v-4H12v6h3.5V10.5H21V20h3v-3h5v10.5z" />
      {[
        [5.3, 21],
        [9.7, 17],
        [9.7, 22],
        [17.3, 14],
        [19, 18],
        [17.3, 22],
        [26.5, 21],
      ].map(([x, y]) => (
        <rect key={`${x}${y}`} className="y n" x={x} y={y} width="1.6" height="1.8" rx=".3" />
      ))}
    </>
  ),
  mic: (
    <>
      <path d="M9.5 13.5a6.5 6.5 0 0 0 13 0M16 20v6M11.5 27.5h9" />
      <rect className="f" x="12" y="3.5" width="8" height="13.5" rx="4" />
      <path className="thin" d="M12 9h8M12 11.5h8" />
    </>
  ),
  nightCafe: (
    <>
      <path className="y" d="M23.5 1.8a4 4 0 1 0 4 6 3.2 3.2 0 0 1-4-6z" />
      <path className="y n" d={star(16, 5, 1.6, 0.6, 4)} />
      <path d="M22 14h1.8a3.7 3.7 0 0 1 0 7.4H21.5" />
      <path className="f" d={MUG} />
      <path className="br n" d="M8.5 13h12v1.8h-12z" />
    </>
  ),
  spring: (
    <>
      <Flower cx={16} cy={15} d={5.4} r={4.2} cls="f" />
      <path className="gs" d="M16 21v7" />
    </>
  ),
  sun: (
    <>
      <path
        className="ys thick"
        d={Array.from({ length: 8 }, (_, i) => {
          const a = (i * 45 * Math.PI) / 180;
          return `M${f2(16 + 9.5 * Math.cos(a))} ${f2(16 + 9.5 * Math.sin(a))}L${f2(16 + 12.5 * Math.cos(a))} ${f2(16 + 12.5 * Math.sin(a))}`;
        }).join("")}
      />
      <circle className="y" cx="16" cy="16" r="6.5" />
    </>
  ),
  autumn: (
    <>
      <path className="o" d="M16 3l2.2 5.5 4.3-2-1.2 5.5 6.2-1-3.5 5 3 2.5-6.5 1 1 4-5.5-2-5.5 2 1-4-6.5-1 3-2.5-3.5-5 6.2 1-1.2-5.5 4.3 2z" />
      <path d="M16 21.5V29M16 21.5V11" />
    </>
  ),
  snow: <path className="bs thick" d={snowflake(16, 16, 12)} />,
  coaster: (
    <>
      <path className="thin" d="M8 27.5v-7.5M13 27.5V15M18 27.5v-8M23 27.5V13" />
      <path className="thick" d="M3.5 27c3-12 7-17 10.5-11s6.5 7 9-2c1.5-5 3.5-7 5.5-6" />
      <g transform="translate(25.2 9.2) rotate(-40)">
        <rect className="r" x="-3.6" y="-3.6" width="7.2" height="3.8" rx="1.3" />
      </g>
      <path d="M3 27.5h26" />
    </>
  ),
  ferris: (
    <>
      <path d="M10 28l6-14 6 14M8 28h16" />
      <circle cx="16" cy="13.5" r="9.5" />
      <path className="thin" d="M16 4v19M6.5 13.5h19M9.3 6.8l13.4 13.4M22.7 6.8 9.3 20.2" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        return <circle key={i} className={i % 2 ? "y" : "f"} cx={f2(16 + 9.5 * Math.cos(a))} cy={f2(13.5 + 9.5 * Math.sin(a))} r="2.1" />;
      })}
      <circle className="d n" cx="16" cy="13.5" r="1.5" />
    </>
  ),
  carousel: (
    <>
      <path d="M16 2.5V4M8 14.5v11M24 14.5v11M16 14.5v6" />
      <path className="f" d="M4 12 16 4l12 8z" />
      <path className="w" d="M4 12h24c0 1.8-1.5 2.6-3 2.6S22 13.8 22 12c0 1.8-1.5 2.6-3 2.6S16 13.8 16 12c0 1.8-1.5 2.6-3 2.6S10 13.8 10 12c0 1.8-1.5 2.6-3 2.6S4 13.8 4 12z" />
      <path d="M12.5 22.5v2.5M19 22.5v2.5" />
      <path className="y" d="M10.5 22.5c0-2 2-3 4-3h4l2.5-3 2 1.2-1.5 3.2c.5.7.5 1.6 0 2.6z" />
      <path className="f" d="M4.5 25.5h23V28h-23z" />
    </>
  ),
  ghost: (
    <>
      <path d="M7.5 19c-2 0-3.5-1-4-2.5M24.5 19c2 0 3.5-1 4-2.5" />
      <path className="w" d="M7.5 28V14.5a8.5 8.5 0 0 1 17 0V28l-2.8-2.2-2.9 2.2-2.8-2.2-2.8 2.2-2.9-2.2z" />
      <ellipse className="d n" cx="13" cy="15" rx="1.3" ry="1.8" />
      <ellipse className="d n" cx="19" cy="15" rx="1.3" ry="1.8" />
      <ellipse className="f" cx="16" cy="20.5" rx="1.6" ry="1.3" />
    </>
  ),
  panda: (
    <>
      <circle className="d" cx="8.5" cy="9" r="3.6" />
      <circle className="d" cx="23.5" cy="9" r="3.6" />
      <circle className="w" cx="16" cy="17" r="10.5" />
      <ellipse className="d" cx="11.5" cy="16" rx="2.6" ry="3.4" transform="rotate(25 11.5 16)" />
      <ellipse className="d" cx="20.5" cy="16" rx="2.6" ry="3.4" transform="rotate(-25 20.5 16)" />
      <circle className="w n" cx="11.9" cy="15.4" r=".9" />
      <circle className="w n" cx="20.1" cy="15.4" r=".9" />
      <ellipse className="d" cx="16" cy="21" rx="1.8" ry="1.2" />
      <path className="thin" d="M14 23.3c1 .9 3 .9 4 0" />
    </>
  ),
  elephant: (
    <>
      <ellipse className="gy" cx="7.5" cy="14.5" rx="5.5" ry="7" />
      <ellipse className="gy" cx="24.5" cy="14.5" rx="5.5" ry="7" />
      <ellipse className="f n" cx="7.5" cy="14.5" rx="3" ry="4.5" />
      <ellipse className="f n" cx="24.5" cy="14.5" rx="3" ry="4.5" />
      <circle className="gy" cx="16" cy="13.5" r="7.5" />
      <path className="gy" d="M13.5 18h5v5.5c0 2.5 1.5 3.5 3.5 3.2v2.3c-4 .5-8.5-1-8.5-5.5z" />
      <circle className="d n" cx="13" cy="12" r="1.1" />
      <circle className="d n" cx="19" cy="12" r="1.1" />
    </>
  ),
  giraffe: (
    <>
      <path d="M15.5 6V3M20 6V3" />
      <circle className="br" cx="15.5" cy="2.8" r="1.2" />
      <circle className="br" cx="20" cy="2.8" r="1.2" />
      <path className="y" d="M15 28.5 17 13h5l-1 15.5z" />
      <path className="y" d="M9.5 10c0-2.2 1.6-4 3.8-4H20a3.5 3.5 0 0 1 3.5 3.5v1.5a3.5 3.5 0 0 1-3.5 3.5h-6.5c-2.2 0-4-1.8-4-4z" />
      <path className="y" d="M23 7.5l3.5-1.5-1 3.5" />
      <circle className="d n" cx="17" cy="9.3" r="1.1" />
      <circle className="br n" cx="18.8" cy="17.5" r="1.3" />
      <circle className="br n" cx="18.6" cy="22.5" r="1.3" />
      <circle className="br n" cx="17.4" cy="26.5" r="1" />
      <path className="thin" d="M11 11.5h.8" />
    </>
  ),
  penguin: (
    <>
      <path className="os thick" d="M10.5 27.8h4M17.5 27.8h4" />
      <ellipse className="d" cx="16" cy="17" rx="8" ry="10.5" />
      <path className="w" d="M16 10.5c3.8 0 5.5 4 5.5 8.5S19.5 26.5 16 26.5 10.5 23.5 10.5 19 12.2 10.5 16 10.5z" />
      <circle className="w n" cx="13.3" cy="10" r="1.4" />
      <circle className="w n" cx="18.7" cy="10" r="1.4" />
      <path className="o" d="M14.5 12.8h3L16 15z" />
    </>
  ),
  swim: (
    <>
      <path className="thick" d="M14 16.5c3-4 8-6 13-5" />
      <circle className="f" cx="11" cy="15" r="3.4" />
      <path className="thin" d="M5.5 12.5 4 11M7 10l-.5-2" />
      <path className="b" d={water(18.5)} />
      <path className="ws" d={wave(23.5, 6, 26)} />
    </>
  ),
  sandcastle: (
    <>
      <path d="M16 13V6.5" />
      <path className="r" d="M16 6.5h4.5L19 8l1.5 1.5H16z" />
      <path className="tan" d="M10 19.5v-6.5h2.5v1.5h2V13h3v1.5h2V13H22v6.5z" />
      <path className="tan" d="M4.5 27.5v-8.5h3v2h3v-2h3v2h5v-2h3v2h3v-2h3v8.5z" />
      <path d="M14.3 27.5V24a1.7 1.7 0 0 1 3.4 0v3.5" />
    </>
  ),
  parasol: (
    <>
      <path d="M16 5v22.5M7.5 27.5h17" />
      <path className="f" d="M3.5 14a12.5 9 0 0 1 25 0c-2 1.5-4.2 1.5-6.2 0-2 1.5-4.3 1.5-6.3 0-2 1.5-4.3 1.5-6.3 0-2 1.5-4.2 1.5-6.2 0z" />
      <path className="thin" d="M16 5.3c-3 2-4.5 5-4.7 8.7M16 5.3c3 2 4.5 5 4.7 8.7" />
    </>
  ),
  shell: (
    <>
      <path className="f" d="M16 27.5 5.5 14.5C4.5 9.5 9.5 5 16 5s11.5 4.5 10.5 9.5z" />
      <path className="thin" d="M16 27.5 9.5 7.5M16 27.5l-3-21.8M16 27.5V5M16 27.5l3-21.8M16 27.5l6.5-20" />
      <path className="f" d="M13 27h6l-1 2h-4z" />
    </>
  ),

  /* ---------- おうち ---------- */
  ...Object.fromEntries(
    [1, 2, 3, 4].map((n) => [
      `press${n}`,
      <>
        <g transform="translate(-1.5 2.5) scale(.78)">
          <path className="f" d={HAND} />
          <path className="thin" d={HAND_LINES} />
        </g>
        <Meter n={n} hot={n === 4} />
        {n === 4 && <path className="rs thick" d="M27 4.5v5M27 12.5v.2" />}
      </>,
    ]),
  ),
  tv: (
    <>
      <path d="M12 27h8M16 22.5V27" />
      <rect className="w" x="4" y="6.5" width="24" height="16" rx="2.5" />
      <path className="r n" d="M14 11v7l6-3.5z" />
    </>
  ),
  cook: (
    <>
      <path className="thick" d="M21 12.5 28.5 7" />
      <circle className="d" cx="13.5" cy="17" r="9.5" />
      <path className="w" d="M9 15.5c0-3 3-4.5 5.5-3.5 2.5-1 5.5 1 4.5 4 1.5 2-.5 5-3 4.5-2 2-5.5 1-5.5-1.5-1.5-.5-2-2.5-1.5-3.5z" />
      <circle className="y n" cx="14" cy="16.5" r="2.4" />
    </>
  ),
  nap: (
    <>
      <path className="f" d="M5 22c0-3 2-4.5 5-4.5h12c3 0 5 1.5 5 4.5s-2 4.5-5 4.5H10c-3 0-5-1.5-5-4.5z" />
      <path className="thin" d="M9 20.5c1.5 1 3 1 4.5 0" />
      <path d="M13 4h5l-5 5h5M20.5 10.5h3.5l-3.5 3.5h3.5" />
    </>
  ),
  game: (
    <>
      <path className="f" d="M9 11h14a6 6 0 0 1 5.8 7.4l-1 4a3 3 0 0 1-5.1 1.3L20 21h-8l-2.7 2.7a3 3 0 0 1-5.1-1.3l-1-4A6 6 0 0 1 9 11z" />
      <path d="M9.5 14.5v4.5M7.25 16.75h4.5" />
      <circle className="d n" cx="22" cy="15" r="1.3" />
      <circle className="d n" cx="24.8" cy="17.8" r="1.3" />
    </>
  ),
  phone: (
    <>
      {PHONE}
      <rect className="f n" x="11.5" y="6.5" width="9" height="17" rx="1" />
      <path d="M14.5 26h3" />
      <circle className="r" cx="22" cy="5" r="3" />
    </>
  ),
  wash: (
    <>
      <circle className="w" cx="16" cy="18" r="9" />
      <path d="M11.8 17c.8.8 2 .8 2.8 0M17.4 17c.8.8 2 .8 2.8 0" />
      <path className="thin" d="M14 22c1 .8 3 .8 4 0" />
      <path className="b" d={drop(6, 7, 1.3)} />
      <path className="b" d={drop(26, 8, 1.1)} />
      <path className="b" d={drop(16, 4.5, 0.9)} />
    </>
  ),
  water: (
    <>
      <path className="w" d="M8.5 5h15l-2.2 22.5h-10.6z" />
      <path className="b" d="M9.3 13h13.4l-1.4 14.5h-10.6z" />
      <path className="ws" d="M12 17v5" />
    </>
  ),
  dog: (
    <>
      <circle className="tan" cx="16" cy="16.5" r="9.5" />
      <path className="br" d="M9 7.5C5.5 7 3.5 10.5 4 15.5c.3 2.5 2.5 3 4 1.5z" />
      <path className="br" d="M23 7.5c3.5-.5 5.5 3 5 8-.3 2.5-2.5 3-4 1.5z" />
      <circle className="d n" cx="12.5" cy="14.5" r="1.3" />
      <circle className="d n" cx="19.5" cy="14.5" r="1.3" />
      <ellipse className="w" cx="16" cy="20.5" rx="4.5" ry="3.5" />
      <ellipse className="d" cx="16" cy="19" rx="1.8" ry="1.3" />
      <path className="thin" d="M16 20.3v1.5M14 22.5c1 .8 3 .8 4 0" />
    </>
  ),
  cat: (
    <>
      <path className="gy" d="M7 12.5 6.5 4.5l6 4.2a10 10 0 0 1 7 0l6-4.2-.5 8A9.5 9.5 0 0 1 16 27.5 9.5 9.5 0 0 1 7 12.5z" />
      <path className="f n" d="M8.2 7.4l3 2.2-2.6 1.6zM23.8 7.4l-3 2.2 2.6 1.6z" />
      <ellipse className="d n" cx="12.5" cy="16" rx="1.2" ry="1.7" />
      <ellipse className="d n" cx="19.5" cy="16" rx="1.2" ry="1.7" />
      <path className="f" d="M15 19.5h2l-1 1.2z" />
      <path className="thin" d="M3.5 18.5l6 1M3.5 22l6-1M28.5 18.5l-6 1M28.5 22l-6-1" />
    </>
  ),
  rabbit: (
    <>
      <path className="w" d="M11.5 15c-2.5-4-3-12 0-12.5s3.5 7.5 2.5 12z" />
      <path className="w" d="M20.5 15c2.5-4 3-12 0-12.5s-3.5 7.5-2.5 12z" />
      <path className="f n" d="M11.7 12.5c-1.2-3-1.4-7.5 0-8 1.3.5 1.5 5 .9 8z" />
      <path className="f n" d="M20.3 12.5c1.2-3 1.4-7.5 0-8-1.3.5-1.5 5-.9 8z" />
      <circle className="w" cx="16" cy="20.5" r="8" />
      <circle className="d n" cx="13" cy="19.5" r="1.1" />
      <circle className="d n" cx="19" cy="19.5" r="1.1" />
      <path className="f" d="M15 22h2l-1 1.1z" />
      <ellipse className="f n" cx="10.8" cy="23" rx="1.5" ry="1" />
      <ellipse className="f n" cx="21.2" cy="23" rx="1.5" ry="1" />
    </>
  ),
  goldfish: (
    <>
      <circle cx="5.5" cy="8" r="1.4" />
      <circle cx="8.5" cy="5" r="1" />
      <path className="o" d="M12 11c1-2.5 3.5-3 5-2-1 1-2 2-2 3z" />
      <path className="o" d="M19.5 16c3-4.5 7-6 8.5-4.5-1 1.6-1 3.4 0 4.5-1 1.1-1 2.9 0 4.5-1.5 1.5-5.5 0-8.5-4.5z" />
      <path className="o" d="M5 16c2.5-5.5 11-6.5 15 0-4 6.5-12.5 5.5-15 0z" />
      <circle className="d n" cx="9.5" cy="15" r="1.1" />
    </>
  ),
  plant: (
    <>
      <path d="M16 18V9" />
      <path className="g" d="M16 13.5c-1-3.5-4.5-5.5-8-4.5 1 3.5 4.5 5.5 8 4.5z" />
      <path className="g" d="M16 10.5c.5-3.5 4-6.5 8-6-.5 4-4 6.5-8 6z" />
      <path className="g" d="M16 16.5c1-2.5 4-3.5 6.5-3-.8 2.6-3.8 3.8-6.5 3z" />
      <path className="o" d="M10 20h12l-1.6 8h-8.8z" />
      <path className="o" d="M8.5 17.5h15V20h-15z" />
    </>
  ),
  bigTv: (
    <>
      <path d="M9 27.5l3-4.5M23 27.5l-3-4.5" />
      <rect className="w" x="2.5" y="5.5" width="27" height="17.5" rx="2" />
      <rect className="f n" x="4.5" y="7.5" width="23" height="13.5" rx="1" />
      <path className="ws thick" d="M8 17.5l5-6.5M12 18l3.5-4.5" />
    </>
  ),
  cloudy: (
    <>
      <circle className="y" cx="10" cy="10" r="4.5" />
      <path className="w" d={cloud(1, 1)} />
    </>
  ),
  rain: (
    <>
      <path className="w" d={cloud(0, -6)} />
      <path className="bs thick" d="M10 22l-1.5 4M16 22l-1.5 4M22 22l-1.5 4" />
    </>
  ),
  snowman: (
    <>
      <circle className="w" cx="16" cy="22" r="6.5" />
      <circle className="w" cx="16" cy="12" r="4.8" />
      <path className="d" d="M11.8 8.3h8.4M13.2 8.3V4h5.6v4.3z" />
      <path className="r" d="M11.5 15.4c3 1.6 6 1.6 9 0v2.2c-3 1.4-6 1.4-9 0z" />
      <path className="o" d="M16 12l3.5.8-3.5.8z" />
      <circle className="d n" cx="14.3" cy="11" r=".8" />
      <circle className="d n" cx="17.7" cy="11" r=".8" />
    </>
  ),
  bathtub: (
    <>
      <path d="M6 15V7.5a2.5 2.5 0 0 1 5 0" />
      <circle className="w" cx="11" cy="12.5" r="2.4" />
      <circle className="w" cx="15.5" cy="11" r="2.8" />
      <circle className="w" cx="20.5" cy="12.5" r="2.2" />
      <circle className="w" cx="24" cy="10.5" r="1.6" />
      <path className="f" d="M3 15h26v3.5a7.5 7.5 0 0 1-7.5 7.5h-11A7.5 7.5 0 0 1 3 18.5z" />
      <path d="M8 26l-1 2.5M24 26l1 2.5" />
    </>
  ),
  shower: (
    <>
      <path d="M7 28.5V8.5a4.5 4.5 0 0 1 9 0V10" />
      <path className="f" d="M11.5 10h9l1.5 3.5h-12z" />
      <path className="bs" d="M12 16.5l-1 3M16 16.5v3.5M20 16.5l1 3M13.5 22.5l-.5 2.5M18.5 22.5l.5 2.5" />
    </>
  ),
  showerSun: (
    <>
      <path className="ys" d="M26 1.5v1.6M30 5.5h-1.6M28.8 2.7l-1.1 1.1M22 5.5h1.6M23.2 2.7l1.1 1.1" />
      <circle className="y" cx="26" cy="6" r="2.3" />
      <path d="M7 28.5V8.5a4.5 4.5 0 0 1 9 0V10" />
      <path className="f" d="M11.5 10h9l1.5 3.5h-12z" />
      <path className="bs" d="M12 16.5l-1 3M16 16.5v3.5M20 16.5l1 3M13.5 22.5l-.5 2.5M18.5 22.5l.5 2.5" />
    </>
  ),
  twice: (
    <>
      <circle className="y" cx="8" cy="8.5" r="3.5" />
      <path className="ys" d="M8 2.5v-1M8 15.5v-1M2 8.5H1M15 8.5h-1M3.8 4.3l-.7-.7M12.2 4.3l.7-.7" />
      <path className="y" d="M23.5 4a4.5 4.5 0 1 0 4.5 6.5 3.6 3.6 0 0 1-4.5-6.5z" />
      <path className="b" d={drop(16, 21, 2.4)} />
    </>
  ),
  acCold: <Aircon wind={3} snow />,
  acCool: <Aircon wind={3} />,
  acMild: <Aircon wind={1} />,
  fan: (
    <>
      <path d="M16 21.5v5M11 27.5h10" />
      <circle className="w" cx="16" cy="12.5" r="9" />
      {[0, 120, 240].map((a) => (
        <ellipse key={a} className="b" cx="16" cy="8.3" rx="2.4" ry="4" transform={`rotate(${a} 16 12.5)`} />
      ))}
      <circle className="d n" cx="16" cy="12.5" r="1.6" />
    </>
  ),
  dark: (
    <>
      <rect className="d" x="4.5" y="4.5" width="23" height="23" rx="5" />
      <path className="y n" d="M17 9a7 7 0 1 0 6.5 10 5.6 5.6 0 0 1-6.5-10z" />
      <path className="y n" d={star(10, 10, 1.6, 0.6, 4)} />
    </>
  ),
  lamp: (
    <>
      <circle className="glow" cx="16" cy="13" r="10" />
      <path d="M16 15v8.5M11 27.5h10M16 23.5v4" />
      <path className="y" d="M10.5 15 13 6h6l2.5 9z" />
    </>
  ),
  music: (
    <>
      <path d="M11 22V8.5l13-3V19" />
      <path className="thick" d="M11 8.5l13-3" />
      <ellipse className="d" cx="8.5" cy="22.5" rx="3" ry="2.3" transform="rotate(-20 8.5 22.5)" />
      <ellipse className="d" cx="21.5" cy="19.5" rx="3" ry="2.3" transform="rotate(-20 21.5 19.5)" />
    </>
  ),
  teddy: (
    <>
      <circle className="tan" cx="8.5" cy="9.5" r="3.6" />
      <circle className="tan" cx="23.5" cy="9.5" r="3.6" />
      <circle className="f n" cx="8.5" cy="9.5" r="1.7" />
      <circle className="f n" cx="23.5" cy="9.5" r="1.7" />
      <circle className="tan" cx="16" cy="17" r="10" />
      <ellipse className="w" cx="16" cy="20.5" rx="4.3" ry="3.4" />
      <ellipse className="d" cx="16" cy="19.4" rx="1.6" ry="1.1" />
      <circle className="d n" cx="12.3" cy="15.5" r="1.2" />
      <circle className="d n" cx="19.7" cy="15.5" r="1.2" />
    </>
  ),

  /* ---------- あそび ---------- */
  romance: (
    <>
      <path className="a" d={heart(16, 17, 12)} />
      <path className="ws thick" d="M9 13c.5-1.6 1.7-2.6 3.2-2.8" />
    </>
  ),
  action: (
    <>
      <path className="y" d={star(16, 16, 13, 7, 10)} />
      <path className="o n" d={star(16, 16, 7.5, 4, 8)} />
    </>
  ),
  anime: (
    <>
      <path className="y n" d={star(26.5, 6, 3.6, 1.3, 4)} />
      <circle className="w" cx="15" cy="17.5" r="10.5" />
      <path className="d" d="M5 15c1-6 6-9.5 11.5-9 4 .4 7.5 3 8.5 7-3-1.5-6-1.5-8.5-3.5-2 2.5-6 4.5-11.5 5.5z" />
      <ellipse className="d" cx="11" cy="18.5" rx="2.2" ry="3.1" />
      <ellipse className="d" cx="19" cy="18.5" rx="2.2" ry="3.1" />
      <circle className="w n" cx="11.7" cy="17.3" r="1" />
      <circle className="w n" cx="19.7" cy="17.3" r="1" />
      <ellipse className="f n" cx="8" cy="22.5" rx="1.8" ry="1" />
      <ellipse className="f n" cx="22" cy="22.5" rx="1.8" ry="1" />
      <path className="thin" d="M14 23.5c.6.6 1.4.6 2 0" />
    </>
  ),
  ...Object.fromEntries(
    (["popcorn", "caramel"] as const).map((kind) => [
      kind,
      <>
        {[
          [10, 10, 3],
          [14.5, 7.5, 3.2],
          [19.5, 8.5, 3],
          [22.5, 11.5, 2.6],
          [12.5, 12.5, 2.6],
          [17.5, 11.5, 2.8],
        ].map(([x, y, r]) => (
          <circle key={`${x}${y}`} className={kind === "popcorn" ? "w" : "tan"} cx={x} cy={y} r={r} />
        ))}
        {kind === "caramel" && <path className="br n" d="M13 6.5c1-1 2.5-1 3.5 0-.5 1-.5 2 0 3-1.5.2-2.6-.5-3.5-3zM20 7c.8-.6 1.8-.4 2.3.4-.6.6-.8 1.4-.5 2.2-1 0-1.6-.8-1.8-2.6z" />}
        <path className="w" d="M8 12.5h16l-2 15.5H10z" />
        <path className="rs thick" d="M12 12.5l.8 15.5M16 12.5V28M20 12.5l-.8 15.5" />
      </>,
    ]),
  ),
  hotdog: (
    <>
      <path className="tan" d="M5 14c.5-2.5 2.5-3.5 5-3.5h12c2.5 0 4.5 1 5 3.5z" />
      <rect className="r" x="3" y="13.5" width="26" height="5" rx="2.5" />
      <path className="ys" d="M7 14.8l2 1.8 2-1.8 2 1.8 2-1.8 2 1.8 2-1.8 2 1.8 2-1.8 2 1.8" />
      <path className="tan" d="M4 18c0-1 .8-1.5 2-1.5h20c1.2 0 2 .5 2 1.5v.5c0 3-2.5 5.5-5.5 5.5h-13C6.5 24 4 21.5 4 18.5z" />
    </>
  ),
  drink: (
    <>
      <path d="M17 7.5 19 2.5h3" />
      <path className="f" d="M8.5 10.5h15l-1.8 17h-11.4z" />
      <path className="ws thick" d="M9.3 17.5h13.4" />
      <path className="w" d="M7.5 10.5c0-2 1.5-3 3-3h11c1.5 0 3 1 3 3z" />
    </>
  ),
  ballad: (
    <>
      <path d="M9 23V9l10-2.5" />
      <ellipse className="d" cx="6.5" cy="23.5" rx="3" ry="2.3" transform="rotate(-20 6.5 23.5)" />
      <path className="a" d={heart(22, 20, 7)} />
    </>
  ),
  idol: (
    <>
      <path className="y" d={star(6.5, 7, 4, 1.6)} />
      <path className="y" d={star(26, 9, 3, 1.2)} />
      <path d="M9.5 15.5a6.5 6.5 0 0 0 13 0M16 22v4.5M11.5 27.5h9" />
      <rect className="f" x="12" y="5.5" width="8" height="13.5" rx="4" />
      <path className="thin" d="M12 11h8M12 13.5h8" />
    </>
  ),
  animeSong: (
    <>
      <rect className="w" x="3" y="5" width="20" height="15" rx="2.5" />
      <path className="y n" d={star(13, 12.5, 4.5, 1.8)} />
      <path d="M9 25.5h8M13 20v5.5" />
      <path d="M24 26V14l5-1.2" />
      <ellipse className="d" cx="22" cy="26.3" rx="2.4" ry="1.8" transform="rotate(-20 22 26.3)" />
    </>
  ),
  listen: (
    <>
      <path className="thick" d="M6 19v-3a10 10 0 0 1 20 0v3" />
      <rect className="f" x="4" y="17.5" width="5.5" height="9" rx="2.5" />
      <rect className="f" x="22.5" y="17.5" width="5.5" height="9" rx="2.5" />
    </>
  ),
  ...Object.fromEntries(
    ["J", "T", "K"].map((letter) => [
      `pop${letter}`,
      <>
        <path d="M8.5 21V7l9-2.2V19" />
        <path className="thick" d="M8.5 7l9-2.2" />
        <ellipse className="d" cx="6.2" cy="21.5" rx="2.6" ry="2" transform="rotate(-20 6.2 21.5)" />
        <ellipse className="d" cx="15.2" cy="19.5" rx="2.6" ry="2" transform="rotate(-20 15.2 19.5)" />
        <circle className="f" cx="22.5" cy="21.5" r="7.5" />
        <text x="22.5" y="25.3" className="t">
          {letter}
        </text>
      </>,
    ]),
  ),
  popWorld: (
    <>
      <path d="M8.5 21V7l9-2.2V19" />
      <path className="thick" d="M8.5 7l9-2.2" />
      <ellipse className="d" cx="6.2" cy="21.5" rx="2.6" ry="2" transform="rotate(-20 6.2 21.5)" />
      <ellipse className="d" cx="15.2" cy="19.5" rx="2.6" ry="2" transform="rotate(-20 15.2 19.5)" />
      <circle className="b" cx="22.5" cy="21.5" r="7.5" />
      <path className="thin" d="M15 21.5h15M22.5 14c-3.5 4.5-3.5 10.5 0 15M22.5 14c3.5 4.5 3.5 10.5 0 15" />
    </>
  ),
  boardgame: (
    <>
      <rect className="w" x="17" y="15" width="11" height="11" rx="2.5" transform="rotate(12 22.5 20.5)" />
      <circle className="d n" cx="20.2" cy="18" r="1.1" />
      <circle className="d n" cx="22.5" cy="20.5" r="1.1" />
      <circle className="d n" cx="24.8" cy="23" r="1.1" />
      <circle className="f" cx="10" cy="9.5" r="3.4" />
      <path className="f" d="M3.5 17c0-1.6 1.1-2.7 2.7-2.7h7.6c1.6 0 2.7 1.1 2.7 2.7 0 1-1 1.6-2 1.9l1.6 8.6h-4.8L10 24.5l-1.3 3H3.9l1.6-8.6c-1-.3-2-.9-2-1.9z" />
    </>
  ),
  cards: (
    <>
      <rect className="w" x="5" y="7" width="13" height="18" rx="2" transform="rotate(-12 11.5 16)" />
      <path className="d n" d="M9.2 10.6c1.2 1.4 3 2.2 2.4 3.8-.4 1-1.6 1-2.2.4l.5 1.6h-1.6l.4-1.7c-.6.6-1.8.5-2.1-.5-.4-1.6 1.4-2.2 2.6-3.6z" />
      <rect className="w" x="13" y="7" width="13" height="18" rx="2" transform="rotate(10 19.5 16)" />
      <path className="r n" d={heart(19.5, 16, 4)} transform="rotate(10 19.5 16)" />
    </>
  ),
  puzzle: (
    <path className="f" d="M6 11h5.5a2.5 2.5 0 1 1 5 0H22v5.5a2.5 2.5 0 1 1 0 5V27h-5.5a2.5 2.5 0 1 0-5 0H6v-5.5a2.5 2.5 0 1 0 0-5z" />
  ),
  yoga: (
    <>
      <rect className="f" x="4" y="27" width="24" height="2.2" rx="1.1" />
      <path d="M16 11.5 10 5.5M16 11.5l6-6M16 9.5v10M16 19.5l1 7.5M16 19.5l-5 3 4.5 1.5" />
      <circle className="f" cx="16" cy="6.5" r="2.8" />
    </>
  ),
  shoe: (
    <>
      <path className="thin" d="M1.5 14.5h3.5M1 18h2.5" />
      <path className="f" d="M3.5 22.5c0-2 .5-3.5 1.5-5L8 11h5l1.5 3 7.5 2.5c3.5 1 6.5 2.5 6.5 5.5v.5z" />
      <path className="w" d="M3.5 22.5h25v2.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path className="thin" d="M12 14.5l2.5-1M14 17l3-1.2M16.5 19l2.5-1" />
    </>
  ),
  shuttle: (
    <g transform="rotate(25 16 16)">
      <path className="w" d="M9.5 4h13l-3.5 14h-6z" />
      <path className="thin" d="M13 4l1.5 14M16 4v14M19 4l-1.5 14M10.5 9h11" />
      <path className="tan" d="M12.8 18h6.4v2.5a3.2 3.2 0 0 1-6.4 0z" />
    </g>
  ),
  fireworks: (
    <>
      <path
        className="ys thick"
        d={Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          return `M${f2(14 + 4 * Math.cos(a))} ${f2(13 + 4 * Math.sin(a))}L${f2(14 + 9 * Math.cos(a))} ${f2(13 + 9 * Math.sin(a))}`;
        }).join("")}
      />
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i * 30 + 15) * Math.PI) / 180;
        return <circle key={i} className="f n" cx={f2(14 + 11 * Math.cos(a))} cy={f2(13 + 11 * Math.sin(a))} r="1.2" />;
      })}
      <path className="rs" d="M25 29v-5M22.5 24l2.5 2.5 2.5-2.5" />
    </>
  ),
  lantern: (
    <>
      <path className="b" d={water(22.5)} />
      <path className="g" d="M6 21.5c2-3 18-3 20 0-2 2.5-18 2.5-20 0z" />
      <path className="f" d="M9 20.5c0-4 2-6 4-7 0 3 1 5 3 7zM23 20.5c0-4-2-6-4-7 0 3-1 5-3 7z" />
      <path className="f" d="M13 20.5c0-5 1.5-7.5 3-9 1.5 1.5 3 4 3 9z" />
      <path className="w" d="M15 8h2v5h-2z" />
      <path className="y" d="M16 3c1.4 1.6 1.7 2.8 1 3.8h-2c-.7-1-.4-2.2 1-3.8z" />
    </>
  ),
  splash: (
    <>
      <path className="b" d="M9 15c1.5-6.5 7-10.5 14-10-4.5 1.5-8 4.5-9.5 10z" />
      <path className="b" d={drop(25, 10, 1)} />
      <path className="b" d={drop(27, 16, 0.8)} />
      <path className="b" d={drop(21.5, 15, 0.7)} />
      <g transform="rotate(-25 11 21)">
        <path className="gy" d="M2.5 17.5h17l-1.8 6a4 4 0 0 1-3.8 2.8H8.1a4 4 0 0 1-3.8-2.8z" />
        <path className="thin" d="M5 20.5h12" />
      </g>
    </>
  ),
  fly: (
    <>
      <path className="w" d={cloud(0, 3)} transform="translate(16 25) scale(.7) translate(-16 -25)" />
      <path className="w" d="M14.5 13C11 6.5 5.5 4.5 2.5 6.5c.8 2 2 3 4 3.5-1.5 1-2 2.5-1.5 4 1.5 0 3-.5 4-1.5 0 2 1 3.5 2.5 4 1.5-1 2.5-2 3-3.5z" />
      <path className="w" d="M17.5 13C21 6.5 26.5 4.5 29.5 6.5c-.8 2-2 3-4 3.5 1.5 1 2 2.5 1.5 4-1.5 0-3-.5-4-1.5 0 2-1 3.5-2.5 4-1.5-1-2.5-2-3-3.5z" />
      <circle className="f" cx="16" cy="13.5" r="2.6" />
    </>
  ),
  teleport: (
    <>
      <ellipse className="pu" cx="12.5" cy="17" rx="6.5" ry="10" />
      <ellipse className="f n" cx="12.5" cy="17" rx="3.8" ry="7" />
      <path className="y n" d={star(24.5, 8, 4, 1.4, 4)} />
      <path className="y n" d={star(26, 21, 2.6, 0.9, 4)} />
      <path className="y n" d={star(21, 27, 1.8, 0.7, 4)} />
    </>
  ),
  invisible: (
    <>
      <circle className="dash" cx="15" cy="10" r="4.6" />
      <path className="dash" d="M6.5 27.5a8.5 8.5 0 0 1 17 0z" />
      <path className="y n" d={star(25.5, 7, 3.4, 1.2, 4)} />
      <path className="y n" d={star(26.5, 17.5, 2.2, 0.8, 4)} />
    </>
  ),
  animals: (
    <>
      <path className="w" d="M5 5h22a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H14l-5 5v-5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <ellipse className="br n" cx="16" cy="16" rx="3.6" ry="3" />
      <circle className="br n" cx="11" cy="11.5" r="1.6" />
      <circle className="br n" cx="14.3" cy="9.3" r="1.6" />
      <circle className="br n" cx="17.7" cy="9.3" r="1.6" />
      <circle className="br n" cx="21" cy="11.5" r="1.6" />
    </>
  ),

  /* ---------- おかいもの ---------- */
  handbag: (
    <>
      <path d="M11 13V9.5a5 5 0 0 1 10 0V13" />
      <path className="f" d="M5.5 13.5h21l-1.8 13a1.6 1.6 0 0 1-1.6 1.4H8.9a1.6 1.6 0 0 1-1.6-1.4z" />
      <rect className="y" x="14" y="16" width="4" height="3" rx=".8" />
    </>
  ),
  perfume: (
    <>
      <path className="thin" d="M19.5 6h3M24.5 4.3l1.5-1M24.5 6h2M24.5 7.7l1.5 1" />
      <rect className="w" x="13" y="3.5" width="6" height="5" rx="1" />
      <path className="w" d="M14 8.5h4V10h-4z" />
      <rect className="f" x="7" y="10" width="18" height="18" rx="5" />
      <rect className="w" x="11" y="15.5" width="10" height="6" rx="1.2" />
    </>
  ),
  eye: (
    <>
      <path className="w" d="M3 16c3.5-5.5 8-8 13-8s9.5 2.5 13 8c-3.5 5.5-8 8-13 8s-9.5-2.5-13-8z" />
      <circle className="f" cx="16" cy="16" r="5" />
      <circle className="d" cx="16" cy="16" r="2.3" />
      <circle className="w n" cx="17.3" cy="14.7" r=".9" />
    </>
  ),
  bouquet: (
    <>
      <path className="gs" d="M16 18v-4M13 18l-2.5-5M19 18l2.5-5" />
      <Flower cx={10} cy={10.5} d={2.4} r={2} cls="r" />
      <Flower cx={22} cy={10.5} d={2.4} r={2} cls="pu" />
      <Flower cx={16} cy={7} d={2.4} r={2} cls="f" />
      <path className="w" d="M9 17h14l-4.5 11h-5z" />
      <path className="a" d="M13 21l3 1.5 3-1.5v3l-3-1.5-3 1.5z" />
    </>
  ),
  letter: (
    <>
      <rect className="w" x="4" y="8" width="24" height="17" rx="2" />
      <path d="M4.5 9l11.5 9 11.5-9" />
      <path className="a" d={heart(16, 18.5, 3.8)} />
    </>
  ),
  ring: (
    <>
      <circle className="ys thick" cx="16" cy="20" r="7.5" />
      <path className="b" d="M12 9.5l2-3h4l2 3-4 4.5z" />
      <path className="thin" d="M12 9.5h8M14 6.5l2 7.5 2-7.5" />
    </>
  ),
  bento: (
    <>
      <rect className="w" x="4" y="8" width="24" height="17" rx="3" />
      <path d="M16 8v17M16 16.5h12" />
      <path className="a" d={heart(10, 16.5, 3.4)} />
      <rect className="y" x="18.5" y="10.5" width="7" height="4" rx="1" />
      <circle className="g" cx="20.5" cy="20.5" r="2.2" />
      <circle className="r" cx="24.5" cy="20.8" r="1.6" />
    </>
  ),
  giftbox: (
    <>
      <path className="r" d="M16 10c-3-4-7-4-7-1.5S13 10 16 10zM16 10c3-4 7-4 7-1.5S19 10 16 10z" />
      <rect className="f" x="5" y="13" width="22" height="14" rx="1.5" />
      <rect className="w" x="4" y="10" width="24" height="4.5" rx="1.2" />
      <path className="rs thick" d="M16 10.5v16.5" />
    </>
  ),
  keychain: (
    <>
      <circle className="thick" cx="10" cy="8" r="4.5" />
      <path className="thin" d="M13 11.5l3 4" />
      <path className="y" d={star(19, 20.5, 8, 3.6)} />
    </>
  ),
  tshirt: (
    <>
      <path className="f" d={TSHIRT} />
      <path className="w" d="M11.5 15h9v6h-9z" />
    </>
  ),
  magnet: (
    <>
      <path className="r" d="M7 6h5v9a4 4 0 0 0 8 0V6h5v9a9 9 0 0 1-18 0z" />
      <path className="w" d="M7 6h5v4H7zM20 6h5v4h-5z" />
    </>
  ),
  market: (
    <>
      <circle className="r" cx="10" cy="13" r="3.4" />
      <circle className="o" cx="16" cy="11.5" r="3.6" />
      <circle className="g" cx="22" cy="13" r="3.4" />
      <path className="tan" d="M4 15h24l-2.5 12h-19z" />
      <path className="thin" d="M5 19h22M6 23h20M10 15l1 12M16 15v12M22 15l-1 12" />
    </>
  ),
  online: (
    <>
      <rect className="w" x="8" y="3" width="16" height="26" rx="3" />
      <path d="M11 10.5h2.2l2 7.5h6l1.6-5.5H14" />
      <circle className="d n" cx="16" cy="20.5" r="1.2" />
      <circle className="d n" cx="20.5" cy="20.5" r="1.2" />
      <path d="M14.5 26h3" />
    </>
  ),
  thrift: (
    <>
      <path d="M16 9.5V8a2 2 0 1 1 2-2" />
      <path d="M16 9.5 4 18h24z" />
      <path className="f" d={TSHIRT} transform="translate(16 18) scale(.5) translate(-16 -5)" />
      <path className="y" d="M21 20.5h5l2 2.5-2 2.5h-5z" />
      <circle className="w n" cx="22.5" cy="23" r=".7" />
    </>
  ),
  shirtWhite: <path className="w" d={TSHIRT} />,
  shirtBlack: <path className="blk" d={TSHIRT} />,
  shirtPastel: (
    <>
      <path className="pastel" d={TSHIRT} />
      <path className="mint n" d="M7 18h18v3H7z" />
    </>
  ),
  shirtBright: (
    <>
      <path className="r" d={TSHIRT} />
      <path className="y n" d="M7 18h18v3H7z" />
    </>
  ),
  caseCute: <PhoneCase kind="cute" />,
  caseSimple: <PhoneCase kind="simple" />,
  caseFlip: <PhoneCase kind="flip" />,
  caseBare: <PhoneCase kind="bare" />,
  backpack: (
    <>
      <path d="M12 8.5V6.5a4 4 0 0 1 8 0v2" />
      <rect className="f" x="7" y="8" width="18" height="20" rx="5" />
      <rect className="w" x="10.5" y="18" width="11" height="7" rx="2" />
      <path className="thin" d="M10.5 21h11" />
    </>
  ),
  tote: (
    <>
      <path d="M11 15V8.5a5 5 0 0 1 10 0V15" />
      <path className="w" d="M6 13h20l-1 15H7z" />
      <path className="f n" d="M6.6 21h18.8l-.2 3H6.8z" />
    </>
  ),
  shoulder: (
    <>
      <path d="M7 17 13 4h6l6 13" />
      <rect className="f" x="5" y="15" width="22" height="13" rx="3" />
      <path className="w" d="M5 18a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3H5z" />
      <circle className="y" cx="16" cy="21" r="1.5" />
    </>
  ),
  handsFree: (
    <>
      <g transform="translate(12.5 5.5) scale(.68)">
        <path className="f" d={HAND} />
        <path className="thin" d={HAND_LINES} />
      </g>
      <g transform="translate(19.5 5.5) scale(-.68 .68)">
        <path className="f" d={HAND} />
        <path className="thin" d={HAND_LINES} />
      </g>
      <path className="thin" d="M2 6l1.5 1.5M1 10.5h2M30 6l-1.5 1.5M31 10.5h-2" />
    </>
  ),
};

/** 好みの質問の 4 つの選択肢の絵（質問の ID → 絵の名前）。「どっちが？」は WHO を使う */
export const PICTURES: Record<string, readonly [string, string, string, string]> = {
  "food.tapioca": ["tea3", "tea1", "tea0", "teaPearls"],
  "food.noodle": ["ramen", "udon", "padthai", "pasta"],
  "food.dessert": ["iceCream", "cake", "kakigori", "pudding"],
  "food.spicy": ["chili0", "chili1", "chili2", "chili3"],
  "food.breakfast": ["rice", "bread", "porridge", "coffee"],
  "food.konbini": ["onigiri", "cupcake", "karaage", "bottle"],
  "food.cafe": ["coffee", "tea", "juice", "cocoa"],
  "food.dinner": ["yakiniku", "sushi", "thai", "hotpot"],
  "food.fruit": ["mango", "strawberry", "watermelon", "grapes"],
  "outing.holiday": ["sea", "mountain", "city", "sofaZz"],
  "outing.trip": ["dish", "view", "shopping", "bed"],
  "outing.go": ["walk", "bike", "train", "car"],
  "outing.rain": ["cinema", "coffee", "fish", "mall"],
  "outing.night": ["stall", "nightView", "mic", "nightCafe"],
  "outing.season": ["spring", "sun", "autumn", "snow"],
  "outing.ride": ["coaster", "ferris", "carousel", "ghost"],
  "outing.zoo": ["panda", "elephant", "giraffe", "penguin"],
  "outing.beach": ["swim", "sandcastle", "parasol", "shell"],
  "home.massage": ["press1", "press2", "press3", "press4"],
  "home.relax": ["tv", "cook", "nap", "game"],
  "home.morning": ["phone", "wash", "water", "nap"],
  "home.pet": ["dog", "cat", "rabbit", "goldfish"],
  "home.room": ["sofa", "plant", "bigTv", "bed"],
  "home.weather": ["sun", "cloudy", "rain", "snowman"],
  "home.bath": ["bathtub", "shower", "showerSun", "twice"],
  "home.aircon": ["acCold", "acCool", "acMild", "fan"],
  "home.bedtime": ["dark", "lamp", "music", "teddy"],
  "fun.netflix": ["romance", "action", "ghost", "anime"],
  "fun.cinema": ["popcorn", "caramel", "hotdog", "drink"],
  "fun.karaoke": ["ballad", "idol", "animeSong", "listen"],
  "fun.music": ["popJ", "popT", "popK", "popWorld"],
  "fun.play": ["boardgame", "game", "cards", "puzzle"],
  "fun.sport": ["yoga", "shoe", "swim", "shuttle"],
  "fun.festival": ["stall", "fireworks", "lantern", "splash"],
  "fun.power": ["fly", "teleport", "invisible", "animals"],
  "shop.brand": ["handbag", "perfume", "shoe", "eye"],
  "shop.gift": ["bouquet", "letter", "ring", "bento"],
  "shop.souvenir": ["giftbox", "keychain", "tshirt", "magnet"],
  "shop.where": ["mall", "market", "online", "thrift"],
  "shop.color": ["shirtWhite", "shirtBlack", "shirtPastel", "shirtBright"],
  "shop.case": ["caseCute", "caseSimple", "caseFlip", "caseBare"],
  "shop.bag": ["backpack", "tote", "shoulder", "handsFree"],
};

/** 「どっちが？」の選択肢の絵。0 = 先手・1 = 後手・2 = ふたりとも・3 = どっちも違う */
export const WHO = ["p0", "p1", "both", "neither"] as const;

/** 質問 id の choice 番目の絵の名前 */
export const pictureOf = (id: string, choice: number): string =>
  (id.startsWith("who.") ? WHO[choice] : PICTURES[id]?.[choice]) ?? "";

export function Picture({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`ishin-pic ${className}`} aria-hidden>
      {PICS[name]}
    </svg>
  );
}
