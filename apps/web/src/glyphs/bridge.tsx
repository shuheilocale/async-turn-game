/**
 * つなぎ橋のアイコン：3×3 の六角のマスをひし形に並べ、上下の辺を青、左右の辺をオレンジで縁取る。
 * 青の石が上の辺から下の辺までつながっている
 */
const N = 3;
const R = 7.5;
const W = Math.sqrt(3) * R;
const X0 = (64 - W * (N + (N - 1) / 2)) / 2;
const Y0 = (64 - R * (2 + 1.5 * (N - 1))) / 2;

const center = (r: number, c: number) => ({ x: X0 + W / 2 + (c + r / 2) * W, y: Y0 + R + 1.5 * R * r });
/** k = 0 が真上で時計回り（5 が左上） */
const corner = (r: number, c: number, k: number) => {
  const { x, y } = center(r, c);
  const a = (Math.PI / 3) * k - Math.PI / 2;
  return `${(x + R * Math.cos(a)).toFixed(2)},${(y + R * Math.sin(a)).toFixed(2)}`;
};

const range = [0, 1, 2];
const cells = range.flatMap((r) => range.map((c) => [r, c] as const));
const edges = [
  { cls: "g-p0-stroke", pts: range.flatMap((c) => [5, 0, 1].map((k) => corner(0, c, k))) },
  { cls: "g-p0-stroke", pts: range.flatMap((c) => [4, 3, 2].map((k) => corner(N - 1, c, k))) },
  { cls: "g-p1-stroke", pts: range.flatMap((r) => [5, 4].map((k) => corner(r, 0, k))) },
  { cls: "g-p1-stroke", pts: range.flatMap((r) => [1, 2].map((k) => corner(r, N - 1, k))) },
];
const stones = [
  { r: 0, c: 1, cls: "g-p0" },
  { r: 1, c: 1, cls: "g-p0" },
  { r: 2, c: 0, cls: "g-p0" },
  { r: 1, c: 2, cls: "g-p1" },
  { r: 2, c: 2, cls: "g-p1" },
];

export default () => (
  <>
    {/* 縁取りを先に描き、内側の半分をマスで隠す */}
    {edges.map((e, i) => (
      <polyline key={i} points={e.pts.join(" ")} className={e.cls} strokeWidth="5" />
    ))}
    {cells.map(([r, c]) => (
      <polygon key={`${r}-${c}`} points={[0, 1, 2, 3, 4, 5].map((k) => corner(r, c, k)).join(" ")} className="g-frame" />
    ))}
    {stones.map(({ r, c, cls }) => {
      const { x, y } = center(r, c);
      return <circle key={`${r}-${c}`} cx={x.toFixed(2)} cy={y.toFixed(2)} r="4.4" className={cls} />;
    })}
  </>
);
