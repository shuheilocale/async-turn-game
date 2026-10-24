import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Freehand, other, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./FreehandBoard.css";

const { CANVAS, ROUNDS, SHAPES } = Freehand;
type Shape = Freehand.Shape;
type Point = Freehand.Point;
type RoundView = Freehand.RoundView;

/** これより短い線は、描いたのではなく触っただけとみなして送らない（キャンバスの大きさを 1000 として） */
const TAP_LENGTH = 15;
/** 結果の絵で色をつけるずれ（理想の形の大きさに対する割合）。meh は少し、bad は大きくずれた所 */
const MEH = 0.05;
const BAD = 0.1;
/** 閉じた形で、始めと終わりがこれ以上離れていたら「とぎれ」を点線で示す */
const GAP = 0.08;
/** 点数が数え上がる時間 */
const COUNT_MS = 800;

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (cx: number, cy: number, r: number, deg: number): Point => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const pathOf = (points: Point[], closed: boolean) =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + (closed ? " Z" : "");
const listOf = (points: Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const STAR = [0, 2, 4, 1, 3].map((i) => polar(50, 54, 42, -90 + 72 * i));
const TRIANGLE = [0, 1, 2].map((i) => polar(50, 58, 44, -90 + 120 * i));

/** お題の絵（viewBox 0 0 100 100）。色は currentColor */
const SHAPE_ART: Record<Shape, ReactNode> = {
  circle: <circle cx="50" cy="50" r="38" />,
  line: <path d="M14 76 86 24" />,
  triangle: <path d={pathOf(TRIANGLE, true)} />,
  square: <rect x="16" y="16" width="68" height="68" />,
  star: <path d={pathOf(STAR, true)} />,
};

export function ShapeIcon({ shape, className = "" }: { shape: Shape; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`freehand-icon ${className}`} aria-hidden>
      {SHAPE_ART[shape]}
    </svg>
  );
}

/** 目隠しの印（閉じた目） */
function BlindMark() {
  return (
    <svg viewBox="0 0 24 24" className="freehand-blind-mark" aria-hidden>
      <path d="M3 10c4.5 5 13.5 5 18 0M7 13.5 5.5 16M12 15v3M17 13.5l1.5 2.5" />
    </svg>
  );
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 0 から target まで数え上がる数。key が変わるたびに数え直す */
function useCountUp(target: number, key: string) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - start) / COUNT_MS);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, target]);
  return value;
}

/** ずれの大きさの段階 */
const levelOf = (dev: number) => (dev >= BAD ? "bad" : dev >= MEH ? "meh" : null);

/**
 * 描いた絵。理想の形をうすく重ね、ずれた所に色をつける。marks を false にすると絵だけ
 */
function Sketch({ shape, points, seat, marks = true }: { shape: Shape; points: Point[]; seat: Seat; marks?: boolean }) {
  const analysis = useMemo(() => (marks ? Freehand.analyzeDrawing(shape, points) : null), [shape, points, marks]);

  // ずれの段階が同じ点が続くところを 1 本の線にまとめる
  const runs = useMemo(() => {
    if (!analysis) return [];
    const out: { level: "meh" | "bad"; points: Point[] }[] = [];
    for (let i = 1; i < points.length; i++) {
      const level = levelOf((analysis.deviations[i - 1]! + analysis.deviations[i]!) / 2);
      const prev = out.at(-1);
      if (!level) continue;
      if (prev && prev.level === level && prev.points.at(-1) === points[i - 1]) prev.points.push(points[i]!);
      else out.push({ level, points: [points[i - 1]!, points[i]!] });
    }
    return out;
  }, [analysis, points]);

  // 閉じた形で、始めと終わりが離れているところ
  const gap = useMemo(() => {
    if (!analysis || !analysis.ideal.closed || points.length < 2) return null;
    const ideal = analysis.ideal.points;
    if (ideal.length === 0) return null;
    const [cx, cy] = ideal.reduce(([x, y], p) => [x + p[0] / ideal.length, y + p[1] / ideal.length], [0, 0]);
    const size = Math.max(...ideal.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    const a = points[0]!;
    const b = points.at(-1)!;
    return Math.hypot(a[0] - b[0], a[1] - b[1]) > GAP * size ? { a, b } : null;
  }, [analysis, points]);

  return (
    <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className={`freehand-sketch seat${seat}`} aria-hidden>
      {analysis && analysis.ideal.points.length > 0 && (
        <path className="freehand-ideal" d={pathOf(analysis.ideal.points, analysis.ideal.closed)} vectorEffect="non-scaling-stroke" />
      )}
      {runs.map((r, i) => (
        <polyline key={i} className={`freehand-off ${r.level}`} points={listOf(r.points)} vectorEffect="non-scaling-stroke" />
      ))}
      {gap && (
        <line className="freehand-gap" x1={gap.a[0]} y1={gap.a[1]} x2={gap.b[0]} y2={gap.b[1]} vectorEffect="non-scaling-stroke" />
      )}
      <polyline className="freehand-stroke" points={listOf(points)} vectorEffect="non-scaling-stroke" />
      {points[0] && <circle className="freehand-start" cx={points[0][0]} cy={points[0][1]} r={12} />}
    </svg>
  );
}

/** 結果の 1 人分：名前・絵・点数 */
function ResultCard({
  round,
  seat,
  label,
  index,
}: {
  round: RoundView;
  seat: Seat;
  label: string;
  index: number;
}) {
  const { t } = useI18n();
  const d = round.drawings[seat];
  const score = d !== null && d !== "hidden" ? d.score : 0;
  const shown = useCountUp(score, `${index}-${seat}`);
  const winner = Freehand.roundWinner(round);
  const won = winner === seat;
  return (
    <div className={`freehand-card seat${seat} ${won ? "won" : ""}`}>
      <div className="freehand-card-head">
        <span className="token dot" aria-hidden />
        <span className="freehand-card-name">{label}</span>
      </div>
      {d !== null && d !== "hidden" ? (
        <Sketch shape={round.shape} points={d.points} seat={seat} />
      ) : (
        <div className="freehand-sketch freehand-facedown">{t("game.freehand.hidden")}</div>
      )}
      <div className="freehand-score" aria-label={t("game.freehand.points", { n: score })}>
        <strong className="num">{shown}</strong>
        <span className="muted small">{t("game.freehand.unit")}</span>
        {won && <span className="freehand-badge">{t("game.freehand.win")}</span>}
      </div>
    </div>
  );
}

/** 回戦の見出し：お題の絵・名前・目隠し */
function RoundTitle({ t, round, index }: { t: T; round: RoundView; index: number }) {
  return (
    <div className="freehand-round-title">
      <span className="muted small">{t("game.freehand.result", { n: index + 1 })}</span>
      <span className="freehand-round-shape">
        <ShapeIcon shape={round.shape} />
        <strong>{t(`game.freehand.shape.${round.shape}`)}</strong>
        {round.blind && (
          <span className="freehand-tag">
            <BlindMark />
            {t("game.freehand.blind")}
          </span>
        )}
      </span>
    </div>
  );
}

/** 2 人の絵と点数を並べる */
function Reveal({
  round,
  index,
  me,
  label,
  children,
}: {
  round: RoundView;
  index: number;
  me: Seat;
  label(seat: Seat): string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const winner = Freehand.roundWinner(round);
  return (
    <section className="freehand-reveal panel">
      <RoundTitle t={t} round={round} index={index} />
      <div className="freehand-pair">
        {([me, other(me)] as Seat[]).map((seat) => (
          <ResultCard key={`${index}-${seat}`} round={round} seat={seat} label={label(seat)} index={index} />
        ))}
      </div>
      {winner === null && <p className="freehand-even">{t("game.freehand.draw")}</p>}
      <p className="muted small freehand-legend">{t("game.freehand.legend")}</p>
      {children}
    </section>
  );
}

/**
 * 指で描く場所。指を置いてから離すまでを一筆として、離した瞬間に onDone を呼ぶ。
 * 描いている間の線は React を通さず直接書きかえる（指の動きに遅れないように）。目隠しのときは線を描かず、指の位置に点だけ出す
 */
function DrawPad({
  shape,
  blind,
  seat,
  enabled,
  frozen,
  onStart,
  onDone,
  message,
}: {
  shape: Shape | null;
  blind: boolean;
  seat: Seat;
  enabled: boolean;
  /** 送った（送っている）線。あれば描けない */
  frozen: Point[] | null;
  onStart(): void;
  onDone(points: Point[] | null, why?: "tap" | "cancel"): void;
  message: string | null;
}) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const line = useRef<SVGPolylineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const raw = useRef<Point[]>([]);
  const pointer = useRef<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const canDraw = enabled && shape !== null && frozen === null;

  // iPhone の Safari などで、描いている間にページが動かないようにする（touch-action の念のため）
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (pointer.current !== null) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const toCanvas = (e: { clientX: number; clientY: number }): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS, ((e.clientY - r.top) / r.height) * CANVAS];
  };

  const paint = () => {
    const last = raw.current.at(-1);
    if (line.current) line.current.setAttribute("points", blind ? "" : listOf(raw.current));
    if (dot.current && last) {
      dot.current.setAttribute("cx", String(last[0]));
      dot.current.setAttribute("cy", String(last[1]));
    }
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!canDraw || pointer.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId;
    raw.current = [toCanvas(e)];
    setDrawing(true);
    onStart();
    paint();
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== pointer.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length > 0 ? events : [e.nativeEvent]) raw.current.push(toCanvas(ev));
    paint();
  };

  const finish = (e: PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    setDrawing(false);
    const points = raw.current;
    raw.current = [];
    if (line.current) line.current.setAttribute("points", "");
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    if (cancelled) return onDone(null, "cancel");
    if (length < TAP_LENGTH) return onDone(null, "tap");
    onDone(Freehand.thinStroke(points));
  };

  const overlay = frozen
    ? t("game.freehand.sending")
    : !shape
      ? t("game.freehand.pickFirst")
      : drawing
        ? blind
          ? t("game.freehand.blindNow")
          : null
        : (message ?? (blind ? t("game.freehand.blindNow") : t("game.freehand.drawHere")));

  return (
    <div className={`freehand-canvas seat${seat} ${canDraw ? "ready" : ""} ${drawing ? "drawing" : ""} ${blind ? "blind" : ""}`}>
      <svg
        ref={svg}
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        role="img"
        aria-label={shape ? t("game.freehand.canvas", { shape: t(`game.freehand.shape.${shape}`) }) : t("game.freehand.pickFirst")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {frozen && <polyline className="freehand-stroke" points={listOf(frozen)} vectorEffect="non-scaling-stroke" />}
        <polyline ref={line} className="freehand-stroke live" points="" vectorEffect="non-scaling-stroke" />
        <circle ref={dot} className={`freehand-finger ${drawing && blind ? "on" : ""}`} r={9} cx={-50} cy={-50} />
      </svg>
      {overlay && <p className={`freehand-overlay ${drawing ? "faint" : ""}`}>{overlay}</p>}
    </div>
  );
}

/**
 * ひとふでチャレンジ。出題する人はお題と目隠しを選んで描き、相手は同じお題で描く。
 * 指を離した瞬間に点の列を送る（確定を待たない）。点数はサーバが計算し、相手が描き終えたら 2 人の絵を並べて見せる
 */
export function FreehandBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Freehand.FreehandView;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const turn = Freehand.turnOf(s.rounds);
  const myTurn = playing && you !== null && turn === you;
  const last = s.rounds.at(-1);
  /** 出題した人だけが描いて、相手を待っている回戦 */
  const pending = last && !Freehand.isComplete(last) ? last : null;
  const doneCount = s.rounds.filter(Freehand.isComplete).length;
  const lastDone = doneCount > 0 ? (pending ? s.rounds.length - 2 : s.rounds.length - 1) : -1;
  const used = Freehand.usedShapes(s.rounds);
  const { wins, totals } = Freehand.tally(s.rounds);

  /** 文の中で使う呼び名（「あなた」「〇〇さん」。名前がまだなければ「相手」） */
  const who = (seat: Seat) =>
    seat === you
      ? t("game.freehand.you")
      : names[seat]
        ? t("game.freehand.who", { name: names[seat] })
        : t("game.freehand.opponent");
  /** 絵や点数の見出しに付ける名前 */
  const label = (seat: Seat) => (seat === you ? t("game.freehand.you") : names[seat] || t("game.freehand.opponent"));
  const shapeName = (shape: Shape) => t(`game.freehand.shape.${shape}`);

  /** 出題するときに選んでいるお題と目隠し */
  const [shape, setShape] = useState<Shape | null>(null);
  const [blind, setBlind] = useState(false);
  /** 送った線（サーバから次の状態が届くまで出しておく） */
  const [sent, setSent] = useState<Point[] | null>(null);
  const [penDown, setPenDown] = useState(false);
  const [padMessage, setPadMessage] = useState<string | null>(null);
  /** 「つぎへ」で閉じた結果の数。自分の番で、まだ閉じていない結果があれば先に見せる */
  const [acked, setAcked] = useState(0);
  /** 履歴から選んで見ている回戦 */
  const [picked, setPicked] = useState<number | null>(null);
  /** 増やすと、描く場所が画面に収まるようにスクロールする（お題を選んだとき・結果を閉じたとき） */
  const [showPad, setShowPad] = useState(0);
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    if (showPad > 0) stage.current?.querySelector(".freehand-canvas")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [showPad]);

  // 回戦が進んだら、描く場所を新しくする
  const progress = `${s.rounds.length}-${doneCount}`;
  useEffect(() => {
    setShape(null);
    setBlind(false);
    setSent(null);
    setPenDown(false);
    setPadMessage(null);
    setPicked(null);
  }, [progress]);

  const gate = myTurn && lastDone >= 0 && acked < doneCount;
  const setting = myTurn && !pending;
  const task: { shape: Shape; blind: boolean } | null = pending
    ? { shape: pending.shape, blind: pending.blind }
    : shape
      ? { shape, blind }
      : null;

  const submit = async (points: Point[]) => {
    setSent(points);
    const move: Freehand.FreehandMove = setting ? { shape: shape!, blind, points } : { points };
    const ok = await onSubmit(move);
    if (!ok) setSent(null);
  };

  const onDone = (points: Point[] | null, why?: "tap" | "cancel") => {
    setPenDown(false);
    if (!points) {
      setPadMessage(t(why === "cancel" ? "game.freehand.cancelled" : "game.freehand.tap"));
      return;
    }
    setPadMessage(null);
    void submit(points);
  };

  const shownIndex = picked ?? lastDone;
  const shownRound = shownIndex >= 0 ? s.rounds[shownIndex] : undefined;
  const roundNo = Math.min(ROUNDS, pending ? s.rounds.length : s.rounds.length + 1);
  const tieBreak = !playing && wins[0] === wins[1] && totals[0] !== totals[1];

  // 自分の番：出題するならお題選び、相手の出題なら同じお題で描く
  const drawArea = myTurn && !gate && (
    <section className="freehand-stage" ref={stage}>
      {setting && (
        <div className="freehand-picker panel">
          <p className="freehand-label">{t("game.freehand.pick")}</p>
          <div className="freehand-shapes" role="radiogroup" aria-label={t("game.freehand.pick")}>
            {SHAPES.map((sh) => {
              const isUsed = used.includes(sh);
              return (
                <button
                  key={sh}
                  type="button"
                  role="radio"
                  aria-checked={shape === sh}
                  className={`freehand-shape seat${me} ${shape === sh ? "on" : ""}`}
                  disabled={isUsed || !interactive || penDown || sent !== null}
                  onClick={() => {
                    setShape(sh);
                    setShowPad((n) => n + 1);
                  }}
                >
                  <ShapeIcon shape={sh} />
                  <span>{t(`game.freehand.short.${sh}`)}</span>
                  {isUsed && <small>{t("game.freehand.used")}</small>}
                </button>
              );
            })}
          </div>
          <label className={`freehand-switch seat${me}`}>
            <input
              type="checkbox"
              checked={blind}
              disabled={!interactive || penDown || sent !== null}
              onChange={(e) => setBlind(e.target.checked)}
            />
            <span className="freehand-switch-track" aria-hidden />
            <span className="freehand-switch-text">
              <strong>
                <BlindMark />
                {t("game.freehand.blind")}
              </strong>
              <span className="muted small">{t("game.freehand.blindHint")}</span>
            </span>
          </label>
        </div>
      )}

      {task && (
        <div className={`freehand-task seat${me}`}>
          <ShapeIcon shape={task.shape} className="big" />
          <div>
            <strong>{t("game.freehand.task", { shape: shapeName(task.shape) })}</strong>
            <span className="muted small">{t(`game.freehand.hint.${task.shape}`)}</span>
            {task.blind && (
              <span className="freehand-tag">
                <BlindMark />
                {t("game.freehand.blind")}
              </span>
            )}
          </div>
        </div>
      )}

      <DrawPad
        shape={task?.shape ?? null}
        blind={task?.blind ?? false}
        seat={me}
        enabled={interactive}
        frozen={sent}
        onStart={() => {
          setPenDown(true);
          setPadMessage(null);
        }}
        onDone={onDone}
        message={padMessage}
      />

      {pending && (
        <p className="freehand-facedown-note">
          <span className="freehand-card-back" aria-hidden />
          <span>{t("game.freehand.theirHidden", { who: who(pending.setter) })}</span>
        </p>
      )}
    </section>
  );

  // 相手の番：何を待っているか。自分が出題した絵は、伏せてあることが分かるように出す
  const mine = pending && you !== null && pending.setter === you ? pending.drawings[you] : null;
  const waiting = !myTurn && playing && (
    <section className="freehand-wait">
      <p className="board-note">
        <span>
          {pending
            ? t("game.freehand.drawing", { who: who(other(pending.setter)), shape: shapeName(pending.shape) })
            : t("game.freehand.choosing", { who: who(turn ?? opp) })}
        </span>
      </p>
      {pending && mine && mine !== "hidden" && (
        <div className={`freehand-mine panel seat${me}`}>
          <div className="freehand-mine-head">
            <strong>{t("game.freehand.mine")}</strong>
            <span className="freehand-tag">
              <span className="freehand-lock" aria-hidden />
              {t("game.freehand.mineHidden", { who: who(other(pending.setter)) })}
            </span>
          </div>
          <div className="freehand-mine-body">
            <Sketch shape={pending.shape} points={mine.points} seat={me} />
            <div className="freehand-score">
              <strong className="num">{mine.score}</strong>
              <span className="muted small">{t("game.freehand.unit")}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="freehand">
      <div className="freehand-head">
        {playing && <span className="freehand-round-no num">{t("game.freehand.round", { n: roundNo, total: ROUNDS })}</span>}
        <div className="scores">
          {([me, opp] as Seat[]).map((seat) => (
            <div key={seat} className={`score seat${seat}`}>
              <span className="muted small freehand-score-name">
                <span className="token dot" aria-hidden />
                <span>{label(seat)}</span>
              </span>
              <span className="freehand-wins">
                <strong>{t("game.freehand.wins", { n: wins[seat] })}</strong>
                <span className="muted small num">{t("game.freehand.total", { n: totals[seat] })}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {gate && shownRound && (
        <Reveal round={shownRound} index={shownIndex} me={me} label={label}>
          <button type="button" className="primary freehand-next" onClick={() => {
              setAcked(doneCount);
              setPicked(null);
              setShowPad((n) => n + 1);
            }}>
            {t("game.freehand.next")}
          </button>
        </Reveal>
      )}

      {drawArea}
      {waiting}

      {!myTurn && shownRound && Freehand.isComplete(shownRound) && (
        <Reveal round={shownRound} index={shownIndex} me={me} label={label} />
      )}

      {tieBreak && <p className="board-note muted">{t("game.freehand.tieBreak")}</p>}

      {s.rounds.length > 0 && (
        <section className="freehand-rounds">
          <h3 className="muted">{t("game.freehand.history")}</h3>
          <ol>
            {s.rounds.map((r, i) => {
              const complete = Freehand.isComplete(r);
              const w = Freehand.roundWinner(r);
              const scoreText = (seat: Seat) => {
                const d = r.drawings[seat];
                return d === null ? "…" : d === "hidden" ? "?" : String(d.score);
              };
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`freehand-row ${i === shownIndex && complete ? "on" : ""}`}
                    disabled={!complete || (myTurn && !gate)}
                    onClick={() => setPicked(i)}
                  >
                    <span className="muted num">{i + 1}</span>
                    <ShapeIcon shape={r.shape} />
                    <span className="freehand-row-name">
                      {t(`game.freehand.short.${r.shape}`)}
                      {r.blind && <BlindMark />}
                    </span>
                    {([me, opp] as Seat[]).map((seat) => (
                      <span key={seat} className={`freehand-row-score seat${seat} ${complete && w === seat ? "won" : ""}`}>
                        <span className="token dot" aria-hidden />
                        <span className="num">{scoreText(seat)}</span>
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
