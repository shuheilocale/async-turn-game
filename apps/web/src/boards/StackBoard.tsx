import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Stack, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import type * as Physics from "./stack/physics.ts";
import { GROUND_Y, ROCK_CRACKS, ROCK_OUTLINE, STEP, VIEW_BOTTOM, VIEW_H, VIEW_W } from "./stack/scene.ts";
import "./StackBoard.css";

type Pose = Stack.Pose;
type Point = Stack.Point;

/** 物理演算（planck）は、この盤を開いたときに初めて読み込む */
let physics: Promise<typeof Physics> | null = null;
const loadPhysics = () =>
  (physics ??= import("./stack/physics.ts").catch((e) => {
    // 読み込めなかったら、次に押したときに読み込み直す
    physics = null;
    throw e;
  }));

/** 回転ボタン 1 回で回す角度 */
const TURN = Math.PI / 12;
/** 再生を始める前に、落とす前の石を見せておく時間（ミリ秒） */
const HOLD_MS = 700;
/** 見える範囲の上の端に、「つぎ」の石を出す分の余白 */
const HEADROOM = 0.8;
/** 石の色（灰〜茶）。置いた人の色を CSS で薄く混ぜる */
const TONES = ["#8e877d", "#a08f7a", "#7c7a76", "#aa9c8a", "#8a7b6b", "#9b958c", "#776c62", "#b0a597"];

interface Anim {
  /** 落としたあとの石の数 */
  key: number;
  seat: Seat;
  /** 1 コマごとの全部の石の位置。計算が済むまでは、落とす前の 1 コマだけ */
  frames: Pose[][];
  /** 再生のとき、最後にそろえる保存された位置。自分で落としたときは null */
  target: Pose[] | null;
  /** 再生のとき、計算し直す落とし方 */
  drop: Stack.LastDrop | null;
  pending: boolean;
  /** 1 コマ目を出す時刻（performance.now()） */
  start: number;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
const clampX = (x: number) => Math.max(-Stack.X_LIMIT, Math.min(Stack.X_LIMIT, x));
const deg = (a: number) => (a * 180) / Math.PI;
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const smooth = (t: number) => t * t * (3 - 2 * t);
const pointsOf = (poly: Point[]) => poly.map(([x, y]) => `${x},${y}`).join(" ");
const radius = (stone: Point[]) => Math.max(...stone.map(([x, y]) => Math.hypot(x, y)));
/** 回転の段数を -11〜12（-165°〜180°）にそろえる */
const normTurns = (k: number) => ((((k + 11) % 24) + 24) % 24) - 11;

/** 一番上にある石の中心の x。落とす位置の初めの値にする */
function topX(s: Stack.StackState): number {
  let best = 0;
  let top = -Infinity;
  s.positions.forEach((pose, i) => {
    if (Stack.isFallen(pose)) return;
    const y = Math.max(...Stack.place(s.stones[i]!, pose).map((p) => p[1]));
    if (y > top) [top, best] = [y, pose[0]];
  });
  return clampX(Math.round(best * 100) / 100);
}

/** 見える範囲の下端。積んだ石の一番上と、次に落とす石（next 番目）が収まるようにする */
function cameraBottom(stones: Point[][], settled: Pose[], next: number): number {
  const reach = next < stones.length ? Stack.DROP_GAP + 2 * radius(stones[next]!) : 0;
  return Math.max(VIEW_BOTTOM, Stack.topOf(stones, settled) + reach + HEADROOM - VIEW_H);
}

/** 直前の手を再生する準備。計算が済むまでは、落とす前の位置で石を浮かせておく */
function replayOf(s: Stack.StackState): Anim | null {
  const last = s.last;
  if (!last) return null;
  return {
    key: s.positions.length,
    seat: last.seat,
    frames: [[...last.before, Stack.dropPose(s.stones, last.before, last.x, last.angle)]],
    target: s.positions,
    drop: last,
    pending: true,
    start: performance.now() + HOLD_MS,
  };
}

/**
 * i コマ目の位置。再生のときは、端末による計算のずれを少しずつ埋めて、最後は保存された位置にそろえる
 */
function frameAt(anim: Anim, i: number): Pose[] {
  const frame = anim.frames[i]!;
  const end = anim.frames[anim.frames.length - 1]!;
  const target = anim.target;
  if (!target || target.length !== frame.length || anim.pending) return frame;
  const w = smooth(anim.frames.length > 1 ? i / (anim.frames.length - 1) : 1);
  return frame.map((p, k) => {
    const e = end[k]!;
    const g = target[k]!;
    return [p[0] + (g[0] - e[0]) * w, p[1] + (g[1] - e[1]) * w, p[2] + wrap(g[2] - e[2]) * w];
  });
}

function StoneShape({ stone, pose, index, className = "" }: { stone: Point[]; pose: Pose; index: number; className?: string }) {
  return (
    <g transform={`translate(${pose[0]} ${pose[1]}) rotate(${deg(pose[2])})`}>
      <polygon
        points={pointsOf(stone)}
        className={`stack-stone seat${index % 2} ${className}`}
        style={{ "--tone": TONES[(index * 5) % TONES.length] } as CSSProperties}
      />
      <polygon points={pointsOf(stone)} className="stack-sheen" />
    </g>
  );
}

/**
 * 上から石を落として積む盤。自分の番には、石を左右にドラッグ（またはタップ）して位置を、
 * 回転ボタンで傾きを決めて「落とす」。落とすとすぐに物理演算で結果を出して送り、
 * 落ちて止まるまでを動かして見せる。相手の手は、開いたとき・届いたときに再生する
 */
export function StackBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Stack.StackState;
  const count = s.positions.length;
  const finished = status.kind === "finished";

  const [x, setX] = useState(() => topX(s));
  const [turns, setTurns] = useState(0);
  const [busy, setBusy] = useState(false);
  // 開いたとき、直前の手が相手のものなら再生する（自分の手は「もう一度見る」で見られる）
  const [play, setPlay] = useState<{ anim: Anim; i: number } | null>(() => {
    const anim = s.last && s.last.seat !== you ? replayOf(s) : null;
    return anim && { anim, i: 0 };
  });
  /** 表示を済ませた石の数 */
  const shown = useRef(count);
  /** 自分で落として、いま動かしている手（落としたあとの石の数） */
  const local = useRef<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; clientX: number; startX: number; moved: boolean } | null>(null);

  useEffect(() => {
    loadPhysics();
  }, []);

  // 石の数が変わったら：落とす位置を一番上の石に戻し、相手の手なら再生する
  useEffect(() => {
    if (count === shown.current) return;
    const prev = shown.current;
    shown.current = count;
    setTurns(0);
    setX(topX(s));
    if (count < prev) {
      // 別の対局に替わった
      setPlay(null);
      return;
    }
    if (local.current !== count) replayLast();
  }, [count]);

  // 再生の準備：落とす前の位置から、同じ x・傾きで計算し直す
  const anim = play?.anim ?? null;
  useEffect(() => {
    if (!anim?.pending || !anim.drop) return;
    let alive = true;
    const { before, x: dropX, angle } = anim.drop;
    const stones = s.stones;
    loadPhysics().then(
      (p) => {
        if (!alive) return;
        const sim = p.simulateDrop(stones, before, dropX, angle);
        const ready = { ...anim, frames: sim.frames, pending: false, start: Math.max(anim.start, performance.now()) };
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
    if (!anim || anim.pending) return;
    const last = anim.frames.length - 1;
    let raf = 0;
    const tick = (now: number) => {
      const i = Math.min(last, Math.max(0, Math.floor((now - anim.start) / 1000 / STEP)));
      setPlay((cur) => (cur?.anim === anim ? { anim, i } : cur));
      if (i < last) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  // 止まるところまで見せたら、保存された状態の表示に戻す（自分で落とした手は、送れるまで待つ）
  const ended = !!play && !play.anim.pending && play.i >= play.anim.frames.length - 1;
  useEffect(() => {
    if (ended && count >= play!.anim.key) setPlay(null);
  }, [ended, count]);

  const angle = turns * TURN;
  const canAim = interactive && !finished && !play && !busy && count < Stack.STONES;

  async function drop() {
    if (!canAim) return;
    setBusy(true);
    try {
      const p = await loadPhysics();
      const dropX = round4(x);
      const sim = p.simulateDrop(s.stones, s.positions, dropX, angle);
      // 結果を見てから取り消せないよう、動かし始めると同時に送る
      local.current = count + 1;
      setPlay({
        anim: { key: count + 1, seat: s.turn, frames: sim.frames, target: null, drop: null, pending: false, start: performance.now() },
        i: 0,
      });
      const ok = await onSubmit({ x: dropX, angle, positions: sim.positions, collapsed: sim.collapsed });
      if (!ok) {
        local.current = null;
        setPlay(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function replayLast() {
    const anim = replayOf(s);
    setPlay(anim && { anim, i: 0 });
  }

  // ---------- ドラッグ・タップ・キー操作 ----------

  const worldPerPx = () => VIEW_W / (svg.current?.getBoundingClientRect().width || 1);

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!canAim || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, clientX: e.clientX, startX: x, moved: false };
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.clientX;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) setX(clampX(d.startX + dx * worldPerPx()));
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // 動かさずに離したら、タップした場所へ石を動かす
    if (!d.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      setX(clampX(((e.clientX - rect.left) / rect.width - 0.5) * VIEW_W));
    }
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (!canAim) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") setX((v) => clampX(v - step));
    else if (e.key === "ArrowRight") setX((v) => clampX(v + step));
    else if (e.key === "Enter") drop();
    else return;
    e.preventDefault();
  }

  // ---------- 描くもの ----------

  const poses: Pose[] = play ? frameAt(play.anim, play.i) : s.positions;
  /** 止まっている石（落としている最中は、落とす前の石） */
  const settled: Pose[] = play ? play.anim.frames[0]!.slice(0, -1) : s.positions;
  const camera = cameraBottom(s.stones, settled, play ? play.anim.key - 1 : finished ? Stack.STONES : count);
  const ghost = canAim ? Stack.dropPose(s.stones, s.positions, x, angle) : null;
  const height = Math.round(Stack.topOf(s.stones, settled) * 100);
  const left = Stack.STONES - settled.length;

  const nameOf = (seat: Seat) => (seat === you ? t("game.stack.you") : t("game.stack.someone", { name: names[seat] }));
  let note: string | null = null;
  if (play) note = t("game.stack.dropped", { who: nameOf(play.anim.seat) });
  else if (finished && s.last?.collapsed) note = t("game.stack.collapsed", { who: nameOf(s.last.seat) });
  else if (finished) note = t("game.stack.full");
  else if (canAim) note = t("game.stack.aim");
  else if (status.kind === "playing" && status.turn !== you && names[status.turn])
    note = t("game.stack.turnOf", { name: names[status.turn] });

  /** 右上（いまの石は左上）に出す小さな見本。大きさは盤の 7 割 */
  const inset = (label: string, index: number, side: 1 | -1) => (
    <g className="stack-inset" transform={`translate(${(side * VIEW_W) / 2 - side * 0.58} ${-VIEW_H + 0.42})`}>
      <rect x={-0.5} y={-0.34} width={1} height={0.66} rx={0.1} />
      {/* ブラウザの最小の文字サイズに引っかからないよう、大きな数値の文字を縮めて描く */}
      <text x={-42} y={-17} transform="scale(0.01)">
        {label}
      </text>
      <g transform="translate(0 0.08) scale(0.7 -0.7)">
        <StoneShape stone={s.stones[index]!} pose={[0, 0, 0]} index={index} />
      </g>
    </g>
  );
  const upcoming = play ? play.anim.key : count + 1;

  return (
    <div className="stack-board stack-sm">
      <div className="stack-view">
        <svg
          ref={svg}
          className={`stack-svg ${canAim ? "aiming" : ""}`}
          viewBox={`${-VIEW_W / 2} ${-VIEW_H} ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={t("game.stack.board", { cm: height, n: left })}
          tabIndex={canAim ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
        >
          <defs>
            {/* 石の上側を少し明るく、下側を少し暗くする（反転した座標で描くので y は下から上） */}
            <linearGradient id="stack-sheen" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.16" />
            </linearGradient>
          </defs>

          {/* y を上向きにして、見える範囲の下端を盤の下の端に合わせる。塔が伸びたら上へずらす */}
          <g className="stack-world" style={{ transform: `translate(0px, ${camera}px) scale(1, -1)` }}>
            <rect className="stack-ground" x={-VIEW_W} y={GROUND_Y - 4} width={VIEW_W * 2} height={4} />
            <line className="stack-ground-edge" x1={-VIEW_W} y1={GROUND_Y} x2={VIEW_W} y2={GROUND_Y} />
            {/* 左の端の目盛り（50 cm ごと、1 m ごとに数字） */}
            {Array.from({ length: Math.ceil((camera + VIEW_H) / 0.5) }, (_, k) => {
              const y = (k + 1) * 0.5;
              const major = (k + 1) % 2 === 0;
              return (
                <g key={k} className="stack-ruler">
                  <line x1={-VIEW_W / 2} y1={y} x2={-VIEW_W / 2 + (major ? 0.14 : 0.08)} y2={y} />
                  {major && <text transform={`translate(${-VIEW_W / 2 + 0.18} ${y - 0.04}) scale(0.01 -0.01)`}>{y} m</text>}
                </g>
              );
            })}
            {ghost && <line className="stack-guide" x1={ghost[0]} y1={ghost[1]} x2={ghost[0]} y2={GROUND_Y} />}
            <polygon className="stack-rock" points={pointsOf(ROCK_OUTLINE)} />
            {ROCK_CRACKS.map((crack, i) => (
              <polyline key={i} className="stack-crack" points={pointsOf(crack)} />
            ))}
            <line className="stack-rock-top" x1={-Stack.PLATFORM_W / 2} y1={0} x2={Stack.PLATFORM_W / 2} y2={0} />

            {poses.map((pose, i) => (
              <StoneShape
                key={i}
                stone={s.stones[i]!}
                pose={pose}
                index={i}
                className={!play && s.last && i === count - 1 ? "last" : ""}
              />
            ))}

            {ghost && (
              <g className={`stack-ghost seat${count % 2}`}>
                <StoneShape stone={s.stones[count]!} pose={ghost} index={count} className="ghost" />
                {/* 左右に動かせることを示す印 */}
                {[-1, 1].map((dir) => (
                  <path
                    key={dir}
                    className="stack-arrow"
                    d={`M${ghost[0] + dir * (radius(s.stones[count]!) + 0.1)} ${ghost[1] + 0.11}l${dir * 0.1} -0.11l${-dir * 0.1} -0.11`}
                  />
                ))}
              </g>
            )}
          </g>

          {!finished && upcoming < Stack.STONES && inset(t("game.stack.next"), upcoming, 1)}
          {!finished && !play && !canAim && count < Stack.STONES && inset(t("game.stack.now"), count, -1)}
        </svg>

        {s.last && !play && (
          <button type="button" className="stack-replay ghost-button" onClick={replayLast}>
            {t("game.stack.replay")}
          </button>
        )}
      </div>

      {you !== null && !finished && (
        <div className="stack-controls">
          <button type="button" onClick={() => setTurns((k) => normTurns(k + 1))} disabled={!canAim}>
            {t("game.stack.rotateLeft")}
          </button>
          <button type="button" onClick={() => setTurns((k) => normTurns(k - 1))} disabled={!canAim}>
            {t("game.stack.rotateRight")}
          </button>
          <button type="button" className="primary" onClick={drop} disabled={!canAim}>
            {t("game.stack.drop")}
          </button>
        </div>
      )}

      <p className="board-note">
        {note && <span>{note}</span>}
        <span className="muted">{t("game.stack.info", { cm: height, n: left })}</span>
      </p>
    </div>
  );
}
