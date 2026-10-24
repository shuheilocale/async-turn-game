import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Artillery, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import type { ArtilleryView, Display, ShotPlay } from "./artillery/scene.ts";
import "./ArtilleryBoard.css";

type State = Artillery.ArtilleryState;
type Field = Artillery.Field;
type Shot = Artillery.Shot;
type Move = Artillery.ArtilleryMove;

/** 盤の絵（Phaser）は、この盤を開いたときに初めて読み込む */
let sceneModule: Promise<typeof import("./artillery/scene.ts")> | null = null;
const loadScene = () =>
  (sceneModule ??= import("./artillery/scene.ts").catch((e) => {
    // 読み込めなかったら、次に開いたときに読み込み直す
    sceneModule = null;
    throw e;
  }));

/** 相手の 1 発を再生する前に、撃つ前の場を見せておく時間（ミリ秒） */
const HOLD_MS = 650;
/** 続けて再生するときの間（ミリ秒） */
const GAP_MS = 350;
/** 予想の線に使う、弾の最初のきざみの数（1/3 秒ほど） */
const PREVIEW_STEPS = 40;
/** 盤の幅のこの割合だけ指を引くと、強さ 100 */
const PULL_FULL = 0.42;
/** 指を引いたとみなす距離（px）。これより短ければ狙いを変えない */
const PULL_MIN = 8;

/** 再生する 1 発。HUD（体力・残りの弾・風）も、再生中はこれに合わせる */
interface Clip {
  /** 何発目か（0 から） */
  index: number;
  play: ShotPlay;
  wind: number;
  /** 自分で撃った手（送るのと同時に動かす） */
  local: boolean;
}

const fieldOf = (s: Field): Field => ({ terrain: s.terrain, cannons: s.cannons, hp: s.hp });
const clampAngle = (a: number) => Math.max(0, Math.min(180, Math.round(a)));
const clampPower = (p: number) => Math.max(0, Math.min(100, Math.round(p)));
const prefersDark = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

/** それぞれが最後に撃った向き（まだなら外向きの 45 度） */
function anglesOf(shots: readonly Shot[]): [number, number] {
  const angles: [number, number] = [45, 135];
  for (const shot of shots) angles[shot.seat] = shot.angle;
  return angles;
}

function displayOf(s: State, field: Field, used: number, active: Seat | null, angles = anglesOf(s.shots.slice(0, used))): Display {
  return {
    field,
    ground: s.ground,
    soots: s.shots.slice(0, used).flatMap((shot) => (shot.impact ? [shot.impact] : [])),
    wind: s.winds[used] ?? 0,
    active,
    angles,
  };
}

/** index 発目（shot）を、撃つ前の場 before から撃って after になった 1 発として再生する準備 */
function clipOf(s: State, index: number, before: Field, after: Field, local: boolean, aimAngle?: number): Clip {
  const shot = s.shots[index]!;
  const wind = s.winds[index] ?? 0;
  const flight = Artillery.fly(before, shot.seat, shot, wind, true);
  const angles = anglesOf(s.shots.slice(0, index));
  if (aimAngle !== undefined) angles[shot.seat] = aimAngle;
  return {
    index,
    wind,
    local,
    play: {
      seat: shot.seat,
      angle: shot.angle,
      path: flight.path,
      impact: flight.impact,
      damage: shot.damage,
      before: displayOf(s, before, index, null, angles),
      after: displayOf(s, after, index + 1, null),
    },
  };
}

/** 直前の 1 発の再生 */
const replayOf = (s: State): Clip | null =>
  s.before && s.shots.length > 0 ? clipOf(s, s.shots.length - 1, s.before, fieldOf(s), false) : null;

/** seat が次に撃つときの狙いの初めの値。前に撃った手があればそれ */
function startAim(s: State, seat: Seat): Move {
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const shot = s.shots[i]!;
    if (shot.seat === seat) return { angle: shot.angle, power: shot.power };
  }
  return { angle: seat === 0 ? 45 : 135, power: 62 };
}

/** 角度の見せ方：自分の向いている側から測った仰角と、向きの矢印 */
function angleText(angle: number) {
  const elevation = angle <= 90 ? angle : 180 - angle;
  const arrow = angle < 88 ? "↗" : angle > 92 ? "↖" : "↑";
  return { elevation, arrow };
}

/**
 * 地形の上の大砲で撃ち合う盤。絵は Phaser（artillery/scene.ts）で描き、操作・体力・風の表示は React。
 * 自分の番には、盤の上で指を置いて後ろへ引く（大砲を引きしぼる向き）か、スライダーで角度と強さを決めて「撃つ」。
 * 撃つとすぐに同じ計算で弾を飛ばして見せ、同時にサーバへ送る（やり直しはできない）。
 * 相手の手は、開いたとき・届いたときに再生する
 */
export function ArtilleryBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as State;
  const count = s.shots.length;
  const finished = status.kind === "finished";

  const [view, setView] = useState<ArtilleryView | null>(null);
  const [failed, setFailed] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [impacted, setImpacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aim, setAim] = useState<Move>(() => startAim(s, you ?? 0));
  const [pull, setPull] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const viewEl = useRef<HTMLDivElement>(null);
  const clipRef = useRef<Clip | null>(null);
  const queue = useRef<Clip[]>([]);
  /** 表示を済ませた（または再生を決めた）弾の数 */
  const shown = useRef(count);
  const drag = useRef<{ id: number; x: number; y: number; width: number } | null>(null);
  const labels = { direct: t("game.artillery.direct"), out: t("game.artillery.out") };

  function startClip(c: Clip | null) {
    clipRef.current = c;
    setClip(c);
    setImpacted(false);
  }

  function enqueue(c: Clip | null) {
    if (!c) return;
    if (clipRef.current) queue.current.push(c);
    else startClip(c);
  }

  // Phaser の盤を作る（StrictMode で 2 回呼ばれても、片方はすぐ片づける）
  useEffect(() => {
    let alive = true;
    let made: ArtilleryView | null = null;
    loadScene().then(
      (m) => {
        if (!alive || !stage.current) return;
        made = m.mount(stage.current, { dark: prefersDark(), labels });
        setView(made);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      made?.destroy();
      setView(null);
    };
  }, []);

  // 言語を切り替えたら、盤に浮かぶ文字（直撃・場外）も替える
  useEffect(() => {
    view?.setLabels(labels);
  }, [view, labels.direct, labels.out]);

  // ダークモードの切り替え
  useEffect(() => {
    if (!view) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => view.setDark(mq.matches);
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, [view]);

  // 盤が画面の外にあるときは止める
  useEffect(() => {
    const el = viewEl.current;
    if (!view || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => view.setAwake(!!entry?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [view]);

  // 開いたとき、直前の 1 発が相手のものなら再生する（自分の手は「もう一度見る」で見られる）。
  // StrictMode で 2 回呼ばれても 1 回だけにする
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const last = s.shots[count - 1];
    if (last && last.seat !== you) enqueue(replayOf(s));
  }, []);

  // 弾の数が変わったら：相手の手なら再生し、狙いを自分の前の手に戻す
  useEffect(() => {
    if (count === shown.current) return;
    const prev = shown.current;
    shown.current = count;
    if (count < prev) {
      // 別の対局に替わった
      queue.current = [];
      view?.cancel();
      startClip(null);
    } else {
      enqueue(replayOf(s));
    }
  }, [count]);

  useEffect(() => {
    if (you !== null) setAim(startAim(s, you));
  }, [count, you]);

  // 再生：相手の手は少し間をおいてから。終わったら次へ（なければ今の場に戻す）
  useEffect(() => {
    if (!clip) return;
    if (failed) {
      startClip(queue.current.shift() ?? null);
      return;
    }
    if (!view) return;
    let alive = true;
    // 相手の手は、撃つ前の場を少し見せてから撃つ
    if (!clip.local) view.show(clip.play.before);
    const timer = setTimeout(
      () => {
        view
          .play(clip.play, () => alive && setImpacted(true))
          .then(() => {
            if (!alive || clipRef.current !== clip) return;
            const next = queue.current.shift() ?? null;
            if (next) setTimeout(() => clipRef.current === clip && startClip(next), GAP_MS);
            else startClip(null);
          });
      },
      clip.local ? 0 : HOLD_MS,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [clip, view, failed]);

  const canAim = interactive && you !== null && !finished && !clip && !busy && status.kind === "playing" && status.turn === you;
  const wind = clip ? clip.wind : Artillery.windNow(s);

  // 止まっている場と狙いを Phaser に伝える
  useEffect(() => {
    if (!view || clip) return;
    const active = status.kind === "playing" ? status.turn : null;
    const angles = anglesOf(s.shots);
    if (canAim && you !== null) angles[you] = aim.angle;
    view.show(displayOf(s, fieldOf(s), count, active, angles));
  }, [view, clip, s, status, canAim]);

  useEffect(() => {
    if (!view || clip) return;
    if (!canAim || you === null) {
      view.clearAim();
      return;
    }
    const preview = Artillery.fly(s, you, aim, wind, true).path.slice(0, PREVIEW_STEPS).filter((_, i) => i % 4 === 2);
    view.aim(you, aim.angle, preview, pull);
  }, [view, clip, canAim, aim, pull, s, wind]);

  async function fire() {
    if (!canAim || you === null) return;
    const move = { angle: clampAngle(aim.angle), power: clampPower(aim.power) };
    let next: State;
    try {
      next = Artillery.artillery.applyMove(s, move, you);
    } catch {
      return;
    }
    // 結果を見てから取り消せないよう、飛ばし始めると同時に送る
    shown.current = count + 1;
    startClip(clipOf(next, count, fieldOf(s), fieldOf(next), true, move.angle));
    setBusy(true);
    const ok = await onSubmit(move);
    setBusy(false);
    if (!ok) {
      shown.current = count;
      queue.current = [];
      view?.cancel();
      startClip(null);
    }
  }

  function replayLast() {
    if (clipRef.current) return;
    enqueue(replayOf(s));
  }

  // ---------- 指で引いて狙う ----------

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!canAim || !e.isPrimary || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, width: e.currentTarget.getBoundingClientRect().width };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // 引いた向きの反対へ撃つ（画面の y は下向きなので、上下も反対にする）
    const dx = d.x - e.clientX;
    const dy = e.clientY - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist < PULL_MIN) return;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle = dx >= 0 ? 0 : 180;
    const power = clampPower((Math.min(1, dist / (d.width * PULL_FULL)) * 100));
    setAim({ angle: clampAngle(angle), power });
    setPull(power);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setPull(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!canAim) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") setAim((a) => ({ ...a, angle: clampAngle(a.angle + step) }));
    else if (e.key === "ArrowRight") setAim((a) => ({ ...a, angle: clampAngle(a.angle - step) }));
    else if (e.key === "ArrowUp") setAim((a) => ({ ...a, power: clampPower(a.power + step) }));
    else if (e.key === "ArrowDown") setAim((a) => ({ ...a, power: clampPower(a.power - step) }));
    else if (e.key === "Enter") fire();
    else return;
    e.preventDefault();
  }

  // ---------- 表示 ----------

  // 再生中は、撃つ前（爆発したらあと）の体力と、撃った弾までの数を見せる
  const hp: [number, number] = clip ? (impacted ? clip.play.after.field.hp : clip.play.before.field.hp) : s.hp;
  const used = clip ? clip.index + 1 : count;
  const fired = ([0, 1] as Seat[]).map((seat) => s.shots.slice(0, used).filter((shot) => shot.seat === seat).length);
  const turnSeat: Seat | null = clip ? clip.play.seat : status.kind === "playing" ? status.turn : null;
  const nameOf = (seat: Seat) => (seat === you ? t("game.artillery.you") : t("game.artillery.someone", { name: names[seat] }));
  const note = noteText(t, s, status, clip, impacted, canAim, you, names, nameOf);
  const { elevation, arrow } = angleText(aim.angle);

  return (
    <div className={`artillery-board stack-sm ${you !== null ? `seat${you}` : ""}`}>
      <div
        ref={viewEl}
        className={`artillery-view ${canAim ? "aiming" : ""}`}
        role="group"
        aria-label={t("game.artillery.board", { a: hp[0], b: hp[1], wind: windText(t, wind) })}
        tabIndex={canAim ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {/* 絵が出るまで（出せないとき）の、地形と大砲だけの簡単な絵 */}
        <LiteView s={s} />
        <div ref={stage} className="artillery-stage" />
        {!view && !failed && <span className="artillery-loading">{t("game.artillery.loading")}</span>}

        <div className="artillery-hud">
          {([0, 1] as Seat[]).map((seat) => (
            <div key={seat} className={`artillery-player seat${seat} ${turnSeat === seat && !finished ? "turn" : ""}`}>
              <span className="artillery-name">{names[seat] || t(`game.artillery.seat${seat}`)}</span>
              <span className="artillery-hp" aria-label={t("game.artillery.hpOf", { n: hp[seat]! })}>
                <i style={{ width: `${hp[seat]}%` }} />
              </span>
              <span className="artillery-meta">
                <b className="num">{hp[seat]}</b>
                <span className="artillery-pips" aria-label={t("game.artillery.shotsLeft", { n: Artillery.SHOTS - fired[seat]! })}>
                  {Array.from({ length: Artillery.SHOTS }, (_, i) => (
                    <i key={i} className={i < Artillery.SHOTS - fired[seat]! ? "left" : ""} />
                  ))}
                </span>
              </span>
            </div>
          ))}
          <WindGauge wind={wind} t={t} />
        </div>

        {count > 0 && !clip && (
          <button type="button" className="artillery-replay ghost-button" onClick={replayLast}>
            {t("game.artillery.replay")}
          </button>
        )}
      </div>

      {you !== null && !finished && (
        <div className="artillery-controls">
          <div className="artillery-row">
            <span className="artillery-label" id="artillery-angle">
              {t("game.artillery.angle")}
            </span>
            <button
              type="button"
              className="artillery-step"
              aria-label={t("game.artillery.left")}
              disabled={!canAim}
              onClick={() => setAim((a) => ({ ...a, angle: clampAngle(a.angle + 1) }))}
            >
              <svg viewBox="0 0 20 20" aria-hidden>
                <path d="M12.5 5 7.5 10l5 5" />
              </svg>
            </button>
            {/* 左の端が真左（180°）、右の端が真右（0°）。つまみを動かした向きに砲身が傾く */}
            <input
              type="range"
              min={0}
              max={180}
              value={180 - aim.angle}
              disabled={!canAim}
              aria-labelledby="artillery-angle"
              aria-valuetext={`${arrow} ${elevation}°`}
              onChange={(e) => setAim((a) => ({ ...a, angle: clampAngle(180 - Number(e.target.value)) }))}
            />
            <button
              type="button"
              className="artillery-step"
              aria-label={t("game.artillery.right")}
              disabled={!canAim}
              onClick={() => setAim((a) => ({ ...a, angle: clampAngle(a.angle - 1) }))}
            >
              <svg viewBox="0 0 20 20" aria-hidden>
                <path d="m7.5 5 5 5-5 5" />
              </svg>
            </button>
            <output className="artillery-value num">
              <small aria-hidden>{arrow}</small>
              {elevation}°
            </output>
          </div>
          <div className="artillery-row">
            <span className="artillery-label" id="artillery-power">
              {t("game.artillery.power")}
            </span>
            <button
              type="button"
              className="artillery-step"
              aria-label={t("game.artillery.weaker")}
              disabled={!canAim}
              onClick={() => setAim((a) => ({ ...a, power: clampPower(a.power - 1) }))}
            >
              <svg viewBox="0 0 20 20" aria-hidden>
                <path d="M5 10h10" />
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={aim.power}
              disabled={!canAim}
              aria-labelledby="artillery-power"
              onChange={(e) => setAim((a) => ({ ...a, power: clampPower(Number(e.target.value)) }))}
            />
            <button
              type="button"
              className="artillery-step"
              aria-label={t("game.artillery.stronger")}
              disabled={!canAim}
              onClick={() => setAim((a) => ({ ...a, power: clampPower(a.power + 1) }))}
            >
              <svg viewBox="0 0 20 20" aria-hidden>
                <path d="M5 10h10M10 5v10" />
              </svg>
            </button>
            <output className="artillery-value num">{aim.power}</output>
          </div>
          <button type="button" className="primary artillery-fire" onClick={fire} disabled={!canAim}>
            {t("game.artillery.fire")}
          </button>
        </div>
      )}

      <p className="board-note">
        {note.main && <span>{note.main}</span>}
        {note.sub && <span className="muted">{note.sub}</span>}
        {failed && <span className="muted">{t("game.artillery.noScene")}</span>}
      </p>
    </div>
  );
}

function windText(t: T, wind: number): string {
  if (wind === 0) return t("game.artillery.calm");
  return t(wind > 0 ? "game.artillery.windRight" : "game.artillery.windLeft", { n: Math.abs(wind) });
}

/** 風の向きと強さ：旗と矢印と数字 */
function WindGauge({ wind, t }: { wind: number; t: T }) {
  const strength = Math.abs(wind) / Artillery.WIND_MAX;
  const dir = wind < 0 ? -1 : 1;
  const len = 6 + strength * 22;
  return (
    <div className="artillery-wind" aria-label={windText(t, wind)}>
      <svg viewBox="-20 -9 40 18" aria-hidden className={wind === 0 ? "calm" : ""}>
        {wind === 0 ? (
          <circle cx="0" cy="0" r="3" />
        ) : (
          <g transform={`scale(${dir} 1)`}>
            <path d={`M${-len / 2} 0H${len / 2}`} />
            <path d={`M${len / 2 - 5} -4.5 ${len / 2} 0 ${len / 2 - 5} 4.5`} />
          </g>
        )}
      </svg>
      <span className="artillery-wind-label">
        <svg viewBox="0 0 16 16" aria-hidden className={`artillery-flag ${wind === 0 ? "calm" : wind < 0 ? "left" : "right"}`}>
          <path d="M3 15V1.5" className="pole" />
          <path d="M3.5 2h9l-2.2 3 2.2 3h-9z" className="cloth" />
        </svg>
        {wind === 0 ? t("game.artillery.calm") : <b className="num">{Math.abs(wind)}</b>}
      </span>
    </div>
  );
}

/** Phaser の絵が出るまで（出せないとき）に見せる、地形と大砲の簡単な絵（SVG） */
function LiteView({ s }: { s: State }) {
  const w = Artillery.COLS;
  const h = Artillery.VIEW_H;
  const points = s.terrain.map((y, c) => `${c + 0.5},${h - y}`).join(" ");
  return (
    <svg className="artillery-lite" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${h} 0,${h - s.terrain[0]!} ${points} ${w},${h - s.terrain[w - 1]!} ${w},${h}`} className="ground" />
      {s.cannons.map((c, seat) => (
        <circle key={seat} cx={c.x} cy={h - c.y - 2} r={3} className={`cannon seat${seat}`} />
      ))}
    </svg>
  );
}

/** 盤の下に出す文。上は今の様子、下は直前の 1 発の結果 */
function noteText(
  t: T,
  s: State,
  status: BoardProps["status"],
  clip: Clip | null,
  impacted: boolean,
  canAim: boolean,
  you: Seat | null,
  names: Record<Seat, string>,
  nameOf: (seat: Seat) => string,
): { main: string | null; sub: string | null } {
  const result = (shot: Shot | undefined, impact: [number, number] | null) => {
    if (!shot) return null;
    const who = nameOf(shot.seat);
    const hit = shot.damage[shot.seat === 0 ? 1 : 0];
    const self = shot.damage[shot.seat];
    if (!impact) return t("game.artillery.result.out", { who });
    const parts = [hit > 0 ? t("game.artillery.result.hit", { who, n: hit }) : t("game.artillery.result.miss", { who })];
    if (self > 0) parts.push(t("game.artillery.result.self", { n: self }));
    return parts.join(" ");
  };
  if (clip) {
    const shot = s.shots[clip.index];
    return {
      main: t("game.artillery.fired", { who: nameOf(clip.play.seat) }),
      sub: impacted ? result(shot, clip.play.impact) : null,
    };
  }
  const last = s.shots[s.shots.length - 1];
  const sub = result(last, last?.impact ?? null);
  if (status.kind === "finished") {
    const dead = ([0, 1] as Seat[]).filter((seat) => s.hp[seat] <= 0);
    if (dead.length > 0) return { main: dead.map((seat) => t("game.artillery.ko", { who: nameOf(seat) })).join(" "), sub };
    return { main: t("game.artillery.limit"), sub };
  }
  if (canAim) return { main: t("game.artillery.aim"), sub };
  if (status.turn !== you && names[status.turn]) return { main: t("game.artillery.turnOf", { name: names[status.turn] }), sub };
  return { main: null, sub };
}
