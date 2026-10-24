import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Heart, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./HeartBoard.css";

const { CANVAS, ROUNDS, THEMES, GUIDE, CLEAR_AVERAGE } = Heart;
type Point = Heart.Point;
type Theme = Heart.Theme;
type RoundView = Heart.RoundView;
type Side = "left" | "right";

/** 真ん中の縦線の x */
const MID = CANVAS / 2;
/** これより短い線は、描いたのではなく触っただけとみなす（キャンバスの大きさを 1000 として） */
const TAP_LENGTH = 15;
/** 自分の側（真ん中の線からこれだけはみ出しても自分の側に数える）に描いた点がこの割合より少なければ、反対側かもと知らせる */
const SIDE_MARGIN = 40;
const SIDE_SHARE = 0.5;
/** 結果のハートで、つなぎ目がこれ以上離れていたら点線で示す */
const GAP = 30;
/** 点数が数え上がる時間 */
const COUNT_MS = 900;

const listOf = (points: readonly Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const pathOf = (points: readonly Point[]) =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
const lengthOf = (points: readonly Point[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  return total;
};
const shown = (h: Heart.HalfView): h is Point[] => h !== null && h !== "hidden";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 0 から target まで数え上がる数。key が変わるたびに数え直す。animate が false ならすぐに target */
function useCountUp(target: number, key: string, animate = true) {
  const instant = !animate || prefersReducedMotion();
  const [value, setValue] = useState(() => (instant ? target : 0));
  useEffect(() => {
    if (instant) {
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
  }, [key, target, instant]);
  return value;
}

/** 半分のハートの印（お題の見出し用）。描く側を濃く、反対側をうすく */
function HalfMark({ side }: { side: Side }) {
  const d = "M12 6.2C10.4 3.2 6.6 2.4 4.4 4.6 2.2 6.8 2.6 10.4 5 13L12 20";
  return (
    <svg viewBox="0 0 24 24" className="heart-half-mark" aria-hidden>
      <path d={d} className={side === "left" ? "on" : "off"} />
      <path d={d} transform="matrix(-1 0 0 1 24 0)" className={side === "right" ? "on" : "off"} />
      <path d="M12 4v18" className="mid" />
    </svg>
  );
}

/** まだの回戦に出す、点線のハートの形（viewBox 0 0 100 100）。左右の半分はどちらもくぼみからとがりへ */
const EMPTY_HALF: Record<Side, string> = {
  left: "M50 34C44 20 24 18 18 32 13 44 22 58 50 82",
  right: "M50 34C56 20 76 18 82 32 87 44 78 58 50 82",
};
const EMPTY_HEART = "M50 34C44 20 24 18 18 32 13 44 22 58 50 82 78 58 87 44 82 32 76 18 56 20 50 34Z";

/** 相手が描いているあいだの印：点線のハートの、相手が描いている側をペンがなぞり続ける */
function WaitHeart({ side, seat }: { side: Side; seat: Seat }) {
  const rest: Side = side === "left" ? "right" : "left";
  return (
    <svg viewBox="0 0 100 100" className={`heart-wait-art seat${seat}`} aria-hidden>
      <path d={EMPTY_HALF[rest]} className="rest" />
      <path d={EMPTY_HALF[side]} className="pen" pathLength={1} />
    </svg>
  );
}

/** 鍵の印（伏せてある） */
const Lock = () => <span className="heart-lock" aria-hidden />;

/**
 * 2 人の半分を合わせたハート。左の線は左半分を描いた人の色、右は右半分の人の色で、内側を 2 人の色でうすく塗る。
 * 点数が高いほど濃く塗る。big では真ん中の線とつなぎ目のすき間も示し、animate なら線を描いてから塗りがふわっと出る
 */
function HeartArt({
  round,
  big = false,
  animate = false,
  label,
}: {
  round: RoundView;
  big?: boolean;
  animate?: boolean;
  label?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const left = useMemo(() => (shown(round.left) ? Heart.orient(round.left) : null), [round.left]);
  const right = useMemo(() => (shown(round.right) ? Heart.orient(round.right) : null), [round.right]);
  const leftSeat = round.leftSeat;
  const rightSeat = other(leftSeat);
  const grade = round.result ? Heart.gradeOf(round.result.score) : "apart";

  // 2 人の色の境目は、つなぎ目の x のあたり（はなれていればその間）
  const ends = [left?.[0], left?.at(-1), right?.[0], right?.at(-1)].filter((p): p is Point => !!p);
  const seam = ends.length > 0 ? ends.reduce((s, p) => s + p[0], 0) / ends.length / CANVAS : 0.5;
  const gaps: [Point, Point][] =
    big && left && right
      ? ([
          [left[0]!, right[0]!],
          [left.at(-1)!, right.at(-1)!],
        ] as [Point, Point][]).filter(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) > GAP)
      : [];

  return (
    <svg
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      className={`heart-art ${big ? "big" : "mini"} ${animate ? "animate" : ""} grade-${grade}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${gid}-fill`} x1="0" x2={CANVAS} y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset={Math.max(0, seam - 0.06)} className={`heart-stop seat${leftSeat}`} />
          <stop offset={Math.min(1, seam + 0.06)} className={`heart-stop seat${rightSeat}`} />
        </linearGradient>
      </defs>
      {big && <line className="heart-mid" x1={MID} y1={30} x2={MID} y2={CANVAS - 30} />}
      {left && right && (
        <g className="heart-fill-wrap">
          <path className="heart-fill" d={pathOf([...left, ...[...right].reverse()])} fill={`url(#${gid}-fill)`} />
        </g>
      )}
      {left && <polyline className={`heart-line seat${leftSeat} first`} points={listOf(left)} pathLength={1} />}
      {right && <polyline className={`heart-line seat${rightSeat} second`} points={listOf(right)} pathLength={1} />}
      {gaps.map(([a, b], i) => (
        <line key={i} className="heart-gap" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      ))}
    </svg>
  );
}

/** 3 つの見どころの棒 */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="heart-meter">
      <span className="heart-meter-label">{label}</span>
      <span className="heart-meter-bar" aria-hidden>
        <span style={{ width: `${value}%` }} />
      </span>
      <span className="heart-meter-num num">{value}</span>
    </div>
  );
}

/** 1 回戦分の結果：合わせたハート・点数・やさしい言葉・3 つの見どころ */
function Reveal({
  round,
  index,
  who,
  seen,
  children,
}: {
  round: RoundView;
  index: number;
  who(seat: Seat): string;
  /** もう演出して見せた回戦。同じ結果を別の場所に出し直すときは演出をくり返さない */
  seen: Set<number>;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [animate] = useState(() => !seen.has(index));
  useEffect(() => {
    seen.add(index);
  }, [seen, index]);
  const result = round.result!;
  const value = useCountUp(result.score, `reveal-${index}`, animate);
  const grade = Heart.gradeOf(result.score);
  return (
    <section className={`heart-reveal panel grade-${grade}`}>
      <div className="heart-reveal-head">
        <span className="muted small">{t("game.heart.result", { n: index + 1 })}</span>
        <span className={`heart-chip theme-${round.theme}`}>{t(`game.heart.theme.${round.theme}`)}</span>
      </div>
      <HeartArt
        key={`art-${index}`}
        round={round}
        big
        animate={animate}
        label={t("game.heart.art", { n: index + 1, score: result.score })}
      />
      <div className="heart-score" aria-label={t("game.heart.points", { n: result.score })}>
        <strong className="num">{value}</strong>
        <span className="muted small">{t("game.heart.unit")}</span>
      </div>
      <p className="heart-grade">{t(`game.heart.grade.${grade}`)}</p>
      <div className="heart-meters">
        <Meter label={t("game.heart.symmetry")} value={result.symmetry} />
        <Meter label={t("game.heart.joins")} value={result.joins} />
        <Meter label={t("game.heart.shape")} value={result.shape} />
      </div>
      <p className="heart-who small">
        <span className={`seat${round.leftSeat}`}>
          <span className="token dot" aria-hidden />
          {t("game.heart.drewLeft", { who: who(round.leftSeat) })}
        </span>
        <span className={`seat${other(round.leftSeat)}`}>
          <span className="token dot" aria-hidden />
          {t("game.heart.drewRight", { who: who(other(round.leftSeat)) })}
        </span>
      </p>
      {children}
    </section>
  );
}

/**
 * 指で描く場所。真ん中に点線、自分の描く側を明るく、反対側を暗くする。
 * 指を置いてから離すまでが一筆で、描き直すと前の線は消える。描いている間の線は React を通さず直接書きかえる。
 * 目隠しのときは線を描かず、指の位置に点だけ出す（描き終えても線は見せない）
 */
function DrawPad({
  side,
  theme,
  seat,
  enabled,
  stroke,
  sending,
  message,
  otherLabel,
  onStart,
  onDone,
}: {
  side: Side;
  theme: Theme;
  seat: Seat;
  enabled: boolean;
  /** 描いた（送る前の）線 */
  stroke: Point[] | null;
  sending: boolean;
  message: string | null;
  /** 反対側に出す、相手の名前 */
  otherLabel: string;
  onStart(): void;
  onDone(points: Point[] | null, why?: "tap" | "cancel"): void;
}) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const line = useRef<SVGPolylineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const raw = useRef<Point[]>([]);
  const pointer = useRef<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const blind = theme === "blind";
  const canDraw = enabled && !sending;

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
    if (cancelled) return onDone(null, "cancel");
    if (lengthOf(points) < TAP_LENGTH) return onDone(null, "tap");
    onDone(Heart.thinStroke(points));
  };

  const overlay = sending
    ? t("game.heart.sending")
    : drawing
      ? blind
        ? t("game.heart.blindNow")
        : null
      : (message ?? (stroke ? (blind ? t("game.heart.blindDone") : null) : blind ? t("game.heart.blindNow") : t("game.heart.drawHere")));

  const mineX = side === "left" ? 0 : MID;
  const otherX = side === "left" ? MID : 0;

  return (
    <div className={`heart-pad seat${seat} side-${side} ${canDraw ? "ready" : ""} ${drawing ? "drawing" : ""}`}>
      <svg
        ref={svg}
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        role="img"
        aria-label={t("game.heart.canvas", { side: t(`game.heart.side.${side}`) })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id={`heart-hatch-${side}`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="28" className="heart-hatch" />
          </pattern>
        </defs>
        <rect className="heart-pad-mine" x={mineX} y={0} width={MID} height={CANVAS} />
        <rect className="heart-pad-other" x={otherX} y={0} width={MID} height={CANVAS} />
        <rect x={otherX} y={0} width={MID} height={CANVAS} fill={`url(#heart-hatch-${side})`} />
        <line className="heart-mid" x1={MID} y1={0} x2={MID} y2={CANVAS} />
        {theme === "guide" && (
          <g className="heart-guide">
            {[GUIDE.dip, GUIDE.tip].map(([x, y]) => (
              <g key={y}>
                <circle cx={x} cy={y} r={26} className="ring" />
                <circle cx={x} cy={y} r={9} className="dot" />
              </g>
            ))}
          </g>
        )}
        {stroke && !blind && <polyline className="heart-stroke" points={listOf(stroke)} />}
        <polyline ref={line} className="heart-stroke live" points="" />
        <circle ref={dot} className={`heart-finger ${drawing && blind ? "on" : ""}`} r={13} cx={-50} cy={-50} />
      </svg>
      <span className={`heart-pad-label mine side-${side}`}>{t("game.heart.mySide")}</span>
      <span className={`heart-pad-label other side-${side === "left" ? "right" : "left"}`}>{otherLabel}</span>
      {overlay && <p className={`heart-overlay ${drawing ? "faint" : ""}`}>{overlay}</p>}
    </div>
  );
}

/**
 * はんぶんこハート。左半分の人が描いて送り、右半分の人は相手の半分を見ずに描く。
 * 「描けた」を押すまでは何度でも描き直せる。2 人とも描いたら、合わせたハートと点数（サーバが計算）を見せる
 */
export function HeartBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Heart.HeartView;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const turn = Heart.turnOf(s.rounds);
  const myTurn = playing && you !== null && turn === you;
  const last = s.rounds.at(-1);
  /** 左半分だけ描いて、右半分を待っている回戦 */
  const pending = last && !Heart.isComplete(last) ? last : null;
  const doneCount = s.rounds.filter(Heart.isComplete).length;
  // 終わった回戦はいつも前から順に並ぶので、最後に終わった回戦は doneCount - 1 番目
  const lastDone = doneCount - 1;
  const { average } = Heart.summary(s.rounds);

  /** 文の中で使う呼び名（「あなた」「〇〇さん」。名前がまだなければ「相手」） */
  const who = (seat: Seat) =>
    seat === you ? t("game.heart.you") : names[seat] ? t("game.heart.who", { name: names[seat] }) : t("game.heart.partner");

  /** 描いた（まだ送っていない）線 */
  const [stroke, setStroke] = useState<Point[] | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** 「つぎへ」で閉じた結果の数。自分の番で、まだ閉じていない結果があれば先に見せる */
  const [acked, setAcked] = useState(0);
  /** これまでのハートから選んで見ている回戦 */
  const [picked, setPicked] = useState<number | null>(null);
  /** いちど見せた結果は、もう一度出すときに演出をくり返さない */
  const seen = useRef(new Set<number>());
  /**
   * 増やすと、いま見てほしい所（終局の点数・結果・描く場所・待っている知らせのうち、上にあるもの）が
   * 画面に入るようにスクロールする。送ったあとと「つぎへ」のあとに使う
   */
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus > 0) {
      root.current
        ?.querySelector(".heart-final, .heart-reveal, .heart-stage, .heart-wait")
        ?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [focus]);

  // 回戦が進んだら、描く場所を新しくする
  const progress = `${s.rounds.length}-${doneCount}`;
  useEffect(() => {
    setStroke(null);
    setSending(false);
    setMessage(null);
    setPicked(null);
  }, [progress]);

  // 相手の番のあいだに終わった回戦は、待っている画面で結果を見せているので、自分の番になっても出し直さない
  // （席が分かる前の、観戦者としての表示は数えない）
  useEffect(() => {
    if (you !== null && playing && !myTurn) setAcked(doneCount);
  }, [you, playing, myTurn, doneCount]);

  const index = pending ? s.rounds.length - 1 : s.rounds.length;
  const side: Side = pending ? "right" : "left";
  const theme: Theme = THEMES[Math.min(index, ROUNDS - 1)]!;
  const gate = myTurn && lastDone >= 0 && acked < doneCount;

  const offSide =
    stroke !== null &&
    stroke.filter(([x]) => (side === "left" ? x <= MID + SIDE_MARGIN : x >= MID - SIDE_MARGIN)).length < stroke.length * SIDE_SHARE;

  const submit = async () => {
    if (!stroke || sending) return;
    setSending(true);
    const ok = await onSubmit({ points: stroke } satisfies Heart.HeartMove);
    if (ok) setFocus((n) => n + 1);
    else setSending(false);
  };

  const onDone = (points: Point[] | null, why?: "tap" | "cancel") => {
    if (!points) {
      setMessage(t(why === "cancel" ? "game.heart.cancelled" : "game.heart.tap"));
      return;
    }
    setMessage(null);
    setStroke(points);
  };

  const shownIndex = picked ?? lastDone;
  const shownRound = shownIndex >= 0 ? s.rounds[shownIndex] : undefined;
  const reveal = (round: RoundView, i: number, children?: ReactNode) => (
    <Reveal key={`reveal-${i}`} round={round} index={i} who={who} seen={seen.current}>
      {children}
    </Reveal>
  );

  // 自分の番：左半分なら新しい回戦を、右半分なら相手の左半分に合わせて描く
  const drawArea = myTurn && !gate && (
    <section className="heart-stage">
      <div className={`heart-task seat${me}`}>
        <HalfMark side={side} />
        <div>
          <strong>{t(`game.heart.task.${side}`)}</strong>
          <span className="muted small">{t("game.heart.how")}</span>
          <span className="heart-theme-hint small">
            <span className={`heart-chip theme-${theme}`}>{t(`game.heart.theme.${theme}`)}</span>
            <span className="muted">{t(`game.heart.themeHint.${theme}`)}</span>
          </span>
        </div>
      </div>

      <DrawPad
        side={side}
        theme={theme}
        seat={me}
        enabled={interactive}
        stroke={stroke}
        sending={sending}
        message={message ?? (offSide ? t("game.heart.wrongSide") : null)}
        otherLabel={t("game.heart.theirSide", { who: who(other(me)) })}
        onStart={() => setMessage(null)}
        onDone={onDone}
      />

      <div className="heart-actions">
        <button type="button" disabled={!stroke || sending} onClick={() => (setStroke(null), setMessage(null))}>
          {t("game.heart.redo")}
        </button>
        <button type="button" className="primary" disabled={!stroke || sending || !interactive} onClick={() => void submit()}>
          {t("game.heart.done")}
        </button>
      </div>

      {pending && (
        <p className="heart-hidden-note">
          <Lock />
          <span>{t("game.heart.theirHidden", { who: who(pending.leftSeat) })}</span>
        </p>
      )}
    </section>
  );

  // 相手の番：何を待っているか。自分が描いた左半分は、伏せてあることが分かるように出す
  const mine = pending && you !== null && pending.leftSeat === you && shown(pending.left) ? pending : null;
  const waiting = !myTurn && playing && (
    <section className="heart-wait">
      <div className="heart-wait-row">
        <WaitHeart side={side} seat={turn ?? other(me)} />
        <p>
          <strong>{t("game.heart.drawing", { who: who(turn ?? other(me)) })}</strong>
          <span className="muted small">
            {t("game.heart.drawingSub", { n: index + 1, side: t(`game.heart.side.${side}`) })}
          </span>
        </p>
      </div>
      {mine && (
        <div className={`heart-mine panel seat${me}`}>
          <HeartArt round={mine} />
          <div className="heart-mine-text">
            <strong>{t("game.heart.mine")}</strong>
            <span className="heart-tag">
              <Lock />
              {t("game.heart.mineHidden", { who: who(other(me)) })}
            </span>
          </div>
        </div>
      )}
    </section>
  );

  // 終局：3 回戦の平均と、クリアしたか
  const avg = Math.round(average);
  const finalValue = useCountUp(avg, `final-${doneCount}`, !playing);
  const cleared = status.kind === "finished" && status.coop === "cleared";
  const final = !playing && doneCount > 0 && (
    <section className={`heart-final panel ${cleared ? "cleared" : "failed"}`}>
      <span className="muted small">{t("game.heart.average")}</span>
      <div className="heart-score">
        <strong className="num">{finalValue}</strong>
        <span className="muted small">{t("game.heart.unit")}</span>
      </div>
      <p className="heart-grade">{t(`game.heart.grade.${Heart.gradeOf(avg)}`)}</p>
      <p className="heart-final-note">{t(cleared ? "game.heart.cleared" : "game.heart.failed", { n: CLEAR_AVERAGE })}</p>
    </section>
  );

  return (
    <div className="heart" ref={root}>
      {playing && (
        <div className="heart-head">
          <span className="heart-round-no num">{t("game.heart.round", { n: Math.min(ROUNDS, index + 1), total: ROUNDS })}</span>
          {doneCount > 0 && <span className="muted small">{t("game.heart.averageSoFar", { n: Math.round(average) })}</span>}
        </div>
      )}

      {final}

      {gate && shownRound && reveal(
        shownRound,
        shownIndex,
        <button
          type="button"
          className="primary heart-next"
          onClick={() => {
            setAcked(doneCount);
            setPicked(null);
            setFocus((n) => n + 1);
          }}
        >
          {t("game.heart.next")}
        </button>,
      )}

      {drawArea}
      {waiting}

      {!myTurn && shownRound && Heart.isComplete(shownRound) && reveal(shownRound, shownIndex)}

      {(s.rounds.length > 0 || !playing) && (
        <section className="heart-history">
          <h3 className="muted">{t("game.heart.history")}</h3>
          <ol>
            {Array.from({ length: ROUNDS }, (_, i) => {
              const r = s.rounds[i];
              const complete = !!r && Heart.isComplete(r);
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`heart-slot ${complete && i === shownIndex ? "on" : ""}`}
                    disabled={!complete || (myTurn && !gate)}
                    onClick={() => setPicked(i)}
                    aria-label={complete ? t("game.heart.art", { n: i + 1, score: r!.result!.score }) : t("game.heart.result", { n: i + 1 })}
                  >
                    {complete ? (
                      <HeartArt round={r!} />
                    ) : (
                      <svg viewBox="0 0 100 100" className="heart-slot-empty" aria-hidden>
                        <path d={EMPTY_HEART} />
                      </svg>
                    )}
                    <span className="heart-slot-text">
                      <span className="muted">{t(`game.heart.theme.${THEMES[i]!}`)}</span>
                      <strong className="num">{complete ? r!.result!.score : r ? "…" : "–"}</strong>
                    </span>
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
