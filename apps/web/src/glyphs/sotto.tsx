/**
 * そっと出しのアイコン：小さい順に右上へ重ねて出した 3 枚の札。
 * 下の線の色は出した人（2 人が交互に出している）
 */
const W = 22;
const H = 30;
const cards = [
  { x: 6, y: 28, n: 3, seat: "g-p0" },
  { x: 20, y: 19, n: 8, seat: "g-p1" },
  { x: 34, y: 10, n: 15, seat: "g-p0" },
];

export default () => (
  <>
    {cards.map(({ x, y, n, seat }, i) => (
      <g key={n}>
        <rect x={x} y={y} width={W} height={H} rx="4" className="g-card-back" />
        {/* 下の札は右側が次の札に隠れるので、数字は見えている左寄りに書く */}
        <text x={i === cards.length - 1 ? x + W / 2 : x + 7.5} y={y + 17} className="g-num">
          {n}
        </text>
        <rect x={x + 4} y={y + H - 7.5} width={W - 8} height="3.5" rx="1.75" className={seat} />
      </g>
    ))}
  </>
);
