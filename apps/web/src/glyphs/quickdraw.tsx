/** ぎざぎざの縁の内と外の点を交互に結ぶ（合図の形。盤の合図と同じく、角を 12 個） */
const burst = (cx: number, cy: number, outer: number, inner: number, points: number) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    return `${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join("") + "Z";

/** はやうち：ぎざぎざの合図に大きな「！」。右下に、指で押した印と波紋 */
export default () => (
  <>
    <path d={burst(29, 29, 25, 18, 12)} className="g-p1" />
    {/* 「！」 */}
    <path d="M29 17v13" className="g-ink-stroke" strokeWidth="6.4" />
    <circle cx="29" cy="40" r="3.7" className="g-ink" />
    {/* 押した印と、広がる波紋 */}
    <circle cx="52" cy="52" r="4.6" className="g-p0" />
    <path d="M43.5 49.7a9 9 0 0 1 6.2-6.2" className="g-p0-stroke" strokeWidth="2.6" />
    <path d="M38.3 48.3a14.5 14.5 0 0 1 10-10" className="g-p0-stroke" strokeWidth="2.2" />
  </>
);
