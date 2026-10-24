/**
 * めくりあわせのアイコン：伏せた札 1 枚と、表に返した同じ絵（星）の 2 枚
 */
const star = (cx: number, cy: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 === 0 ? 7 : 3;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

const faceUp = [
  { x: 22, y: 17, angle: -3 },
  { x: 37, y: 21, angle: 10 },
];

export default () => (
  <>
    <g transform="rotate(-12 17 30)">
      <rect x="6" y="15" width="21" height="30" rx="4" className="g-rack" />
      <rect x="9.5" y="18.5" width="14" height="23" rx="2" className="g-cut" strokeWidth="1.5" />
    </g>
    {faceUp.map(({ x, y, angle }) => (
      <g key={x} transform={`rotate(${angle} ${x + 10.5} ${y + 15})`}>
        <rect x={x} y={y} width="21" height="30" rx="4" className="g-card-back" />
        <path d={`M${star(x + 10.5, y + 15.5)}z`} className="g-p1" />
      </g>
    ))}
  </>
);
