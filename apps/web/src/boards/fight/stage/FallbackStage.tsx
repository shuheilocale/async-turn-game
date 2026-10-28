import { useEffect, useRef, useState } from "react";
import { statLevel } from "./body.ts";
import type { FighterLook, FighterStageProps, StyleId } from "./types.ts";

/**
 * WebGL が使えないとき（と、3D を読み込んでいるあいだ）の 2D（SVG）の舞台。
 * 横から見た 2 人（または 1 人）を棒と丸で描き、攻防が来たら少し動かして、終わったことを知らせる
 */

/** バックボーンごとの構えの低さ・前かがみ・手の高さ。ないものはふつうの構えで描く */
const STANCE: Partial<Record<StyleId, { low: number; lean: number; hands: number }>> = {
  boxing: { low: 0.06, lean: 0.12, hands: 0.92 },
  muaythai: { low: 0.03, lean: 0.02, hands: 0.95 },
  karate: { low: 0.1, lean: 0, hands: 0.7 },
  taekwondo: { low: 0.04, lean: 0, hands: 0.72 },
  judo: { low: 0.12, lean: 0.15, hands: 0.72 },
  bjj: { low: 0.18, lean: 0.25, hands: 0.75 },
  wrestling: { low: 0.24, lean: 0.45, hands: 0.7 },
  mma: { low: 0.09, lean: 0.12, hands: 0.86 },
  capoeira: { low: 0.14, lean: 0.12, hands: 0.8 },
  sumo: { low: 0.2, lean: 0.18, hands: 0.66 },
  kickboxing: { low: 0.06, lean: 0.1, hands: 0.92 },
  taichi: { low: 0.08, lean: 0, hands: 0.7 },
  gamer: { low: 0.03, lean: 0.3, hands: 0.55 },
  magician: { low: 0.02, lean: -0.04, hands: 0.6 },
  nurse: { low: 0.04, lean: 0.04, hands: 0.66 },
  swimmer: { low: 0.02, lean: 0, hands: 0.3 },
  idol: { low: 0.03, lean: -0.02, hands: 0.72 },
  rapper: { low: 0.05, lean: -0.06, hands: 0.62 },
  chef: { low: 0.05, lean: 0.04, hands: 0.6 },
  robot: { low: 0.03, lean: 0, hands: 0.66 },
  ninja: { low: 0.2, lean: 0.22, hands: 0.78 },
  tuktuk: { low: 0.04, lean: 0.1, hands: 0.55 },
  stuntman: { low: 0.07, lean: 0.08, hands: 0.82 },
  salaryman: { low: 0.01, lean: -0.04, hands: 0.62 },
  bubbletea: { low: 0.02, lean: -0.02, hands: 0.74 },
  kendo: { low: 0.04, lean: 0, hands: 0.72 },
  luchador: { low: 0.07, lean: -0.05, hands: 0.82 },
  firefighter: { low: 0.09, lean: 0.06, hands: 0.52 },
  dj: { low: 0.05, lean: 0.02, hands: 0.7 },
  investor: { low: 0.02, lean: -0.03, hands: 0.6 },
  dino: { low: 0.07, lean: 0.05, hands: 0.74 },
};

/**
 * 格闘家ではない人たちの見分け方：胴と脚の色・頭にかぶるもの・持ち物・首まわりと体の印。
 * 色の seat はその人の色、white・black・metal は決まった色
 */
type Paint = "seat" | "white" | "black" | "metal" | "navy" | "tan" | "green";
interface Look {
  body?: Paint;
  legs?: Paint;
  hat?: "tophat" | "toque" | "cap" | "swim" | "headset" | "antenna" | "mic" | "hood" | "bandana" | "men" | "mask" | "helmet" | "capf" | "glasses" | "dino";
  prop?: "cane" | "pan" | "penlight" | "bag" | "cup" | "shinai" | "nozzle" | "tablet";
  /** 首まわり：タオル・ネクタイ・ヘッドホン */
  neck?: "towel" | "tie" | "phones";
  /**
   * 体の印：ひじ・ひざのプロテクター・胸当てのエプロン・帯・剣道の胴と袴・ルチャの白いブーツ・反射の帯・ベスト・
   * 恐竜のしっぽとおなか
   */
  mark?: "pads" | "apron" | "belt" | "bogu" | "boots" | "reflect" | "vest" | "tail";
}
const LOOK: Partial<Record<StyleId, Look>> = {
  kickboxing: { legs: "seat" },
  taichi: { body: "white", legs: "black" },
  gamer: { body: "seat", legs: "black", hat: "headset" },
  magician: { body: "black", legs: "black", hat: "tophat", prop: "cane" },
  nurse: { body: "seat", legs: "seat" },
  swimmer: { hat: "swim" },
  idol: { body: "seat", legs: "white", hat: "mic", prop: "penlight" },
  rapper: { body: "seat", legs: "black", hat: "cap" },
  chef: { body: "white", legs: "black", hat: "toque", prop: "pan" },
  robot: { body: "metal", legs: "metal", hat: "antenna" },
  ninja: { body: "black", legs: "black", hat: "hood", mark: "belt" },
  tuktuk: { body: "seat", legs: "black", neck: "towel" },
  stuntman: { body: "black", legs: "black", mark: "pads" },
  salaryman: { body: "black", legs: "black", neck: "tie", prop: "bag" },
  bubbletea: { body: "white", legs: "black", hat: "bandana", prop: "cup", mark: "apron" },
  kendo: { body: "navy", legs: "navy", hat: "men", prop: "shinai", mark: "bogu" },
  luchador: { legs: "seat", hat: "mask", mark: "boots" },
  firefighter: { body: "tan", legs: "tan", hat: "helmet", prop: "nozzle", mark: "reflect" },
  dj: { body: "seat", legs: "black", hat: "capf", neck: "phones" },
  investor: { body: "white", legs: "black", hat: "glasses", neck: "tie", prop: "tablet", mark: "vest" },
  dino: { body: "green", legs: "green", hat: "dino", mark: "tail" },
};
const paintClass = (p: Paint | undefined) => (p ? ` paint-${p}` : "");

export function Figure({ look, x, facing, hit, down }: { look: FighterLook | null; x: number; facing: 1 | -1; hit: boolean; down: boolean }) {
  const st = (look && STANCE[look.style]) || { low: 0.03, lean: 0.05, hands: 0.8 };
  const power = look ? statLevel(look.stats.power) : 0;
  const guard = look ? statLevel(look.stats.guard) : 0;
  const speed = look ? statLevel(look.stats.speed) : 0;
  const w = 1 + 0.12 * power + 0.1 * guard - 0.08 * speed;
  const hip = 92 - st.low * 40;
  const shoulder = hip - 40;
  const lean = st.lean * 14 * facing;
  const head = { x: lean * 1.3, y: shoulder - 15 };
  const hand = { x: 18 * facing + lean, y: shoulder + (1 - st.hands) * 40 };
  const cls = look ? `seat${look.seat}` : "sil";
  const lk: Look = (look && LOOK[look.style]) || {};
  // ひざ・ひじ（プロテクターの印を付ける場所）
  const knee = { x: 7 * facing, y: (140 + hip) / 2 };
  const elbow = { x: (lean + hand.x) / 2, y: (shoulder + hand.y) / 2 + 3 };
  if (down)
    return (
      <g transform={`translate(${x} 0)`} className={`fs2-fig ${cls}`}>
        <line x1={-30 * facing} y1={136} x2={20 * facing} y2={136} className="fs2-limb thick" />
        <circle cx={-40 * facing} cy={133} r={9} className="fs2-head" />
      </g>
    );
  return (
    <g transform={`translate(${x} 0)`} className={`fs2-fig ${cls}${hit ? " hit" : ""}`}>
      <g className="fs2-breath">
        {lk.mark === "tail" && (
          <g>
            <path d={`M ${-3 * facing} ${hip + 2} Q ${-22 * facing} ${hip + 10} ${-36 * facing} 139`} className="fs2-tail" />
            {[0.3, 0.6].map((u) => (
              <circle key={u} cx={-(3 + 30 * u) * facing} cy={hip + 2 + (139 - hip) * u * u - 3} r={2.4} className="fs2-spike" />
            ))}
          </g>
        )}
        <line x1={-10 * facing} y1={140} x2={0} y2={hip} className={`fs2-limb${paintClass(lk.legs)}`} />
        <line x1={14 * facing} y1={140} x2={0} y2={hip} className={`fs2-limb${paintClass(lk.legs)}`} />
        {/* 袴：腰から裾へ大きく広がる */}
        {lk.mark === "bogu" && <path d={`M -6 ${hip - 2} L 6 ${hip - 2} L ${22 * facing} 141 L ${-18 * facing} 141 Z`} className="fs2-skirt" />}
        {lk.mark === "boots" &&
          [-10, 14].map((fx) => <line key={fx} x1={fx * facing} y1={140} x2={fx * facing * 0.62} y2={140 - (140 - hip) * 0.38} className="fs2-boot" />)}
        {lk.mark === "reflect" &&
          [-10, 14].map((fx) => <line key={fx} x1={fx * facing * 0.72 - 4} y1={140 - (140 - hip) * 0.28} x2={fx * facing * 0.72 + 4} y2={140 - (140 - hip) * 0.28} className="fs2-reflect" />)}
        <line x1={0} y1={hip} x2={lean} y2={shoulder} className={`fs2-limb thick${paintClass(lk.body)}`} style={{ strokeWidth: 13 * w }} />
        {lk.mark === "vest" && <line x1={0} y1={hip} x2={lean} y2={shoulder + 3} className="fs2-vest" style={{ strokeWidth: 9 * w }} />}
        {lk.mark === "bogu" && <line x1={lean * 0.3 + 3 * facing} y1={hip - 6} x2={lean * 0.85 + 3 * facing} y2={shoulder + 8} className="fs2-do" style={{ strokeWidth: 9 * w }} />}
        {lk.mark === "reflect" && <line x1={lean * 0.6 - 6} y1={shoulder + 14} x2={lean * 0.6 + 6} y2={shoulder + 14} className="fs2-reflect" />}
        {lk.mark === "tail" && <line x1={lean * 0.25 + 4 * facing} y1={hip - 6} x2={lean * 0.8 + 4 * facing} y2={shoulder + 8} className="fs2-belly" style={{ strokeWidth: 7 * w }} />}
        <line x1={lean} y1={shoulder} x2={hand.x} y2={hand.y} className={`fs2-limb${paintClass(lk.body)}`} />
        <line x1={lean} y1={shoulder + 2} x2={hand.x - 9 * facing} y2={hand.y + 6} className={`fs2-limb${paintClass(lk.body)}`} />
        {lk.prop === "cane" && <line x1={hand.x} y1={hand.y} x2={hand.x + 6 * facing} y2={140} className="fs2-prop" />}
        {lk.prop === "pan" && (
          <g className="fs2-prop">
            <line x1={hand.x} y1={hand.y} x2={hand.x + 12 * facing} y2={hand.y - 2} />
            <ellipse cx={hand.x + 20 * facing} cy={hand.y - 3} rx={9} ry={3.5} />
          </g>
        )}
        {lk.prop === "penlight" && <line x1={hand.x} y1={hand.y} x2={hand.x + 3 * facing} y2={hand.y - 14} className="fs2-light" />}
        {lk.mark === "apron" && <line x1={lean * 0.75} y1={shoulder + 9} x2={-1 * facing} y2={hip + 16} className="fs2-apron" />}
        {lk.mark === "belt" && <line x1={-6} y1={hip - 3} x2={6} y2={hip - 3} className="fs2-tie" strokeWidth={4} />}
        {lk.neck === "tie" && <line x1={lean} y1={shoulder + 1} x2={lean * 0.8} y2={shoulder + 17} className="fs2-tie" />}
        {lk.neck === "towel" && (
          <g className="fs2-towel">
            <line x1={lean - 6} y1={shoulder + 1} x2={lean + 6} y2={shoulder + 1} />
            <line x1={lean + 4 * facing} y1={shoulder + 1} x2={lean + 4 * facing} y2={shoulder + 12} />
          </g>
        )}
        {lk.mark === "pads" && (
          <g className="fs2-pad">
            <circle cx={knee.x} cy={knee.y} r={3.4} />
            <circle cx={-knee.x * 0.6} cy={knee.y} r={3.4} />
            <circle cx={elbow.x} cy={elbow.y} r={3} />
          </g>
        )}
        {lk.prop === "bag" && (
          <g className="fs2-bag">
            <rect x={hand.x - 7} y={hand.y + 3} width={14} height={10} rx={2} />
            <line x1={hand.x - 3} y1={hand.y + 3} x2={hand.x - 1} y2={hand.y} />
          </g>
        )}
        {lk.prop === "shinai" && (
          <g>
            <line x1={hand.x - 8 * facing} y1={hand.y + 4} x2={hand.x + 40 * facing} y2={hand.y - 18} className="fs2-shinai" />
            <line x1={hand.x + 2 * facing} y1={hand.y - 4} x2={hand.x + 2 * facing} y2={hand.y + 2} className="fs2-tsuba" />
          </g>
        )}
        {lk.prop === "nozzle" && (
          <g>
            <path d={`M ${hand.x - 4 * facing} ${hand.y + 2} Q ${-14 * facing} ${hand.y + 20} ${-26 * facing} 140`} className="fs2-hose" />
            <line x1={hand.x - 3 * facing} y1={hand.y + 1} x2={hand.x + 12 * facing} y2={hand.y - 1} className="fs2-nozzle" />
          </g>
        )}
        {lk.prop === "tablet" && (
          <g>
            <rect x={hand.x - (facing > 0 ? 2 : 9)} y={hand.y - 13} width={11} height={15} rx={1.5} className="fs2-tablet" />
            <rect x={hand.x - (facing > 0 ? 0.5 : 7.5)} y={hand.y - 11.5} width={8} height={12} rx={0.8} className="fs2-screen" />
          </g>
        )}
        {lk.neck === "phones" && (
          <g className="fs2-phones">
            <path d={`M ${lean - 7} ${shoulder - 1} A 7 5 0 0 0 ${lean + 7} ${shoulder - 1}`} fill="none" />
            <circle cx={lean + 6 * facing} cy={shoulder} r={3.2} />
          </g>
        )}
        {lk.prop === "cup" && (
          <g>
            <line x1={hand.x + 1} y1={hand.y - 9} x2={hand.x + 3 * facing} y2={hand.y - 17} className="fs2-light" strokeWidth={2} />
            <rect x={hand.x - 3.5} y={hand.y - 10} width={7} height={12} rx={1.5} className="fs2-cup" />
          </g>
        )}
        {/* 手：グローブは大きく、恐竜の着ぐるみは緑の丸い手、剣道の小手と消防の手袋は暗い色 */}
        <circle
          cx={hand.x}
          cy={hand.y}
          r={look && (look.style === "boxing" || look.style === "muaythai" || look.style === "kickboxing" || look.style === "dino") ? 6.5 : 4.5}
          className={`fs2-glove${look?.style === "dino" ? " paw" : look?.style === "kendo" || look?.style === "firefighter" ? " mitt" : ""}`}
        />
        <circle cx={head.x} cy={head.y} r={9.5} className={`fs2-head${lk.body === "metal" ? " paint-metal" : ""}`} />
        {lk.hat && <Hat kind={lk.hat} x={head.x} y={head.y} facing={facing} />}
      </g>
    </g>
  );
}

/** 頭にかぶるもの（シルクハット・コック帽・キャップ・スイムキャップ・ヘッドセット・アンテナ・マイク） */
function Hat({ kind, x, y, facing }: { kind: string; x: number; y: number; facing: 1 | -1 }) {
  switch (kind) {
    case "tophat":
      return (
        <g className="fs2-hat black">
          <rect x={x - 7} y={y - 25} width={14} height={17} rx={1.5} />
          <rect x={x - 12} y={y - 10} width={24} height={3.5} rx={1.5} />
          <rect x={x - 7} y={y - 13} width={14} height={3} className="fs2-band" />
        </g>
      );
    case "toque":
      return (
        <g className="fs2-hat white">
          <rect x={x - 8} y={y - 28} width={16} height={22} rx={7} />
        </g>
      );
    case "cap":
      return (
        <g className="fs2-hat black">
          <path d={`M ${x - 10} ${y - 3} A 10 10 0 0 1 ${x + 10} ${y - 3} Z`} />
          <rect x={facing > 0 ? x - 18 : x + 6} y={y - 5} width={12} height={3} rx={1.5} />
        </g>
      );
    case "swim":
      return (
        <g className="fs2-hat">
          <path d={`M ${x - 10} ${y - 1} A 10 10 0 0 1 ${x + 10} ${y - 1} Z`} className="fs2-band" />
          <circle cx={x + 4 * facing} cy={y - 6} r={2.6} className="black" />
        </g>
      );
    case "headset":
      return (
        <g className="fs2-hat black">
          <path d={`M ${x - 10} ${y} A 10 11 0 0 1 ${x + 10} ${y}`} fill="none" strokeWidth={2.5} className="fs2-wire" />
          <rect x={x - 2.5 - 2 * facing} y={y - 3} width={5} height={7} rx={2} className="fs2-band" />
        </g>
      );
    case "antenna":
      return (
        <g className="fs2-hat">
          <line x1={x} y1={y - 9} x2={x} y2={y - 19} className="fs2-wire" strokeWidth={2} />
          <circle cx={x} cy={y - 20} r={2.5} className="fs2-band" />
          <rect x={x - 2 + 4 * facing} y={y - 3} width={7} height={3} rx={1.5} className="fs2-band" />
        </g>
      );
    case "mic":
      return (
        <g className="fs2-hat">
          <line x1={x - 4 * facing} y1={y + 1} x2={x + 7 * facing} y2={y + 5} className="fs2-wire" strokeWidth={1.6} />
        </g>
      );
    case "hood":
      // 忍びの頭巾：頭を黒く覆い、目のところだけ細く開ける。後ろにその人の色の結び目
      return (
        <g className="fs2-hat black">
          <circle cx={x} cy={y} r={10.2} />
          <line x1={x + 1 * facing} y1={y - 1.5} x2={x + 9 * facing} y2={y - 1.5} className="fs2-slit" />
          <circle cx={x - 10 * facing} cy={y - 5} r={2.4} className="fs2-band" />
        </g>
      );
    case "bandana":
      return (
        <g className="fs2-hat">
          <path d={`M ${x - 10} ${y - 1} A 10 10 0 0 1 ${x + 10} ${y - 1} Z`} className="fs2-band" />
          <circle cx={x - 10 * facing} cy={y - 2} r={2.6} className="fs2-band" />
        </g>
      );
    case "men":
      // 剣道の面：暗い面布団と、顔の前の格子（面金）、後ろにその人の色の面紐
      return (
        <g className="fs2-hat black">
          <circle cx={x - 1 * facing} cy={y} r={11} />
          {[-4, -1, 2, 5].map((dy) => (
            <line key={dy} x1={x + 3 * facing} y1={y + dy} x2={x + 11 * facing} y2={y + dy} className="fs2-grille" />
          ))}
          <line x1={x + 11 * facing} y1={y - 6} x2={x + 11 * facing} y2={y + 7} className="fs2-grille" />
          <line x1={x - 11 * facing} y1={y - 3} x2={x - 14 * facing} y2={y + 8} className="fs2-tie" strokeWidth={2} />
        </g>
      );
    case "mask":
      // ルチャの覆面：頭をその人の色で包み、目のまわりに白い模様
      return (
        <g className="fs2-hat">
          <circle cx={x} cy={y} r={10} className="fs2-band" />
          <ellipse cx={x + 5 * facing} cy={y - 1.5} rx={3.4} ry={2.4} className="fs2-eyes" />
          <line x1={x - 1 * facing} y1={y - 10} x2={x + 2 * facing} y2={y - 3} className="fs2-slit" />
        </g>
      );
    case "helmet":
      // 消防のヘルメット（その人の色）：丸い帽体と、後ろの長いつば
      return (
        <g className="fs2-hat">
          <path d={`M ${x - 10} ${y - 2} A 10 11 0 0 1 ${x + 10} ${y - 2} Z`} className="fs2-band" />
          <rect x={facing > 0 ? x - 16 : x - 10} y={y - 3.5} width={26} height={3} rx={1.5} className="fs2-band" />
        </g>
      );
    case "capf":
      // 前向きのキャップ（つばが前）
      return (
        <g className="fs2-hat black">
          <path d={`M ${x - 10} ${y - 3} A 10 10 0 0 1 ${x + 10} ${y - 3} Z`} />
          <rect x={facing > 0 ? x + 6 : x - 18} y={y - 5} width={12} height={3} rx={1.5} />
          <circle cx={x} cy={y - 12.5} r={1.6} className="fs2-band" />
        </g>
      );
    case "glasses":
      // 細い金の縁の眼鏡
      return (
        <g className="fs2-glasses">
          <circle cx={x + 6 * facing} cy={y - 1} r={3} />
          <line x1={x + 3 * facing} y1={y - 1} x2={x - 6 * facing} y2={y - 2} />
        </g>
      );
    case "dino":
      // 恐竜のフード：緑の布で頭を包み、額の上に目と歯の付いた上あごが前へ出る
      return (
        <g className="fs2-hat">
          <path d={`M ${x - 11} ${y + 4} A 11 12 0 0 1 ${x + 11} ${y - 3} Z`} className="fs2-dino" />
          <ellipse cx={x + 9 * facing} cy={y - 7} rx={9} ry={4.5} className="fs2-dino" />
          {[3, 7, 11, 15].map((dx) => (
            <circle key={dx} cx={x + dx * facing} cy={y - 2.4} r={1.1} className="fs2-teeth" />
          ))}
          <circle cx={x + 6 * facing} cy={y - 11} r={2.2} className="fs2-teeth" />
          <circle cx={x - 10 * facing} cy={y - 8} r={2.2} className="fs2-spike" />
        </g>
      );
    default:
      return null;
  }
}

export function FallbackStage({ fighters, mode, focus = 0, me = 0, event, onEventDone, hp, active }: FighterStageProps & { active: boolean }) {
  const [hitSeat, setHitSeat] = useState<0 | 1 | null>(null);
  const [number, setNumber] = useState<{ seat: 0 | 1; text: string; key: number } | null>(null);
  const played = useRef<number | null>(null);
  const doneRef = useRef(onEventDone);
  doneRef.current = onEventDone;
  const eventRef = useRef(event);
  eventRef.current = event;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const eventId = event?.id ?? null;

  // 攻防の id が変わったときだけ再生する（同じ攻防の props が作り直されても、やり直さない）
  useEffect(() => {
    const event = eventRef.current;
    const mode = modeRef.current;
    if (!active || !event || played.current === event.id) return;
    played.current = event.id;
    const id = event.id;
    const hit = event.strikes.find((s) => s.result === "hit" || s.result === "countered");
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (hit && mode === "fight") {
      const target: 0 | 1 = hit.result === "countered" ? hit.by : hit.by === 0 ? 1 : 0;
      timers.push(setTimeout(() => setHitSeat(target), 250));
      if (hit.damage > 0) timers.push(setTimeout(() => setNumber({ seat: target, text: `${hit.damage}`, key: id }), 250));
      timers.push(setTimeout(() => setHitSeat(null), 700));
      timers.push(setTimeout(() => setNumber(null), 1300));
    }
    let finished = false;
    timers.push(
      setTimeout(
        () => {
          finished = true;
          doneRef.current?.(id);
        },
        mode === "fight" ? 1100 : 0,
      ),
    );
    return () => {
      timers.forEach(clearTimeout);
      // 終わる前に止めたとき（StrictMode の作り直しなど）は、次にもう一度再生する
      if (!finished) played.current = null;
    };
  }, [active, eventId]);

  const left = me;
  const right: 0 | 1 = me === 0 ? 1 : 0;
  const downOf = (s: 0 | 1) => (hp?.[s] ?? 100) <= 0;
  return (
    <svg viewBox="0 0 240 180" className="fs2" aria-hidden="true">
      <ellipse cx={120} cy={146} rx={110} ry={12} className="fs2-floor" />
      {mode === "custom" ? (
        <Figure look={fighters[focus]} x={120} facing={1} hit={false} down={false} />
      ) : (
        <>
          <Figure look={fighters[left]} x={88} facing={1} hit={hitSeat === left} down={downOf(left)} />
          <Figure look={fighters[right]} x={152} facing={-1} hit={hitSeat === right} down={downOf(right)} />
        </>
      )}
      {number && mode === "fight" && (
        <text key={number.key} x={number.seat === left ? 88 : 152} y={40} className={`fs2-num seat${number.seat === 0 ? 1 : 0}`} textAnchor="middle">
          {number.text}
        </text>
      )}
    </svg>
  );
}
