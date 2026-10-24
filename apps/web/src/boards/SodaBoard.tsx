import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { other, Soda, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import { capture, inputOf, InputTag, PortraitStage, SensorBar, usePreferTouch, useScreenAngle, useSensor } from "../sensors.tsx";
import type { BoardProps } from "./index.ts";
import { ShakeMeter } from "./soda/meter.ts";
import "./SodaBoard.css";

const { SHAKES, MIN_POWER, LIMIT_MIN, LIMIT_MAX, SHAKE_MS, pressureOf, addedOf, isShort } = Soda;
type Input = "motion" | "touch";

/** 「振る」が受け付けられてから測りはじめるまで（かまえる時間） */
const READY_MS = 1000;
/** 相手が振った分を見せるときに、ボトルを揺らす時間 */
const REPLAY_MS = 1100;
/** 測り終わってから、結果を見せておく時間（送れたら閉じる） */
const RESULT_MS = 900;
/** 圧力計のいちばん右。限界の上限にそろえる（限界がどこかのヒントは出さない） */
const GAUGE_MAX = LIMIT_MAX;

const frac = (pressure: number) => Math.min(1, Math.max(0, pressure / GAUGE_MAX));

/** 泡 1 つ 1 つの位置・大きさ・速さ。描き直しても同じになるよう、番号から決める */
const BUBBLES = Array.from({ length: 52 }, (_, i) => {
  const r = (n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
  return { x: 36 + r(1) * 88, size: 1.8 + r(2) * 3.4, delay: -r(3) * 4, dur: 2.4 + r(4) * 1.8, sway: (r(5) - 0.5) * 12 };
});
/** 吹き出したときに飛ぶしぶき：向き（度、上が -90）と距離と大きさ */
const SPRAY = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => (((Math.sin(i * 7.137 + n * 31.71) * 9631.21) % 1) + 1) % 1;
  return { deg: -90 + (r(1) - 0.5) * 110, dist: 70 + r(2) * 120, size: 4 + r(3) * 9, delay: r(4) * 0.25 };
});

/** 吹き出したときに口からあふれる泡のかたまり [x, y, 半径, 遅れ（秒）] */
const GUSH: [number, number, number, number][] = [
  [80, 40, 11, 0],
  [72, 26, 12, 0.05],
  [89, 18, 13, 0.1],
  [78, 4, 14, 0.15],
  [92, -8, 12, 0.2],
  [68, -12, 11, 0.25],
  [82, -24, 13, 0.3],
];

/** ボトルの形（viewBox 0 0 160 320）。液面は SURFACE の高さ */
const BODY = "M63 48L63 66C63 88 26 94 26 122L26 284C26 300 40 308 56 308L104 308C120 308 134 300 134 284L134 122C134 94 97 88 97 66L97 48Z";
const SURFACE = 136;

/**
 * ふりふりソーダの盤。「振る」をまずサーバに送り、受け付けられたら全画面の舞台で 1 秒かまえてから 3 秒間測る。
 * 測り終わったら強さをすぐ送る（確定を待たない）。始めたことは記録に残るので、開き直したら失敗扱いの手を送る
 */
export function SodaBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Soda.SodaView;
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const count = s.shakes.length;
  const who = (seat: Seat) => (seat === you ? t("game.soda.you") : t("game.soda.who", { name: names[seat] }));

  // ---------- センサー ----------
  const meter = useRef<ShakeMeter | null>(null);
  const sensor = useSensor<DeviceMotionEvent>("motion", (e) => {
    meter.current?.addMotion(e.acceleration, e.accelerationIncludingGravity, e.timeStamp);
  });
  const [preferTouch, setPreferTouch] = usePreferTouch("motion");
  const { needAsk, deciding, input } = inputOf(sensor.status, preferTouch);
  const angle = useScreenAngle();

  // ---------- 振る手番 ----------
  /** この画面で振りはじめた手番（何回目の振りか）と、どちらで遊んだか */
  const [run, setRun] = useState<{ index: number; input: Input } | null>(null);
  /** 測り終わった強さ。送れなかったら、ここから送り直す */
  const [result, setResult] = useState<{ index: number; power: number } | null>(null);
  const [sending, setSending] = useState<"start" | "shake" | "fail" | null>(null);
  const sendingRef = useRef(false);
  const [retry, setRetry] = useState<"shake" | "fail" | null>(null);
  /** 開いたときにもう「振りはじめた」状態だった手番。この画面では測っていないので、失敗扱いにする */
  const openedShaking = useRef(playing && you !== null && s.shaking === you ? count : null);
  const failSent = useRef<number | null>(null);
  const [lostIndex, setLostIndex] = useState<number | null>(null);

  const runHere = run !== null && run.index === count;
  type Phase = "idle" | "run" | "lost" | "elsewhere" | "watch" | "over";
  let phase: Phase;
  if (!playing) phase = "over";
  else if (!myTurn) phase = "watch";
  else if (s.shaking === you) phase = runHere ? "run" : sending === "start" ? "idle" : openedShaking.current === count ? "lost" : "elsewhere";
  else phase = "idle";
  // 送れて手番が移っても、結果を見せ終わるまでは舞台を閉じない
  const [holdStage, setHoldStage] = useState(false);
  const stageOpen = phase === "run" || holdStage;

  async function send(move: Soda.SodaMove, kind: "start" | "shake" | "fail"): Promise<boolean> {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(kind);
    setRetry(null);
    const ok = await onSubmit(move);
    sendingRef.current = false;
    setSending(null);
    if (!ok && kind !== "start") setRetry(kind);
    return ok;
  }

  /** 「振る」：サーバが受け付けてから舞台を開いて測りはじめる */
  async function begin() {
    if (phase !== "idle" || !interactive || needAsk || deciding) return;
    const index = count;
    const chosen = input;
    if (!(await send({ kind: "start" }, "start"))) return;
    meter.current = new ShakeMeter();
    meter.current.open = false;
    setResult(null);
    setRun({ index, input: chosen });
  }

  /** 測り終わった：強さをすぐ送る。送れたら、少し結果を見せてから舞台を閉じる */
  async function finish(power: number) {
    const r = run;
    if (!r) return;
    setResult({ index: r.index, power });
    setHoldStage(true);
    const shownAt = performance.now();
    const ok = await send({ kind: "shake", power, input: r.input }, "shake");
    if (!ok) return;
    setTimeout(() => setHoldStage(false), Math.max(0, RESULT_MS - (performance.now() - shownAt)));
  }

  async function resend() {
    if (!result || !run) return;
    if (await send({ kind: "shake", power: result.power, input: run.input }, "shake")) setHoldStage(false);
  }

  // 終わったら（結果を見せ終わったら）、この画面で持っていた手番の記録を捨てる（お試しの「もう一度」で最初から遊べるように）
  useEffect(() => {
    if (playing || holdStage) return;
    meter.current = null;
    openedShaking.current = null;
    failSent.current = null;
    setRun(null);
    setResult(null);
    setRetry(null);
    setLostIndex(null);
  }, [playing, holdStage]);

  // 振りはじめたまま開き直したら、失敗扱いの手を 1 回だけ送る（送れなければボタンで送り直す）
  useEffect(() => {
    if (phase !== "lost" || !interactive || failSent.current === count) return;
    failSent.current = count;
    sendFail();
  }, [phase, interactive, count]);

  async function sendFail() {
    const index = count;
    if (await send({ kind: "fail" }, "fail")) setLostIndex(index);
  }

  // ---------- 見せる圧力（相手が振った分は、揺らしてから増やす） ----------
  const last = s.shakes.at(-1) ?? null;
  const [shown, setShown] = useState(() => (last && (last.seat !== you || s.burstBy !== null) ? count - 1 : count));
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (count < shown) {
      // 別の対局に替わった
      setShown(count);
      return;
    }
    if (count === shown) return;
    // 自分が振った分は、全画面の舞台を閉じてから増やす（吹き出したところを盤で見せる）
    const mine = s.shakes[shown]?.seat === you;
    if (mine && count === shown + 1) {
      if (!holdStage) setShown(count);
      return;
    }
    setShaking(true);
    const timer = setTimeout(() => {
      setShaking(false);
      setShown(count);
    }, REPLAY_MS);
    return () => clearTimeout(timer);
  }, [count, shown, holdStage]);

  // 別の対局に替わった直後は shown が今の回数より多いことがあるので、今の回数までにする
  const visible = Math.min(shown, count);
  const shownShakes = s.shakes.slice(0, visible);
  const pressure = shownShakes.reduce((sum, x) => sum + x.added, 0);
  const prev = visible > 0 ? pressure - shownShakes[visible - 1]!.added : null;
  const burst = s.burstBy !== null && visible === count;

  // ---------- 文 ----------
  let note: string;
  if (!playing) {
    note =
      s.burstBy !== null
        ? burst
          ? t("game.soda.burst", { who: who(s.burstBy) })
          : ""
        : t("game.soda.survived");
  } else if (phase === "watch") {
    note = s.shaking !== null ? t("game.soda.theyShake", { name: names[s.shaking] }) : t("game.soda.waiting", { name: names[s.turn] });
  } else if (phase === "lost") {
    note = t("game.soda.lost");
  } else if (phase === "elsewhere") {
    note = t("game.soda.elsewhere");
  } else if (needAsk) {
    note = t("game.soda.yourTurnAsk");
  } else {
    note = t(input === "motion" || deciding ? "game.soda.yourTurnMotion" : "game.soda.yourTurnTouch");
  }
  const lastText =
    last && visible === count && playing && phase !== "run" && !(lostIndex !== null && last.seat === you && last.power === null)
      ? last.power === null
        ? t("game.soda.lastLost", { who: who(last.seat) })
        : isShort(last)
          ? t("game.soda.lastShort", { who: who(last.seat), n: last.power, min: MIN_POWER })
          : t("game.soda.lastShook", { who: who(last.seat), n: last.power })
      : null;

  // センサーを確かめている間は押せないだけで、文はそのまま（確かめていることは SensorBar に出る）
  const mainLabel = needAsk
    ? t("game.soda.sensorOn")
    : sending === "start"
      ? t("game.soda.sending")
      : t(input === "motion" || deciding ? "game.soda.shake" : "game.soda.rub");

  return (
    <div className={`soda seat${me}`}>
      <div className="scores soda-scores">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className={`score seat${seat} ${playing && s.turn === seat ? "turn" : ""}`}>
            <span className="muted small">
              <span className="token dot" aria-hidden />
              <span className="soda-name">{names[seat]}</span>
            </span>
            <strong className="num">{pressureOf(shownShakes, seat)}</strong>
          </div>
        ))}
      </div>
      <p className="soda-meta muted small">
        <span>{t("game.soda.scoreHint")}</span>
        {playing && <span>{t("game.soda.left", { n: SHAKES - visible })}</span>}
      </p>

      <div className={`soda-stage ${shaking ? "replay" : ""}`}>
        {burst && (
          <span key={count} className="soda-pop">
            {t("game.soda.pop")}
          </span>
        )}
        <Bottle pressure={pressure} burst={burst} burstKey={count} seat={s.burstBy ?? me} label={t("game.soda.bottle")} />
        <div className="soda-gauge-box">
          <Gauge value={pressure} prev={prev} limit={!playing ? s.limit : null} t={t} />
          <p className="soda-gauge-label muted small">{t("game.soda.gauge")}</p>
          {!playing && s.limit !== null && <p className="soda-limit small">{t(s.burstBy !== null ? "game.soda.limitWas" : "game.soda.limitWould")}</p>}
        </div>
      </div>

      {phase === "idle" && (
        <div className="soda-controls stack-sm">
          <SensorBar
            status={sensor.status}
            preferTouch={preferTouch}
            onPreferTouch={setPreferTouch}
            say={(k) => t(`game.soda.sensor.${k}`)}
          />
          <button
            type="button"
            className={`soda-go primary seat${me}`}
            disabled={!interactive || deciding || sending !== null}
            onClick={needAsk ? sensor.enable : begin}
          >
            <span className="soda-go-label">{mainLabel}</span>
            {!needAsk && !deciding && <span className="soda-go-hint">{t("game.soda.goHint")}</span>}
          </button>
        </div>
      )}
      {retry === "fail" && phase === "lost" && (
        <button type="button" className="primary" onClick={sendFail}>
          {t("game.soda.lostSend")}
        </button>
      )}

      <p className="board-note">
        {lostIndex !== null && phase !== "run" && <span className="soda-warn">{t("game.soda.lostDone")}</span>}
        {lastText && <span className="muted">{lastText}</span>}
        {note && <span>{note}</span>}
        {playing && <span className="muted">{t("game.soda.range")}</span>}
      </p>

      {s.shakes.length > 0 && <History t={t} shakes={shownShakes} burst={burst} who={who} />}

      {stageOpen && run && (
        <PortraitStage angle={angle} className={`soda-run seat${me}`}>
          <ShakeRun
            key={run.index}
            t={t}
            input={run.input}
            base={s.shakes.slice(0, run.index).reduce((sum, x) => sum + x.added, 0)}
            meter={meter.current!}
            result={result?.index === run.index ? result.power : null}
            sending={sending === "shake"}
            retry={retry === "shake"}
            onDone={finish}
            onRetry={resend}
            seat={me}
          />
        </PortraitStage>
      )}
    </div>
  );
}

/** 振っている間の全画面。かまえて → 3 秒測って → 強さを見せる */
function ShakeRun({
  t,
  input,
  base,
  meter,
  result,
  sending,
  retry,
  onDone,
  onRetry,
  seat,
}: {
  t: T;
  input: Input;
  /** 振る前の圧力 */
  base: number;
  meter: ShakeMeter;
  result: number | null;
  sending: boolean;
  retry: boolean;
  onDone(power: number): void;
  onRetry(): void;
  seat: Seat;
}) {
  const [now, setNow] = useState(() => performance.now());
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const wobble = useRef<HTMLDivElement>(null);
  const touches = useRef(new Map<number, [number, number]>());

  useEffect(() => {
    let lastTime = performance.now();
    let frame = requestAnimationFrame(function tick(time) {
      const elapsed = time - t0.current;
      meter.open = elapsed >= READY_MS && elapsed < READY_MS + SHAKE_MS;
      meter.settle(Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      // ボトルの揺れは、振った勢いの分だけ（React を通さずに毎フレーム書き換える）
      const w = meter.level;
      wobble.current?.style.setProperty("--wob", `${Math.sin(time / 38) * w * 16}deg`);
      wobble.current?.style.setProperty("--jump", `${Math.abs(Math.sin(time / 52)) * w * -10}px`);
      setNow(time);
      if (elapsed >= READY_MS + SHAKE_MS) {
        meter.open = false;
        if (!done.current) {
          done.current = true;
          doneRef.current(meter.power);
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const elapsed = now - t0.current;
  const ready = elapsed < READY_MS;
  const left = Math.max(0, READY_MS + SHAKE_MS - elapsed);
  const power = result ?? meter.power;
  const live = result === null ? power : addedOf(power);

  // 指で遊ぶとき：ボトルをこすった長さと、たたいた回数を数える
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (input !== "touch") return;
    e.preventDefault();
    capture(e);
    touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    meter.addTap();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = touches.current.get(e.pointerId);
    if (input !== "touch" || !p) return;
    meter.addRub(Math.hypot(e.clientX - p[0], e.clientY - p[1]));
    touches.current.set(e.pointerId, [e.clientX, e.clientY]);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => touches.current.delete(e.pointerId);

  let head: string;
  if (result !== null) {
    head = result < MIN_POWER ? t("game.soda.runShort", { n: result, min: MIN_POWER }) : t("game.soda.runPower", { n: result });
  } else if (ready) {
    head = t("game.soda.runReady");
  } else {
    head = t(input === "motion" ? "game.soda.runShake" : "game.soda.runRub");
  }

  return (
    <>
      <div className="soda-run-head">
        <InputTag input={input} label={t(input === "motion" ? "game.soda.sensor.tagMotion" : "game.soda.sensor.tagTouch")} />
        <p className={`soda-run-title ${result !== null && result < MIN_POWER ? "short" : ""}`} aria-live="assertive">
          {head}
        </p>
        <div className="soda-run-time" aria-hidden>
          <span style={{ width: `${ready ? 100 : (left / SHAKE_MS) * 100}%` }} className={ready ? "ready" : ""} />
        </div>
        <StrengthBar power={result === null && ready ? 0 : power} t={t} />
      </div>
      <div
        className={`soda-run-bottle ${input}`}
        ref={wobble}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Bottle pressure={base + live} burst={false} burstKey={0} seat={seat} label={t("game.soda.bottle")} />
        {input === "touch" && result === null && !ready && <span className="soda-run-hint">{t("game.soda.rubHere")}</span>}
      </div>
      <div className="soda-run-foot">
        <div className="soda-run-gauge">
          <Gauge value={base + live} prev={base} limit={null} t={t} />
        </div>
        <p className="muted small">{result === null ? t("game.soda.gauge") : sending ? t("game.soda.sending") : t("game.soda.added", { n: addedOf(result) })}</p>
        {retry && (
          <button type="button" className="primary" onClick={onRetry}>
            {t("game.soda.resend")}
          </button>
        )}
      </div>
    </>
  );
}

/** 振った強さの帯。最低ライン（これより弱いと最低量が足される）に印を付ける。数字は出さない */
function StrengthBar({ power, t }: { power: number; t: T }) {
  return (
    <div className="soda-strength" role="img" aria-label={t("game.soda.strength")}>
      <span className="soda-strength-fill" style={{ width: `${power}%` }} />
      <span className="soda-strength-min" style={{ left: `${MIN_POWER}%` }} />
      {[25, 50, 75].map((x) => (
        <span key={x} className="soda-strength-tick" style={{ left: `${x}%` }} />
      ))}
    </div>
  );
}

/** ソーダのボトル。泡と液面の上のあぶくが、圧力に合わせて増える */
function Bottle({ pressure, burst, burstKey, seat, label }: { pressure: number; burst: boolean; burstKey: number; seat: Seat; label: string }) {
  const id = useId().replace(/:/g, "");
  const f = frac(pressure);
  const bubbles = Math.round(4 + f * 46);
  // 吹き出したあとは、あぶくはほとんど残らない
  const foam = burst ? 6 : 3 + f * 44;
  const surface = burst ? SURFACE + 46 : SURFACE;
  return (
    <svg className={`soda-bottle seat${seat} ${burst ? "burst" : ""}`} viewBox="0 0 160 320" role="img" aria-label={label} style={{ "--speed": 1 - f * 0.55 } as CSSProperties}>
      <defs>
        <clipPath id={`${id}-in`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`${id}-glass`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="soda-glass-edge" />
          <stop offset="0.25" className="soda-glass-mid" />
          <stop offset="0.75" className="soda-glass-mid" />
          <stop offset="1" className="soda-glass-edge" />
        </linearGradient>
      </defs>
      <path d={BODY} className="soda-glass" fill={`url(#${id}-glass)`} />
      <g clipPath={`url(#${id}-in)`}>
        <rect className="soda-liquid" x="20" y={surface} width="120" height={320 - surface} />
        {/* 液面の上のあぶく。圧力が上がるほど高くなる */}
        <g className="soda-foam" style={{ transform: `translateY(${burst ? 46 : 0}px)` }}>
          <rect x="20" y={SURFACE - foam} width="120" height={foam + 2} />
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx={24 + i * 14} cy={SURFACE - foam} r={6 + (i % 3)} />
          ))}
        </g>
        {BUBBLES.slice(0, bubbles).map((b, i) => (
          <circle
            key={i}
            className="soda-bubble"
            cx={b.x}
            cy={300}
            r={b.size}
            style={{ "--delay": `${b.delay}s`, "--dur": `${b.dur}s`, "--sway": `${b.sway}px`, "--travel": `${300 - surface - 4}px` } as CSSProperties}
          />
        ))}
      </g>
      {/* ラベルとつや */}
      <rect className="soda-label" x="26" y="182" width="108" height="52" />
      <path className="soda-label-wave" d="M26 208c9-7 18-7 27 0s18 7 27 0 18-7 27 0 18 7 27 0" />
      <path className="soda-shine" d="M40 130v140" />
      <path d={BODY} className="soda-outline" />
      {/* ふた。吹き出したら飛んでいく */}
      <g key={burst ? `cap-${burstKey}` : "cap"} className={`soda-cap ${burst ? "flying" : ""}`}>
        <rect x="56" y="16" width="48" height="30" rx="6" />
        {[64, 72, 80, 88, 96].map((x) => (
          <path key={x} className="soda-cap-ridge" d={`M${x} 21v20`} />
        ))}
      </g>
      <rect className="soda-ring" x="60" y="44" width="40" height="6" rx="2" />
      {burst && (
        <g key={`gush-${burstKey}`} className="soda-gush">
          {GUSH.map(([x, y, r, delay], i) => (
            <circle key={i} cx={x} cy={y} r={r} style={{ "--delay": `${delay}s` } as CSSProperties} />
          ))}
        </g>
      )}
      {burst && (
        <g key={`spray-${burstKey}`} className="soda-spray">
          {SPRAY.map((d, i) => (
            <circle
              key={i}
              cx="80"
              cy="46"
              r={d.size}
              style={
                {
                  "--dx": `${Math.cos((d.deg * Math.PI) / 180) * d.dist}px`,
                  "--dy": `${Math.sin((d.deg * Math.PI) / 180) * d.dist}px`,
                  "--delay": `${d.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </g>
      )}
    </svg>
  );
}

/** 円弧の上の点（frac 0 が左端、1 が右端） */
const arcPoint = (f: number, r: number): [number, number] => [100 + r * Math.cos(Math.PI * (1 - f)), 100 - r * Math.sin(Math.PI * (1 - f))];
const arc = (a: number, b: number, r: number) => {
  const [x1, y1] = arcPoint(a, r);
  const [x2, y2] = arcPoint(b, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
/** 危ない帯（限界がありうる範囲）を、黄色から赤へ少しずつ色を変えて描く */
const DANGER_STEPS = 10;
const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
const dangerColor = (k: number) => `rgb(${lerp(245, 226, k)} ${lerp(197, 72, k)} ${lerp(66, 77, k)})`;

/** 圧力計。数字は出さず、目盛りと針で見せる。黄色から赤の帯のどこかで吹き出す。終局後は限界に印を付ける */
function Gauge({ value, prev, limit, t }: { value: number; prev: number | null; limit: number | null; t: T }) {
  const safe = LIMIT_MIN / GAUGE_MAX;
  return (
    <svg className="soda-gauge" viewBox="0 0 200 118" role="img" aria-label={t("game.soda.gauge")}>
      <path className="soda-gauge-track" d={arc(0, 1, 80)} />
      <path className="soda-gauge-safe" d={arc(0, safe, 80)} />
      {Array.from({ length: DANGER_STEPS }, (_, i) => {
        const a = safe + ((1 - safe) * i) / DANGER_STEPS;
        const b = safe + ((1 - safe) * (i + 1)) / DANGER_STEPS;
        return <path key={i} className="soda-gauge-danger" d={arc(a, b + 0.002, 80)} style={{ stroke: dangerColor(i / (DANGER_STEPS - 1)) }} />;
      })}
      {Array.from({ length: 21 }, (_, i) => {
        const long = i % 5 === 0;
        const [x1, y1] = arcPoint(i / 20, long ? 60 : 64);
        const [x2, y2] = arcPoint(i / 20, 70);
        return <line key={i} className={`soda-gauge-tick ${long ? "long" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {limit !== null && (
        <g className="soda-gauge-limit">
          {(() => {
            const [x, y] = arcPoint(frac(limit), 92);
            const [x2, y2] = arcPoint(frac(limit), 72);
            return <line x1={x} y1={y} x2={x2} y2={y2} />;
          })()}
        </g>
      )}
      {prev !== null && prev !== value && (
        <g className="soda-needle ghost" style={{ transform: `rotate(${frac(prev) * 180}deg)` }}>
          <path d="M100 100L36 100" />
        </g>
      )}
      <g className="soda-needle" style={{ transform: `rotate(${frac(value) * 180}deg)` }}>
        <path d="M100 96.5L32 100L100 103.5Z" />
      </g>
      <circle className="soda-hub" cx="100" cy="100" r="7" />
    </svg>
  );
}

/** これまでの記録。強さは帯と数で、どちらで遊んだかも小さく出す */
function History({ t, shakes, burst, who }: { t: T; shakes: Soda.Shake[]; burst: boolean; who: (seat: Seat) => string }) {
  if (shakes.length === 0) return null;
  return (
    <section className="soda-history">
      <h3 className="muted">{t("game.soda.history")}</h3>
      <ol className="history">
        {shakes.map((x, i) => (
          <li key={i} className={`seat${x.seat}`}>
            <span className="muted num">{i + 1}</span>
            <span className="soda-who">
              <span className="token dot" aria-hidden />
              <span>{who(x.seat)}</span>
              {x.input && <InputTag input={x.input} label={t(x.input === "motion" ? "game.soda.sensor.tagMotion" : "game.soda.sensor.tagTouch")} />}
            </span>
            <span className="soda-bar" aria-hidden>
              <span style={{ width: `${x.added}%` }} />
            </span>
            <strong className="num soda-after">+{x.added}</strong>
            {/* 足りない・閉じた・吹き出した は、名前を詰めないよう次の行に出す */}
            {(x.power === null || isShort(x) || (burst && i === shakes.length - 1)) && (
              <span className="soda-tags">
                {x.power === null && <b className="soda-tag lost">{t("game.soda.short.lost")}</b>}
                {isShort(x) && <b className="soda-tag">{t("game.soda.short.short")}</b>}
                {burst && i === shakes.length - 1 && <b className="soda-tag burst">{t("game.soda.short.burst")}</b>}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
