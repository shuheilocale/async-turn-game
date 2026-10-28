import { useId, type ReactNode } from "react";
import { Mochi } from "@atg/core";

/**
 * ふたりのもちの絵（SVG）。もち・部屋・お世話のしるし・たからもの。
 * もちは「足もとのまん中」を (0, 0) にして上へ描く（部屋の床に置くとき translate するだけでよい）。
 * 体の色は 2 人の色を混ぜたもの（bodyColor）。ほかの色は CSS の変数（MochiBoard.css）で、夜の部屋では変わる
 */

type Stage = Mochi.Stage;
type Form = Mochi.Form;
type Mood = Mochi.Mood;
type Care = Mochi.Care;
type Item = Mochi.Item;
type Act = Mochi.Act;
type Accessory = Mochi.Accessory;

// ---------- 色 ----------

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** a と b を t（0〜1）で混ぜる */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

const INK = "#3b3142";
const BLUSH = "#f08a9c";

/** SVG の id（React の useId はコロンを含むので取り除く） */
const useSvgId = () => useId().replace(/[^a-zA-Z0-9]/g, "");

// ---------- もち ----------

/** 姿ごとの大きさ（幅・高さ）と、体の線のふくらみ（肩の丸さ・横のふくらみ） */
interface Shape {
  w: number;
  h: number;
  shoulder: number;
  side: number;
}

export function shapeOf(stage: Stage, form: Form | null): Shape {
  if (stage === "baby") return { w: 66, h: 50, shoulder: 0.6, side: 0.74 };
  if (stage === "child") return { w: 88, h: 70, shoulder: 0.58, side: 0.74 };
  switch (form) {
    case "round":
      return { w: 130, h: 98, shoulder: 0.66, side: 0.8 };
    case "hop":
      return { w: 94, h: 92, shoulder: 0.46, side: 0.7 };
    case "fluffy":
      return { w: 112, h: 86, shoulder: 0.6, side: 0.76 };
    default:
      return { w: 112, h: 88, shoulder: 0.58, side: 0.75 };
  }
}

/** だいふくのような、下が平らで肩の丸い形 */
export function domePath({ w, h, shoulder, side }: Shape): string {
  const x = w / 2;
  const foot = 0.22;
  return [
    `M ${-x} ${-h * foot}`,
    `C ${-x} ${-h * side} ${-x * shoulder} ${-h} 0 ${-h}`,
    `C ${x * shoulder} ${-h} ${x} ${-h * side} ${x} ${-h * foot}`,
    `C ${x} ${-h * 0.05} ${x * 0.82} 0 ${x * 0.6} 0`,
    `L ${-x * 0.6} 0`,
    `C ${-x * 0.82} 0 ${-x} ${-h * 0.05} ${-x} ${-h * foot} Z`,
  ].join(" ");
}

export interface CreatureProps {
  stage: Stage;
  form: Form | null;
  color: string;
  mood: Mood;
  /** 卵のひびの入り方（卵のあいだの育ち 0〜1） */
  eggProgress?: number;
  /** お世話に喜んだ直後（目を細めて大きく笑う） */
  delighted?: boolean;
  /** おとなが身に着けている小物 */
  accessory?: Accessory | null;
}

/** もち。stage が egg なら卵を描く */
export function Creature(props: CreatureProps) {
  if (props.stage === "egg") return <Egg progress={props.eggProgress ?? 0} />;
  return <Body {...props} />;
}

function Body({ stage, form, color, mood, delighted = false, accessory = null }: CreatureProps) {
  const id = useSvgId();
  const shape = shapeOf(stage, form);
  const { w, h } = shape;
  const d = domePath(shape);
  const line = mix(color, "#4a3c58", 0.5);
  const adult = stage === "adult";
  return (
    <g className={`mochi-creature form-${form ?? stage} mood-${mood}`}>
      <defs>
        <radialGradient id={`${id}b`} cx="0.36" cy="0.26" r="0.85">
          <stop offset="0" stopColor={mix(color, "#ffffff", 0.62)} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={mix(color, "#6a5878", 0.2)} />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <path d={d} />
        </clipPath>
      </defs>

      {/* 影はうごかさない */}
      <ellipse className="mochi-shadow" cx="0" cy="1.5" rx={w * 0.46} ry="5" />

      <g className="mochi-bob">
        <g className="mochi-breathe">
          {adult && form === "fluffy" && <Fluff w={w} h={h} color={color} line={line} grad={`url(#${id}b)`} />}
          {adult && form === "hop" && <Feet w={w} color={color} line={line} />}
          <path d={d} fill={`url(#${id}b)`} stroke={line} strokeWidth="1.6" />
          {/* もちの粉と、つや */}
          <g clipPath={`url(#${id}c)`}>
            <ellipse cx={-w * 0.2} cy={-h * 0.74} rx={w * 0.13} ry={h * 0.075} transform={`rotate(-28 ${-w * 0.2} ${-h * 0.74})`} fill="#fff" opacity="0.55" />
            <circle cx={w * 0.06} cy={-h * 0.9} r="1.3" fill="#fff" opacity="0.75" />
            <circle cx={w * 0.2} cy={-h * 0.8} r="1" fill="#fff" opacity="0.6" />
            <circle cx={-w * 0.07} cy={-h * 0.95} r="0.9" fill="#fff" opacity="0.6" />
            {adult && form === "round" && <ellipse cx="0" cy={-h * 0.24} rx={w * 0.26} ry={h * 0.15} fill="#fff" opacity="0.22" />}
            {adult && form === "explorer" && <Scarf w={w} h={h} />}
          </g>
          {(stage === "child" || adult) && <Arms w={w} h={h} color={color} line={line} />}
          {adult && form === "ears" && <Ears w={w} h={h} color={color} line={line} />}
          <Face w={w} h={h} mood={mood} delighted={delighted} dreamy={adult && form === "dreamy"} />
          {stage === "baby" && <ShellCap h={h} />}
          {adult && form === "dreamy" && <Crescent h={h} />}
          {adult && form === "explorer" && <Sprout h={h} />}
          {adult && form === "harmony" && <Crown w={w} h={h} />}
          {adult && form === "hop" && <Curl h={h} line={line} />}
          {adult && form === "fluffy" && <Tufts h={h} color={color} line={line} />}
          {adult && accessory && <AccessoryArt kind={accessory} w={w} h={h} />}
        </g>
      </g>
    </g>
  );
}

/** 目・ほお・口。ようすで変える */
function Face({ w, h, mood, delighted, dreamy }: { w: number; h: number; mood: Mood; delighted: boolean; dreamy: boolean }) {
  const ey = -h * 0.44;
  const ex = w * 0.17;
  const er = Math.min(4.2, Math.max(2.7, w * 0.034));
  const my = -h * 0.31;
  const m = Math.max(3, w * 0.045);
  const closed = mood === "asleep";
  const happy = delighted || (mood === "happy" && !dreamy);
  const half = mood === "sleepy" || (dreamy && !delighted && !closed);

  const eye = (x: number) => {
    if (closed) return <path d={`M ${x - er * 1.2} ${ey} q ${er * 1.2} ${er * 1.3} ${er * 2.4} 0`} className="mochi-line" />;
    if (delighted) return <path d={`M ${x - er * 1.25} ${ey + er * 0.4} q ${er * 1.25} ${-er * 1.9} ${er * 2.5} 0`} className="mochi-line" />;
    if (half)
      return (
        <g>
          <ellipse cx={x} cy={ey + er * 0.35} rx={er * 0.95} ry={er * 0.55} fill={INK} />
          <path d={`M ${x - er * 1.3} ${ey - er * 0.1} h ${er * 2.6}`} className="mochi-line" />
        </g>
      );
    return (
      <g>
        <ellipse cx={x} cy={ey} rx={er} ry={er * 1.22} fill={INK} />
        <circle cx={x - er * 0.32} cy={ey - er * 0.5} r={er * 0.4} fill="#fff" />
      </g>
    );
  };

  let mouth: ReactNode;
  if (delighted || mood === "happy") mouth = <path d={`M ${-m} ${my - 0.5} q ${m} ${m * 1.5} ${m * 2} 0 z`} fill="#c95a68" stroke="#a8454f" strokeWidth="1" strokeLinejoin="round" />;
  else if (mood === "hungry") mouth = <ellipse cx="0" cy={my + 0.5} rx={m * 0.42} ry={m * 0.55} fill="#b4505b" />;
  else if (closed) mouth = <ellipse className="mochi-snore" cx="0" cy={my + 0.5} rx={m * 0.3} ry={m * 0.36} fill="#b4505b" />;
  else if (mood === "sad") mouth = <path d={`M ${-m * 0.75} ${my + m * 0.45} q ${m * 0.75} ${-m * 0.7} ${m * 1.5} 0`} className="mochi-line" />;
  else mouth = <path d={`M ${-m * 0.8} ${my} q ${m * 0.8} ${m * 0.8} ${m * 1.6} 0`} className="mochi-line" />;

  return (
    <g className="mochi-face">
      <ellipse cx={-w * 0.3} cy={-h * 0.33} rx={w * 0.066} ry={w * 0.04} fill={BLUSH} opacity={happy ? 0.62 : 0.42} />
      <ellipse cx={w * 0.3} cy={-h * 0.33} rx={w * 0.066} ry={w * 0.04} fill={BLUSH} opacity={happy ? 0.62 : 0.42} />
      <g className={closed || delighted ? "" : "mochi-eyes"}>
        {eye(-ex)}
        {eye(ex)}
      </g>
      {mood === "sad" && !delighted && (
        <g className="mochi-line thin">
          <path d={`M ${-ex - er * 1.5} ${ey - er * 1.7} L ${-ex + er * 0.9} ${ey - er * 2.4}`} />
          <path d={`M ${ex + er * 1.5} ${ey - er * 1.7} L ${ex - er * 0.9} ${ey - er * 2.4}`} />
        </g>
      )}
      {mouth}
    </g>
  );
}

/** 小さな手（こども・おとな） */
function Arms({ w, h, color, line }: { w: number; h: number; color: string; line: string }) {
  const x = w / 2 - w * 0.06;
  const y = -h * 0.24;
  const r = Math.max(5, w * 0.07);
  return (
    <g className="mochi-arms">
      <ellipse cx={-x} cy={y} rx={r} ry={r * 0.78} transform={`rotate(25 ${-x} ${y})`} fill={mix(color, "#ffffff", 0.18)} stroke={line} strokeWidth="1.4" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.78} transform={`rotate(-25 ${x} ${y})`} fill={mix(color, "#ffffff", 0.18)} stroke={line} strokeWidth="1.4" />
    </g>
  );
}

/** 赤ちゃんの頭にのった卵のから */
function ShellCap({ h }: { h: number }) {
  const y = -h + 4;
  return (
    <g transform={`rotate(-14 0 ${y}) translate(2 0)`}>
      <path
        d={`M -15 ${y} C -15 ${y - 14} -7 ${y - 19} 0 ${y - 19} C 7 ${y - 19} 15 ${y - 14} 15 ${y} L 10 ${y - 4} L 5 ${y + 1} L 0 ${y - 4} L -5 ${y + 1} L -10 ${y - 4} Z`}
        fill="#fffaf2"
        stroke="#d7c6b0"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="-5" cy={y - 11} r="1.6" fill="var(--mochi-speck0)" />
      <circle cx="6" cy={y - 8} r="1.3" fill="var(--mochi-speck1)" />
    </g>
  );
}

/** おみみもちの、頭から垂れた長い耳 */
function Ears({ w, h, color, line }: { w: number; h: number; color: string; line: string }) {
  const ear = (s: 1 | -1) => {
    const p = (x: number, y: number) => `${s * x * w} ${y * h}`;
    const outer = `M ${p(0.2, -0.99)} C ${p(0.52, -1.04)} ${p(0.68, -0.64)} ${p(0.63, -0.3)} C ${p(0.6, -0.13)} ${p(0.47, -0.12)} ${p(0.46, -0.3)} C ${p(0.44, -0.54)} ${p(0.38, -0.78)} ${p(0.14, -0.9)} C ${p(0.12, -0.94)} ${p(0.14, -0.98)} ${p(0.2, -0.99)} Z`;
    const inner = `M ${p(0.24, -0.94)} C ${p(0.48, -0.96)} ${p(0.6, -0.64)} ${p(0.57, -0.36)} C ${p(0.56, -0.24)} ${p(0.51, -0.24)} ${p(0.5, -0.34)} C ${p(0.48, -0.58)} ${p(0.42, -0.8)} ${p(0.22, -0.9)} Z`;
    return (
      <g key={s} className={`mochi-ear ${s < 0 ? "left" : "right"}`}>
        <path d={outer} fill={mix(color, "#ffffff", 0.08)} stroke={line} strokeWidth="1.5" strokeLinejoin="round" />
        <path d={inner} fill={mix(color, "#f2a7b6", 0.45)} opacity="0.7" />
      </g>
    );
  };
  return <g>{[ear(-1), ear(1)]}</g>;
}

/** ふわもちのふわふわ（体のうしろに丸を並べて、ふちをでこぼこにする） */
function Fluff({ w, h, color, line, grad }: { w: number; h: number; color: string; line: string; grad: string }) {
  const spots: [number, number][] = [
    [-0.5, -0.3],
    [-0.47, -0.55],
    [-0.36, -0.78],
    [-0.18, -0.94],
    [0, -0.99],
    [0.18, -0.94],
    [0.36, -0.78],
    [0.47, -0.55],
    [0.5, -0.3],
  ];
  const r = w * 0.1;
  return (
    <g>
      {spots.map(([x, y], i) => (
        <circle key={i} cx={x * w} cy={y * h} r={r} fill={i % 2 ? grad : mix(color, "#ffffff", 0.25)} stroke={line} strokeWidth="1.5" />
      ))}
    </g>
  );
}

function Tufts({ h, color, line }: { h: number; color: string; line: string }) {
  const y = -h;
  return (
    <g fill={mix(color, "#ffffff", 0.35)} stroke={line} strokeWidth="1.4" strokeLinejoin="round">
      <path d={`M -9 ${y + 4} C -12 ${y - 6} -4 ${y - 10} -1 ${y - 3} C 1 ${y - 11} 11 ${y - 8} 8 ${y + 3} Z`} />
    </g>
  );
}

/** ぴょんもちの足と、頭のくるん */
function Feet({ w, color, line }: { w: number; color: string; line: string }) {
  return (
    <g fill={mix(color, "#4a3c58", 0.12)} stroke={line} strokeWidth="1.4">
      <ellipse cx={-w * 0.2} cy="-1" rx={w * 0.12} ry="5.5" />
      <ellipse cx={w * 0.2} cy="-1" rx={w * 0.12} ry="5.5" />
    </g>
  );
}

function Curl({ h, line }: { h: number; line: string }) {
  const y = -h;
  return <path d={`M 0 ${y + 1} C 0 ${y - 9} 9 ${y - 12} 10 ${y - 6} C 11 ${y - 1} 4 ${y - 1} 5 ${y - 5}`} fill="none" stroke={line} strokeWidth="2.2" strokeLinecap="round" />;
}

/** ねむもちのおでこの三日月と小さな星 */
function Crescent({ h }: { h: number }) {
  const y = -h * 0.72;
  return (
    <g>
      <path d={`M 2.5 ${y - 7} A 7 7 0 1 0 6.5 ${y + 5} A 5.6 5.6 0 1 1 2.5 ${y - 7} Z`} fill="#f3c86a" stroke="#d6a644" strokeWidth="0.9" />
      <path d={`M 12 ${y - 10} l 1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z`} fill="#f7dc8d" />
    </g>
  );
}

/** たびもちの、頭の芽 */
function Sprout({ h }: { h: number }) {
  const y = -h;
  return (
    <g strokeLinejoin="round">
      <path d={`M 0 ${y + 2} C 0 ${y - 4} 1 ${y - 8} 2 ${y - 11}`} fill="none" stroke="#5f9a63" strokeWidth="2" strokeLinecap="round" />
      <path d={`M 2 ${y - 10} C -2 ${y - 18} -12 ${y - 18} -15 ${y - 12} C -9 ${y - 7} -2 ${y - 7} 2 ${y - 10} Z`} fill="#8fcb8b" stroke="#5f9a63" strokeWidth="1.3" />
      <path d={`M 2 ${y - 11} C 5 ${y - 20} 15 ${y - 21} 18 ${y - 15} C 13 ${y - 9} 6 ${y - 8} 2 ${y - 11} Z`} fill="#a6d79c" stroke="#5f9a63" strokeWidth="1.3" />
    </g>
  );
}

/** たびもちのマフラー（体の形で切り取る） */
function Scarf({ w, h }: { w: number; h: number }) {
  // 口の下に結んだ小さなスカーフ（細い帯と、まん中に垂れた三角の布）
  const y = -h * 0.21;
  return (
    <g strokeLinejoin="round">
      <path d={`M ${-w} ${y - 4} Q 0 ${y + 3} ${w} ${y - 4} L ${w} ${y} Q 0 ${y + 7} ${-w} ${y} Z`} fill="#e47a63" />
      <path d={`M -11 ${y + 2} L 11 ${y + 2} L 1 ${y + 15} Z`} fill="#e47a63" stroke="#c95c48" strokeWidth="1" />
      <circle cx="0" cy={y + 7} r="1.3" fill="#f6c3a8" />
      <circle cx="-4.5" cy={y + 4.2} r="1" fill="#f6c3a8" />
      <circle cx="4.5" cy={y + 4.2} r="1" fill="#f6c3a8" />
    </g>
  );
}

/** なかよしもちの花かざり（2 人の色の花） */
function Crown({ w, h }: { w: number; h: number }) {
  const spots: [number, number, number][] = [
    [-0.3, -0.86, 0],
    [-0.15, -0.96, 1],
    [0, -1, 0],
    [0.15, -0.96, 1],
    [0.3, -0.86, 0],
  ];
  return (
    <g>
      {spots.slice(0, -1).map(([x, y], i) => (
        <ellipse key={`l${i}`} cx={(x + 0.075) * w} cy={(y - 0.01) * h} rx="3.4" ry="1.8" transform={`rotate(${x * 90} ${(x + 0.075) * w} ${(y - 0.01) * h})`} fill="#86c08a" />
      ))}
      {spots.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x * w} ${y * h})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3.2} cy={Math.sin((a * Math.PI) / 180) * 3.2} r="2.7" fill={s ? "#f6a868" : "#86a3f3"} />
          ))}
          <circle r="2" fill="#f7d774" />
        </g>
      ))}
    </g>
  );
}

/** おとなの小物。体の大きさ（w・h）に合わせて置く。頭の上のものは、姿のしるしとぶつからないよう少し横に寄せる */
function AccessoryArt({ kind, w, h }: { kind: Accessory; w: number; h: number }) {
  const ink = { stroke: "#5b4a3a", strokeWidth: 1.2, strokeLinejoin: "round" as const };
  switch (kind) {
    case "strawHat": {
      const x = -w * 0.2;
      const y = -h * 0.93;
      return (
        <g transform={`rotate(-14 ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx={w * 0.3} ry={h * 0.07} fill="#ecc66e" {...ink} />
          <path d={`M ${x - w * 0.16} ${y} C ${x - w * 0.16} ${y - h * 0.2} ${x + w * 0.16} ${y - h * 0.2} ${x + w * 0.16} ${y} Z`} fill="#f3d385" {...ink} />
          <path d={`M ${x - w * 0.155} ${y - h * 0.035} Q ${x} ${y - h * 0.01} ${x + w * 0.155} ${y - h * 0.035}`} fill="none" stroke="#d9534f" strokeWidth="3" />
        </g>
      );
    }
    case "nightcap": {
      const y = -h * 0.9;
      return (
        <g>
          <path d={`M ${-w * 0.34} ${y + 4} C ${-w * 0.2} ${y - h * 0.3} ${w * 0.2} ${y - h * 0.34} ${w * 0.46} ${y - h * 0.06} L ${w * 0.1} ${y - h * 0.02} Z`} fill="#8fa0dc" {...ink} />
          <path d={`M ${-w * 0.36} ${y + 5} Q ${-w * 0.1} ${y - 6} ${w * 0.14} ${y - 2}`} fill="none" stroke="#f6f1e6" strokeWidth="5" strokeLinecap="round" />
          <circle cx={w * 0.47} cy={y - h * 0.04} r="5" fill="#f6f1e6" {...ink} />
        </g>
      );
    }
    case "towel": {
      const y = -h * 0.98;
      return (
        <g transform={`rotate(-8 ${-w * 0.05} ${y})`}>
          <rect x={-w * 0.3} y={y - 9} width={w * 0.44} height="12" rx="4" fill="#fbf7ef" {...ink} />
          <path d={`M ${-w * 0.3 + 4} ${y - 5} h ${w * 0.44 - 8} M ${-w * 0.3 + 4} ${y - 1} h ${w * 0.44 - 8}`} stroke="#f2a7b6" strokeWidth="1.6" />
        </g>
      );
    }
    case "leafPin":
      return (
        <g transform={`translate(${-w * 0.36} ${-h * 0.88}) rotate(-20) scale(0.85) translate(-12 -12)`}>
          {itemShapes.momiji}
        </g>
      );
    case "ribbon": {
      const x = w * 0.3;
      const y = -h * 0.86;
      return (
        <g fill="#e86a7a" {...ink}>
          <path d={`M ${x} ${y} l -11 -7 v 14 z`} />
          <path d={`M ${x} ${y} l 11 -7 v 14 z`} />
          <circle cx={x} cy={y} r="3.4" fill="#f08a9c" />
        </g>
      );
    }
    case "garland": {
      const y = -h * 0.2;
      const n = 9;
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const u = i / (n - 1) - 0.5;
            return <circle key={i} cx={u * w * 0.78} cy={y + 5 - Math.cos(u * Math.PI) * 6} r="3.6" fill={i === (n - 1) / 2 ? "#f3a03c" : "#fffaf0"} stroke="#c9b48a" strokeWidth="0.9" />;
          })}
        </g>
      );
    }
    case "uchiwa": {
      const x = w * 0.5;
      const y = -h * 0.52;
      return (
        <g>
          <path d={`M ${x - 2} ${y + 12} L ${w * 0.44} ${-h * 0.25}`} stroke="#b88a55" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx={x} cy={y} r={Math.max(11, w * 0.12)} fill="#eaf4fb" {...ink} />
          <circle cx={x + 2} cy={y + 2} r={Math.max(5, w * 0.055)} fill="#e86a5a" />
        </g>
      );
    }
    case "paint":
      return (
        <g opacity="0.9">
          <path d={`M ${-w * 0.36} ${-h * 0.36} q 5 -4 9 0 q 3 4 -2 6 q -6 2 -7 -6 z`} fill="#6fa8dc" />
          <circle cx={-w * 0.25} cy={-h * 0.27} r="2.2" fill="#f6a868" />
        </g>
      );
    case "glasses": {
      const ex = w * 0.17;
      const ey = -h * 0.44;
      const r = Math.min(7.5, Math.max(5, w * 0.065));
      return (
        <g fill="rgba(255,255,255,0.18)" stroke="#5b4a3a" strokeWidth="1.5">
          <circle cx={-ex} cy={ey} r={r} />
          <circle cx={ex} cy={ey} r={r} />
          <path d={`M ${-ex + r} ${ey} Q 0 ${ey - 3} ${ex - r} ${ey}`} fill="none" />
        </g>
      );
    }
  }
}

/** 卵。育つほどひびが入る */
function Egg({ progress }: { progress: number }) {
  const id = useSvgId();
  const d = "M 0 -84 C 21 -84 34 -52 34 -33 C 34 -12 19 0 0 0 C -19 0 -34 -12 -34 -33 C -34 -52 -21 -84 0 -84 Z";
  const specks: [number, number, number, 0 | 1][] = [
    [-14, -60, 3.2, 0],
    [11, -66, 2.6, 1],
    [-20, -34, 2.4, 1],
    [16, -38, 3.4, 0],
    [-3, -20, 2.6, 0],
    [4, -47, 2, 1],
    [20, -18, 2, 1],
    [-24, -50, 1.8, 0],
  ];
  return (
    <g className="mochi-creature egg">
      <defs>
        <radialGradient id={`${id}e`} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#fbf3e8" />
          <stop offset="1" stopColor="#ecdccb" />
        </radialGradient>
      </defs>
      {/* ふかふかの台 */}
      <ellipse cx="0" cy="-1" rx="44" ry="9" className="mochi-nest" />
      <path d="M -36 -3 q 6 -5 14 -2 M -10 -6 q 8 -4 16 0 M 18 -4 q 7 -4 14 1" className="mochi-nest-line" />
      <g className="mochi-wobble">
        <path d={d} fill={`url(#${id}e)`} stroke="#d6c4ae" strokeWidth="1.6" />
        {specks.map(([x, y, r, s], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={s ? "var(--mochi-speck1)" : "var(--mochi-speck0)"} opacity="0.85" />
        ))}
        <ellipse cx="-13" cy="-62" rx="5.5" ry="10" transform="rotate(-22 -13 -62)" fill="#fff" opacity="0.7" />
        {progress >= 0.45 && <path d="M -17 -57 L -10 -51 L -4 -58 L 2 -51 L 8 -57" className="mochi-crack" />}
        {progress >= 0.75 && <path d="M 8 -57 L 13 -52 L 19 -56 M 24 -40 L 19 -36 L 23 -31" className="mochi-crack" />}
      </g>
    </g>
  );
}

// ---------- 部屋 ----------

/** 部屋の大きさ（viewBox）と、もちを置く床の位置 */
export const ROOM = { w: 360, h: 250, floor: 222 };

/**
 * 部屋。昼は窓に空と雲、夜（暗い画面）は月と星と、明かりのついたランプ。
 * shelf には最近のたからもの（3 つまで）をのせる
 */
export function Room({ shelf, children }: { shelf: Item[]; children: ReactNode }) {
  const id = useSvgId();
  return (
    <>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mochi-wall)" />
          <stop offset="1" stopColor="var(--mochi-wall-2)" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mochi-sky-top)" />
          <stop offset="1" stopColor="var(--mochi-sky-bottom)" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}win`}>
          <rect x="32" y="30" width="82" height="76" rx="7" />
        </clipPath>
      </defs>

      <rect width={ROOM.w} height="178" fill={`url(#${id}w)`} />
      <rect y="176" width={ROOM.w} height={ROOM.h - 176} className="mochi-floor" />
      <path d="M 0 198 H 360 M 0 226 H 360" className="mochi-floor-line" />
      <path d="M 70 176 v 22 M 210 176 v 22 M 140 198 v 28 M 290 198 v 28 M 40 226 v 24 M 250 226 v 24" className="mochi-floor-line" />
      <rect y="172" width={ROOM.w} height="6" className="mochi-skirting" />

      {/* 窓 */}
      <rect x="26" y="24" width="94" height="88" rx="11" className="mochi-frame" />
      <rect x="32" y="30" width="82" height="76" rx="7" fill={`url(#${id}s)`} />
      <g clipPath={`url(#${id}win)`}>
        <g className="mochi-win-day">
          <circle cx="94" cy="50" r="10" fill="#ffe6a3" opacity="0.9" />
          <g className="mochi-cloud">
            <path d="M 40 74 a 8 8 0 0 1 14 -5 a 10 10 0 0 1 18 4 a 6 6 0 0 1 2 12 h -32 a 6 6 0 0 1 -2 -11 z" fill="#fff" opacity="0.92" />
          </g>
        </g>
        <g className="mochi-win-night">
          <path d="M 92 40 a 11 11 0 1 0 8 19 a 9 9 0 1 1 -8 -19 z" fill="#f6e7b0" />
          <circle className="mochi-star" cx="48" cy="46" r="1.4" fill="#fff" />
          <circle className="mochi-star s2" cx="66" cy="62" r="1" fill="#fff" />
          <circle className="mochi-star s3" cx="44" cy="84" r="1.2" fill="#fff" />
          <circle className="mochi-star s2" cx="104" cy="88" r="1" fill="#fff" />
        </g>
      </g>
      <path d="M 73 30 V 106 M 32 68 H 114" className="mochi-frame-bar" />
      <rect x="20" y="110" width="106" height="7" rx="3.5" className="mochi-sill" />

      {/* 棚とたからもの */}
      <rect x="236" y="96" width="98" height="6" rx="3" className="mochi-shelf" />
      <path d="M 250 102 l 4 8 M 320 102 l -4 8" className="mochi-shelf-line" />
      {shelf.length === 0 ? (
        <g transform="translate(285 96)">
          <path d="M -9 0 l 2 -12 h 14 l 2 12 z" className="mochi-pot" />
          <path d="M 0 -12 C -2 -20 -10 -24 -14 -22 C -12 -16 -6 -13 0 -12 M 0 -12 C 2 -21 9 -26 14 -23 C 12 -17 6 -13 0 -12" className="mochi-leaf" />
        </g>
      ) : (
        shelf.slice(-3).map((item, i, all) => (
          <g key={`${item}-${i}`} transform={`translate(${285 + (i - (all.length - 1) / 2) * 30 - 12} 72)`}>
            <ItemIcon item={item} />
          </g>
        ))
      )}

      {/* 鉢植え */}
      <g transform="translate(46 204)">
        <path d="M -14 -6 C -22 -24 -16 -40 -6 -44 C -4 -32 -6 -18 -2 -8 M 2 -8 C 4 -24 12 -38 22 -38 C 20 -26 12 -14 4 -6 M 0 -8 C -2 -26 0 -46 6 -54 C 10 -42 6 -24 2 -8" className="mochi-plant" />
        <path d="M -14 -8 h 28 l -3 20 h -22 z" className="mochi-pot" />
      </g>

      {/* ランプ（夜だけ明かりがつく） */}
      <g transform="translate(326 176)">
        <circle cx="0" cy="-62" r="46" fill={`url(#${id}g)`} className="mochi-glow" />
        <path d="M 0 -52 V -2 M -9 0 h 18" className="mochi-lamp-pole" />
        <path d="M -12 -54 l 4 -16 h 16 l 4 16 z" className="mochi-lamp-shade" />
      </g>

      {/* じゅうたん */}
      <ellipse cx="180" cy={ROOM.floor} rx="112" ry="19" className="mochi-rug" />
      <ellipse cx="180" cy={ROOM.floor} rx="98" ry="14" className="mochi-rug-line" />
      {children}
    </>
  );
}

// ---------- 喜んだときの小さなしるし ----------

export type Spark = "heart" | "note" | "z" | "leaf" | "star" | "crumb";

/** お世話ごとに出すしるし */
export const sparkOf = (care: Care): Spark =>
  ({ feed: "crumb", play: "note", pet: "heart", talk: "note", sleep: "z", walk: "leaf" })[care] as Spark;

export function SparkShape({ kind }: { kind: Spark }) {
  switch (kind) {
    case "heart":
      return <path d="M 0 4 C -6 -1 -6 -6 -3 -7 C -1.5 -7.6 0 -6.5 0 -5 C 0 -6.5 1.5 -7.6 3 -7 C 6 -6 6 -1 0 4 Z" fill="#f2879d" />;
    case "note":
      return (
        <g fill="#8d7fd6">
          <ellipse cx="-2" cy="3" rx="3" ry="2.3" transform="rotate(-20 -2 3)" />
          <path d="M 0.6 2.6 V -7 l 5 1.6 v 2.4 l -3.4 -1 V 2.6 z" />
        </g>
      );
    case "z":
      return <path d="M -4 -4 h 7 l -7 8 h 7" fill="none" stroke="#8fa0dc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
    case "leaf":
      return <path d="M -5 4 C -5 -3 0 -7 6 -6 C 6 0 2 5 -5 4 Z" fill="#8fcb8b" stroke="#5f9a63" strokeWidth="1" />;
    case "star":
      return <path d="M 0 -6 L 1.6 -1.6 L 6 0 L 1.6 1.6 L 0 6 L -1.6 1.6 L -6 0 L -1.6 -1.6 Z" fill="#f7cf63" />;
    case "crumb":
      return (
        <g>
          <path d="M 0 -5 C 2 -5 3.2 -3.6 4.4 -1.6 L 5.6 1.2 C 6.2 2.8 5 4.4 3.4 4.4 H -3.4 C -5 4.4 -6.2 2.8 -5.6 1.2 L -4.4 -1.6 C -3.2 -3.6 -2 -5 0 -5 Z" fill="#fff" stroke="#3b3142" strokeWidth="0.9" />
          <rect x="-2.6" y="1" width="5.2" height="3.4" fill="#2f3b35" />
        </g>
      );
  }
}

// ---------- お世話のしるし ----------

export function CareIcon({ care }: { care: Care }) {
  return (
    <svg viewBox="0 0 24 24" className="mochi-icon" aria-hidden>
      {careShapes[care]}
    </svg>
  );
}

/** お世話のしるしの中身だけ（部屋の吹き出しなど、ほかの SVG の中に置くとき） */
export const CareShape = ({ care }: { care: Care }) => <>{careShapes[care]}</>;

const careShapes: Record<Care, ReactNode> = {
  feed: (
    <>
      <path d="M12 4.2c1.7 0 2.8 1 3.8 2.6l4 7.4c1.1 2-.4 4.6-2.7 4.6H6.9c-2.3 0-3.8-2.6-2.7-4.6l4-7.4c1-1.6 2.1-2.6 3.8-2.6z" className="ic-white" />
      <path d="M8.8 14.6h6.4v4.2H8.8z" className="ic-nori" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="7.6" className="ic-yellow" />
      <path d="M4.8 10.2c4.2 1.8 10.2 1.8 14.4 0M9 4.8c2.6 3.8 2.6 10.6 0 14.4" className="ic-stripe" />
    </>
  ),
  pet: (
    <>
      <path d="M12 19.5C6.5 15.6 4.2 12.8 4.2 10a3.8 3.8 0 0 1 7.8-1.3A3.8 3.8 0 0 1 19.8 10c0 2.8-2.3 5.6-7.8 9.5z" className="ic-pink" />
      <path d="M6.5 4.6q5.5-2.6 11 0" className="ic-motion" />
    </>
  ),
  talk: (
    <>
      <path d="M5.2 5.5h13.6a2.2 2.2 0 0 1 2.2 2.2v7a2.2 2.2 0 0 1-2.2 2.2H11l-4.2 3.1v-3.1H5.2A2.2 2.2 0 0 1 3 14.7v-7a2.2 2.2 0 0 1 2.2-2.2z" className="ic-white" />
      <circle cx="8" cy="11.2" r="1.3" className="ic-dot" />
      <circle cx="12" cy="11.2" r="1.3" className="ic-dot" />
      <circle cx="16" cy="11.2" r="1.3" className="ic-dot" />
    </>
  ),
  sleep: (
    <>
      <path d="M14.6 3.8a8.2 8.2 0 1 0 5.6 13.4A6.8 6.8 0 0 1 14.6 3.8z" className="ic-moon" />
      <path d="M18.2 4.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" className="ic-star" />
    </>
  ),
  walk: (
    <>
      <path d="M4.6 19.4c0-8.4 6-14.4 14.8-14.4 0 8.6-6 14.4-14.8 14.4z" className="ic-leaf" />
      <path d="M4.6 19.4L14.2 9.8" className="ic-vein" />
    </>
  ),
};

// ---------- やることのしるし ----------

/** おでかけの行き先の絵 */
const placeShapes: Record<Mochi.Place, ReactNode> = {
  park: (
    <>
      <path d="M12 21v-6" stroke="#8a5a3a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="10" r="6.4" fill="#8fcb8b" stroke="#5f9a63" strokeWidth="1" />
      <circle cx="9.6" cy="8.4" r="1.6" fill="#b5dfae" />
      <path d="M3.5 21h17" stroke="#5f9a63" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  market: (
    <>
      <path d="M4 9.5h16v10H4z" fill="#fbf3e2" stroke="#b07a4a" strokeWidth="1" />
      <path d="M3 9.5l2-5h14l2 5c0 1.4-1.3 2-2.3 2s-2.2-.6-2.2-2c0 1.4-1.3 2-2.3 2S12 10.9 12 9.5c0 1.4-1.2 2-2.2 2s-2.3-.6-2.3-2c0 1.4-1.2 2-2.2 2S3 10.9 3 9.5z" fill="#ef8f6a" stroke="#b9573c" strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx="9" cy="16.5" r="1.8" fill="#f7bf45" />
      <circle cx="13.4" cy="16.5" r="1.8" fill="#8fcb8b" />
    </>
  ),
  sea: (
    <>
      <circle cx="16.5" cy="7.5" r="3.4" fill="#f7cf63" />
      <path d="M2.5 14.5c2.4-2 4.6-2 7 0s4.6 2 7 0 4-1.6 5 0V21h-19z" fill="#7cc1e8" stroke="#4a92bf" strokeWidth="1" strokeLinejoin="round" />
      <path d="M5 18.2c1.6-1 3-1 4.6 0" stroke="#d8eefa" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </>
  ),
  festival: (
    <>
      <path d="M12 2.5v2.4" stroke="#7a5236" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="8.6" y="4.4" width="6.8" height="2" rx="0.8" fill="#4b3a33" />
      <ellipse cx="12" cy="12.4" rx="6.6" ry="6.4" fill="#ef6a55" stroke="#b9473a" strokeWidth="1" />
      <path d="M6 10.4h12M5.6 13.4h12.8M6.4 16.2h11.2" stroke="#f6b4a6" strokeWidth="0.9" />
      <rect x="8.6" y="18.4" width="6.8" height="2" rx="0.8" fill="#4b3a33" />
    </>
  ),
};

/** やることのしるし。行き先と、たからものを使うやることだけ（ほかは null） */
export function ActIcon({ act }: { act: Act }) {
  const def = Mochi.ACT_DEFS[act] as Mochi.ActDef;
  if (def.place) {
    return (
      <svg viewBox="0 0 24 24" className="mochi-icon" aria-hidden>
        {placeShapes[def.place]}
      </svg>
    );
  }
  if (typeof def.unlock === "object" && "item" in def.unlock) return <ItemSvg item={def.unlock.item} className="mochi-icon" />;
  return null;
}

// ---------- たからもの ----------

/** たからものの絵（24 × 24。部屋の棚では、そのまま置く） */
export function ItemIcon({ item }: { item: Item }) {
  return <g className="mochi-item">{itemShapes[item]}</g>;
}

export function ItemSvg({ item, className = "" }: { item: Item; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`mochi-item-svg ${className}`} aria-hidden>
      <ItemIcon item={item} />
    </svg>
  );
}

const itemShapes: Record<Item, ReactNode> = {
  mango: (
    <>
      <path d="M5 14.2C5 9 9 5.2 14 5.2c3.4 0 5.6 2.4 5.6 5.6 0 5.2-4.6 9.6-9.6 9.6C7.2 20.4 5 17.8 5 14.2z" fill="#f7bf45" stroke="#c98a2a" strokeWidth="1" />
      <path d="M8 16.5c1.5 2 4.5 2.4 7 .8" fill="none" stroke="#f08a3c" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M13.6 5.4c.8-2.4 3.4-3.6 6.2-3.2-1 2.6-3.6 3.6-6.2 3.2z" fill="#74b05e" stroke="#4f8a3c" strokeWidth="0.8" />
    </>
  ),
  tapioca: (
    <>
      {[
        [8, 15.5],
        [15.8, 15.5],
        [11.9, 8.6],
      ].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="4.3" fill="#4b3530" stroke="#8d6b5f" strokeWidth="0.8" />
          <circle cx={x! - 1.3} cy={y! - 1.4} r="1.2" fill="#fff" opacity="0.55" />
        </g>
      ))}
    </>
  ),
  sakura: (
    <>
      <path d="M12 6.4L10.2 3.6C6.4 6 5 10 6 14c1 3.8 3.8 6 6 7 2.2-1 5-3.2 6-7 1-4-.4-8-4.2-10.4z" fill="#f8c6d2" stroke="#e294a9" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12 9.5v8" stroke="#ea9fb3" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  jasmine: (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="12" cy="7.2" rx="2.9" ry="4.6" transform={`rotate(${a} 12 12)`} fill="#fff" stroke="#c9d3c2" strokeWidth="0.9" />
      ))}
      <circle cx="12" cy="12" r="2.1" fill="#f1dd8e" />
    </>
  ),
  bell: (
    <>
      <path d="M12 6.4V3.4" stroke="#d9534f" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="13.2" r="7" fill="#eebd4c" stroke="#b98a26" strokeWidth="1" />
      <path d="M7.8 14.8h8.4" stroke="#9c7420" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="1.2" fill="#9c7420" />
      <circle cx="9.6" cy="10.4" r="1.4" fill="#fff" opacity="0.6" />
    </>
  ),
  plumeria: (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d="M12 12C9.6 9.6 9.8 5.2 12.6 4c2.4 1.6 2 5.6-.6 8z" transform={`rotate(${a} 12 12)`} fill="#fffaf0" stroke="#e6cfa2" strokeWidth="0.8" />
      ))}
      <circle cx="12" cy="12" r="2.6" fill="#f6c650" />
    </>
  ),
  coconut: (
    <>
      <circle cx="12" cy="14.4" r="7" fill="#7db55c" stroke="#4f8a3c" strokeWidth="1" />
      <ellipse cx="12" cy="9.4" rx="4.4" ry="1.7" fill="#f5f1dc" stroke="#4f8a3c" strokeWidth="0.8" />
      <path d="M13 9.4L17.4 2.6" stroke="#f08ab0" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  acorn: (
    <>
      <path d="M7 10.6h10c0 5.2-2.6 9.2-5 9.2s-5-4-5-9.2z" fill="#cc8d4f" stroke="#9a6233" strokeWidth="1" />
      <path d="M5.6 10.8c0-3.2 2.8-5.4 6.4-5.4s6.4 2.2 6.4 5.4z" fill="#86593a" stroke="#6a432a" strokeWidth="1" />
      <path d="M12 5.4V3" stroke="#6a432a" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  momiji: (
    <>
      <path d="M12 2.8l1.6 4.4 3.4-2-.8 4 4.2-.6-2.8 3.2 3 1.4-4.2 1.4.8 2.8L13 16v4.8h-2V16l-4.2 1.4.8-2.8-4.2-1.4 3-1.4-2.8-3.2 4.2.6-.8-4 3.4 2z" fill="#e8653f" stroke="#c24a2a" strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  marble: (
    <>
      <circle cx="12" cy="12" r="7.6" fill="#a7d3f2" stroke="#6aa0cf" strokeWidth="1" />
      <path d="M7.2 14c2-3.6 6.6-1.6 9.4-4.8" fill="none" stroke="#ec7d97" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9.4" cy="8.6" r="1.8" fill="#fff" opacity="0.75" />
    </>
  ),
  crane: (
    <>
      <path d="M3.4 14.6l8.6-3.4 8.6 3.4-8.6 2.4z" fill="#e8707d" stroke="#c4505e" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M12 11.2L8 3.6l5.4 8.6z" fill="#f3a0a8" stroke="#c4505e" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M12 11.2l4.6-6.6-1.4 8z" fill="#f08c96" stroke="#c4505e" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M20.6 14.6l1-4.2-2.4 2.6" fill="#e8707d" stroke="#c4505e" strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  shell: (
    <>
      <path d="M12 19.4C6.4 19.4 3.2 13.4 4 9.4 5.6 5.4 8.8 4.2 12 4.2s6.4 1.2 8 5.2c.8 4-2.4 10-8 10z" fill="#f8dccb" stroke="#d3a58a" strokeWidth="1" />
      <path d="M12 19V5M12 19L7 6.6M12 19l5-12.4M12 19L4.6 10M12 19l7.4-9" stroke="#e1b79d" strokeWidth="0.8" />
      <path d="M9.6 19.4h4.8l-.8 1.8h-3.2z" fill="#e9c1a9" />
    </>
  ),
  furin: (
    <>
      <path d="M12 3.6v1.6" stroke="#7fb4d4" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6 11.6c0-3.8 2.6-6.4 6-6.4s6 2.6 6 6.4z" fill="#cbe9f7" stroke="#7fb4d4" strokeWidth="1" />
      <path d="M8 9.4c1-1.6 2.4-2.2 3.4-2.2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="9.6" cy="9.6" r="0.9" fill="#ec7d97" />
      <path d="M12 11.6v2" stroke="#7fb4d4" strokeWidth="1" />
      <rect x="10.4" y="13.6" width="3.2" height="7" rx="0.6" fill="#f5d667" stroke="#d8b23e" strokeWidth="0.7" />
    </>
  ),
  elephant: (
    <>
      <path d="M5.6 17.6v-4.2c0-3.6 2.8-6.2 6.6-6.2h1.4c2.8 0 4.8 1.8 5.2 4.6l.4 3.2c.2 1.4-1.4 1.8-1.8.6l-.4-1.4v3.4h-2.4v-2.6h-4.8v2.6H7.6v-1.8c-.6.6-2 .6-2-.2z" fill="#b3a9d6" stroke="#7f73ad" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M8.8 7.6c-2.4 0-3.6 1.8-3.4 3.8.2 1.6 1.6 2.4 3 2" fill="#c8bfe6" stroke="#7f73ad" strokeWidth="0.9" />
      <path d="M10.6 7.4h4.6l-.6 3.2h-3.4z" fill="#e88e8e" />
      <circle cx="16.4" cy="10.4" r="0.8" fill="#3b3142" />
    </>
  ),
  krathong: (
    <>
      <path d="M2.8 15.4h18.4l-3.2 4.2H6z" fill="#76ad59" stroke="#4f8a3c" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M5 15.4l1.6-2.6 1.6 2.6 1.6-2.6 1.6 2.6M12.8 15.4l1.6-2.6 1.6 2.6 1.6-2.6 1.6 2.6" fill="#92c470" stroke="#4f8a3c" strokeWidth="0.7" />
      <circle cx="12" cy="12.6" r="3" fill="#f39a4a" />
      <circle cx="12" cy="12.6" r="1.4" fill="#f7d774" />
      <path d="M15.6 12.6V8.6" stroke="#f3eee2" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.6 7.8c-.9-1-.7-2.2 0-3 .7.8.9 2 0 3z" fill="#f6c94c" />
    </>
  ),
  clover: (
    <>
      <path d="M12 12c1 3.6 1.4 6.2.8 8.8" stroke="#4f8a3c" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {[
        [8.6, 8.6],
        [15.4, 8.6],
        [8.6, 15.2],
        [15.4, 15.2],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.6" fill="#7dbb72" stroke="#4f8a3c" strokeWidth="0.8" />
      ))}
      <circle cx="12" cy="12" r="1.2" fill="#a6d79c" />
    </>
  ),
};
