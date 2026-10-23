import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Korokoro, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import {
  BOARD,
  centerOf,
  circle,
  cubeFaces,
  depthOf,
  EDGE,
  onGround,
  roundedRect,
  TILES,
  VIEW_H,
  VIEW_W,
  type CubePose,
} from "./korokoro/scene.ts";
import "./KorokoroBoard.css";

type State = Korokoro.KorokoroState;
type Roll = Korokoro.Roll;

const N = Korokoro.SIZE;
/** 1 マス転がるのにかける時間（ミリ秒）。全体の始めと終わりは少しゆっくり */
const STEP_MS = 190;
/** 開いたときに直前の手を再生するまでの間（何が起きるか分かるように少し待つ） */
const HOLD_MS = 500;
const OPPOSITE: Record<Korokoro.Dir, Korokoro.Dir> = { up: "down", down: "up", left: "right", right: "left" };
/** これ以上指をすべらせたらスワイプとみなす（px） */
const SWIPE_PX = 24;
const ARROWS: Record<string, Korokoro.Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

interface Anim {
  roll: Roll;
  /** 転がす前の向き */
  faces: Korokoro.Faces;
  start: number;
  duration: number;
}

const reduceMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 盤の下の案内の 1 行 */
interface NoteLine {
  text: string;
  /** 塗る色の文字にするとき */
  seat?: Seat;
  muted?: boolean;
}

const painted = (s: State) => s.board.filter((c) => c !== null).length;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 直前の転がしを、転がす前の向きから動かす準備。転がす前の向きは、反対向きに転がし戻して求める */
function animOf(s: State, start: number): Anim | null {
  const roll = s.lastMove;
  if (!roll) return null;
  const dist = roll.path.length - 1;
  return {
    roll,
    faces: Korokoro.rollBy(s.cube.faces, OPPOSITE[roll.dir], dist),
    start,
    duration: dist * STEP_MS + 120,
  };
}

/** 再生中のキューブの置き方。全体の進み具合を、通るマスの数で割って 1 マスずつ転がす */
function poseAt(anim: Anim, now: number): CubePose {
  const { roll, faces } = anim;
  const dist = roll.path.length - 1;
  const p = easeInOut(Math.min(1, Math.max(0, (now - anim.start) / anim.duration))) * dist;
  const k = Math.min(dist - 1, Math.floor(p));
  return { cell: roll.path[k]!, faces: Korokoro.rollBy(faces, roll.dir, k), roll: { dir: roll.dir, t: p - k } };
}

/**
 * 点を置く位置。キューブのすぐ奥（北）のマスは、まん中だとキューブに隠れるので、奥寄りに置く
 */
function dotAt(cell: number, cube: number): [number, number] {
  const [x, y] = centerOf(cell);
  return cell === cube - N ? [x, y - 0.22] : [x, y];
}

/**
 * 面の明るさに応じた塗り。光の当たる面は白を、当たらない面は黒を少し混ぜる。
 * 黒を混ぜすぎるとオレンジが茶色に見えるので、色が分かる程度にとどめる
 */
function shade(light: number): CSSProperties {
  const k = light - 0.6;
  return {
    "--mix": `${Math.round(100 - Math.abs(k) * (k > 0 ? 40 : 30))}%`,
    "--tone": k > 0 ? "#fff" : "#000",
  } as CSSProperties;
}

function Cube({ pose, className = "", label }: { pose: CubePose; className?: string; label?: string }) {
  const { faces, center } = cubeFaces(pose);
  // 影は、キューブの真下の床に、光と反対の右手前へ少しずらして落とす
  const h = EDGE * 0.56;
  const shadow = onGround(roundedRect(center[0] - h + 0.04, center[1] - h + 0.05, center[0] + h + 0.04, center[1] + h + 0.05, 0.12));
  return (
    <g className={`korokoro-cube ${className}`} role={label ? "img" : undefined} aria-label={label}>
      <polygon points={shadow} className="korokoro-shadow" />
      {faces.map((f) => (
        <polygon
          key={f.face}
          points={f.points}
          className={`korokoro-face seat${f.color}`}
          style={shade(f.light)}
        />
      ))}
    </g>
  );
}

/**
 * ころころの盤。ななめ上から見た 4×4 の盤に、立体のキューブを描く（SVG で、面ごとに計算して描く）。
 * 自分の番には、止まれるマスすべてに「そこに止まると塗られる色」の点を出す。マスをタップすると、
 * そこにキューブの影と塗られる色の影が出て、画面下の「これで決定」で転がす。
 * 新しい手が届いたら（自分の手も）、通ったマスの数だけ転がして見せる。開いたときは、直前の手が相手のものなら再生する
 */
export function KorokoroBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as State;
  const sel = selected as Korokoro.KorokoroMove | null;
  const count = painted(s);

  const [anim, setAnim] = useState<Anim | null>(() =>
    s.lastMove && s.lastMove.seat !== you && !reduceMotion() ? animOf(s, performance.now() + HOLD_MS) : null,
  );
  const [now, setNow] = useState(() => performance.now());
  /** 表示を済ませた手の数（塗ったマスの数） */
  const shown = useRef(count);

  // 塗ったマスが 1 つ増えたら、その転がしを見せる。別の対局に替わったなど、それ以外は止める
  useEffect(() => {
    if (count === shown.current) return;
    const prev = shown.current;
    shown.current = count;
    setAnim(count === prev + 1 && !reduceMotion() ? animOf(s, performance.now()) : null);
  }, [count]);

  // コマ送り。終わったら保存された状態の表示に戻す
  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const tick = (time: number) => {
      setNow(time);
      if (time < anim.start + anim.duration) raf = requestAnimationFrame(tick);
      else setAnim((cur) => (cur === anim ? null : cur));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  const playing = anim !== null;
  // 再生中は、止まったマスの色と勝った並びをまだ出さない
  const hiddenCell = playing ? anim.roll.to : null;
  const canPick = interactive && !playing && !s.finished;
  const dests = canPick ? Korokoro.destinations(s) : [];
  const destAt = new Map(dests.map((d) => [d.to, d]));
  const chosen = sel ? (destAt.get(sel.to) ?? null) : null;
  const win = !playing && s.winLine ? s.winLine : [];
  const winSet = new Set(win);

  const colorName = (c: Seat) => t(`game.korokoro.color${c}`);
  const pose: CubePose = anim ? poseAt(anim, now) : { cell: s.cube.cell, faces: s.cube.faces };
  const ghost: CubePose | null = chosen
    ? { cell: chosen.to, faces: Korokoro.rollBy(s.cube.faces, chosen.dir, chosen.dist) }
    : null;
  // 2 つのキューブは奥にある方から描く
  const cubes = [
    { key: "cube", pose, className: "", label: t("game.korokoro.cube", { color: colorName(s.cube.faces.top) }) },
    ...(ghost ? [{ key: "ghost", pose: ghost, className: "ghost", label: undefined }] : []),
  ].sort((a, b) => depthOf(cubeFaces(b.pose).center) - depthOf(cubeFaces(a.pose).center));

  const cellLabel = (i: number) => t("game.korokoro.cell", { row: Korokoro.rowOf(i) + 1, col: Korokoro.colOf(i) + 1 });
  const pick = (i: number) => destAt.has(i) && onSelect({ to: i });
  const keyPick = (e: KeyboardEvent, i: number) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    pick(i);
  };

  /**
   * スワイプ（または矢印キー）で選ぶ。キューブのいる行・列の上で、選んでいるマスから
   * その向きにある一番近い止まれるマスへ選びなおす（何も選んでいなければキューブから数える）
   */
  function nudge(dir: Korokoro.Dir) {
    const across = (d: Korokoro.Dir) => d === "left" || d === "right";
    const offset = (d: Korokoro.Destination) => (d.dir === "left" || d.dir === "up" ? -d.dist : d.dist);
    const sign = dir === "right" || dir === "down" ? 1 : -1;
    const line = dests.filter((d) => across(d.dir) === across(dir));
    const here = chosen && line.includes(chosen) ? offset(chosen) : 0;
    const next = line
      .filter((d) => (offset(d) - here) * sign > 0)
      .sort((a, b) => Math.abs(offset(a) - here) - Math.abs(offset(b) - here))[0];
    if (next) onSelect({ to: next.to });
  }
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  /** スワイプした直後のクリック（同じマスの上で指を離したとき）は、選びなおしに使わない */
  const swiped = useRef(false);
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    swiped.current = false;
    if (canPick && e.isPrimary) swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== e.pointerId || !canPick) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    swiped.current = true;
    nudge(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };
  const onArrow = (e: KeyboardEvent) => {
    const dir = ARROWS[e.key];
    if (!dir || !canPick) return;
    e.preventDefault();
    nudge(dir);
  };

  // 直前の転がしの道（転がり始めたマスに小さな輪、そこから止まったマスまで線）
  const last = !playing ? s.lastMove : null;
  const trail = last ? [centerOf(last.from), centerOf(last.to)] : null;
  // 勝った並びの線（たてとよこが同時にそろえば 2 本）
  const winLines: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const row = win.filter((c) => Korokoro.rowOf(c) === k);
    if (row.length >= Korokoro.LINE) winLines.push([row[0]!, row[row.length - 1]!]);
    const col = win.filter((c) => Korokoro.colOf(c) === k);
    if (col.length >= Korokoro.LINE) winLines.push([col[0]!, col[col.length - 1]!]);
  }

  const note = noteLines();

  /** 盤の下の案内。高さが変わって画面がずれないよう、いつも 2 行までにする */
  function noteLines(): NoteLine[] {
    if (canPick) {
      return [
        chosen
          ? { text: t("game.korokoro.willPaint", { n: chosen.dist, color: colorName(chosen.color) }), seat: chosen.color }
          : { text: t("game.korokoro.pick") },
        { text: t("game.korokoro.dots"), muted: true },
      ];
    }
    const m = s.lastMove;
    if (!m) return [{ text: t("game.korokoro.paint"), muted: true }];
    const vars = { name: names[m.seat], n: m.path.length - 1, color: colorName(m.color) };
    const rolled = { text: t(m.seat === you ? "game.korokoro.rolledYou" : "game.korokoro.rolled", vars), seat: m.color };
    // 再生中は、終局の知らせをまだ出さない
    if (!s.finished || playing) return [rolled, { text: t("game.korokoro.paint"), muted: true }];
    if (s.winner !== null) return [rolled, { text: t("game.korokoro.lined", { color: colorName(s.winner) }), muted: true }];
    return [rolled, { text: t(s.turn === you ? "game.korokoro.stuckYou" : "game.korokoro.stuck", { name: names[s.turn] }), muted: true }];
  }

  return (
    <div className="korokoro stack-sm">
      <svg
        // 自分の番は、盤の上でのスワイプを選ぶ操作に使う（ページはスクロールしない）
        className={`korokoro-board seat${s.turn} ${canPick ? "picking" : ""}`}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ "--ratio": (VIEW_W / VIEW_H).toFixed(3) } as CSSProperties}
        role="group"
        aria-label={t("game.korokoro.board")}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        onKeyDown={onArrow}
      >
        <polygon points={BOARD.body} className="korokoro-slab" />
        <polygon points={BOARD.top} className="korokoro-top" />

        {s.board.map((cell, i) => {
          const shownCell = i === hiddenCell ? null : cell;
          const d = destAt.get(i);
          const isChosen = chosen?.to === i;
          const label = shownCell === null ? cellLabel(i) : `${cellLabel(i)} ${colorName(shownCell)}`;
          return (
            <polygon
              key={i}
              points={TILES[i]}
              className={[
                "korokoro-tile",
                shownCell !== null && `paint seat${shownCell}`,
                d && "can",
                isChosen && `chosen seat${d!.color}`,
                winSet.has(i) && "win",
                // 塗ったばかりのマスは、色が付くところを見せる（再生中は付けず、終わったときに付ける）
                last && last.to === i && "fresh",
              ]
                .filter(Boolean)
                .join(" ")}
              role={d ? "button" : undefined}
              tabIndex={d ? 0 : undefined}
              aria-pressed={d ? isChosen : undefined}
              aria-label={d ? t("game.korokoro.cellPaint", { cell: label, color: colorName(d.color) }) : label}
              onClick={d ? () => (swiped.current ? (swiped.current = false) : pick(i)) : undefined}
              onKeyDown={d ? (e) => keyPick(e, i) : undefined}
            />
          );
        })}

        {trail && (
          <g className="korokoro-trail" aria-hidden>
            <polyline points={onGround(trail)} />
            <polygon points={onGround(circle(...trail[0]!, 0.13))} className="korokoro-from" />
          </g>
        )}

        {winLines.map(([a, b]) => (
          <polyline key={`${a}-${b}`} points={onGround([centerOf(a), centerOf(b)])} className="korokoro-winline" aria-hidden />
        ))}

        {dests.map((d) =>
          chosen?.to === d.to ? null : (
            <polygon
              key={d.to}
              points={onGround(circle(...dotAt(d.to, s.cube.cell), 0.15))}
              className={`korokoro-dot seat${d.color}`}
              aria-hidden
            />
          ),
        )}

        {cubes.map((c) => (
          <Cube key={c.key} pose={c.pose} className={c.className} label={c.label} />
        ))}
      </svg>

      <p className="board-note">
        {note.map((line, k) => (
          <span key={k} className={[line.muted && "muted", line.seat !== undefined && !line.muted && `paint-text seat${line.seat}`].filter(Boolean).join(" ")}>
            {line.text}
          </span>
        ))}
      </p>

      {s.lastMove && !reduceMotion() && (
        <button
          type="button"
          className="korokoro-replay ghost-button"
          // 再生中も場所は空けておく（ボタンが消えて下の表示がずれないように）
          style={{ visibility: playing ? "hidden" : undefined }}
          onClick={() => setAnim(animOf(s, performance.now()))}
        >
          {t("game.korokoro.replay")}
        </button>
      )}
    </div>
  );
}
