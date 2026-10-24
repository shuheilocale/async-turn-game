import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Oekaki, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { planPlayback, visibleAt, type Visible } from "./oekaki/playback.ts";
import "./OekakiBoard.css";

const { CANVAS, QUESTIONS, CLEAR_SCORE, DRAW_MS, MAX_STROKES, COLORS, WIDTHS } = Oekaki;
type Stroke = Oekaki.Stroke;
type Point = Oekaki.Point;
type QuestionView = Oekaki.QuestionView;

/** 線の太さ（キャンバスの大きさを 1000 として）。細いペン・太いペン */
const PEN = [9, 24];
/** 残りがこれ以下になったら、残り時間を赤くする */
const HURRY_MS = 10_000;
/** 選択肢の名前の見た目の幅（全角 1 文字を 1 として）がこれより広いものがあれば、選択肢を 1 列に並べる（2 列だと折り返すので） */
const LONG_OPTION = 9.5;

/** 文字列のだいたいの幅。日本語の文字は 1、英字やタイ文字は 0.6 とみなす */
const textWidth = (text: string) => [...text].reduce((w, ch) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.6), 0);

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const listOf = (points: Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const full = (strokes: Stroke[]): Visible[] => strokes.map((stroke) => ({ stroke, points: stroke.points }));
const isDone = (q: QuestionView) => Oekaki.phaseOf(q) === "done";

const STAR = "M12 2.6l2.85 5.95 6.55.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.15 1.2-6.5-4.8-4.5 6.55-.8z";

function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`oekaki-star ${className}`} aria-hidden>
      <path d={STAR} />
    </svg>
  );
}

/** はずれの印 */
function MissIcon() {
  return (
    <svg viewBox="0 0 24 24" className="oekaki-miss" aria-hidden>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

/** 線の小さな絵（もう一度見る・1 つ戻す・文字なし） */
function Icon({ name }: { name: "replay" | "undo" | "pen" }) {
  const d = {
    replay: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4",
    undo: "M9 14 4.5 9.5 9 5M5 9.5h9a5 5 0 0 1 0 10h-3",
    pen: "M4 20l1.2-4.6L15.5 5.1a2.1 2.1 0 0 1 3 3L8.2 18.4zM13.5 7l3.5 3.5",
  }[name];
  return (
    <svg viewBox="0 0 24 24" className="oekaki-icon" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** 描いた線。点が 1 つの線は丸にする */
function Ink({ items }: { items: Visible[] }) {
  return (
    <>
      {items.map(({ stroke, points }, i) =>
        points.length === 1 ? (
          <circle key={i} className={`oekaki-dot c${stroke.color}`} cx={points[0]![0]} cy={points[0]![1]} r={PEN[stroke.width]! / 2} />
        ) : (
          <polyline key={i} className={`oekaki-ink c${stroke.color}`} points={listOf(points)} strokeWidth={PEN[stroke.width]} />
        ),
      )}
    </>
  );
}

/** 絵（viewBox は 0〜CANVAS。線の太さも絵の大きさに合わせて縮む） */
function Paper({ items }: { items: Visible[] }) {
  return (
    <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="oekaki-paper" aria-hidden>
      <Ink items={items} />
    </svg>
  );
}

/**
 * 絵の再生。id が同じあいだは予定を立て直さない（5 秒ごとの確認で同じ絵の新しい配列が届いても、再生がやり直しにならないように）。
 * id ごとに部品を作り直す（key に id を渡す）前提
 */
function usePlayback(strokes: Stroke[], id: string, auto: boolean) {
  // 同じ id の絵は変わらないので、id だけを見て予定を覚えておく
  const plan = useMemo(() => planPlayback(strokes), [id]);
  const [at, setAt] = useState(() => (auto ? 0 : Infinity));
  const [run, setRun] = useState(auto ? 1 : 0);
  useEffect(() => {
    if (run === 0) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = now - start;
      setAt(elapsed);
      if (elapsed < plan.duration) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [run, plan]);
  return {
    items: visibleAt(plan, at),
    playing: run > 0 && at < plan.duration,
    progress: plan.duration > 0 ? Math.min(1, at / plan.duration) : 1,
    replay() {
      setAt(0);
      setRun((n) => n + 1);
    },
  };
}

/** 再生できる絵と「もう一度見る」。auto なら出たときに再生する */
function Player({ strokes, id, auto = false }: { strokes: Stroke[]; id: string; auto?: boolean }) {
  const { t } = useI18n();
  const { items, playing, progress, replay } = usePlayback(strokes, id, auto);
  return (
    <div className="oekaki-player">
      <div className="oekaki-frame">
        <Paper items={items} />
        {strokes.length === 0 && <p className="oekaki-empty">{t("game.oekaki.empty")}</p>}
      </div>
      <div className="oekaki-replay">
        <span className="oekaki-progress" aria-hidden>
          <span style={{ transform: `scaleX(${progress})` }} />
        </span>
        <button type="button" className="ghost-button" onClick={replay} disabled={strokes.length === 0}>
          <Icon name="replay" />
          {playing ? t("game.oekaki.playing") : t("game.oekaki.replay")}
        </button>
      </div>
    </div>
  );
}

/** 6 問分の★。当たり・はずれ・今の問題・まだ */
function Stars({ questions, big = false }: { questions: QuestionView[]; big?: boolean }) {
  const { t } = useI18n();
  const current = Oekaki.currentIndex(questions);
  return (
    <ol className={`oekaki-stars ${big ? "big" : ""}`}>
      {range(QUESTIONS).map((i) => {
        const q = questions[i];
        const kind = q && isDone(q) ? (Oekaki.isCorrect(q) ? "right" : "wrong") : i === current ? "now" : "yet";
        const label = t(`game.oekaki.star.${kind === "now" ? "yet" : kind}`, { n: i + 1 });
        return (
          <li key={i} className={kind} aria-label={label} title={label}>
            <StarIcon />
          </li>
        );
      })}
    </ol>
  );
}

/** お題の名前とジャンルの名前 */
function useNames() {
  const { t } = useI18n();
  return {
    topic: (id: string) => t(`game.oekaki.topic.${id}`),
    genre: (id: string) => t(`game.oekaki.genre.${Oekaki.genreOf(id) ?? "movie"}`),
  };
}

/** 描く人：候補 3 つから選ぶ */
function Picker({ candidates, seat, enabled, onPick }: { candidates: string[]; seat: Seat; enabled: boolean; onPick(topic: string): void }) {
  const { t } = useI18n();
  const name = useNames();
  return (
    <section className={`oekaki-picker panel seat${seat}`}>
      <p className="oekaki-label">{t("game.oekaki.pick")}</p>
      <div className="oekaki-picks">
        {candidates.map((c) => (
          <button key={c} type="button" className="oekaki-pick" disabled={!enabled} onClick={() => onPick(c)}>
            <small>{name.genre(c)}</small>
            <strong>{name.topic(c)}</strong>
          </button>
        ))}
      </div>
      <p className="muted small">{t("game.oekaki.pickHint")}</p>
      <p className="oekaki-rule">
        <Icon name="pen" />
        {t("game.oekaki.noLetters")}
      </p>
    </section>
  );
}

/**
 * 描く人：お題を選んだら 40 秒で描く。時間になるか「描けた」を押したら、間引いて送る。
 * 描いている間の線は React を通さず直接書きかえる（指の動きに遅れないように）。描き終えた線だけを state に入れる
 */
function DrawStage({
  topic,
  seat,
  enabled,
  onRepick,
  onSend,
}: {
  topic: string;
  seat: Seat;
  enabled: boolean;
  onRepick(): void;
  onSend(strokes: Stroke[]): Promise<boolean>;
}) {
  const { t } = useI18n();
  const name = useNames();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(0);
  const [seconds, setSeconds] = useState(DRAW_MS / 1000);
  const [hurry, setHurry] = useState(false);
  const [expired, setExpired] = useState(false);
  const [penDown, setPenDown] = useState(false);
  const [sending, setSending] = useState<"no" | "yes" | "failed">("no");
  const started = useRef(performance.now());
  const done = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const busy = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const live = useRef<SVGPolylineElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const area = useRef<HTMLDivElement>(null);

  /** 描き始めてからのミリ秒（0〜DRAW_MS） */
  const elapsed = () => Math.min(DRAW_MS, Math.max(0, Math.round(performance.now() - started.current)));
  const commit = (list: Stroke[]) => {
    done.current = list;
    setStrokes(list);
  };

  /** 描いている線を終える */
  const endStroke = () => {
    const s = current.current;
    current.current = null;
    pointer.current = null;
    setPenDown(false);
    live.current?.setAttribute("points", "");
    if (s) commit([...done.current, { ...s, t1: Math.max(s.t0, elapsed()) }]);
  };

  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    endStroke();
    setSending("yes");
    const ok = await onSend(Oekaki.thinStrokes(done.current));
    busy.current = false;
    if (!ok) setSending("failed");
  };
  // 時間切れは requestAnimationFrame の中から送るので、いつも新しい send を呼べるようにしておく
  const sendRef = useRef(send);
  sendRef.current = send;

  // 選んだら描く場所が画面に入るようにする
  useEffect(() => {
    area.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  // 残り時間。バーは React を通さず直接縮める。0 になったら描きかけの線も含めて送る
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      const left = DRAW_MS - (performance.now() - started.current);
      if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0, left) / DRAW_MS})`;
      setSeconds(Math.max(0, Math.ceil(left / 1000)));
      setHurry(left <= HURRY_MS);
      if (left <= 0) {
        setExpired(true);
        void sendRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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

  const maxed = strokes.length >= MAX_STROKES;
  const canDraw = enabled && !expired && sending === "no" && !maxed;

  const toCanvas = (e: { clientX: number; clientY: number }): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS, ((e.clientY - r.top) / r.height) * CANVAS];
  };
  const paint = () => live.current?.setAttribute("points", listOf(current.current?.points ?? []));

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!canDraw || pointer.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId;
    current.current = { color, width, t0: elapsed(), t1: 0, points: [toCanvas(e)] };
    setPenDown(true);
    paint();
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== pointer.current || !current.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length > 0 ? events : [e.nativeEvent]) current.current.points.push(toCanvas(ev));
    paint();
  };
  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerId === pointer.current) endStroke();
  };

  const overlay =
    sending === "yes"
      ? t("game.oekaki.sending")
      : expired
        ? t("game.oekaki.timeUp")
        : maxed
          ? t("game.oekaki.tooMany", { n: MAX_STROKES })
          : strokes.length === 0 && !penDown
            ? t("game.oekaki.drawHere")
            : null;

  return (
    <section className={`oekaki-stage seat${seat}`} ref={area}>
      <div className={`oekaki-task ${hurry ? "hurry" : ""}`}>
        <div className="oekaki-task-row">
          <div className="oekaki-task-text">
            <small>
              <span>{t("game.oekaki.topicLabel")}</span>
              <span className="oekaki-genre">{name.genre(topic)}</span>
            </small>
            <strong>{name.topic(topic)}</strong>
          </div>
          <span className="oekaki-seconds num" aria-hidden>
            {seconds}
          </span>
        </div>
        <div className="oekaki-timer" role="timer" aria-label={t("game.oekaki.seconds", { n: seconds })}>
          <span ref={bar} />
        </div>
      </div>

      <div className={`oekaki-pad ${canDraw ? "" : "off"}`}>
        <svg
          ref={svg}
          viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          role="img"
          aria-label={t("game.oekaki.canvas", { topic: name.topic(topic) })}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Ink items={full(strokes)} />
          <polyline ref={live} className={`oekaki-ink c${color}`} points="" strokeWidth={PEN[width]} />
        </svg>
        {overlay && <p className="oekaki-overlay">{overlay}</p>}
      </div>

      <div className="oekaki-tools">
        <div className="oekaki-colors" role="radiogroup">
          {range(COLORS).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={t(`game.oekaki.color.${c}`)}
              title={t(`game.oekaki.color.${c}`)}
              className={`oekaki-swatch c${c} ${color === c ? "on" : ""}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="oekaki-widths" role="radiogroup">
          {range(WIDTHS).map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={width === w}
              aria-label={t(`game.oekaki.width.${w}`)}
              title={t(`game.oekaki.width.${w}`)}
              className={`oekaki-width ${width === w ? "on" : ""}`}
              onClick={() => setWidth(w)}
            >
              <span className={`oekaki-width-dot c${color} w${w}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="oekaki-actions">
        {strokes.length === 0 && !penDown && !expired && sending === "no" ? (
          <button type="button" className="ghost-button" onClick={onRepick}>
            {t("game.oekaki.repick")}
          </button>
        ) : (
          <button
            type="button"
            className="ghost-button"
            disabled={strokes.length === 0 || expired || sending !== "no"}
            onClick={() => commit(done.current.slice(0, -1))}
          >
            <Icon name="undo" />
            {t("game.oekaki.undo")}
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={!enabled || sending === "yes" || (strokes.length === 0 && !expired)}
          onClick={() => void send()}
        >
          {sending === "yes" ? t("game.oekaki.sending") : sending === "failed" ? t("game.oekaki.retry") : t("game.oekaki.done")}
        </button>
      </div>
      <p className="oekaki-rule">
        <Icon name="pen" />
        {t("game.oekaki.noLetters")}
      </p>
    </section>
  );
}

/** 当てる人：絵の再生を見て、4 つから選ぶ（確定は画面下の「これで決定」） */
function GuessStage({
  q,
  index,
  seat,
  drawer,
  enabled,
  chosen,
  onChoose,
}: {
  q: QuestionView;
  index: number;
  seat: Seat;
  drawer: string;
  enabled: boolean;
  chosen: string | null;
  onChoose(topic: string | null): void;
}) {
  const { t } = useI18n();
  const name = useNames();
  const options = q.options ?? [];
  const long = options.some((o) => textWidth(name.topic(o)) > LONG_OPTION);
  return (
    <section className={`oekaki-stage seat${seat}`}>
      <p className="oekaki-label">{t("game.oekaki.guessTitle", { who: drawer })}</p>
      <Player key={`g${index}`} id={`g${index}`} strokes={q.strokes ?? []} auto />
      {options[0] && <span className="oekaki-chip">{t("game.oekaki.genreIs", { genre: name.genre(options[0]) })}</span>}
      <div className={`oekaki-options ${long ? "long" : ""}`} role="radiogroup" aria-label={t("game.oekaki.choose")}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={chosen === o}
            className={`oekaki-option ${chosen === o ? "on" : ""}`}
            disabled={!enabled}
            onClick={() => onChoose(chosen === o ? null : o)}
          >
            {name.topic(o)}
          </button>
        ))}
      </div>
      <p className="muted small center">{t("game.oekaki.choose")}</p>
    </section>
  );
}

/** 答えた問題の結果：当たり・はずれ、絵、お題と答え、描いた人と当てた人 */
function Result({
  q,
  index,
  who,
  auto = false,
  children,
}: {
  q: QuestionView;
  index: number;
  who(seat: Seat): string;
  auto?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const name = useNames();
  const right = Oekaki.isCorrect(q);
  const others = (q.candidates ?? []).filter((c) => c !== q.topic);
  return (
    <section className={`oekaki-result panel ${right ? "right" : "wrong"}`}>
      <div className="oekaki-result-head">
        <span className="muted small">{t("game.oekaki.result", { n: index + 1 })}</span>
        <strong className="oekaki-verdict">
          {right ? <StarIcon /> : <MissIcon />}
          {t(right ? "game.oekaki.right" : "game.oekaki.wrong")}
        </strong>
      </div>
      <Player key={`r${index}`} id={`r${index}`} strokes={q.strokes ?? []} auto={auto} />
      <div className="oekaki-answer">
        <strong>{t("game.oekaki.answerWas", { topic: name.topic(q.topic ?? "") })}</strong>
        {!right && q.guess && <span className="muted">{t("game.oekaki.guessedAs", { topic: name.topic(q.guess) })}</span>}
      </div>
      <p className="oekaki-people">
        <span className={`seat${q.drawer}`}>
          <span className="token dot" aria-hidden />
          {t("game.oekaki.drewBy", { who: who(q.drawer) })}
        </span>
        <span className={`seat${other(q.drawer)}`}>
          <span className="token dot" aria-hidden />
          {t("game.oekaki.guessedBy", { who: who(other(q.drawer)) })}
        </span>
      </p>
      {others.length > 0 && (
        <p className="muted small">{t("game.oekaki.others", { list: others.map(name.topic).join(t("game.oekaki.listSep")) })}</p>
      )}
      {children}
    </section>
  );
}

/** 終わったあと：★と点数、ひとこと、2 人それぞれの絵がいくつ当たったか */
function Final({ questions, me, who, cleared }: { questions: QuestionView[]; me: Seat; who(seat: Seat): string; cleared: boolean }) {
  const { t } = useI18n();
  const score = Oekaki.scoreOf(questions);
  const rank = score >= 3 ? String(score) : "low";
  const stat = (seat: Seat) => {
    const drawn = questions.filter((q) => q.drawer === seat);
    return t("game.oekaki.drawerStat", { who: who(seat), n: drawn.filter(Oekaki.isCorrect).length, total: drawn.length });
  };
  return (
    <section className={`oekaki-final panel ${cleared ? "cleared" : "failed"}`}>
      <Stars questions={questions} big />
      <strong className="oekaki-final-score">{t("game.oekaki.final", { n: score, total: QUESTIONS })}</strong>
      <p className="oekaki-rank">{t(`game.oekaki.rank.${rank}`)}</p>
      <ul className="oekaki-stats">
        {([me, other(me)] as Seat[]).map((seat) => (
          <li key={seat} className={`seat${seat}`}>
            <span className="token dot" aria-hidden />
            {stat(seat)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** これまでの問題の絵を小さく並べる。押すと結果を開く */
function Gallery({
  questions,
  picked,
  disabled,
  onPick,
}: {
  questions: QuestionView[];
  picked: number | null;
  disabled: boolean;
  onPick(index: number | null): void;
}) {
  const { t } = useI18n();
  const name = useNames();
  const done = questions.map((q, i) => ({ q, i })).filter(({ q }) => isDone(q));
  if (done.length === 0) return null;
  return (
    <section className="oekaki-gallery">
      <h3 className="muted">{t("game.oekaki.gallery")}</h3>
      <ol className="oekaki-thumbs">
        {done.map(({ q, i }) => {
          const right = Oekaki.isCorrect(q);
          return (
            <li key={i}>
              <button
                type="button"
                className={`oekaki-thumb ${picked === i ? "on" : ""}`}
                aria-pressed={picked === i}
                disabled={disabled}
                onClick={() => onPick(picked === i ? null : i)}
              >
                <span className="oekaki-thumb-paper">
                  <Paper items={full(q.strokes ?? [])} />
                  <span className={`oekaki-thumb-no num seat${q.drawer}`}>{i + 1}</span>
                  <span className={`oekaki-thumb-mark ${right ? "right" : "wrong"}`}>{right ? <StarIcon /> : <MissIcon />}</span>
                </span>
                <span className="oekaki-thumb-name">{name.topic(q.topic ?? "")}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="muted small">{t("game.oekaki.galleryHint")}</p>
    </section>
  );
}

/**
 * おえかきクイズ。描く人は候補から選んで 40 秒で描き（送るのは確定を待たない）、当てる人は再生を見て 4 つから選ぶ（「これで決定」で確定）。
 * 答えた問題の結果は、次に自分の番が来たときに先に見せる（相手が答えた結果を見ないまま次へ進まないように）
 */
export function OekakiBoard({ state, status, you, names, interactive, selected, onSelect, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Oekaki.OekakiView;
  const qs = s.questions;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && Oekaki.turnOf(qs) === you;
  const index = Oekaki.currentIndex(qs);
  const q = qs[index];
  const phase = q ? Oekaki.phaseOf(q) : "done";
  // 答えた問題はいつも前から順に並ぶ
  const doneCount = qs.filter(isDone).length;
  const lastDone = doneCount - 1;
  const score = Oekaki.scoreOf(qs);

  /** 「つぎへ」で閉じた結果の数 */
  const [acked, setAcked] = useState(0);
  /** これまでの絵から選んで見ている問題 */
  const [picked, setPicked] = useState<number | null>(null);
  /** 描く人が選んだお題（送るまでは画面の中だけ） */
  const [topic, setTopic] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // 問題や番が進んだら、選びかけのお題と、見返している絵を閉じる
  const progress = `${index}-${phase}`;
  useEffect(() => {
    setTopic(null);
    setPicked(null);
  }, [progress]);

  /** 文の中で使う呼び名（「あなた」「〇〇さん」。お試しの「先手」などはそのまま。名前がまだなければ「相手」） */
  const who = (seat: Seat) =>
    seat === you
      ? t("game.oekaki.you")
      : !names[seat]
        ? t("game.oekaki.partner")
        : names[seat] === t(`game.oekaki.seat${seat}`)
          ? names[seat]
          : t("game.oekaki.who", { name: names[seat] });
  /** 見出しに付ける名前 */
  const label = (seat: Seat) => (seat === you ? t("game.oekaki.you") : names[seat] || t("game.oekaki.partner"));

  const gate = myTurn && lastDone >= 0 && acked < doneCount;
  const chosen = (selected as { guess?: string } | null)?.guess ?? null;
  const need = CLEAR_SCORE - score;
  const left = QUESTIONS - doneCount;
  const goal =
    need <= 0 ? t("game.oekaki.clearSure") : need > left ? t("game.oekaki.cantClear") : t("game.oekaki.toClear", { n: need });

  // 自分の番でないときに、何も選ばなくても見せる結果（相手が描いている間の直前の結果・終わったあとの最後の結果）
  const waitingDraw = !myTurn && playing && phase === "draw";
  const detail = picked ?? ((waitingDraw || !playing) && lastDone >= 0 ? lastDone : null);

  return (
    <div className="oekaki" ref={root}>
      {/* 終わったあとは、下の Final が★と点数を大きく出す */}
      {playing && (
        <div className="oekaki-head">
          <div className="oekaki-head-row">
            <span className="oekaki-qno">{t("game.oekaki.question", { n: index + 1, total: QUESTIONS })}</span>
            <strong className="oekaki-team">{t("game.oekaki.score", { n: score })}</strong>
          </div>
          <Stars questions={qs} />
          <p className="oekaki-goal">{goal}</p>
          {q && (
            <div className="oekaki-roles">
              {([q.drawer, other(q.drawer)] as Seat[]).map((seat, k) => (
                <span key={seat} className={`oekaki-role seat${seat} ${Oekaki.turnOf(qs) === seat ? "turn" : ""}`}>
                  <span className="token dot" aria-hidden />
                  <span className="oekaki-role-name">{label(seat)}</span>
                  <small>{t(k === 0 ? "game.oekaki.role.draw" : "game.oekaki.role.guess")}</small>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {gate && (
        <Result q={qs[lastDone]!} index={lastDone} who={who}>
          <p className="oekaki-next-note">{t(phase === "draw" ? "game.oekaki.nextDraw" : "game.oekaki.nextGuess")}</p>
          <button
            type="button"
            className="primary oekaki-next"
            onClick={() => {
              setAcked(doneCount);
              setPicked(null);
              root.current?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          >
            {t("game.oekaki.next")}
          </button>
        </Result>
      )}

      {myTurn && !gate && q && phase === "draw" &&
        (topic ? (
          <DrawStage
            key={`${index}-${topic}`}
            topic={topic}
            seat={me}
            enabled={interactive}
            onRepick={() => setTopic(null)}
            onSend={(strokes) => onSubmit({ kind: "draw", topic, strokes } satisfies Oekaki.OekakiMove)}
          />
        ) : (
          <Picker candidates={q.candidates ?? []} seat={me} enabled={interactive} onPick={setTopic} />
        ))}

      {myTurn && !gate && q && phase === "guess" && (
        <GuessStage
          q={q}
          index={index}
          seat={me}
          drawer={who(q.drawer)}
          enabled={interactive}
          chosen={chosen}
          onChoose={(g) => onSelect(g === null ? null : ({ kind: "guess", guess: g } satisfies Oekaki.OekakiMove))}
        />
      )}

      {!myTurn && playing && q && (
        <section className="oekaki-wait">
          <p className="board-note">
            <span>{t(phase === "draw" ? "game.oekaki.drawing" : "game.oekaki.guessing", { who: who(Oekaki.turnOf(qs)!) })}</span>
            {phase === "draw" && <span className="muted">{t("game.oekaki.drawingHint")}</span>}
          </p>
          {phase === "guess" && (
            <div className={`oekaki-mine panel seat${q.drawer}`}>
              {q.topic && <strong>{t("game.oekaki.yourTopic", { topic: t(`game.oekaki.topic.${q.topic}`) })}</strong>}
              <Player key={`w${index}`} id={`w${index}`} strokes={q.strokes ?? []} />
              {q.options && (
                <>
                  <span className="muted small">{t("game.oekaki.theySee", { who: who(other(q.drawer)) })}</span>
                  <ul className="oekaki-seen">
                    {q.options.map((o) => (
                      <li key={o} className={o === q.topic ? "answer" : ""}>
                        {t(`game.oekaki.topic.${o}`)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {!playing && <Final questions={qs} me={me} who={who} cleared={status.kind === "finished" && status.coop === "cleared"} />}

      {!gate && detail !== null && qs[detail] && <Result key={detail} q={qs[detail]!} index={detail} who={who} />}

      <Gallery questions={qs} picked={picked} disabled={gate} onPick={setPicked} />
    </div>
  );
}
