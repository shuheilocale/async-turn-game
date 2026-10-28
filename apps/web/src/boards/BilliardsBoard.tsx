import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Billiards, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import type * as Physics from "./billiards/physics.ts";
import { BREAK_POWER, DEFAULT_POWER, speedOf, STEP, wrapAngle } from "./billiards/table.ts";
import { aimGuide, placeNear } from "./billiards/aim.ts";
import { ballsAt, durationOf, lastFrame, restingBalls, restingQuat, withSim, type Clip } from "./billiards/playback.ts";
import { layoutFor, TableRenderer, toTable, upOf, type Layout } from "./billiards/render.ts";
import { ballHex } from "./billiards/colors.ts";
import { shotText } from "./billiards/text.ts";
import "./BilliardsBoard.css";

const { CUE, EIGHT, BALL_R, HEAD_SPOT } = Billiards;

/** 物理演算（planck）は、この盤を開いたときに初めて読み込む */
let physics: Promise<typeof Physics> | null = null;
const loadPhysics = () =>
  (physics ??= import("./billiards/physics.ts").catch((e) => {
    physics = null;
    throw e;
  }));

/** 再生を始める前に、打つ前の様子を見せておく時間（ミリ秒） */
const HOLD_MS = 700;
/** 1 打が止まってから、次の打の再生（か、ふだんの表示）へ移るまで */
const AFTER_MS = 1100;
/** 「少し左・右」で回す角度（ラジアン。0.2 度） */
const NUDGE = (0.2 * Math.PI) / 180;
/** この幅より広ければ台を横に置く */
const WIDE = 520;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 保存された 1 打を再生する準備（計算はあとで） */
const clipOf = (shot: Billiards.Shot, start: number): Clip => ({
  n: shot.n,
  before: shot.before,
  angle: shot.angle,
  speed: shot.speed,
  spin: shot.spin,
  target: shot.after,
  sim: null,
  start,
  roll: null,
  rest: null,
});

interface Play {
  clips: Clip[];
  idx: number;
}

/** ねらいのはじめの向き：手球からいちばん近い、当ててよい球へ（ブレイクならラックの先頭へ） */
function defaultAim(s: Billiards.BilliardsState, seat: Seat, cue: { x: number; y: number }): number {
  if (s.breaking) return Math.atan2(-cue.y, Billiards.FOOT_X - cue.x);
  const targets = Billiards.targetsOf(s, seat);
  const ids = new Set(targets.length > 0 ? targets : [EIGHT]);
  let best: Billiards.Ball | null = null;
  for (const b of s.balls) {
    if (!ids.has(b.id)) continue;
    if (!best || Math.hypot(b.x - cue.x, b.y - cue.y) < Math.hypot(best.x - cue.x, best.y - cue.y)) best = b;
  }
  return best ? Math.atan2(best.y - cue.y, best.x - cue.x) : 0;
}

/**
 * ビリヤード（8 ボール）の盤。上から見た台を canvas に描く。自分の番には、台をドラッグして向きを決め、
 * 強さと回転（押し・引き）を選んで「打つ」。打った瞬間に止まるまでを計算して結果を送り、動きを見せる。
 * フリーボールとブレイクでは、手球をドラッグして置ける。相手の打は、開いたとき・届いたときに、
 * 打つ前の配置と打ち方から計算し直して再生し、最後は保存された位置にそろえる（続けて打った打は順に全部）
 */
export function BilliardsBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Billiards.BilliardsState;
  const seq = s.shots;
  const finished = status.kind === "finished";
  const turn = status.kind === "playing" ? status.turn : null;

  const [busy, setBusy] = useState(false);
  const [power, setPower] = useState(s.breaking ? BREAK_POWER : DEFAULT_POWER);
  const [spin, setSpin] = useState(0);
  /** 置いた手球（フリーボール・ブレイクのとき）。null なら台の上の手球のまま */
  const [placed, setPlaced] = useState<[number, number] | null>(null);
  const [angle, setAngle] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [dragging, setDragging] = useState<"aim" | "place" | null>(null);
  // 開いたとき、いちばん新しいひと続きの打が相手のものなら再生する（自分のものは「もう一度見る」で見られる）
  const [play, setPlay] = useState<Play | null>(() => {
    const run = s.run;
    if (run.length === 0 || run[0]!.seat === you) return null;
    const now = performance.now() + HOLD_MS;
    return { clips: run.map((r) => clipOf(r, now)), idx: 0 };
  });
  /** いま再生している打の結果の見出し（止まってから出す） */
  const [caption, setCaption] = useState<number | null>(null);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<TableRenderer | null>(null);
  /** 表示を済ませた打の数 */
  const shown = useRef(seq);
  /** この画面で自分が打った打の番号 */
  const local = useRef(new Set<number>());
  const seqRef = useRef(seq);
  seqRef.current = seq;
  const submit = useRef(onSubmit);
  submit.current = onSubmit;
  const drag = useRef<{ id: number; kind: "aim" | "place" } | null>(null);

  const cueOnTable = s.balls.find((b) => b.id === CUE) ?? null;
  const canAim = interactive && !finished && !play && !busy && turn !== null;
  const canPlace = canAim && (s.inHand || s.breaking);
  /** 打つ前の手球の位置 */
  const cue = useMemo((): { x: number; y: number } | null => {
    if (placed) return { x: placed[0], y: placed[1] };
    if (cueOnTable) return cueOnTable;
    if (!canPlace) return null;
    const spot = placeNear(HEAD_SPOT[0], HEAD_SPOT[1], s.balls, s.breaking);
    return spot ? { x: spot[0], y: spot[1] } : null;
  }, [placed, cueOnTable, canPlace, s.balls, s.breaking]);

  // 手番が来たら（打の数が変わったら）、置いた手球・ねらい・強さを決め直す
  const aimKey = `${seq}:${turn}:${canAim}`;
  useEffect(() => {
    setPlaced(null);
    if (turn === null) return;
    const from = cueOnTable ?? (() => {
      const spot = placeNear(HEAD_SPOT[0], HEAD_SPOT[1], s.balls, s.breaking);
      return spot ? { x: spot[0], y: spot[1] } : { x: HEAD_SPOT[0], y: HEAD_SPOT[1] };
    })();
    setAngle(defaultAim(s, turn, from));
    if (s.breaking) setPower(BREAK_POWER);
    else setPower((p) => (p > 0.8 ? DEFAULT_POWER : p));
    setSpin(0);
  }, [aimKey]);

  useEffect(() => {
    loadPhysics().catch(() => {});
  }, []);

  // 打の数が変わったら、相手の新しい打を再生する
  useEffect(() => {
    if (seq === shown.current) return;
    const prev = shown.current;
    shown.current = seq;
    if (seq < prev) {
      setPlay(null);
      return;
    }
    if (local.current.has(seq)) return;
    const fresh = s.run.filter((r) => r.n > prev && !local.current.has(r.n));
    if (fresh.length === 0) return;
    const now = performance.now() + HOLD_MS;
    setPlay({ clips: fresh.map((r) => clipOf(r, now)), idx: 0 });
  }, [seq]);

  // 台の大きさ：幅いっぱい。スマホの縦の画面では台を縦に置き、高さは画面に収める
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const vertical = width < WIDE;
      const vh = window.innerHeight;
      const maxH = vertical ? Math.max(380, vh - 150) : Math.max(260, vh - 200);
      setLayout((cur) => {
        const next = layoutFor(width, maxH, vertical);
        return cur && cur.width === next.width && cur.height === next.height && cur.vertical === next.vertical ? cur : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ---------- 描く ----------

  const q0 = useMemo(() => restingQuat(upOf(layout ?? { vertical: true })), [layout?.vertical]);
  /** 描くのに使う最新の値（requestAnimationFrame の中から読む） */
  const view = useRef({ play, s, cue, angle, power, canAim, canPlace, dragging, q0 });
  view.current = { play, s, cue, angle, power, canAim, canPlace, dragging, q0 };

  const draw = (now = performance.now()) => {
    const r = renderer.current;
    const v = view.current;
    if (!r) return;
    const p = v.play;
    if (p) {
      const clip = p.clips[p.idx]!;
      const i = clip.sim ? clamp(Math.floor((now - clip.start) / 1000 / STEP), 0, lastFrame(clip)) : 0;
      r.draw({ balls: ballsAt(clip, i, v.q0) });
      return;
    }
    let balls = v.s.balls.filter((b) => b.id !== CUE);
    if (v.cue) balls = [{ id: CUE, x: v.cue.x, y: v.cue.y }, ...balls];
    const guide =
      v.canAim && v.cue && v.dragging !== "place"
        ? { cue: v.cue, angle: v.angle, power: v.power, guide: aimGuide(balls, v.cue, v.angle) }
        : null;
    r.draw({ balls: restingBalls(balls, v.q0), guide, placing: v.canPlace ? { dragging: v.dragging === "place" } : null });
  };

  useLayoutEffect(() => {
    if (!canvas.current || !layout) return;
    renderer.current ??= new TableRenderer(canvas.current);
    renderer.current.resize(layout, window.devicePixelRatio || 1);
    draw();
  }, [layout]);

  // ふだんの表示は、変わったときだけ描き直す
  useEffect(() => {
    if (!play) draw();
  });

  // 再生：1 コマずつ描く。止まったら少し見せてから、次の打へ（最後なら、ふだんの表示へ）
  const clip = play ? play.clips[play.idx]! : null;
  useEffect(() => {
    if (!play || !clip) return;
    // 計算がまだなら、打つ前の配置と打ち方から計算し直す
    if (!clip.sim) {
      let alive = true;
      loadPhysics().then(
        (p) => {
          if (!alive) return;
          const sim = p.simulateShot(clip.before, clip.angle, clip.speed, clip.spin);
          const ready = withSim(clip, sim, performance.now() + (play.idx > 0 ? 250 : 0));
          setPlay((cur) => (cur && cur.clips[cur.idx] === clip ? { ...cur, clips: cur.clips.map((c) => (c === clip ? ready : c)) } : cur));
        },
        // 読み込めなければ再生はあきらめて、止まった位置を出す
        () => alive && setPlay(null),
      );
      draw();
      return () => {
        alive = false;
      };
    }
    let raf = 0;
    let captioned = false;
    const end = clip.start + durationOf(clip);
    const tick = (now: number) => {
      draw(now);
      if (now >= end && !captioned) {
        captioned = true;
        setCaption(clip.n);
      }
      if (now >= end + AFTER_MS) {
        if (play.idx + 1 < play.clips.length) {
          setCaption(null);
          setPlay((cur) => (cur && cur.clips[cur.idx] === clip ? { ...cur, idx: cur.idx + 1 } : cur));
          return;
        }
        // 自分の打は、送れて表示が追いつくまで待つ
        if (seqRef.current >= clip.n) {
          setCaption(null);
          setPlay((cur) => (cur && cur.clips[cur.idx] === clip ? null : cur));
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, clip]);

  // ---------- 打つ ----------

  async function shoot() {
    if (!canAim || !cue) return;
    setBusy(true);
    try {
      const p = await loadPhysics();
      const before: Billiards.Ball[] = [{ id: CUE, x: round4(cue.x), y: round4(cue.y) }, ...s.balls.filter((b) => b.id !== CUE)];
      const a = round4(wrapAngle(angle));
      const speed = round4(speedOf(power));
      const sp = Math.round(spin * 100) / 100;
      const sim = p.simulateShot(before, a, speed, sp);
      const n = seq + 1;
      local.current.add(n);
      const target = sim.balls.map(([id, x, y]) => ({ id, x, y }));
      const now = performance.now();
      const shot = withSim({ n, before, angle: a, speed, spin: sp, target, sim: null, start: now, roll: null, rest: null }, sim, now);
      setCaption(null);
      setPlay({ clips: [shot], idx: 0 });
      const placedCue = placed || !cueOnTable ? { cue: [round4(cue.x), round4(cue.y)] as [number, number] } : {};
      const ok = await submit.current({
        ...placedCue,
        angle: a,
        speed,
        spin: sp,
        pocketed: sim.pocketed,
        firstHit: sim.firstHit,
        balls: sim.balls,
      });
      if (!ok) {
        local.current.delete(n);
        setPlay((cur) => (cur?.clips[0] === shot ? null : cur));
      }
    } finally {
      setBusy(false);
    }
  }

  function replay() {
    if (s.run.length === 0) return;
    setCaption(null);
    const now = performance.now() + 300;
    setPlay({ clips: s.run.map((r) => clipOf(r, now)), idx: 0 });
  }

  /** 再生を最後まで飛ばす（続けて打った打もまとめて） */
  function skip() {
    setPlay((cur) => {
      if (!cur) return cur;
      const last = cur.clips[cur.clips.length - 1]!;
      // 自分の打で、まだ送れていなければ、止まったところで待つ
      if (seqRef.current < last.n && last.sim) {
        return { clips: [{ ...last, start: performance.now() - durationOf(last) }], idx: 0 };
      }
      return null;
    });
    setCaption(null);
  }

  // ---------- ドラッグ・キー操作 ----------

  const tableAt = (e: PointerEvent<HTMLCanvasElement>): [number, number] | null => {
    if (!layout) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    return toTable(layout, e.clientX - rect.left, e.clientY - rect.top);
  };

  function aimAt(x: number, y: number) {
    if (!cue) return;
    // 手球のすぐ近くでは向きが定まらないので変えない
    if (Math.hypot(x - cue.x, y - cue.y) < 2.2 * BALL_R) return;
    setAngle(Math.atan2(y - cue.y, x - cue.x));
  }

  function placeAt(x: number, y: number) {
    const spot = placeNear(x, y, s.balls, s.breaking);
    if (spot) setPlaced(spot);
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!canAim || !e.isPrimary) return;
    const p = tableAt(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    // 手球の近くを押したら、手球を動かす（置けるときだけ）
    const near = cue && Math.hypot(p[0] - cue.x, p[1] - cue.y) < 3.2 * BALL_R;
    const kind = canPlace && near ? "place" : "aim";
    drag.current = { id: e.pointerId, kind };
    setDragging(kind);
    if (kind === "aim") aimAt(p[0], p[1]);
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = tableAt(e);
    if (!p) return;
    if (d.kind === "place") placeAt(p[0], p[1]);
    else aimAt(p[0], p[1]);
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    if (!canAim) return;
    const fine = e.shiftKey ? 0.25 : 1;
    if (e.key === "ArrowLeft") setAngle((a) => a + NUDGE * 2 * fine);
    else if (e.key === "ArrowRight") setAngle((a) => a - NUDGE * 2 * fine);
    else if (e.key === "ArrowUp") setPower((v) => clamp(v + 0.02 * fine, 0, 1));
    else if (e.key === "ArrowDown") setPower((v) => clamp(v - 0.02 * fine, 0, 1));
    else if (e.key === "Enter") shoot();
    else return;
    e.preventDefault();
  }

  // ---------- 文 ----------

  const seatName = (seat: Seat) => t(`game.billiards.seat${seat}`);
  // お試しでは名前が色の名前（青・オレンジ）なので、「さん」を付けない
  // （お試しでは 2 人分を打つので「あなた」とも呼ばない）
  const nameOf = (seat: Seat) =>
    names[seat] === seatName(seat) ? names[seat] : seat === you ? t("game.billiards.you") : t("game.billiards.someone", { name: names[seat] });

  // 再生している間は、組と残りの球を、その打の前の様子で出す（先に結果がわからないように）
  const shownState: Billiards.BilliardsState =
    play && clip
      ? {
          ...s,
          balls: clip.before,
          solids: s.run.some((r) => r.n >= clip.n && r.assigned) ? null : s.solids,
          inHand: false,
        }
      : s;

  const lastShot = s.run.at(-1) ?? null;
  const captionShot = caption !== null ? s.run.find((r) => r.n === caption) : null;
  let note: string | null = null;
  let result: string | null = null;
  if (play && clip) {
    const shot = s.run.find((r) => r.n === clip.n);
    const who = shot ? nameOf(shot.seat) : turn !== null ? nameOf(turn) : "";
    const inRun = s.run.findIndex((r) => r.n === clip.n);
    note = play.clips.length > 1 && inRun >= 0 ? t("game.billiards.shotN", { who, n: inRun + 1 }) : t("game.billiards.shooting", { who });
    if (captionShot) result = shotText(t, captionShot, nameOf);
  } else {
    if (canAim) {
      if (s.breaking) note = t("game.billiards.aimBreak");
      else if (s.inHand) note = t("game.billiards.aimInHand");
      else if (Billiards.onEight(s, turn!)) note = t("game.billiards.aimEight");
      else note = t("game.billiards.aim");
    } else if (turn !== null && turn !== you && names[turn]) note = t("game.billiards.turnOf", { name: names[turn] });
    if (lastShot) result = shotText(t, lastShot, nameOf);
  }

  return (
    <div className="billiards-board stack-sm">
      <Players s={shownState} names={names} you={you} turn={finished || play ? null : turn} />

      <div ref={wrap} className={`billiards-wrap ${layout?.vertical ? "is-vertical" : "is-wide"}`}>
        <div className="billiards-table" style={layout ? { width: layout.width, height: layout.height } : undefined}>
          <canvas
            ref={canvas}
            className={`billiards-canvas ${canAim ? "aiming" : ""} ${dragging ? "dragging" : ""}`}
            tabIndex={canAim ? 0 : -1}
            role="img"
            aria-label={t("game.billiards.board")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          />
          {play ? (
            <button type="button" className="billiards-pill billiards-replay" onClick={skip}>
              {t("game.billiards.skip")}
            </button>
          ) : (
            s.run.length > 0 && (
              <button type="button" className="billiards-pill billiards-replay" onClick={replay}>
                <ReplayIcon />
                {t("game.billiards.replay")}
              </button>
            )
          )}
          {play && captionShot && (
            <p className={`billiards-caption ${captionShot.foul ? "foul" : ""}`} role="status">
              {shotText(t, captionShot, nameOf)}
            </p>
          )}
        </div>
      </div>

      {you !== null && !finished && (
        <div className={`billiards-controls ${canAim ? "" : "off"}`}>
          <SpinPad value={spin} onChange={setSpin} disabled={!canAim} />
          <div className="billiards-power">
            <label htmlFor="billiards-power">
              <span>{t("game.billiards.power")}</span>
              <b>{Math.round(power * 100)}</b>
            </label>
            <input
              id="billiards-power"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={power}
              disabled={!canAim}
              onChange={(e) => setPower(Number(e.currentTarget.value))}
              style={{ "--p": `${power * 100}%` } as CSSProperties}
            />
          </div>
          <div className="billiards-shootrow">
            <NudgeButton dir={1} label={t("game.billiards.left1")} disabled={!canAim} onNudge={() => setAngle((a) => a + NUDGE)} />
            <button type="button" className="primary billiards-shoot" onClick={shoot} disabled={!canAim || !cue}>
              {t("game.billiards.shoot")}
            </button>
            <NudgeButton dir={-1} label={t("game.billiards.right1")} disabled={!canAim} onNudge={() => setAngle((a) => a - NUDGE)} />
          </div>
        </div>
      )}

      <p className="board-note">
        {note && <span>{note}</span>}
        {result && !play && <span className="muted">{result}</span>}
      </p>
    </div>
  );
}

/** 2 人の組と残りの球。手番の人を光らせ、フリーボールの印も出す */
function Players({
  s,
  names,
  you,
  turn,
}: {
  s: Billiards.BilliardsState;
  names: Record<Seat, string>;
  you: Seat | null;
  turn: Seat | null;
}) {
  const { t } = useI18n();
  const onTable = new Set(s.balls.map((b) => b.id));
  return (
    <div className="billiards-players">
      {([0, 1] as Seat[]).map((seat) => {
        const group = Billiards.groupOfSeat(s, seat);
        const ids = group === "solid" ? [1, 2, 3, 4, 5, 6, 7] : group === "stripe" ? [9, 10, 11, 12, 13, 14, 15] : [];
        const left = ids.filter((id) => onTable.has(id)).length;
        return (
          <div key={seat} className={`billiards-player seat${seat} ${turn === seat ? "turn" : ""}`}>
            <div className="billiards-who">
              <span className="billiards-dot" aria-hidden />
              <span className="billiards-name">{names[seat] || t(`game.billiards.seat${seat}`)}</span>
              {seat === you && <span className="billiards-you">{t("game.billiards.you")}</span>}
              {turn === seat && s.inHand && <span className="billiards-tag">{t("game.billiards.inHand")}</span>}
            </div>
            <div className="billiards-group">
              {group ? (
                <>
                  <span className="billiards-gname">{t(`game.billiards.${group}`)}</span>
                  <span className="billiards-mini" role="img" aria-label={left > 0 ? t("game.billiards.left", { n: left }) : t("game.billiards.onEight")}>
                    {ids.map((id) => (
                      <MiniBall key={id} id={id} gone={!onTable.has(id)} />
                    ))}
                    {left === 0 && <MiniBall id={EIGHT} gone={!onTable.has(EIGHT)} />}
                  </span>
                </>
              ) : (
                <span className="billiards-gname muted" title={t("game.billiards.open")}>
                  {t("game.billiards.openShort")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 小さな球（番号つき）。入った球はうすく */
function MiniBall({ id, gone }: { id: number; gone: boolean }) {
  const color = ballHex(id);
  const stripe = id >= 9;
  return (
    <i className={`billiards-ball ${stripe ? "stripe" : ""} ${gone ? "gone" : ""}`} style={{ "--ball": color } as CSSProperties}>
      <b>{id}</b>
    </i>
  );
}

/** 手球のどこを打つか（上下）。上を押すと押し球、下を押すと引き球。まん中の近くは回転なし */
function SpinPad({ value, onChange, disabled }: { value: number; onChange(v: number): void; disabled: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const set = (clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = -((clientY - rect.top) / rect.height - 0.5) / 0.38;
    const c = clamp(v, -1, 1);
    onChange(Math.abs(c) < 0.12 ? 0 : Math.round(c * 20) / 20);
  };
  const label = value > 0 ? t("game.billiards.spinFollow") : value < 0 ? t("game.billiards.spinDraw") : t("game.billiards.spinNone");
  return (
    <div className="billiards-spin">
      <div
        ref={ref}
        className={`billiards-spinpad ${disabled ? "off" : ""}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t("game.billiards.spin")}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={label}
        aria-disabled={disabled}
        title={t("game.billiards.spinHelp")}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = e.pointerId;
          set(e.clientY);
        }}
        onPointerMove={(e) => active.current === e.pointerId && set(e.clientY)}
        onPointerUp={() => (active.current = null)}
        onPointerCancel={() => (active.current = null)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowUp") onChange(clamp(Math.round((value + 0.25) * 4) / 4, -1, 1));
          else if (e.key === "ArrowDown") onChange(clamp(Math.round((value - 0.25) * 4) / 4, -1, 1));
          else return;
          e.preventDefault();
        }}
      >
        <svg viewBox="0 0 40 40" aria-hidden>
          <path d="M8 20h24M20 6v28" className="billiards-spin-cross" />
          <circle cx="20" cy={20 - value * 13} r="4.2" className="billiards-spin-dot" />
        </svg>
      </div>
      <span className="billiards-spin-label">{label}</span>
    </div>
  );
}

/** 少しずつ向きを変えるボタン。押し続けると続けて回る */
function NudgeButton({ dir, label, disabled, onNudge }: { dir: 1 | -1; label: string; disabled: boolean; onNudge(): void }) {
  const timer = useRef<number | null>(null);
  const nudge = useRef(onNudge);
  nudge.current = onNudge;
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const start = () => {
    nudge.current();
    let delay = 380;
    const again = () => {
      nudge.current();
      delay = Math.max(40, delay * 0.7);
      timer.current = window.setTimeout(again, delay);
    };
    timer.current = window.setTimeout(again, delay);
  };
  return (
    <button
      type="button"
      className="billiards-nudge"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          nudge.current();
        }
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {dir === 1 ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

function ReplayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="billiards-icon" aria-hidden>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}
