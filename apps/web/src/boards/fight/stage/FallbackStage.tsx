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
};

function Figure({ look, x, facing, hit, down }: { look: FighterLook | null; x: number; facing: 1 | -1; hit: boolean; down: boolean }) {
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
        <line x1={-10 * facing} y1={140} x2={0} y2={hip} className="fs2-limb" />
        <line x1={14 * facing} y1={140} x2={0} y2={hip} className="fs2-limb" />
        <line x1={0} y1={hip} x2={lean} y2={shoulder} className="fs2-limb thick" style={{ strokeWidth: 13 * w }} />
        <line x1={lean} y1={shoulder} x2={hand.x} y2={hand.y} className="fs2-limb" />
        <line x1={lean} y1={shoulder + 2} x2={hand.x - 9 * facing} y2={hand.y + 6} className="fs2-limb" />
        <circle cx={hand.x} cy={hand.y} r={look && (look.style === "boxing" || look.style === "muaythai") ? 6.5 : 4.5} className="fs2-glove" />
        <circle cx={head.x} cy={head.y} r={9.5} className="fs2-head" />
      </g>
    </g>
  );
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
