import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { other, Stopwatch, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./StopwatchBoard.css";

const { MIN_TARGET, MAX_TARGET, TARGET_STEP, MAX_MS, VISIBLE_MS, PERFECT_MS, ROUNDS, FAIL_ERROR } = Stopwatch;

/** 霧がかかりはじめてから数字が見えなくなるまで（ミリ秒）。VISIBLE_MS で見えなくなるよう、その前から始める */
const FOG_MS = 500;
/** 出題のときに、はじめに出しておく秒数 */
const DEFAULT_TARGET = 10_000;

/** 1/100 秒の整数で組み立てる（小数の丸めで 13.52 が 13.51 にならないように） */
const centis = (ms: number) => Math.round(Math.abs(ms) / 10);
const sec2 = (ms: number) => {
  const c = centis(ms);
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
};
const sec1 = (ms: number) => (Math.round(ms / 100) / 10).toFixed(1);
/** 目標との差。遅ければ +、早ければ −（マイナス記号） */
const signed = (diff: number) => (centis(diff) === 0 ? "±0.00" : `${diff > 0 ? "+" : "−"}${sec2(diff)}`);
const clampTarget = (ms: number) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(ms / TARGET_STEP) * TARGET_STEP));

type Phase =
  /** 自分が出題する：目標の秒数を選ぶ */
  | "pick"
  /** 目標が決まり、スタートを待つ */
  | "ready"
  /** この画面でスタートして測っている（止めて送っている間も） */
  | "running"
  /** スタートしたまま画面を開き直した：失敗扱いにする */
  | "lost"
  /** 別の画面（別のタブ）でスタートした */
  | "elsewhere"
  /** 相手の番・観戦 */
  | "watch"
  | "over";

/**
 * 目隠しのストップウォッチ。「スタート」はまずサーバに送り、受け付けられてから時間を測りはじめる。
 * 「ストップ」で測った時間（1/100 秒に丸めたミリ秒）をすぐ送る（確定を待たない）。
 * スタートしたことは記録に残るので、開き直したら失敗扱いの手を送って、やり直しをできなくする
 */
export function StopwatchBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Stopwatch.StopwatchView;
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const idx = s.rounds.length - 1;
  const cur = s.rounds[idx]!;
  const myTurn = playing && you !== null && s.turn === you;
  const opp = other(me);
  const who = (seat: Seat) => (seat === you ? t("game.stopwatch.you") : t("game.stopwatch.who", { name: names[seat] }));

  /** 出題で選んでいる秒数と、「この秒数で出題する」で決めた秒数（その回戦の中だけ） */
  const [draft, setDraft] = useState(DEFAULT_TARGET);
  const [picked, setPicked] = useState<{ round: number; target: number } | null>(null);
  /** この画面でスタートした挑戦（時間を測りはじめた時刻）と、止めた時間 */
  const [run, setRun] = useState<{ round: number; at: number } | null>(null);
  const [stopped, setStopped] = useState<{ round: number; ms: number } | null>(null);
  const runRef = useRef(run);
  const stopRef = useRef(stopped);
  const [now, setNow] = useState(() => performance.now());
  /** 送っている手。送れなかったら retry に残して、もう一度送れるようにする */
  const [sending, setSending] = useState<"start" | "stop" | "fail" | null>(null);
  const sendingRef = useRef(false);
  const [retry, setRetry] = useState<"stop" | "fail" | null>(null);
  /** 開いたときにもう「スタートした」状態だった回戦。この画面では測っていないので、失敗扱いにする */
  const openedRunning = useRef(playing && you !== null && cur.running === you ? idx : null);
  const failSent = useRef<number | null>(null);
  /** 失敗扱いにした回戦。やり直しはできないことを、送ったあとも出しておく */
  const [lostRound, setLostRound] = useState<number | null>(null);
  /** ポインタで押したあとに続けて来る click を無視する（キーボードや読み上げの操作だけ click で受ける） */
  const lastPress = useRef(0);

  const localTarget = picked?.round === idx ? picked.target : null;
  const runHere = run !== null && run.round === idx;
  const stoppedHere = stopped !== null && stopped.round === idx ? stopped : null;

  let phase: Phase;
  if (!playing) phase = "over";
  else if (!myTurn) phase = "watch";
  else if (cur.running === you) phase = runHere ? "running" : sending === "start" ? "ready" : openedRunning.current === idx ? "lost" : "elsewhere";
  else if (cur.target === null && localTarget === null) phase = "pick";
  else phase = "ready";

  const target = cur.target ?? localTarget;
  const elapsed = runHere ? (stoppedHere ? stoppedHere.ms : Math.max(0, now - run.at)) : 0;
  const fogged = phase === "running" && !stoppedHere && elapsed >= VISIBLE_MS - FOG_MS;

  async function send(move: Stopwatch.StopwatchMove, kind: "start" | "stop" | "fail"): Promise<boolean> {
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

  /** スタート：サーバが受け付けてから測りはじめる。出題する人の最初のスタートは目標も一緒に送る */
  async function begin() {
    if (phase !== "ready" || !interactive || target === null) return;
    const round = idx;
    const ok = await send(cur.target === null ? { kind: "start", target } : { kind: "start" }, "start");
    if (!ok) return;
    const at = performance.now();
    runRef.current = { round, at };
    setRun(runRef.current);
    setNow(at);
  }

  /** ストップ：かかった時間をすぐ送る。止めたあとはもう測り直せない */
  function halt() {
    const r = runRef.current;
    if (!r || r.round !== idx || stopRef.current?.round === r.round) return;
    const ms = Stopwatch.toCentis(performance.now() - r.at);
    stopRef.current = { round: r.round, ms };
    setStopped(stopRef.current);
    send({ kind: "stop", ms }, "stop");
  }

  const press = () => {
    if (phase === "running") halt();
    else if (phase === "ready") begin();
  };

  // 終わったら、この画面で持っていた挑戦の記録を捨てる（お試しの「もう一度」で最初から遊べるように）
  useEffect(() => {
    if (playing) return;
    runRef.current = null;
    stopRef.current = null;
    openedRunning.current = null;
    failSent.current = null;
    setLostRound(null);
    setRun(null);
    setStopped(null);
    setPicked(null);
    setRetry(null);
  }, [playing]);

  // 数字が見えている間だけ毎フレーム描き直す。見えなくなったら止める（霧の向こうで数字が変わって見えないように）
  const ticking = phase === "running" && !stoppedHere && elapsed < VISIBLE_MS;
  useEffect(() => {
    if (!ticking) return;
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [ticking]);

  // 60 秒たったら、押さなくても止めて送る
  const counting = phase === "running" && !stoppedHere;
  useEffect(() => {
    if (!counting || !runRef.current) return;
    const timer = setTimeout(halt, Math.max(0, runRef.current.at + MAX_MS - performance.now()));
    return () => clearTimeout(timer);
  }, [counting]);

  // スタートしたまま開き直したら、失敗扱いの手を 1 回だけ送る（送れなければボタンで送り直す）
  useEffect(() => {
    if (phase !== "lost" || !interactive || failSent.current === idx) return;
    failSent.current = idx;
    sendFail();
  }, [phase, interactive, idx]);

  async function sendFail() {
    const round = idx;
    if (await send({ kind: "fail" }, "fail")) setLostRound(round);
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    lastPress.current = performance.now();
    press();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    lastPress.current = performance.now();
    press();
  };
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // 読み上げの操作など、押した位置のない click だけ受ける
    if (e.detail !== 0 || performance.now() - lastPress.current < 600) return;
    press();
  };

  const results = s.rounds.filter((r) => Stopwatch.roundResult(r) !== null);
  const latest = results.at(-1) ?? null;
  const { wins, errors } = Stopwatch.tally(s.rounds);

  // ---------- 盤の中身 ----------

  let action: ReactNode;
  if (phase === "over") {
    action = <Final t={t} rounds={s.rounds} wins={wins} errors={errors} winner={status.kind === "finished" ? status.winner : null} who={who} />;
  } else if (phase === "pick") {
    action = (
      <div className="sw-stage stack-sm">
        <p className="board-note">
          <span>{t("game.stopwatch.yourSet", { n: idx + 1 })}</span>
          <span className="muted">{t("game.stopwatch.pickHint")}</span>
        </p>
        <Picker t={t} value={draft} onChange={setDraft} seat={me} />
        <button type="button" className={`sw-button seat${me}`} disabled={!interactive} onClick={() => setPicked({ round: idx, target: draft })}>
          <span className="sw-button-label">{t("game.stopwatch.pickConfirm")}</span>
          <span className="sw-button-hint num">{t("game.stopwatch.targetSec", { sec: sec1(draft) })}</span>
        </button>
      </div>
    );
  } else {
    // スタート前・測っている間・相手の番は、同じストップウォッチの絵で見せる。
    // 出題して止め終わった人には、相手の番の間も自分の記録を見せておく（相手には伏せてある）
    const myTry = you !== null ? cur.tries[you] : null;
    const showMine = phase === "watch" && myTry !== null && myTry !== "hidden" && cur.target !== null;
    const challenger: Seat = phase === "watch" && !showMine ? s.turn : me;
    const watching = phase === "watch" && cur.running !== null;
    let digits = "0.00";
    let label = t("game.stopwatch.faceIdle");
    let mode = "idle";
    /** 止めた時間と、目標との差（ぴったりなら印も） */
    const showResult = (ms: number | null) => {
      mode = ms === null ? "lost" : "result";
      digits = ms === null ? "--.--" : sec2(ms);
      if (ms === null || target === null) return (label = "");
      const diff = ms - target;
      label = Math.abs(diff) <= PERFECT_MS ? `${signed(diff)} ${t("game.stopwatch.perfect")}` : signed(diff);
    };
    if (showMine) {
      showResult((myTry as Stopwatch.Try).ms);
    } else if (phase === "running") {
      digits = sec2(stoppedHere ? stoppedHere.ms : Math.min(elapsed, VISIBLE_MS));
      if (stoppedHere) {
        showResult(stoppedHere.ms);
      } else {
        mode = fogged ? "fog" : "running";
        label = t(fogged ? "game.stopwatch.faceFog" : "game.stopwatch.faceRunning");
      }
    } else if (phase === "lost") {
      mode = "lost";
      digits = "--.--";
      label = "";
    } else if (phase === "elsewhere" || watching) {
      mode = "fog";
      label = phase === "elsewhere" ? "" : t("game.stopwatch.faceWatching");
    } else if (phase === "watch") {
      mode = "dim";
      label = cur.target === null ? "" : t("game.stopwatch.faceIdle");
    }

    let note: ReactNode = null;
    if (phase === "ready" || phase === "running") {
      const setterTry = cur.tries[cur.setter];
      note = (
        <p className="board-note">
          <span>
            {cur.setter === me
              ? t("game.stopwatch.yourOwn", { sec: sec1(target!) })
              : t("game.stopwatch.yourTry", { who: who(cur.setter), sec: sec1(target!) })}
          </span>
          <span className="muted">{t("game.stopwatch.howTo")}</span>
          {setterTry === "hidden" && <span className="muted sw-lock">{t("game.stopwatch.theirsHidden", { who: who(cur.setter) })}</span>}
        </p>
      );
    } else if (phase === "lost" || phase === "elsewhere") {
      note = (
        <p className="board-note">
          <span className={phase === "lost" ? "sw-warn" : ""}>{t(phase === "lost" ? "game.stopwatch.lost" : "game.stopwatch.elsewhere")}</span>
        </p>
      );
    } else if (phase === "watch") {
      const name = names[s.turn];
      note = (
        <p className="board-note">
          <span>
            {cur.target === null
              ? t("game.stopwatch.waitingSet", { name })
              : t(cur.running !== null ? "game.stopwatch.challenging" : "game.stopwatch.waitingTry", { name, sec: sec1(cur.target) })}
          </span>
        </p>
      );
    }

    const button =
      phase === "ready" || phase === "running" ? (
        <button
          type="button"
          className={`sw-button big seat${me} ${phase === "running" ? "stop" : ""}`}
          disabled={phase === "ready" ? !interactive || sending !== null : stoppedHere !== null}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onClick={onClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="sw-button-label">
            {sending === "start" || sending === "stop" ? t("game.stopwatch.sending") : t(phase === "running" ? "game.stopwatch.stop" : "game.stopwatch.start")}
          </span>
          <span className="sw-button-hint">{t(phase === "running" ? "game.stopwatch.stopHint" : "game.stopwatch.startHint")}</span>
        </button>
      ) : null;

    action = (
      <div className="sw-stage stack-sm">
        {note}
        <Face
          seat={challenger}
          mode={mode}
          digits={digits}
          label={label}
          target={target === null ? null : t("game.stopwatch.targetSec", { sec: sec1(target) })}
          fogText={t(mode === "lost" ? (showMine ? "game.stopwatch.failedLong" : "game.stopwatch.faceLost") : "game.stopwatch.faceHidden")}
        />
        {button}
        {phase === "ready" && cur.target === null && sending === null && (
          <button type="button" className="ghost-button sw-change" onClick={() => setPicked(null)}>
            {t("game.stopwatch.change")}
          </button>
        )}
        {retry === "stop" && stoppedHere && (
          <button type="button" className="primary" onClick={() => send({ kind: "stop", ms: stoppedHere.ms }, "stop")}>
            {t("game.stopwatch.resend")}
          </button>
        )}
        {retry === "fail" && phase === "lost" && (
          <button type="button" className="primary" onClick={sendFail}>
            {t("game.stopwatch.lostSend")}
          </button>
        )}
        {/* 出題した自分の記録は、相手が挑戦し終わるまで相手に伏せてある */}
        {showMine && (
          <p className={`sw-mine seat${me}`}>
            <span className="sw-lock">{t("game.stopwatch.hiddenFrom", { name: names[opp] })}</span>
          </p>
        )}
        {phase === "watch" && you === null && cur.tries.some((x) => x === "hidden") && (
          <p className="muted small sw-lock">{t("game.stopwatch.hiddenAll")}</p>
        )}
      </div>
    );
  }

  const challenging = phase === "ready" || phase === "running" || phase === "lost" || phase === "elsewhere";
  // 失敗扱いにしたことは、その回戦が見えている間（次の自分の挑戦を始めるまで）出しておく
  const lostShown = lostRound !== null && !challenging && (lostRound === idx || lostRound === idx - 1);
  const latestCard = latest && <RoundCard t={t} round={latest} n={s.rounds.indexOf(latest) + 1} who={who} you={you} fresh />;

  return (
    <div className={`sw seat${me}`}>
      <Strip t={t} rounds={s.rounds} wins={wins} errors={errors} who={who} playing={playing} />
      {phase === "over" ? (
        <>
          {lostShown && <p className="sw-notice">{t("game.stopwatch.lostDone", { n: lostRound + 1 })}</p>}
          {action}
          {[...results].reverse().map((r) => (
            <RoundCard key={s.rounds.indexOf(r)} t={t} round={r} n={s.rounds.indexOf(r) + 1} who={who} you={you} />
          ))}
        </>
      ) : (
        <>
          {/* 挑戦している間は、ストップウォッチとボタンが 1 画面に入るよう、前の回戦の結果をあとに回す */}
          {lostShown && <p className="sw-notice">{t("game.stopwatch.lostDone", { n: lostRound + 1 })}</p>}
          {!challenging && latestCard}
          {action}
          {challenging && latestCard}
          {results.length > 1 && (
            <section className="sw-history">
              <h3 className="muted">{t("game.stopwatch.history")}</h3>
              {results
                .slice(0, -1)
                .reverse()
                .map((r) => (
                  <RoundCard key={s.rounds.indexOf(r)} t={t} round={r} n={s.rounds.indexOf(r) + 1} who={who} you={you} />
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 勝ち数と、3 回戦の印（勝った人の色・引き分け・今の回戦・まだの回戦） */
function Strip({
  t,
  rounds,
  wins,
  errors,
  who,
  playing,
}: {
  t: T;
  rounds: Stopwatch.RoundView[];
  wins: [number, number];
  errors: [number, number];
  who: (seat: Seat) => string;
  playing: boolean;
}) {
  const done = rounds.some((r) => Stopwatch.roundResult(r) !== null);
  const side = (seat: Seat) => (
    <div className={`sw-side seat${seat}`}>
      <span className="sw-who">
        <span className="token dot" aria-hidden />
        <span>{who(seat)}</span>
      </span>
      <span className="sw-wins">
        <strong className="num">{wins[seat]}</strong>
        <span className="small">{t("game.stopwatch.wins")}</span>
      </span>
    </div>
  );
  return (
    <section className="sw-strip">
      <div className="sw-strip-row">
        {side(0)}
        <ol className="sw-pips">
          {Array.from({ length: ROUNDS }, (_, i) => {
            const r = rounds[i];
            const res = r ? Stopwatch.roundResult(r) : null;
            const cls = res
              ? res.winner === null
                ? "draw"
                : `won seat${res.winner}`
              : r && playing
                ? `now seat${r.setter}`
                : "later";
            return (
              <li key={i} className={`sw-pip ${cls}`} title={t("game.stopwatch.round", { n: i + 1 })}>
                <span className="num">{res && res.winner === null ? "=" : i + 1}</span>
              </li>
            );
          })}
        </ol>
        {side(1)}
      </div>
      {done && (
        <p className="sw-sum muted small">
          {t("game.stopwatch.errorSum")}
          <span className="num seat0">{sec2(errors[0])}</span>
          <span aria-hidden>/</span>
          <span className="num seat1">{sec2(errors[1])}</span>
        </p>
      )}
    </section>
  );
}

/** 目標の秒数を選ぶ。±1 秒・±0.1 秒のボタンと、すべらせるつまみ */
function Picker({ t, value, onChange, seat }: { t: T; value: number; onChange(ms: number): void; seat: Seat }) {
  const step = (d: number) => onChange(clampTarget(value + d));
  const steps = [
    [-1000, "−1"],
    [-100, "−0.1"],
    [100, "+0.1"],
    [1000, "+1"],
  ] as const;
  return (
    <div className={`sw-picker seat${seat}`}>
      <p className="sw-picker-title muted small">{t("game.stopwatch.pickTitle")}</p>
      <p className="sw-picker-value" aria-live="polite">
        <strong className="num">{sec1(value)}</strong>
        <span>{t("game.stopwatch.secUnit")}</span>
      </p>
      <div className="sw-steps">
        {steps.map(([d, label]) => (
          <button
            key={d}
            type="button"
            className="num"
            disabled={(d < 0 && value <= MIN_TARGET) || (d > 0 && value >= MAX_TARGET)}
            onClick={() => step(d)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="range"
        min={MIN_TARGET}
        max={MAX_TARGET}
        step={TARGET_STEP}
        value={value}
        aria-label={t("game.stopwatch.pickSlider")}
        onChange={(e) => onChange(clampTarget(Number(e.target.value)))}
      />
      <div className="sw-range-ends muted small num">
        <span>{sec1(MIN_TARGET)}</span>
        <button
          type="button"
          className="ghost-button sw-random"
          onClick={() => onChange(MIN_TARGET + Math.floor(Math.random() * ((MAX_TARGET - MIN_TARGET) / TARGET_STEP + 1)) * TARGET_STEP)}
        >
          {t("game.stopwatch.random")}
        </button>
        <span>{sec1(MAX_TARGET)}</span>
      </div>
    </div>
  );
}

/** ストップウォッチの絵。針はない（針の動きで時間が分からないように）。数字は霧で隠す */
function Face({
  seat,
  mode,
  digits,
  label,
  target,
  fogText,
}: {
  seat: Seat;
  mode: string;
  digits: string;
  label: string;
  target: string | null;
  /** 霧の上に出す文字 */
  fogText: string;
}) {
  const fog = mode === "fog" || mode === "lost";
  return (
    <div className={`sw-face seat${seat} ${mode}`} role="timer" aria-live="off">
      <svg viewBox="0 0 240 262" aria-hidden>
        {/* 上のつまみと、横のボタン */}
        <rect className="sw-crown" x="104" y="4" width="32" height="14" rx="5" />
        <rect className="sw-crown" x="113" y="16" width="14" height="16" rx="3" />
        <rect className="sw-crown" x="190" y="34" width="22" height="12" rx="4" transform="rotate(42 201 40)" />
        <circle className="sw-body" cx="120" cy="146" r="110" />
        <circle className="sw-dial" cx="120" cy="146" r="96" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * Math.PI) / 30;
          const long = i % 5 === 0;
          const r1 = long ? 82 : 87;
          return (
            <line
              key={i}
              className={long ? "sw-tick long" : "sw-tick"}
              x1={120 + Math.sin(a) * r1}
              y1={146 - Math.cos(a) * r1}
              x2={120 + Math.sin(a) * 92}
              y2={146 - Math.cos(a) * 92}
            />
          );
        })}
      </svg>
      <div className="sw-screen">
        {target && <span className="sw-target num">{target}</span>}
        <span className="sw-digits num" aria-hidden={fog}>
          {digits}
        </span>
        {label && <span className="sw-label">{label}</span>}
        <span className="sw-fog" aria-hidden />
        {fog && <span className="sw-fog-text">{fogText}</span>}
      </div>
    </div>
  );
}

/** 1 回戦の結果。目標を真ん中にした線の上に 2 人の印を置き、ずれの大きさがひと目で分かるようにする */
function RoundCard({
  t,
  round,
  n,
  who,
  you,
  fresh = false,
}: {
  t: T;
  round: Stopwatch.RoundView;
  n: number;
  who: (seat: Seat) => string;
  you: Seat | null;
  fresh?: boolean;
}) {
  const res = Stopwatch.roundResult(round)!;
  const target = round.target!;
  const tries = round.tries as [Stopwatch.Try, Stopwatch.Try];
  const diffs = tries.map((x) => (x.ms === null ? null : x.ms - target));
  // 目盛りの幅：2 人のずれが入るきりのいい幅（入らなければ端に寄せて矢印）
  const far = Math.max(0, ...diffs.map((d) => (d === null ? 0 : Math.abs(d))));
  const span = [500, 1000, 2000, 5000].find((w) => far <= w) ?? 5000;
  const X0 = 160;
  const HALF = 124;
  // 失敗扱いは右の端に置く（向きはないので、いちばん遠い印として）
  const xOf = (d: number | null) => (d === null ? X0 + HALF : X0 + (Math.max(-span, Math.min(span, d)) / span) * HALF);
  const label = (seat: Seat) => {
    const d = diffs[seat]!;
    return d === null ? t("game.stopwatch.failed") : signed(d);
  };
  // 下の印の文字が真ん中にあるときは、「目標」の文字と重なるので出さない
  const zeroLabel = Math.abs(xOf(diffs[1]!) - X0) > 30;

  return (
    <section className={`sw-card ${fresh ? "fresh" : ""}`}>
      <header className="sw-card-head">
        <strong>{t(fresh ? "game.stopwatch.result" : "game.stopwatch.round", { n })}</strong>
        <span className="muted small">{t("game.stopwatch.setter", { who: who(round.setter) })}</span>
        <span className="sw-card-target num">{t("game.stopwatch.targetSec", { sec: sec1(target) })}</span>
      </header>
      <svg className="sw-chart" viewBox="0 0 320 84" role="img" aria-label={t("game.stopwatch.chart", { sec: sec1(target) })}>
        {/* 目盛り：真ん中が目標、両端が ±span */}
        <line className="sw-axis" x1={X0 - HALF} x2={X0 + HALF} y1="42" y2="42" />
        {[-1, -0.5, 0.5, 1].map((f) => (
          <line key={f} className="sw-grid" x1={X0 + f * HALF} x2={X0 + f * HALF} y1={Math.abs(f) === 1 ? 36 : 38} y2={Math.abs(f) === 1 ? 48 : 46} />
        ))}
        <line className="sw-zero" x1={X0} x2={X0} y1="30" y2="54" />
        {/* 両端の幅は線の外に書く（印の文字と重ならないように） */}
        <text className="sw-axis-label num" x={X0 - HALF - 5} y="45" textAnchor="end">
          −{sec1(span)}
        </text>
        <text className="sw-axis-label num" x={X0 + HALF + 5} y="45" textAnchor="start">
          +{sec1(span)}
        </text>
        {zeroLabel && (
          <text className="sw-axis-label" x={X0} y="78" textAnchor="middle">
            {t("game.stopwatch.target")}
          </text>
        )}
        {([0, 1] as Seat[]).map((seat) => {
          const x = xOf(diffs[seat]!);
          const up = seat === 0;
          const out = diffs[seat] === null || Math.abs(diffs[seat]!) > span;
          // 文字が盤の外にはみ出さないよう、端の近くでは内側に寄せる
          const anchor = x < 40 ? "start" : x > 280 ? "end" : "middle";
          const style = { "--dx": `${X0 - x}px` } as CSSProperties;
          return (
            <g key={seat} className={`sw-mark seat${seat} ${res.winner === seat ? "won" : ""}`} style={style}>
              {up ? <path d={`M${x - 7} 24 L${x + 7} 24 L${x} 37 Z`} /> : <path d={`M${x - 7} 60 L${x + 7} 60 L${x} 47 Z`} />}
              {/* 幅の外なら、外向きの小さな矢印 */}
              {out && <path className="sw-out" d={`M${x < X0 ? x - 10 : x + 10} ${up ? 27 : 51} l${x < X0 ? -4 : 4} 3 l${x < X0 ? 4 : -4} 3`} />}
              <text className="num" x={x} y={up ? 17 : 74} textAnchor={anchor}>
                {label(seat)}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="sw-rows">
        {([0, 1] as Seat[]).map((seat) => {
          const ms = tries[seat].ms;
          const perfect = ms !== null && Math.abs(ms - target) <= PERFECT_MS;
          return (
            <li key={seat} className={`seat${seat} ${res.winner === seat ? "won" : ""} ${seat === you ? "me" : ""}`}>
              <span className="token dot" aria-hidden />
              <span className="sw-row-name">{who(seat)}</span>
              <span className="num sw-row-time">{ms === null ? t("game.stopwatch.faceLost") : t("game.stopwatch.sec", { sec: sec2(ms) })}</span>
              {/* 失敗扱いは向きのないずれ（60 秒）として数える */}
              <span className="num sw-row-diff">{ms === null ? sec2(FAIL_ERROR) : signed(ms - target)}</span>
              <span className="sw-row-tag">
                {perfect && <b className="sw-perfect">{t("game.stopwatch.perfect")}</b>}
                {res.winner === seat && <b className="sw-won">{t("game.stopwatch.win")}</b>}
              </span>
            </li>
          );
        })}
      </ul>
      {res.winner === null && <p className="sw-card-draw muted small">{t("game.stopwatch.draw")}</p>}
    </section>
  );
}

/** 終局：どうやって決まったか（勝ち数・ずれの合計・引き分け、2 勝で決着） */
function Final({
  t,
  rounds,
  wins,
  errors,
  winner,
  who,
}: {
  t: T;
  rounds: Stopwatch.RoundView[];
  wins: [number, number];
  errors: [number, number];
  winner: Seat | null;
  who: (seat: Seat) => string;
}) {
  let text: string;
  if (winner === null) text = t("game.stopwatch.drawAll");
  else if (wins[0] !== wins[1]) text = t("game.stopwatch.byWins", { who: who(winner), a: wins[winner], b: wins[winner === 0 ? 1 : 0] });
  else text = t("game.stopwatch.bySum", { who: who(winner), a: sec2(errors[winner]), b: sec2(errors[winner === 0 ? 1 : 0]) });
  return (
    <p className="board-note sw-final">
      <strong>{text}</strong>
      {rounds.length < ROUNDS && <span className="muted">{t("game.stopwatch.early")}</span>}
    </p>
  );
}
