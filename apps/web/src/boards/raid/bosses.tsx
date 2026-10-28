import type { ReactNode } from "react";
import type { Raid } from "@atg/core";

/**
 * ふたりのボス戦のボスの絵（SVG）。どれも足もとを (0, 0) にして、上へ高さ 130 ほどに描く（x は -60〜60）。
 * 色は RaidBoard.css の .rb-* と、ボスごとの --b-* で決める。顔（目・まゆ・口）は気分で変える
 * （angry = ふつう、strain = 攻撃を受けた・倒れる、smug = 守っている・ひと休み）
 */

export type Mood = "angry" | "strain" | "smug" | "sleepy";

/** 目とまゆと口。cx・cy は顔のまん中、w は目と目の間の半分 */
function Face({ cx, cy, w = 15, mood, size = 1 }: { cx: number; cy: number; w?: number; mood: Mood; size?: number }) {
  const r = 6.5 * size;
  const eye = (x: number, side: -1 | 1) => {
    // ぎゅっとつぶった目（左は「>」、右は「<」）
    if (mood === "strain")
      return (
        <path
          key={side}
          d={`M${x + side * r} ${cy - r * 0.6} L${x - side * r * 0.5} ${cy} L${x + side * r} ${cy + r * 0.6}`}
          className="rb-line"
        />
      );
    if (mood === "sleepy" || mood === "smug")
      return (
        <g key={side}>
          <path d={`M${x - r} ${cy} a${r} ${r} 0 0 0 ${r * 2} 0 z`} className="rb-eye" />
          <circle cx={x} cy={cy + r * 0.45} r={r * 0.42} className="rb-pupil" />
          <path d={`M${x - r - 1} ${cy} h${r * 2 + 2}`} className="rb-line" />
        </g>
      );
    return (
      <g key={side}>
        <circle cx={x} cy={cy} r={r} className="rb-eye" />
        <circle cx={x + side * -1.2} cy={cy + 1} r={r * 0.48} className="rb-pupil" />
      </g>
    );
  };
  const brow = mood === "angry" ? 1 : mood === "strain" ? -0.6 : 0.3;
  const mouthY = cy + 17 * size;
  const mouth =
    mood === "strain" ? (
      <ellipse cx={cx} cy={mouthY + 1} rx={6 * size} ry={7 * size} className="rb-mouth" />
    ) : mood === "smug" ? (
      <path d={`M${cx - 10 * size} ${mouthY - 2} q${10 * size} ${8 * size} ${20 * size} 0`} className="rb-line" />
    ) : mood === "sleepy" ? (
      <path d={`M${cx - 8 * size} ${mouthY} q${4 * size} -4 ${8 * size} 0 q${4 * size} 4 ${8 * size} 0`} className="rb-line" />
    ) : (
      <g>
        <path d={`M${cx - 13 * size} ${mouthY + 3} q${13 * size} ${-9 * size} ${26 * size} 0 z`} className="rb-mouth" />
        <path d={`M${cx - 8 * size} ${mouthY - 1.5} l2.5 3.5 2.5 -3.8 M${cx + 3 * size} ${mouthY - 2.2} l2.5 3.8 2.5 -3.4`} className="rb-teeth" />
      </g>
    );
  return (
    <g className="rb-face">
      {eye(cx - w, -1)}
      {eye(cx + w, 1)}
      <path d={`M${cx - w - 8} ${cy - 11 - 5 * brow} L${cx - w + 7} ${cy - 11 + 3 * brow}`} className="rb-brow" />
      <path d={`M${cx + w + 8} ${cy - 11 - 5 * brow} L${cx + w - 7} ${cy - 11 + 3 * brow}`} className="rb-brow" />
      {mouth}
    </g>
  );
}

/** 月曜日の朝：ふきげんな目覚まし時計。頭に 2 つのベル、細い足 */
function Monday({ mood }: { mood: Mood }) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return <path key={i} d={`M${Math.sin(a) * 35} ${-62 - Math.cos(a) * 35} L${Math.sin(a) * 39} ${-62 - Math.cos(a) * 39}`} className="rb-tick" />;
  });
  return (
    <g>
      <path d="M-22 -18 L-30 -2 M22 -18 L30 -2" className="rb-leg" />
      <ellipse cx={-33} cy={-2} rx={9} ry={4} className="rb-ink-fill" />
      <ellipse cx={33} cy={-2} rx={9} ry={4} className="rb-ink-fill" />
      <path d="M-26 -110 Q0 -128 26 -110" className="rb-leg" />
      <circle cx={-30} cy={-106} r={13} className="rb-accent" />
      <circle cx={30} cy={-106} r={13} className="rb-accent" />
      <rect x={-5} y={-122} width={10} height={9} rx={2} className="rb-ink-fill" />
      <circle cx={0} cy={-62} r={48} className="rb-body" />
      <circle cx={0} cy={-62} r={40} className="rb-face-plate" />
      {ticks}
      <path d="M0 -62 L0 -88 M0 -62 L17 -54" className="rb-hand" />
      <circle cx={0} cy={-62} r={3.5} className="rb-ink-fill" />
      <Face cx={0} cy={-68} w={16} mood={mood} size={0.95} />
      {/* ねぐせ */}
      <path d="M-8 -112 q-4 -10 4 -14 M4 -113 q6 -9 12 -6" className="rb-line thin" />
    </g>
  );
}

/** 大雨の雲：むっとした雨雲。下から雨つぶが落ち、横にかみなり */
function Rain({ mood }: { mood: Mood }) {
  return (
    <g>
      <g className="rb-drops">
        {[-36, -18, 0, 18, 36].map((x, i) => (
          <path key={x} d={`M${x} ${-30 + (i % 2) * 8} q-5 8 0 11 q5 -3 0 -11z`} className="rb-drop" style={{ animationDelay: `${i * 0.17}s` }} />
        ))}
      </g>
      <path
        d="M-48 -38 Q-66 -40 -62 -60 Q-60 -78 -40 -76 Q-38 -104 -10 -104 Q8 -122 30 -106 Q52 -108 54 -86 Q70 -78 62 -58 Q60 -38 40 -38 Z"
        className="rb-body"
      />
      <path d="M-30 -48 Q-8 -40 24 -46" className="rb-line thin rb-soft" />
      <path d="M50 -62 L40 -40 L50 -40 L42 -18" className="rb-bolt" />
      <Face cx={-2} cy={-76} w={17} mood={mood} />
    </g>
  );
}

/** 渋滞モンスター：屋根にコーンをのせた車。ライトが目、バンパーが口。後ろから排気ガス */
function Traffic({ mood }: { mood: Mood }) {
  return (
    <g>
      <g className="rb-smoke">
        <circle cx={60} cy={-34} r={7} />
        <circle cx={70} cy={-44} r={9} />
        <circle cx={62} cy={-56} r={6} />
      </g>
      <path d="M-34 -78 L-24 -108 Q-22 -112 -16 -112 L22 -112 Q28 -112 30 -108 L40 -78 Z" className="rb-accent" />
      <rect x={-56} y={-82} width={112} height={56} rx={16} className="rb-body" />
      <path d="M-8 -112 L0 -134 L8 -112 Z" className="rb-cone" />
      <path d="M-4.6 -122 h9.2" className="rb-cone-stripe" />
      <circle cx={-34} cy={-18} r={14} className="rb-ink-fill" />
      <circle cx={34} cy={-18} r={14} className="rb-ink-fill" />
      <circle cx={-34} cy={-18} r={5} className="rb-hub" />
      <circle cx={34} cy={-18} r={5} className="rb-hub" />
      <circle cx={-46} cy={-46} r={5} className="rb-lamp" />
      <circle cx={46} cy={-46} r={5} className="rb-lamp" />
      <Face cx={0} cy={-62} w={20} mood={mood} size={1.05} />
    </g>
  );
}

/** 締め切り魔人：小さな角の生えた日めくりカレンダー。赤い丸の付いた日が締め切り */
function Deadline({ mood }: { mood: Mood }) {
  const cells = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 5; c++) cells.push(<rect key={`${r}-${c}`} x={-36 + c * 15} y={-42 + r * 12} width={10} height={8} rx={1.5} className="rb-cell" />);
  return (
    <g>
      <path d="M-20 -16 L-26 -2 M20 -16 L26 -2" className="rb-leg" />
      <path d="M-44 -116 Q-58 -132 -46 -142 Q-46 -128 -32 -120 Z" className="rb-horn" />
      <path d="M44 -116 Q58 -132 46 -142 Q46 -128 32 -120 Z" className="rb-horn" />
      <rect x={-48} y={-122} width={96} height={106} rx={10} className="rb-body" />
      <path d="M-48 -112 Q-48 -122 -38 -122 L38 -122 Q48 -122 48 -112 L48 -96 L-48 -96 Z" className="rb-accent" />
      <circle cx={-22} cy={-122} r={4} className="rb-ring" />
      <circle cx={22} cy={-122} r={4} className="rb-ring" />
      {cells}
      <circle cx={23} cy={-26} r={8} className="rb-circle-mark" />
      <Face cx={0} cy={-72} w={17} mood={mood} />
    </g>
  );
}

/** 夜中の蚊：大きな目の蚊。羽をふるわせて浮いている */
function Mosquito({ mood }: { mood: Mood }) {
  return (
    <g>
      <ellipse cx={0} cy={-2} rx={30} ry={4} className="rb-shadow" />
      <g className="rb-hover">
        <g className="rb-wings">
          <ellipse cx={-20} cy={-104} rx={16} ry={34} transform="rotate(-30 -20 -104)" className="rb-wing" />
          <ellipse cx={22} cy={-104} rx={16} ry={34} transform="rotate(30 22 -104)" className="rb-wing" />
        </g>
        <path d="M-10 -58 q-16 18 -24 36 M-2 -56 q-6 22 -8 40 M8 -58 q10 18 22 34 M14 -62 q20 6 30 24" className="rb-line thin" />
        <ellipse cx={22} cy={-60} rx={26} ry={13} transform="rotate(28 22 -60)" className="rb-body" />
        <path d="M12 -66 l-4 12 M24 -60 l-4 12 M36 -54 l-4 10" className="rb-stripe" />
        <circle cx={-6} cy={-74} r={16} className="rb-accent" />
        <circle cx={-26} cy={-90} r={22} className="rb-body" />
        <path d="M-44 -80 L-64 -66" className="rb-nose" />
        <path d="M-34 -110 q-6 -12 -14 -14 M-20 -111 q2 -12 10 -16" className="rb-line thin" />
        <Face cx={-28} cy={-94} w={10} mood={mood} size={0.8} />
      </g>
    </g>
  );
}

const ART: Record<Raid.BossId, (p: { mood: Mood }) => ReactNode> = {
  monday: Monday,
  rain: Rain,
  traffic: Traffic,
  deadline: Deadline,
  mosquito: Mosquito,
};

/** ボスの絵（足もとが (0, 0)）。ボスごとの色は .raid-boss.<ID> の --b-* */
export function BossArt({ boss, mood }: { boss: Raid.BossId; mood: Mood }) {
  const Art = ART[boss];
  return (
    <g className={`raid-boss-art ${boss}`}>
      <Art mood={mood} />
    </g>
  );
}

/** 並びや一覧に出す小さなボスの絵（全身が収まる viewBox） */
export function BossIcon({ boss, className = "" }: { boss: Raid.BossId; className?: string }) {
  return (
    <svg viewBox="-70 -150 140 156" className={`raid-boss-icon ${boss} ${className}`} aria-hidden>
      <BossArt boss={boss} mood="angry" />
    </svg>
  );
}
