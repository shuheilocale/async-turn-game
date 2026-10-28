import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Curling, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import type * as Physics from "./curling/physics.ts";
import { AIM_UI_MAX, DEFAULT_POWER, powerOfReach, releaseAngle, speedOf, STEP, ZONE_EDGES, zoneOf } from "./curling/params.ts";
import {
  cameraAt,
  lastFrame,
  nearOf,
  seqOf,
  stonesAt,
  sweepAt,
  withSim,
  type Anim,
  type Camera,
  type Shown,
} from "./curling/playback.ts";
import { hasWebGL, loadScene, View3D } from "./curling/View3D.tsx";
import { Sheet2D } from "./curling/Sheet2D.tsx";
import { BrushIcon, HammerIcon, SpinIcon, ThrowerViewIcon, TopViewIcon } from "./curling/icons.tsx";
import "./CurlingBoard.css";

const { THROWS, ENDS } = Curling;

/** 物理演算（planck）は、この盤を開いたときに初めて読み込む */
let physics: Promise<typeof Physics> | null = null;
const loadPhysics = () =>
  (physics ??= import("./curling/physics.ts").catch((e) => {
    // 読み込めなかったら、次に投げるときに読み込み直す
    physics = null;
    throw e;
  }));

/** 再生を始める前に、投げる前の様子を見せておく時間（ミリ秒） */
const HOLD_MS = 900;
/** 止まってから、ハウスを上から見せておく時間 */
const AFTER_MS = 1200;
/** 引っぱって強さを 0 から 1 まで変えるのに、盤の高さの何割を動かすか */
const PULL = 0.6;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 直前の 1 投を再生する準備。計算が済むまでは、投げる前の位置で待つ */
function replayOf(s: Curling.CurlingState): Anim | null {
  const last = s.last;
  if (!last) return null;
  return {
    key: seqOf(s),
    seat: last.seat,
    id: last.id,
    before: last.before,
    aim: last.aim,
    speed: last.speed,
    spin: last.spin,
    sweeps: last.sweeps ?? [],
    sim: null,
    target: last.after,
    start: performance.now() + HOLD_MS,
    houseFrom: Infinity,
    near: Curling.TEE_Y,
  };
}

/** 強さの目盛りの、目安の境目（つまみの値） */
const ZONE_AT = {
  guard: powerOfReach(ZONE_EDGES.guard),
  house: powerOfReach(ZONE_EDGES.house),
  hit: powerOfReach(ZONE_EDGES.hit),
};

/**
 * 3D カーリングの盤。自分の番には、画面をドラッグして向き（左右）と強さ（下へ引く長さ）を決め、
 * 回転を選んで「投げる」。すべっている間は 1 コマずつ物理演算しながら 3D で見せ、画面を連打すると
 * ブラシでこする（よく伸びて、曲がりにくい）。止まったら、こすったコマと止まった位置を送る。
 * 相手の手は、開いたとき・届いたときに同じ条件（こすったコマも）で計算し直して再生する。
 * WebGL が使えない端末では、上から見た 2D の図で同じように遊べる
 */
export function CurlingBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Curling.CurlingState;
  const seq = seqOf(s);
  const finished = status.kind === "finished";
  const turn = status.kind === "playing" ? status.turn : null;

  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(DEFAULT_POWER);
  const [spin, setSpin] = useState<Curling.Spin>(1);
  const [busy, setBusy] = useState(false);
  /** 「上から見る」「投げる人から見る」で選んだ見え方。null ならそのときに合わせる */
  const [override, setOverride] = useState<"house" | "aim" | null>(null);
  /** 閉じたエンドの結果（ends.length） */
  const [closedEnd, setClosedEnd] = useState(-1);
  const [use3d, setUse3d] = useState(hasWebGL);
  // 開いたとき、直前の 1 投が相手のものなら再生する（自分の 1 投は「もう一度見る」で見られる）
  const [play, setPlay] = useState<{ anim: Anim; i: number } | null>(() => {
    const anim = s.last && s.last.seat !== you ? replayOf(s) : null;
    return anim && { anim, i: 0 };
  });
  /** 表示を済ませた通しの投数 */
  const shown = useRef(seq);
  /** 自分で投げて、いま動かしている 1 投（投げたあとの通しの投数） */
  const local = useRef<number | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; aim: number; power: number } | null>(null);
  /** 自分で投げて、すべっている 1 投（連打を受けながら計算している途中） */
  const live = useRef<{ run: Physics.ThrowRun; anim: Anim } | null>(null);
  /** 次のコマまでに連打した回数 */
  const taps = useRef(0);
  /** 送る関数はいつも最新のものを使う（画面を離れたときに、前の描画のものを使わない） */
  const submit = useRef(onSubmit);
  submit.current = onSubmit;

  useEffect(() => {
    // 投げる前に読み込んでおく
    loadPhysics().catch(() => {});
    if (use3d) loadScene().catch(() => {});
  }, []);

  // 投数が変わったら：見え方の指定を戻し、相手の 1 投なら再生する
  useEffect(() => {
    if (seq === shown.current) return;
    const prev = shown.current;
    shown.current = seq;
    setOverride(null);
    if (seq < prev) {
      // 別の対局に替わった
      setPlay(null);
      return;
    }
    if (local.current !== seq) replayLast();
  }, [seq]);

  // 再生の準備：投げる前の位置から、同じ向き・速さ・回転で計算し直す
  const anim = play?.anim ?? null;
  useEffect(() => {
    if (!anim || anim.sim) return;
    let alive = true;
    loadPhysics().then(
      (p) => {
        if (!alive) return;
        const sim = p.simulateThrow(anim.before, anim.id, anim.aim, anim.speed, anim.spin, anim.sweeps);
        const ready = withSim(anim, sim, performance.now());
        setPlay((cur) => (cur?.anim === anim ? { anim: ready, i: 0 } : cur));
      },
      // 読み込めなければ再生はあきらめて、止まった位置を出す
      () => alive && setPlay((cur) => (cur?.anim === anim ? null : cur)),
    );
    return () => {
      alive = false;
    };
  }, [anim]);

  // コマ送り
  useEffect(() => {
    if (!anim?.sim) return;
    if (anim.live) {
      // 自分の 1 投：時間に合わせて 1 コマずつ計算する。そのコマまでに連打していれば、こする
      const cur = live.current;
      if (cur?.anim !== anim) return;
      let raf = 0;
      const tick = (now: number) => {
        const want = Math.max(0, Math.floor((now - anim.start) / 1000 / STEP));
        while (!cur.run.done && cur.run.sim.frames.length - 1 < want) {
          cur.run.step(taps.current > 0);
          taps.current = 0;
        }
        const i = Math.min(want, cur.run.sim.frames.length - 1);
        // コマの列は計算のたびに伸びるので、同じ anim でも描き直す
        setPlay((p) => (p?.anim === anim ? { anim, i } : p));
        if (cur.run.done) finishLive();
        else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const last = lastFrame(anim);
    let raf = 0;
    const tick = (now: number) => {
      const i = clamp(Math.floor((now - anim.start) / 1000 / STEP), 0, last);
      setPlay((cur) => (cur?.anim === anim && cur.i !== i ? { anim, i } : cur));
      if (i < last) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  // 止まるところまで見せたら、少しハウスを見せてから、保存された状態の表示に戻す（自分の 1 投は、送れるまで待つ）
  const ended = !!play?.anim.sim && !play.anim.live && play.i >= lastFrame(play.anim);
  useEffect(() => {
    if (!ended || seq < play!.anim.key) return;
    const done = play!.anim;
    const timer = setTimeout(() => setPlay((cur) => (cur?.anim === done ? null : cur)), AFTER_MS);
    return () => clearTimeout(timer);
  }, [ended, seq]);

  // エンドが終わったところ（次のエンドの 1 投目の前）なら、結果を出す
  const lastEnd = s.ends.at(-1) ?? null;
  const atEndBreak = s.thrown === 0 && lastEnd !== null;
  const endCard = atEndBreak && !play && closedEnd !== s.ends.length;
  const canAim = interactive && !finished && !play && !busy && !endCard && turn !== null;

  async function throwStone() {
    if (!canAim) return;
    setBusy(true);
    try {
      const p = await loadPhysics();
      const a = round4(aim);
      const speed = round4(speedOf(power));
      const run = p.startThrow(s.stones, s.thrown, a, speed, spin);
      local.current = seq + 1;
      setOverride(null);
      const anim: Anim = {
        key: seq + 1,
        seat: turn!,
        id: s.thrown,
        before: s.stones,
        aim: a,
        speed,
        spin,
        sweeps: [],
        sim: run.sim,
        live: true,
        target: null,
        start: performance.now(),
        houseFrom: Infinity,
        near: Curling.TEE_Y,
      };
      live.current = { run, anim };
      taps.current = 0;
      setPlay({ anim, i: 0 });
    } catch {
      setBusy(false);
    }
  }

  /**
   * すべっている自分の 1 投を終わらせて送る。止まったとき・「とばす」・画面を離れたとき。
   * まだ止まっていなければ、そこから先はこすらずに計算する（結果を見てから取り消せないよう、途中で閉じても送る）
   */
  async function finishLive(skipToEnd = false) {
    const cur = live.current;
    if (!cur) return;
    live.current = null;
    const { run, anim } = cur;
    while (!run.done) run.step(false);
    const done = withSim({ ...anim, sweeps: run.taps }, run.sim, anim.start);
    const last = lastFrame(done);
    const shownDone = skipToEnd ? { ...done, start: performance.now() - (last + 1) * STEP * 1000 } : done;
    setPlay((p) => (p?.anim === anim ? { anim: shownDone, i: skipToEnd ? last : Math.min(p.i, last) } : p));
    try {
      const ok = await submit.current({
        aim: anim.aim,
        speed: anim.speed,
        spin: anim.spin,
        ...(run.taps.length ? { sweeps: run.taps } : {}),
        stones: run.sim.stones,
      });
      if (!ok) {
        local.current = null;
        setPlay((p) => (p?.anim === shownDone ? null : p));
      }
    } finally {
      setBusy(false);
    }
  }

  // すべっている途中で画面を離れたら（アプリを閉じる・ほかのアプリへ）、そこで終わらせて送る
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") finishLive();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      finishLive();
    };
  }, []);

  // すべっている間は、スペースキーでもこする
  const sliding = !!play?.anim.live;
  useEffect(() => {
    if (!sliding) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      e.preventDefault();
      if (live.current?.run.canSweep()) taps.current++;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sliding]);

  function replayLast() {
    const next = replayOf(s);
    setOverride(null);
    setPlay(next && { anim: next, i: 0 });
  }

  /** 再生を最後まで飛ばす */
  function skip() {
    if (live.current) {
      finishLive(true);
      return;
    }
    setPlay((cur) => {
      if (!cur?.anim.sim) return cur;
      const last = lastFrame(cur.anim);
      return { anim: { ...cur.anim, start: performance.now() - (last + 1) * STEP * 1000 }, i: last };
    });
  }

  // ---------- ドラッグ・キー操作 ----------

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("button")) return;
    // すべっている自分の石の前をこする（どの指で押しても 1 回）
    if (live.current) {
      if (live.current.run.canSweep()) taps.current++;
      return;
    }
    if (!canAim || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, aim, power };
    // 上から見ているときにドラッグしたら、投げる人の後ろに戻す
    if (override === "house") setOverride(null);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // 引っぱった向きの反対へ飛ぶ（左へ引くと右へ）。下へ引くほど強い
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    setAim(clamp(d.aim - (dx / rect.width) * 2 * AIM_UI_MAX, -AIM_UI_MAX, AIM_UI_MAX));
    setPower(clamp(d.power + dy / (rect.height * PULL), 0, 1));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!canAim) return;
    const fine = e.shiftKey ? 0.25 : 1;
    if (e.key === "ArrowLeft") setAim((v) => clamp(v - 0.004 * fine, -AIM_UI_MAX, AIM_UI_MAX));
    else if (e.key === "ArrowRight") setAim((v) => clamp(v + 0.004 * fine, -AIM_UI_MAX, AIM_UI_MAX));
    else if (e.key === "ArrowDown") setPower((v) => clamp(v + 0.01 * fine, 0, 1));
    else if (e.key === "ArrowUp") setPower((v) => clamp(v - 0.01 * fine, 0, 1));
    else if (e.key === "Enter") throwStone();
    else return;
    e.preventDefault();
  }

  // ---------- 描くもの ----------

  /** いま止まっている石（エンドの結果を見せている間は、終わったエンドの並び） */
  const resting = atEndBreak && (endCard || finished) ? lastEnd!.stones : s.stones;
  const counting = new Set(Curling.countingStones(resting).map((c) => c.id));
  let stones: Shown[] = play
    ? stonesAt(play.anim, play.i)
    : resting.map((st) => ({ ...st, opacity: 1, counts: counting.has(st.id) }));
  if (canAim) stones = [...stones, { id: s.thrown, seat: turn!, x: 0, y: 0, angle: releaseAngle(spin), opacity: 1 }];

  // 上から見るときは、ハウスより手前で止まっている石（ガード）も入るようにする
  const house: Camera = { mode: "house", focus: { x: 0, y: nearOf(resting) } };
  let camera: Camera = play ? cameraAt(play.anim, play.i) : canAim ? { mode: "aim" } : house;
  if (override === "aim") camera = { mode: "aim" };
  else if (override === "house") camera = play ? { mode: "house", focus: { x: 0, y: play.anim.near } } : house;
  const aimView = canAim ? { aim, power, spin, seat: turn! } : null;
  const brush = play ? sweepAt(play.anim, play.i) : null;
  const sweep = brush && { ...brush, seat: play!.anim.seat };
  /** いま連打でこすれるか（自分の石がまだすべっている） */
  const canSweep = sliding && !!live.current?.run.canSweep();
  const heat = canSweep && play?.anim.sim ? (play.anim.sim.sweep[play.i] ?? 0) : 0;

  const seatName = (seat: Seat) => t(`game.curling.seat${seat}`);
  // お試しでは名前が色の名前（青・オレンジ）なので、「さん」を付けない
  const nameOf = (seat: Seat) =>
    seat === you
      ? t("game.curling.you")
      : names[seat] === seatName(seat)
        ? names[seat]
        : t("game.curling.someone", { name: names[seat] });
  const endName = (i: number) => (i < ENDS ? t("game.curling.endN", { n: i + 1 }) : t("game.curling.extra"));
  const lying = Curling.scoreEnd(resting);

  let note: string | null = null;
  if (play) note = t("game.curling.threw", { who: nameOf(play.anim.seat) });
  else if (canAim) note = t("game.curling.aim");
  else if (status.kind === "playing" && status.turn !== you && names[status.turn])
    note = t("game.curling.turnOf", { name: names[status.turn] });
  // いまの得点の見込み（動かしている間は、先に結果がわからないよう出さない）。
  // エンドの区切りでは、結果はカードに出すので、次のエンドのはじまりを知らせる
  let info: string | null = null;
  if (finished || play || endCard) info = null;
  else if (atEndBreak) info = t("game.curling.endStart", { end: endName(s.ends.length) });
  else if (lying.scorer === null) info = t("game.curling.lyingNone");
  else info = t("game.curling.lying", { who: seatName(lying.scorer), n: lying.points });

  // エンドの最後の 1 投を動かしている間は、そのエンドの結果をまだ表に出さない（全部投げ終えた形で見せる）
  const scoreState: Curling.CurlingState =
    play && atEndBreak && s.last?.end === s.ends.length - 1
      ? { ...s, ends: s.ends.slice(0, -1), hammer: lastEnd!.hammer, thrown: THROWS }
      : s;

  const zone = zoneOf(power);
  const label = t("game.curling.board", { end: endName(Math.min(s.ends.length, ENDS)), n: THROWS - s.thrown });

  return (
    <div className="curling-board stack-sm">
      <Scoreboard s={scoreState} names={names} you={you} finished={finished && scoreState === s} />

      {!use3d && <p className="curling-no3d muted">{t("game.curling.no3d")}</p>}

      <div
        ref={view}
        className={`curling-view ${use3d ? "is-3d" : "is-2d"} ${canAim ? "aiming" : ""} ${sliding ? "sliding" : ""}`}
        tabIndex={canAim ? 0 : -1}
        role="group"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {use3d ? (
          <View3D stones={stones} aim={aimView} sweep={sweep} camera={camera} onFail={() => setUse3d(false)} />
        ) : (
          <Sheet2D stones={stones} aim={aimView} sweep={sweep} label={label} />
        )}

        {canSweep && (
          <div className={`curling-sweep seat${play!.anim.seat}`} aria-live="polite">
            <BrushIcon />
            <span>{t("game.curling.sweep")}</span>
            <i className="curling-sweep-meter" aria-hidden>
              <b style={{ width: `${Math.round(heat * 100)}%` }} />
            </i>
          </div>
        )}

        {use3d && (
          <button
            type="button"
            className="curling-pill curling-viewswitch"
            aria-pressed={camera.mode === "house"}
            onClick={() => setOverride(camera.mode === "house" ? "aim" : "house")}
          >
            {camera.mode === "house" ? <ThrowerViewIcon /> : <TopViewIcon />}
            <span>{t(camera.mode === "house" ? "game.curling.throwerView" : "game.curling.topView")}</span>
          </button>
        )}

        {play ? (
          play.anim.sim &&
          !ended && (
            <button type="button" className="curling-pill curling-replay" onClick={skip}>
              {t("game.curling.skip")}
            </button>
          )
        ) : (
          s.last &&
          !endCard && (
            <button type="button" className="curling-pill curling-replay" onClick={replayLast}>
              {t("game.curling.replay")}
            </button>
          )
        )}

        {canAim && (
          <div className={`curling-gauge zone-${zone}`} aria-hidden>
            <span className="curling-gauge-label">{t(`game.curling.zone.${zone}`)}</span>
            <div className="curling-gauge-bar">
              <i className="z-short" style={{ height: `${ZONE_AT.guard * 100}%` }} />
              <i className="z-guard" style={{ height: `${(ZONE_AT.house - ZONE_AT.guard) * 100}%` }} />
              <i className="z-house" style={{ height: `${(ZONE_AT.hit - ZONE_AT.house) * 100}%` }} />
              <i className="z-hit" style={{ height: `${(1 - ZONE_AT.hit) * 100}%` }} />
              <b className={`curling-gauge-mark seat${turn}`} style={{ bottom: `${power * 100}%` }} />
            </div>
            <span className="curling-gauge-title">{t("game.curling.power")}</span>
          </div>
        )}

        {endCard && lastEnd && (
          <div className="curling-endcard" role="status">
            <p className="curling-endcard-title">{endName(s.ends.length - 1)}</p>
            <p className={`curling-endcard-result ${lastEnd.scorer === null ? "" : `seat${lastEnd.scorer}`}`}>
              {lastEnd.scorer === null
                ? t("game.curling.blank")
                : t("game.curling.scored", { who: seatName(lastEnd.scorer), n: lastEnd.points })}
            </p>
            <button type="button" className="primary" onClick={() => setClosedEnd(s.ends.length)}>
              {t(finished ? "game.curling.close" : "game.curling.next")}
            </button>
          </div>
        )}
      </div>

      {you !== null && !finished && (
        <div className="curling-controls">
          <div className="curling-spin" role="group" aria-label={t("game.curling.spin")}>
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                className={spin === dir ? "on" : ""}
                aria-pressed={spin === dir}
                aria-label={t(dir === 1 ? "game.curling.spinRight" : "game.curling.spinLeft")}
                title={t(dir === 1 ? "game.curling.spinRight" : "game.curling.spinLeft")}
                onClick={() => setSpin(dir)}
                disabled={!canAim}
              >
                <SpinIcon cw={dir === 1} />
              </button>
            ))}
          </div>
          <button type="button" className="primary curling-throw" onClick={throwStone} disabled={!canAim}>
            {t("game.curling.throw")}
          </button>
        </div>
      )}

      <p className="board-note">
        {note && <span>{note}</span>}
        {info && <span className="muted">{info}</span>}
      </p>
    </div>
  );
}

/** エンドごとの得点の表。ハンマーの印と、このエンドの残りの投数（丸）も出す */
function Scoreboard({
  s,
  names,
  you,
  finished,
}: {
  s: Curling.CurlingState;
  names: Record<Seat, string>;
  you: Seat | null;
  finished: boolean;
}) {
  const { t } = useI18n();
  const totals = Curling.totals(s);
  // 延長は、入ったときだけ列を出す
  const columns = Math.max(ENDS, Math.min(ENDS + Curling.EXTRA_ENDS, s.ends.length + (finished ? 0 : 1)));
  const current = finished ? -1 : s.ends.length;
  const hammerTitle = t("game.curling.hammer");
  return (
    <table className="curling-score">
      <thead>
        <tr>
          <th scope="col" className="who">
            <span className="curling-sr">{t("game.curling.player")}</span>
          </th>
          {Array.from({ length: columns }, (_, i) => (
            <th key={i} scope="col" className={i === current ? "now" : ""}>
              {i < ENDS ? i + 1 : t("game.curling.extraShort")}
            </th>
          ))}
          <th scope="col" className="total">
            {t("game.curling.total")}
          </th>
        </tr>
      </thead>
      <tbody>
        {([0, 1] as Seat[]).map((seat) => {
          const left = Curling.throwsLeft(s, seat);
          return (
            <tr key={seat} className={`seat${seat}`}>
              <th scope="row" className="who">
                <div className="curling-who">
                  <span className="curling-dot" aria-hidden />
                  <span className="curling-name">{names[seat] || t(`game.curling.seat${seat}`)}</span>
                  {seat === you && <span className="curling-you">{t("game.curling.you")}</span>}
                  {!finished && s.hammer === seat && <HammerIcon title={hammerTitle} />}
                  {!finished && (
                    <span className="curling-left" role="img" aria-label={t("game.curling.left", { n: left })}>
                      {Array.from({ length: THROWS / 2 }, (_, i) => (
                        <i key={i} className={i < left ? "full" : ""} />
                      ))}
                    </span>
                  )}
                </div>
              </th>
              {Array.from({ length: columns }, (_, i) => {
                const e = s.ends[i];
                const pts = e ? (e.scorer === seat ? e.points : 0) : null;
                return (
                  <td key={i} className={`${i === current ? "now" : ""} ${e && e.scorer === seat ? "won" : ""}`}>
                    {pts ?? "–"}
                  </td>
                );
              })}
              <td className="total">{totals[seat]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
