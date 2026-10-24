import type { ReactNode } from "react";
import type { Shopping } from "@atg/core";

/**
 * ブランド爆買いオークションの品物の絵（viewBox 0 0 64 64）。ブランドのロゴや形はまねず、
 * 「キルティング」「モノグラム柄」のような特徴だけを描く。絵はクリーム色の札の上に置くので、
 * 色は画面の明暗に関係なく固定にする
 */

const INK = "#3b2a35";
const GOLD = "#d9a93c";
const GOLD_DARK = "#a87a1e";
const CREAM = "#fffaf0";

/** 長方形の中に、斜めの格子（キルティングの縫い目）を引く */
function quilt(x0: number, y0: number, x1: number, y1: number, gap: number): string {
  const segs: string[] = [];
  // 右下がりの線（y = x + c）
  for (let c = y0 - x1 + gap / 2; c < y1 - x0; c += gap) {
    const a = Math.max(x0, y0 - c);
    const b = Math.min(x1, y1 - c);
    if (b > a) segs.push(`M${a} ${a + c}L${b} ${b + c}`);
  }
  // 左下がりの線（y = -x + c）
  for (let c = y0 + x0 + gap / 2; c < y1 + x1; c += gap) {
    const a = Math.max(x0, c - y1);
    const b = Math.min(x1, c - y0);
    if (b > a) segs.push(`M${a} ${c - a}L${b} ${c - b}`);
  }
  return segs.join("");
}

/** 4 つのとがりがある、きらっとした星 */
const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

/** 左右に半円の切り欠きがあるチケットの形 */
const ticket = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x} ${y}h${w}v${h / 2 - r}a${r} ${r} 0 0 0 0 ${2 * r}v${h / 2 - r}H${x}v${-(h / 2 - r)}a${r} ${r} 0 0 0 0 ${-2 * r}Z`;

/** 2 次ベジェ曲線の上の点 */
const onCurve = (t: number, p0: number, p1: number, p2: number) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2;

/** ネックレスの真珠の位置。U の字の曲線（Q）の上に、同じ間隔（長さ）で並べる */
const PEARLS = (() => {
  const samples = Array.from({ length: 401 }, (_, i) => {
    const t = i / 400;
    return [onCurve(t, 11, 32, 53), onCurve(t, 6, 66, 6)] as const;
  });
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1]!;
    const [x1, y1] = samples[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = lengths.at(-1)!;
  const n = Math.round(total / 6.4) + 1;
  return Array.from({ length: n }, (_, k) => {
    const at = (total * k) / (n - 1);
    return samples[Math.max(0, lengths.findIndex((l) => l >= at))]!;
  });
})();

const art: Record<Shopping.ItemId, () => ReactNode> = {
  // キルティングのチェーンバッグ：ひし形の縫い目のある黒い革に、金の鎖の持ち手と留め金
  chainbag: () => (
    <>
      <path d="M18 28C18 9 46 9 46 28" stroke={GOLD} strokeWidth="3" strokeDasharray="3.4 1.6" fill="none" />
      <path d="M18 28C18 9 46 9 46 28" stroke={GOLD_DARK} strokeWidth="0.8" strokeDasharray="3.4 1.6" fill="none" />
      <rect x="10" y="26" width="44" height="29" rx="5" fill="#2f2733" stroke={INK} strokeWidth="1.5" />
      <path d={quilt(12, 28, 52, 53, 7.5)} stroke="#5a4e63" strokeWidth="1.1" />
      {/* ふたのふち。真ん中で少し下がる */}
      <path d="M10.8 31.5C20 39 44 39 53.2 31.5" stroke="#16111a" strokeWidth="1.6" fill="none" />
      <rect x="28" y="33.2" width="8" height="6" rx="1.6" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
      <path d="M30.6 36.2h2.8" stroke={GOLD_DARK} strokeWidth="1" />
    </>
  ),

  // モノグラム柄のトランク：茶色の地に小さな星と点の柄、2 本の革の帯と金具、上に持ち手
  trunk: () => (
    <>
      <path d="M25.5 21v-4.5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3V21" stroke="#5c3a1e" strokeWidth="3" fill="none" />
      <rect x="8" y="20" width="48" height="36" rx="4" fill="#8a5a33" stroke={INK} strokeWidth="1.5" />
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3, 4].map((col) => {
          const x = 12.5 + col * 9.75 + (row % 2) * 4.9;
          const y = 25 + row * 8.5;
          if (x > 53) return null;
          return (row + col) % 2 === 0 ? (
            <path key={`${row}-${col}`} d={sparkle(x, y, 2.4)} fill="#e0bd84" />
          ) : (
            <circle key={`${row}-${col}`} cx={x} cy={y} r="1.3" fill="#e0bd84" />
          );
        }),
      )}
      <path d="M8 33h48" stroke="#5c3a1e" strokeWidth="1.6" />
      <rect x="18" y="20" width="4.5" height="36" fill="#5c3a1e" />
      <rect x="41.5" y="20" width="4.5" height="36" fill="#5c3a1e" />
      <path d="M8.8 26v-5.2H14M50 20.8h5.2V26M8.8 50v5.2H14M50 55.2h5.2V50" stroke={GOLD} strokeWidth="2.4" fill="none" />
      <rect x="29.5" y="30" width="5" height="7" rx="1.2" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
    </>
  ),

  // ハイヒール：横から見た赤いパンプス
  heels: () => (
    <>
      {/* かかとの細いヒール */}
      <path d="M46.5 38.5 50.5 37.5 50 55.5H47.6Z" fill="#9e1830" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      {/* 本体：つま先から甲、はき口、かかとの後ろ、土踏まずの下 */}
      <path
        d="M10 54C5.5 54 5 47 11 45.2 17 43.5 23 42.5 27 41.5 34 46 41 40 47.5 27.5 50 23 54.5 24.5 54 30L52.4 37.4C49 38 46.5 38.5 44 41 37 47.5 31 54 22 54Z"
        fill="#d7263d"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* 中敷き（はき口からのぞく内側） */}
      <path d="M28.5 42.6C35 45.5 41.5 40 47.6 29.5 49.5 27.5 51.5 28 51.8 30.5 46 41 38 47 28.5 42.6Z" fill="#f2c2b8" />
      {/* つやの線 */}
      <path d="M12.5 48.5C17 46.5 21 46 25 45.5" stroke="#ff8d9c" strokeWidth="1.6" fill="none" />
      <path d="M8 55.5H24" stroke={INK} strokeWidth="1.2" />
    </>
  ),

  // ダイヤの指輪：金の輪に、カットの線が入ったダイヤ
  ring: () => (
    <>
      <circle cx="32" cy="45" r="12" stroke={GOLD} strokeWidth="4.6" fill="none" />
      <circle cx="32" cy="45" r="14.3" stroke={GOLD_DARK} strokeWidth="0.8" fill="none" />
      <path d="M27.5 33.5 32 30l4.5 3.5" stroke={GOLD_DARK} strokeWidth="2" fill="none" />
      <path d="M24 13h16l5.5 6.5L32 33.5 18.5 19.5Z" fill="#d6f2ff" stroke="#4f9fc2" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M18.5 19.5h27M24 13l3.5 6.5L32 33.5l4.5-14L40 13M27.5 19.5 32 13l4.5 6.5" stroke="#79bfdc" strokeWidth="1" fill="none" />
      <path d={sparkle(50, 11, 4)} fill={GOLD} />
      <path d={sparkle(13, 29, 2.8)} fill="#79bfdc" />
    </>
  ),

  // 腕時計：革のベルトに金の枠と白い文字盤
  watch: () => (
    <>
      <path d="M25 3h14l-1.5 17h-11Z" fill="#3b3346" stroke={INK} strokeWidth="1.2" />
      <path d="M26.5 44h11L39 61H25Z" fill="#3b3346" stroke={INK} strokeWidth="1.2" />
      {[49, 53, 57].map((y) => (
        <circle key={y} cx="32" cy={y} r="1" fill="#857c92" />
      ))}
      <rect x="45" y="29.3" width="4" height="5.4" rx="1.2" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
      <circle cx="32" cy="32" r="14.5" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.4" />
      <circle cx="32" cy="32" r="11" fill={CREAM} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const r0 = i % 3 === 0 ? 7.6 : 8.8;
        return (
          <path
            key={i}
            d={`M${32 + Math.sin(a) * r0} ${32 - Math.cos(a) * r0}L${32 + Math.sin(a) * 10} ${32 - Math.cos(a) * 10}`}
            stroke={INK}
            strokeWidth={i % 3 === 0 ? 1.6 : 0.9}
          />
        );
      })}
      <path d="M32 32V24.5M32 32l5.2 3" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="32" cy="32" r="1.4" fill={GOLD_DARK} />
    </>
  ),

  // 真珠のネックレス：U の字に並んだ真珠と、下に大きめの 1 粒
  necklace: () => (
    <>
      <path d="M11 6Q32 66 53 6" stroke="#c8b796" strokeWidth="0.8" fill="none" />
      {PEARLS.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.3" fill="#fbf6ec" stroke="#b9a684" strokeWidth="0.9" />
          <circle cx={x - 1} cy={y - 1.1} r="0.9" fill="#fff" />
        </g>
      ))}
      <path d="M30 40.5h4" stroke={GOLD} strokeWidth="2.2" />
      <circle cx="32" cy="47" r="5.6" fill="#fbf6ec" stroke="#b9a684" strokeWidth="1" />
      <circle cx="30.2" cy="45" r="1.5" fill="#fff" />
      <path d={sparkle(49, 40, 3.2)} fill={GOLD} />
    </>
  ),

  // 香水のびん：ピンクのガラスびんと黒いふた
  perfume: () => (
    <>
      <rect x="28" y="17" width="8" height="7" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
      <rect x="23.5" y="5" width="17" height="13" rx="3" fill="#2f2733" stroke={INK} strokeWidth="1.2" />
      <rect x="23.5" y="14.5" width="17" height="3.5" fill={GOLD} />
      <path d="M15 31q0-8 8-8h18q8 0 8 8v17q0 9-9 9H24q-9 0-9-9Z" fill="#f8d3df" stroke="#c97a96" strokeWidth="1.5" />
      <path d="M17 39h30v9q0 7-7 7H24q-7 0-7-7Z" fill="#ec8fb0" />
      <rect x="25" y="31" width="14" height="9" rx="1.8" fill={CREAM} stroke={GOLD} strokeWidth="1.1" />
      <path d="M28 35.5h8" stroke={GOLD} strokeWidth="1.2" />
      <path d="M20 29v15" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <path d={sparkle(53, 14, 3.6)} fill={GOLD} />
      <path d={sparkle(10, 22, 2.6)} fill="#ec8fb0" />
    </>
  ),

  // 美容クリニックのチケット：切り取り線のあるチケットに、十字の印と手鏡
  clinic: () => (
    <>
      <path d={ticket(6, 17, 52, 30, 4.5)} fill="#ffe1ea" stroke="#d9748f" strokeWidth="1.5" />
      <path d="M21 19.5v25" stroke="#d9748f" strokeWidth="1.3" strokeDasharray="2 2.4" />
      <circle cx="14" cy="32" r="4.6" fill="#d9748f" />
      <path d="M14 29.4v5.2M11.4 32h5.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M41 39.5v6.5" stroke={GOLD_DARK} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="41" cy="30.5" r="8.4" fill="#dff3fb" stroke={GOLD} strokeWidth="2.4" />
      <path d={sparkle(38.5, 28.5, 3.4)} fill="#fff" />
      <path d={sparkle(52, 12, 3.4)} fill={GOLD} />
      <path d={sparkle(27, 51.5, 2.6)} fill="#d9748f" />
    </>
  ),

  // ネイルの予約：マニキュアのびんと、チェックの付いた予約のカード
  nail: () => (
    <>
      <rect x="29" y="12" width="27" height="32" rx="3.5" fill={CREAM} stroke={INK} strokeWidth="1.4" />
      <path d="M29 19h27" stroke={INK} strokeWidth="1.2" />
      <path d="M32.5 12h20a3.5 3.5 0 0 1 3.5 3.5V19H29v-3.5a3.5 3.5 0 0 1 3.5-3.5Z" fill="#a35bd6" />
      <path d="M35.5 9.5v5M49.5 9.5v5" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M36 31.5l4.2 4.2 8.5-9" stroke="#2f9e63" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="17" width="10" height="16" rx="2" fill="#2f2733" stroke={INK} strokeWidth="1.2" />
      <rect x="8" y="31" width="22" height="24" rx="6" fill="#e2456b" stroke={INK} strokeWidth="1.4" />
      <path d="M12.5 36.5v12" stroke="#ffb1c1" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),

  // タイ古式マッサージ 1 年分の券：金のふちのチケットに、はすの花と、ハーブボール（ルークプラコップ）
  massage: () => (
    <>
      <path d={ticket(4, 15, 56, 34, 5)} fill="#fdf0d2" stroke="#c9952f" strokeWidth="1.5" />
      <path d={ticket(8, 19, 48, 26, 3)} fill="none" stroke="#e2c27d" strokeWidth="1" strokeDasharray="2 2" />
      {/* はすの花 */}
      <path d="M22 24.5q5.5 6.5 0 15q-5.5-8.5 0-15Z" fill="#e58fb0" />
      <path d="M21.8 39.6q-10-1-11.4-10.4q9.4.6 11.4 10.4Z" fill="#d86f98" />
      <path d="M22.2 39.6q10-1 11.4-10.4q-9.4.6-11.4 10.4Z" fill="#d86f98" />
      <path d="M14 41h16" stroke="#3f8f62" strokeWidth="1.8" strokeLinecap="round" />
      {/* ハーブボール：布で包んでしばった丸い玉と、上に出た布のはし */}
      <path d="M44 26.5l-4-6M44 26.5l4.5-5.5" stroke="#a08350" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="44" cy="35" r="8.6" fill="#d9c79b" stroke="#a08350" strokeWidth="1.3" />
      <path d="M37.5 31.5q6.5 3 13 0M36.5 36.5q7.5 3 15 0M38.5 41q5.5 2.5 11 0" stroke="#b39a63" strokeWidth="1" fill="none" />
      <rect x="40.5" y="25" width="7" height="3.4" rx="1.4" fill="#7a5f33" />
    </>
  ),

  // リゾートのスパ：水の上に積んだなめらかな石、プルメリアの花、やしの葉
  spa: () => (
    <>
      <path d="M58 6C44 6 36 14 33 24 41 18 50 16 58 18Z" fill="#3f9a5a" />
      <path d="M57 9C47 11 40 16 35 22" stroke="#2c6e40" strokeWidth="1.1" fill="none" />
      <path d="M4 50q7-3.5 14 0t14 0 14 0 14 0V60H4Z" fill="#8fd3df" />
      <path d="M8 55q5-2 10 0M30 56q5-2 10 0" stroke="#e4f6f9" strokeWidth="1.3" fill="none" />
      <ellipse cx="32" cy="46" rx="15" ry="5.6" fill="#6f6a72" stroke={INK} strokeWidth="1.1" />
      <ellipse cx="32" cy="37.6" rx="11" ry="4.6" fill="#8a858d" stroke={INK} strokeWidth="1.1" />
      <ellipse cx="32" cy="30.4" rx="7.4" ry="3.6" fill="#a7a2aa" stroke={INK} strokeWidth="1.1" />
      <path d="M26 29.5q3-1.6 6-1.6" stroke="#cfcbd2" strokeWidth="1.1" fill="none" />
      {/* プルメリア：5 枚の花びら */}
      <g transform="translate(15 21)">
        {[0, 72, 144, 216, 288].map((deg) => (
          <ellipse key={deg} cx="0" cy="-5.2" rx="3.4" ry="5.4" transform={`rotate(${deg})`} fill={CREAM} stroke="#e7c36a" strokeWidth="0.8" />
        ))}
        <circle r="2.6" fill="#f4c542" />
      </g>
    </>
  ),

  // タピオカミルクティー 1 年分：ふたの付いたカップに太いストロー、底に黒いタピオカ
  tapioca: () => (
    <>
      <path d="M38.5 2.5 34 26" stroke="#e2456b" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M17.5 22h29l-3.6 31.5q-.4 3.5-3.9 3.5H25q-3.5 0-3.9-3.5Z" fill="#e7c9a2" stroke={INK} strokeWidth="1.4" />
      {[
        [26, 52.5],
        [31.5, 53.5],
        [37, 52.5],
        [28.5, 48.3],
        [34.3, 48.3],
        [24.3, 47.6],
        [39.7, 47.6],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="#3b2a20" />
      ))}
      <path d="M20 31h24l-.5 5H20.6Z" fill="#fffaf0" opacity="0.9" />
      <path d="M16 22q16-13 32 0Z" fill="#fffaf0" stroke={INK} strokeWidth="1.3" opacity="0.92" />
      <rect x="15" y="20.5" width="34" height="3.6" rx="1.8" fill={CREAM} stroke={INK} strokeWidth="1.3" />
      <path d="M36.3 13.5 35 21" stroke="#e2456b" strokeWidth="5.2" strokeLinecap="round" />
    </>
  ),
};

/** 品物の絵 */
export function ItemArt({ id, className = "" }: { id: Shopping.ItemId; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shop-art ${className}`} aria-hidden>
      {art[id]()}
    </svg>
  );
}
