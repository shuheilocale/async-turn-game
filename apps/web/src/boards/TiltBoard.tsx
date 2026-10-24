import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { other, Tilt, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import { capture, inputOf, InputTag, PortraitStage, SensorBar, usePreferTouch, toStage, useScreenAngle, useSensor } from "../sensors.tsx";
import type { BoardProps } from "./index.ts";
import { advance, ballAt, clampLean, type Ball, type Lean } from "./tilt/physics.ts";
import "./TiltBoard.css";

const { ROUNDS, MIN_MS, MAX_MS, MAZES, BOARD_W, BOARD_H, BALL_R, HOLE_R, GOAL_R, roundResult, tally, timeOf, timedOut } = Tilt;
type Input = "motion" | "touch";

/** 端末をこの角度（度）傾けたら、いちばん傾けたことにする */
const MAX_TILT_DEG = 16;
/** これより小さな傾きは 0 とみなす（手のふるえで玉が動かないように） */
const DEADZONE = 0.05;
/** 「3・2・1」の長さ（ミリ秒）。終わったときの持ち方を水平とみなす */
const COUNT_MS = 2400;
/** 穴に落ちてからスタートに戻るまで */
const FALL_MS = 450;
/** 傾きをなめらかにする時間（秒）。センサーとスティックで同じにして、操作のしやすさをそろえる */
const SMOOTH_S = 0.09;
/** 板が傾いて見える角度（いちばん傾けたとき） */
const VIEW_TILT_DEG = 7;
/** ゴールしてから、結果を見せておく時間（送れたら閉じる） */
const RESULT_MS = 1200;

/** 1/100 秒の整数で組み立てる（13.52 秒） */
const sec2 = (ms: number) => {
  const c = Math.round(ms / 10);
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
};
const rad = (deg: number) => (deg * Math.PI) / 180;
/** 端末の向き（度）から、画面の上での重力の向き（右が x、下が y） */
const gravityOf = (beta: number, gamma: number): Lean => ({ x: Math.sin(rad(gamma)) * Math.cos(rad(beta)), y: Math.sin(rad(beta)) });

/**
 * かたむけコロコロの盤。「スタート」をまずサーバに送り、受け付けられたら全画面の舞台で「3・2・1」のあとに玉を転がす。
 * ゴール（または 60 秒で時間切れ）したら、タイムと落ちた回数をすぐ送る。始めたことは記録に残るので、開き直したら失敗扱いの手を送る
 */
export function TiltBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Tilt.TiltView;
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const idx = s.rounds.length - 1;
  const cur = s.rounds[idx]!;
  const maze = MAZES[cur.maze]!;
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("game.tilt.you") : t("game.tilt.who", { name: names[seat] }));

  // ---------- センサー ----------
  const gravity = useRef<Lean | null>(null);
  const sensor = useSensor<DeviceOrientationEvent>("orientation", (e) => {
    gravity.current = gravityOf(e.beta!, e.gamma!);
  });
  const [preferTouch, setPreferTouch] = usePreferTouch("orientation");
  const { needAsk, deciding, input } = inputOf(sensor.status, preferTouch);
  const angle = useScreenAngle();

  // ---------- 挑戦 ----------
  const [run, setRun] = useState<{ round: number; input: Input } | null>(null);
  const [result, setResult] = useState<{ round: number; ms: number; falls: number } | null>(null);
  const [sending, setSending] = useState<"start" | "finish" | "fail" | null>(null);
  const sendingRef = useRef(false);
  const [retry, setRetry] = useState<"finish" | "fail" | null>(null);
  const openedRunning = useRef(playing && you !== null && cur.running === you ? idx : null);
  const failSent = useRef<number | null>(null);
  const [lostRound, setLostRound] = useState<number | null>(null);
  const [holdStage, setHoldStage] = useState(false);

  const runHere = run !== null && run.round === idx;
  type Phase = "ready" | "run" | "lost" | "elsewhere" | "watch" | "over";
  let phase: Phase;
  if (!playing) phase = "over";
  else if (!myTurn) phase = "watch";
  else if (cur.running === you) phase = runHere ? "run" : sending === "start" ? "ready" : openedRunning.current === idx ? "lost" : "elsewhere";
  else phase = "ready";
  const stageOpen = (phase === "run" || holdStage) && run !== null;

  async function send(move: Tilt.TiltMove, kind: "start" | "finish" | "fail"): Promise<boolean> {
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

  async function begin() {
    if (phase !== "ready" || !interactive || needAsk || deciding) return;
    const round = idx;
    const chosen = input;
    if (!(await send({ kind: "start" }, "start"))) return;
    setResult(null);
    setRun({ round, input: chosen });
  }

  async function finish(ms: number, falls: number) {
    const r = run;
    if (!r) return;
    setResult({ round: r.round, ms, falls });
    setHoldStage(true);
    const shownAt = performance.now();
    if (!(await send({ kind: "finish", ms, falls, input: r.input }, "finish"))) return;
    setTimeout(() => setHoldStage(false), Math.max(0, RESULT_MS - (performance.now() - shownAt)));
  }

  async function resend() {
    if (!result || !run) return;
    if (await send({ kind: "finish", ms: result.ms, falls: result.falls, input: run.input }, "finish")) setHoldStage(false);
  }

  // 終わったら（結果を見せ終わったら）、この画面で持っていた挑戦の記録を捨てる
  useEffect(() => {
    if (playing || holdStage) return;
    openedRunning.current = null;
    failSent.current = null;
    setRun(null);
    setResult(null);
    setRetry(null);
    setLostRound(null);
  }, [playing, holdStage]);

  // スタートしたまま開き直したら、失敗扱いの手を 1 回だけ送る
  useEffect(() => {
    if (phase !== "lost" || !interactive || failSent.current === idx) return;
    failSent.current = idx;
    sendFail();
  }, [phase, interactive, idx]);

  async function sendFail() {
    const round = idx;
    if (await send({ kind: "fail" }, "fail")) setLostRound(round);
  }

  // ---------- 盤の中身 ----------
  const results = s.rounds.filter((r) => roundResult(r) !== null);
  const { wins, times } = tally(s.rounds);
  const first = cur.first;
  const firstTry = cur.tries[first];

  let note: ReactNode = null;
  if (phase === "ready") {
    note = (
      <>
        <span>{t(first === you ? "game.tilt.yourFirst" : "game.tilt.yourSecond", { n: idx + 1 })}</span>
        {firstTry === "hidden" && <span className="muted tilt-lock">{t("game.tilt.theirsHidden", { who: who(first) })}</span>}
      </>
    );
  } else if (phase === "watch") {
    const running = cur.running !== null;
    note = (
      <>
        <span>{t(running ? "game.tilt.challenging" : "game.tilt.waiting", { name: names[s.turn] })}</span>
        {you !== null && cur.tries[you] !== null && cur.tries[you] !== "hidden" && (
          <span className="muted tilt-lock">{t("game.tilt.hiddenFrom", { name: names[other(me)] })}</span>
        )}
        {you === null && cur.tries.some((x) => x === "hidden") && <span className="muted tilt-lock">{t("game.tilt.hiddenAll")}</span>}
      </>
    );
  } else if (phase === "lost" || phase === "elsewhere") {
    note = <span className={phase === "lost" ? "tilt-warn" : ""}>{t(phase === "lost" ? "game.tilt.lost" : "game.tilt.elsewhere")}</span>;
  }

  // 自分の今の回戦の結果（相手が終わるまで相手には伏せてある）
  const myTry = you !== null ? cur.tries[you] : null;
  const showMine = playing && myTry !== null && myTry !== "hidden";

  // センサーを確かめている間は押せないだけで、文はそのまま（確かめていることは SensorBar に出る）
  const mainLabel = needAsk ? t("game.tilt.sensorOn") : sending === "start" ? t("game.tilt.sending") : t("game.tilt.start");

  return (
    <div className={`tilt seat${me}`}>
      <Strip t={t} rounds={s.rounds} wins={wins} times={times} who={who} playing={playing} />

      {playing && (
        <section className="tilt-current">
          <header className="tilt-current-head">
            <strong>{t("game.tilt.round", { n: idx + 1 })}</strong>
            <span className="muted small">{t(`game.tilt.maze${cur.maze}`)}</span>
            <span className="muted small">{t("game.tilt.firstIs", { who: who(first) })}</span>
          </header>
          <div className={`tilt-preview ${cur.running !== null && phase === "watch" ? "busy" : ""}`}>
            <MazeView maze={maze} label={t("game.tilt.board", { name: t(`game.tilt.maze${cur.maze}`) })} />
            {cur.running !== null && phase === "watch" && <span className="tilt-busy">{t("game.tilt.faceRunning")}</span>}
          </div>
          {showMine && (
            <p className={`tilt-mine seat${me}`}>
              {t("game.tilt.yourTime", { time: tryText(t, myTry as Tilt.Try) })}
            </p>
          )}
        </section>
      )}

      {phase === "ready" && (
        <div className="tilt-controls stack-sm">
          <SensorBar status={sensor.status} preferTouch={preferTouch} onPreferTouch={setPreferTouch} say={(k) => t(`game.tilt.sensor.${k}`)} />
          <button
            type="button"
            className={`tilt-go primary seat${me}`}
            disabled={!interactive || deciding || sending !== null}
            onClick={needAsk ? sensor.enable : begin}
          >
            <span className="tilt-go-label">{mainLabel}</span>
            {!needAsk && !deciding && <span className="tilt-go-hint">{t("game.tilt.startHint")}</span>}
          </button>
        </div>
      )}
      {retry === "fail" && phase === "lost" && (
        <button type="button" className="primary" onClick={sendFail}>
          {t("game.tilt.lostSend")}
        </button>
      )}

      {(note || lostRound !== null) && (
        <p className="board-note">
          {lostRound !== null && <span className="tilt-warn">{t("game.tilt.lostDone", { n: lostRound + 1 })}</span>}
          {note}
        </p>
      )}

      {!playing && <Final t={t} rounds={s.rounds} wins={wins} times={times} winner={status.kind === "finished" ? status.winner : null} who={who} />}
      {[...results].reverse().map((r) => (
        <RoundCard key={s.rounds.indexOf(r)} t={t} round={r} n={s.rounds.indexOf(r) + 1} who={who} you={you} />
      ))}

      {stageOpen && (
        <PortraitStage angle={angle} className={`tilt-run seat${me}`}>
          <TiltRun
            key={run!.round}
            t={t}
            maze={MAZES[s.rounds[run!.round]!.maze]!}
            input={run!.input}
            gravity={gravity}
            angle={angle}
            result={result?.round === run!.round ? result : null}
            sending={sending === "finish"}
            retry={retry === "finish"}
            onDone={finish}
            onRetry={resend}
          />
        </PortraitStage>
      )}
    </div>
  );
}

/** 結果の文（12.34 秒・時間切れ・失敗扱い） */
function tryText(t: T, x: Tilt.Try) {
  if (x.ms === null) return t("game.tilt.failed");
  if (timedOut(x)) return t("game.tilt.timeout");
  return t("game.tilt.sec", { sec: sec2(x.ms) });
}

/** 迷路の板。玉は ball の位置に描く（動かすときは ballRef を書き換える） */
function MazeView({
  maze,
  label,
  ballRef,
  ball = maze.start,
  children,
}: {
  maze: Tilt.Maze;
  label: string;
  ballRef?: React.Ref<SVGGElement>;
  ball?: Tilt.Point;
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="tilt-maze" viewBox={`-5 -5 ${BOARD_W + 10} ${BOARD_H + 10}`} role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${id}-hole`} cx="0.45" cy="0.4" r="0.6">
          <stop offset="0" className="tilt-hole-deep" />
          <stop offset="0.75" className="tilt-hole-deep" />
          <stop offset="1" className="tilt-hole-rim" />
        </radialGradient>
        <radialGradient id={`${id}-ball`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c9d0dc" />
          <stop offset="1" stopColor="#5d6577" />
        </radialGradient>
      </defs>
      <rect className="tilt-frame" x={-5} y={-5} width={BOARD_W + 10} height={BOARD_H + 10} rx={5} />
      <rect className="tilt-floor" x={0} y={0} width={BOARD_W} height={BOARD_H} rx={1.5} />
      {/* 木目のすじ */}
      {[18, 41, 63, 88, 112, 129].map((y, i) => (
        <path key={y} className="tilt-grain" d={`M0 ${y}c${20 + i * 3} ${i % 2 ? 3 : -3} ${60 - i * 4} ${i % 2 ? -2 : 2} 100 0`} />
      ))}
      <circle className="tilt-start" cx={maze.start[0]} cy={maze.start[1]} r={BALL_R + 1.6} />
      {maze.holes.map(([x, y], i) => (
        <circle key={i} className="tilt-hole" cx={x} cy={y} r={HOLE_R} fill={`url(#${id}-hole)`} />
      ))}
      <g className="tilt-goal">
        <circle cx={maze.goal[0]} cy={maze.goal[1]} r={GOAL_R} />
        <circle className="tilt-goal-ring" cx={maze.goal[0]} cy={maze.goal[1]} r={GOAL_R + 1.6} />
        <path d={`M${maze.goal[0] - 0.4} ${maze.goal[1] + 2.6}v-6.2l4.2 1.6-4.2 1.6`} className="tilt-flag" />
      </g>
      {maze.walls.map(([x, y, w, h], i) => (
        <g key={i}>
          <rect className="tilt-wall-shadow" x={x + 0.6} y={y + 0.9} width={w} height={h} rx={0.8} />
          <rect className="tilt-wall" x={x} y={y} width={w} height={h} rx={0.8} />
        </g>
      ))}
      {children}
      <g ref={ballRef} className="tilt-ball" transform={`translate(${ball[0]} ${ball[1]})`}>
        <circle className="tilt-ball-shadow" cx={0.7} cy={1.1} r={BALL_R} />
        <circle r={BALL_R} fill={`url(#${id}-ball)`} />
      </g>
    </svg>
  );
}

/**
 * 転がしている間の全画面。「3・2・1」のあと、センサー（またはスティック）の傾きで玉を転がす。
 * 玉と時計は React を通さずに毎フレーム書き換える
 */
function TiltRun({
  t,
  maze,
  input,
  gravity,
  angle,
  result,
  sending,
  retry,
  onDone,
  onRetry,
}: {
  t: T;
  maze: Tilt.Maze;
  input: Input;
  gravity: React.RefObject<Lean | null>;
  angle: number;
  result: { ms: number; falls: number } | null;
  sending: boolean;
  retry: boolean;
  onDone(ms: number, falls: number): void;
  onRetry(): void;
}) {
  const [count, setCount] = useState(3);
  const [falls, setFalls] = useState(0);
  const [over, setOver] = useState<"goal" | "timeout" | null>(null);
  const ballEl = useRef<SVGGElement>(null);
  const timerEl = useRef<HTMLSpanElement>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  /** スティック・矢印キーの傾き（指で遊ぶとき） */
  const stick = useRef<Lean>({ x: 0, y: 0 });
  const keys = useRef(new Set<string>());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const angleRef = useRef(angle);
  angleRef.current = angle;

  useEffect(() => {
    const ball: Ball = ballAt(maze.start);
    const lean: Lean = { x: 0, y: 0 };
    let base: Lean = { x: 0, y: 0 };
    let mode: "count" | "run" | "fall" | "end" = "count";
    let fallAt = 0;
    let fallHole: Tilt.Point = maze.start;
    let fallCount = 0;
    let rest = 0;
    const openedAt = performance.now();
    let t0 = openedAt;
    let last = openedAt;
    let shownCount = 3;

    const end = (ms: number, kind: "goal" | "timeout") => {
      mode = "end";
      setOver(kind);
      doneRef.current(Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms / 10) * 10)), fallCount);
    };

    /** 今ねらっている傾き（-1〜1） */
    const target = (): Lean => {
      if (input === "motion") {
        const g = gravity.current;
        if (!g) return { x: 0, y: 0 };
        const k = 1 / Math.sin(rad(MAX_TILT_DEG));
        const v = clampLean((g.x - base.x) * k, (g.y - base.y) * k);
        return Math.hypot(v.x, v.y) < DEADZONE ? { x: 0, y: 0 } : v;
      }
      const k = keys.current;
      const kx = (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0);
      const ky = (k.has("ArrowDown") ? 1 : 0) - (k.has("ArrowUp") ? 1 : 0);
      return kx || ky ? clampLean(kx, ky) : stick.current;
    };

    let frame = requestAnimationFrame(function tick(time) {
      if (mode === "count") {
        const n = Math.max(0, 3 - Math.floor((time - openedAt) / (COUNT_MS / 3)));
        if (n !== shownCount) setCount((shownCount = n));
        if (time - openedAt >= COUNT_MS) {
          // ここでの持ち方を水平とみなす
          base = gravity.current ?? { x: 0, y: 0 };
          mode = "run";
          t0 = last = time;
        }
      } else if (mode === "run" || mode === "fall") {
        const dt = Math.min(0.1, Math.max(0, (time - last) / 1000));
        last = time;
        const want = target();
        const k = 1 - Math.exp(-dt / SMOOTH_S);
        lean.x += (want.x - lean.x) * k;
        lean.y += (want.y - lean.y) * k;
        if (time - t0 >= MAX_MS) {
          end(MAX_MS, "timeout");
        } else if (mode === "run") {
          const step = advance(maze, ball, lean, dt + rest);
          rest = step.rest;
          if (step.event?.kind === "hole") {
            mode = "fall";
            fallAt = time;
            fallHole = maze.holes[step.event.index]!;
            setFalls(++fallCount);
          } else if (step.event?.kind === "goal") {
            ball.x = maze.goal[0];
            ball.y = maze.goal[1];
            end(time - t0, "goal");
          }
        } else if (time - fallAt >= FALL_MS) {
          Object.assign(ball, ballAt(maze.start));
          rest = 0;
          mode = "run";
        }
        if (timerEl.current) timerEl.current.textContent = sec2(Math.min(MAX_MS, time - t0));
        boardEl.current?.style.setProperty("--rx", `${-lean.y * VIEW_TILT_DEG}deg`);
        boardEl.current?.style.setProperty("--ry", `${lean.x * VIEW_TILT_DEG}deg`);
      }
      // 玉：落ちている間は穴のまん中へ吸いこまれて小さくなる
      if (ballEl.current) {
        if (mode === "fall") {
          const k = Math.min(1, (time - fallAt) / FALL_MS);
          const x = ball.x + (fallHole[0] - ball.x) * k;
          const y = ball.y + (fallHole[1] - ball.y) * k;
          ballEl.current.setAttribute("transform", `translate(${x} ${y}) scale(${1 - k * 0.8})`);
        } else {
          ballEl.current.setAttribute("transform", `translate(${ball.x} ${ball.y})`);
        }
      }
      if (mode !== "end") frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // 時計：はじめは 0、結果が出たらそのタイム
  useEffect(() => {
    if (timerEl.current && (result || !timerEl.current.textContent)) timerEl.current.textContent = sec2(result?.ms ?? 0);
  }, [result]);

  // 指で遊ぶとき（PC）：矢印キーでも傾けられる
  useEffect(() => {
    if (input !== "touch") return;
    const down = (e: KeyboardEvent) => {
      if (!e.key.startsWith("Arrow")) return;
      e.preventDefault();
      keys.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [input]);

  let head: string | null = null;
  if (over === "goal") head = t("game.tilt.goal");
  else if (over === "timeout") head = t("game.tilt.timeout");

  return (
    <>
      <div className="tilt-run-head">
        <InputTag input={input} label={t(input === "motion" ? "game.tilt.sensor.tagMotion" : "game.tilt.sensor.tagTouch")} />
        {/* 時計の数字は毎フレーム書き換える（React では描かない） */}
        <span className="tilt-run-time num" ref={timerEl} aria-live="off" />
        <span className="tilt-run-falls small">{t("game.tilt.falls", { n: falls })}</span>
      </div>
      <div className={`tilt-run-board ${input}`}>
        <div className="tilt-tilt" ref={boardEl}>
          <MazeView maze={maze} label={t("game.tilt.boardRun")} ballRef={ballEl} />
        </div>
        {count > 0 && over === null && (
          <span key={count} className="tilt-count num" aria-live="assertive">
            {count}
          </span>
        )}
        {head && (
          <div className="tilt-run-result" aria-live="assertive">
            <strong>{head}</strong>
            {result && over === "goal" && <span className="num">{t("game.tilt.sec", { sec: sec2(result.ms) })}</span>}
            <span className="small">{sending ? t("game.tilt.sending") : null}</span>
            {retry && (
              <button type="button" className="primary" onClick={onRetry}>
                {t("game.tilt.resend")}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="tilt-run-foot">
        {input === "touch" ? (
          <Stick
            angle={angleRef}
            onChange={(v) => (stick.current = v)}
            label={t("game.tilt.stick")}
            disabled={over !== null}
          />
        ) : (
          <p className="muted small tilt-run-hint">{t(count > 0 ? "game.tilt.holdFlat" : "game.tilt.tiltHint")}</p>
        )}
      </div>
    </>
  );
}

/** 指で傾ける丸いスティック。真ん中からずらした向きと大きさが傾きになる */
function Stick({
  angle,
  onChange,
  label,
  disabled,
}: {
  angle: React.RefObject<number>;
  onChange(v: Lean): void;
  label: string;
  disabled: boolean;
}) {
  /** つまみの位置（真ん中からのずれ、ピクセル） */
  const [knob, setKnob] = useState<Lean>({ x: 0, y: 0 });
  const pad = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const rect = pad.current!.getBoundingClientRect();
    const r = rect.width / 2;
    // 画面上の向きを、逆に回した舞台の中の向きに直す
    const [dx, dy] = toStage(e.clientX - (rect.left + r), e.clientY - (rect.top + r), angle.current ?? 0);
    const v = clampLean(dx / (r * 0.8), dy / (r * 0.8));
    setKnob({ x: v.x * r * 0.8, y: v.y * r * 0.8 });
    onChange(v);
  };
  const release = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  };

  return (
    <div
      ref={pad}
      className={`tilt-stick ${disabled ? "off" : ""}`}
      role="application"
      aria-label={label}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        capture(e);
        active.current = e.pointerId;
        move(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && move(e)}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="tilt-stick-ring" aria-hidden />
      <span className="tilt-stick-knob" aria-hidden style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** 勝ち数と、3 回戦の印 */
function Strip({
  t,
  rounds,
  wins,
  times,
  who,
  playing,
}: {
  t: T;
  rounds: Tilt.RoundView[];
  wins: [number, number];
  times: [number, number];
  who: (seat: Seat) => string;
  playing: boolean;
}) {
  const done = rounds.some((r) => roundResult(r) !== null);
  const side = (seat: Seat) => (
    <div className={`tilt-side seat${seat}`}>
      <span className="tilt-who">
        <span className="token dot" aria-hidden />
        <span>{who(seat)}</span>
      </span>
      <span className="tilt-wins">
        <strong className="num">{wins[seat]}</strong>
        <span className="small">{t("game.tilt.wins")}</span>
      </span>
    </div>
  );
  return (
    <section className="tilt-strip">
      <div className="tilt-strip-row">
        {side(0)}
        <ol className="tilt-pips">
          {Array.from({ length: ROUNDS }, (_, i) => {
            const r = rounds[i];
            const res = r ? roundResult(r) : null;
            const cls = res ? (res.winner === null ? "draw" : `won seat${res.winner}`) : r && playing ? `now seat${r.first}` : "later";
            return (
              <li key={i} className={`tilt-pip ${cls}`} title={t("game.tilt.round", { n: i + 1 })}>
                <span className="num">{res && res.winner === null ? "=" : i + 1}</span>
              </li>
            );
          })}
        </ol>
        {side(1)}
      </div>
      {done && (
        <p className="tilt-sum muted small">
          {t("game.tilt.timeSum")}
          <span className="num seat0">{sec2(times[0])}</span>
          <span aria-hidden>/</span>
          <span className="num seat1">{sec2(times[1])}</span>
        </p>
      )}
    </section>
  );
}

/** 1 回戦の結果。タイムを帯の長さで並べ、穴に落ちた回数とどちらで遊んだかも出す */
function RoundCard({ t, round, n, who, you }: { t: T; round: Tilt.RoundView; n: number; who: (seat: Seat) => string; you: Seat | null }) {
  const res = roundResult(round)!;
  const tries = round.tries as [Tilt.Try, Tilt.Try];
  const longest = Math.max(...res.times, 1);
  return (
    <section className="tilt-card">
      <header className="tilt-card-head">
        <strong>{t("game.tilt.round", { n })}</strong>
        <span className="muted small">{t(`game.tilt.maze${round.maze}`)}</span>
      </header>
      <ul className="tilt-rows">
        {([0, 1] as Seat[]).map((seat) => {
          const x = tries[seat];
          return (
            <li key={seat} className={`seat${seat} ${res.winner === seat ? "won" : ""} ${seat === you ? "me" : ""}`}>
              <span className="tilt-row-who">
                <span className="token dot" aria-hidden />
                <span>{who(seat)}</span>
              </span>
              <span className="num tilt-row-time">{tryText(t, x)}</span>
              <span className="tilt-row-tag">{res.winner === seat && <b className="tilt-won">{t("game.tilt.win")}</b>}</span>
              <span className="tilt-row-bar" aria-hidden>
                <span style={{ width: `${(timeOf(x) / longest) * 100}%` }} />
              </span>
              <span className="tilt-row-meta muted small">
                {x.ms !== null && t("game.tilt.falls", { n: x.falls })}
                {x.input && <InputTag input={x.input} label={t(x.input === "motion" ? "game.tilt.sensor.tagMotion" : "game.tilt.sensor.tagTouch")} />}
              </span>
            </li>
          );
        })}
      </ul>
      {res.winner === null && <p className="muted small tilt-card-draw">{t("game.tilt.draw")}</p>}
    </section>
  );
}

/** 終局：どうやって決まったか */
function Final({
  t,
  rounds,
  wins,
  times,
  winner,
  who,
}: {
  t: T;
  rounds: Tilt.RoundView[];
  wins: [number, number];
  times: [number, number];
  winner: Seat | null;
  who: (seat: Seat) => string;
}) {
  let text: string;
  if (winner === null) text = t("game.tilt.drawAll");
  else if (wins[0] !== wins[1]) text = t("game.tilt.byWins", { who: who(winner), a: wins[winner], b: wins[other(winner)] });
  else text = t("game.tilt.bySum", { who: who(winner), a: sec2(times[winner]), b: sec2(times[other(winner)]) });
  return (
    <p className="board-note tilt-final">
      <strong>{text}</strong>
      {rounds.length < ROUNDS && <span className="muted">{t("game.tilt.early")}</span>}
    </p>
  );
}
