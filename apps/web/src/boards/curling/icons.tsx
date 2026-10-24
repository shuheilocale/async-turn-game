/** カーリングの盤で使う小さな絵（SVG）。色は currentColor */

/** 回転の向き。cw なら時計回り（右回り ⟳）、そうでなければ反時計回り（左回り ⟲） */
export function SpinIcon({ cw }: { cw: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="curling-icon" aria-hidden>
      <g transform={cw ? undefined : "matrix(-1 0 0 1 24 0)"}>
        {/* 右上から時計回りにぐるっと回って、上で右を向く矢印 */}
        <path d="M18.6 9.6A7 7 0 1 1 12 5" />
        <path d="M9.4 2.3 12.4 5l-3 2.7" />
      </g>
    </svg>
  );
}

/** ハンマー（そのエンドの最後の 1 投を持つ人）の印 */
export function HammerIcon({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 16 16" className="curling-hammer" role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M3 13.2 8.6 7.6" className="handle" />
      <rect x="6.6" y="1.6" width="8.2" height="4.6" rx="1.2" transform="rotate(45 10.7 3.9)" className="head" />
    </svg>
  );
}

/** 「上から見る」：ハウスを真上から見た同心円 */
export function TopViewIcon() {
  return (
    <svg viewBox="0 0 24 24" className="curling-icon" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="1.2" className="fill" />
    </svg>
  );
}

/** 「投げる人から見る」：奥へ延びるシート */
export function ThrowerViewIcon() {
  return (
    <svg viewBox="0 0 24 24" className="curling-icon" aria-hidden>
      <path d="M9.5 3.5h5l4.5 17H5z" />
      <ellipse cx="12" cy="6.6" rx="2.2" ry="1.1" />
      <circle cx="12" cy="16.6" r="1.6" className="fill" />
    </svg>
  );
}
