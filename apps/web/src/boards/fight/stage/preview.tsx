import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../styles.css";
import { FallbackStage } from "./FallbackStage.tsx";
import { FighterStage } from "./FighterStage.tsx";
import type { ActionKind, FighterLook, FighterStats, StageEvent, StageStrike, StyleId } from "./types.ts";

/**
 * 開発用の確認ページ（fighter-preview.html）。本番のビルドには入らない。
 * バックボーン・stats・seat・hp・モードを切り替え、攻防をいろいろ再生して、3D の舞台を確かめる。
 * Playwright から動かせるよう、window.__fs にも同じ操作を置く
 */

const STYLES: StyleId[] = [
  "boxing",
  "muaythai",
  "karate",
  "taekwondo",
  "judo",
  "bjj",
  "wrestling",
  "mma",
  "capoeira",
  "sumo",
  "kickboxing",
  "taichi",
  "gamer",
  "magician",
  "nurse",
  "swimmer",
  "idol",
  "rapper",
  "chef",
  "robot",
  "ninja",
  "tuktuk",
  "stuntman",
  "salaryman",
  "bubbletea",
];
const KINDS: ActionKind[] = [
  "jab",
  "straight",
  "hook",
  "uppercut",
  "kick_high",
  "kick_mid",
  "kick_low",
  "spin_kick",
  "knee",
  "elbow",
  "push",
  "clinch",
  "takedown",
  "throw",
  "submission",
  "block",
  "dodge",
  "counter",
  "projectile",
  "swing",
  "perform",
  "heal",
  "vanish",
];
const RESULTS: StageStrike["result"][] = ["hit", "blocked", "dodged", "countered", "whiff"];
const STAT_KEYS: (keyof FighterStats)[] = ["power", "guard", "speed", "stamina"];

interface State {
  fighters: [FighterLook | null, FighterLook | null];
  mode: "custom" | "fight";
  focus: 0 | 1;
  me: 0 | 1;
  hp: [number, number];
}

const params = new URLSearchParams(location.search);
const statsOf = (v: string | null): FighterStats => {
  const [power = 5, guard = 5, speed = 5, stamina = 5] = (v ?? "").split(",").map(Number).filter((n) => n > 0);
  return { power, guard, speed, stamina };
};
const lookOf = (style: string | null, stats: string | null, seat: 0 | 1): FighterLook | null =>
  style === "none" ? null : { style: (style as StyleId) ?? (seat === 0 ? "boxing" : "muaythai"), stats: statsOf(stats), seat };

const initial: State = {
  fighters: [lookOf(params.get("s0"), params.get("st0"), 0), lookOf(params.get("s1"), params.get("st1"), 1)],
  mode: params.get("mode") === "fight" ? "fight" : "custom",
  focus: params.get("focus") === "1" ? 1 : 0,
  me: params.get("me") === "1" ? 1 : 0,
  hp: [Number(params.get("hp0") ?? 100), Number(params.get("hp1") ?? 100)],
};

declare global {
  interface Window {
    __fs?: {
      set(patch: Partial<State>): void;
      look(seat: 0 | 1, look: Partial<FighterLook> | null): void;
      play(strikes: StageStrike[], position?: StageEvent["position"], ko?: 0 | 1 | null): number;
      done: number[];
    };
  }
}

function Preview() {
  const [s, setS] = useState<State>(initial);
  const [event, setEvent] = useState<StageEvent | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [width, setWidth] = useState(Number(params.get("w") ?? 0) || 0);
  const nextId = useRef(1);
  const [by, setBy] = useState<0 | 1>(0);
  const [result, setResult] = useState<StageStrike["result"]>("hit");
  const [after, setAfter] = useState<StageEvent["position"]>("standing");
  const [ko, setKo] = useState(false);
  const done = useRef<number[]>([]);
  // 2D（WebGL が使えないとき）の舞台を確かめる
  const [flat, setFlat] = useState(params.get("flat") === "1");

  const play = (strikes: StageStrike[], position: StageEvent["position"] = after, k: 0 | 1 | null = null) => {
    const id = nextId.current++;
    setEvent({ id, strikes, position, ko: k });
    return id;
  };
  const edit = (seat: 0 | 1, patch: Partial<FighterLook> | null) =>
    setS((p) => {
      const f = [...p.fighters] as State["fighters"];
      const cur = f[seat] ?? { style: "boxing" as StyleId, stats: { power: 5, guard: 5, speed: 5, stamina: 5 }, seat };
      f[seat] = patch === null ? null : { ...cur, ...patch, stats: { ...cur.stats, ...patch.stats } };
      return { ...p, fighters: f };
    });

  useEffect(() => {
    window.__fs = {
      set: (patch) => setS((p) => ({ ...p, ...patch })),
      look: edit,
      play,
      done: done.current,
    };
  });

  const seat = s.mode === "custom" ? s.focus : by;
  const f = s.fighters[seat];
  return (
    <div className="pv">
      <div className="pv-stage" style={width ? { width } : undefined}>
        {flat ? (
          <div className="fighter-stage fallback">
            <FallbackStage
              fighters={s.fighters}
              mode={s.mode}
              focus={s.focus}
              me={s.me}
              hp={s.hp}
              event={event}
              active
              onEventDone={(id) => {
                done.current.push(id);
                setLog((l) => [`done ${id}`, ...l].slice(0, 6));
              }}
            />
          </div>
        ) : (
          <FighterStage
            fighters={s.fighters}
            mode={s.mode}
            focus={s.focus}
            me={s.me}
            hp={s.hp}
            event={event}
            onEventDone={(id) => {
              done.current.push(id);
              setLog((l) => [`done ${id}`, ...l].slice(0, 6));
            }}
          />
        )}
      </div>
      <div className="pv-row">
        <button className={s.mode === "custom" ? "on" : ""} onClick={() => setS({ ...s, mode: "custom" })}>
          キャラ作り
        </button>
        <button className={s.mode === "fight" ? "on" : ""} onClick={() => setS({ ...s, mode: "fight" })}>
          対戦
        </button>
        <button onClick={() => setS({ ...s, focus: s.focus === 0 ? 1 : 0 })}>focus: {s.focus}</button>
        <button onClick={() => setS({ ...s, me: s.me === 0 ? 1 : 0 })}>me: {s.me}</button>
        <button className={flat ? "on" : ""} onClick={() => setFlat(!flat)}>
          2D
        </button>
        <select value={width} onChange={(e) => setWidth(Number(e.target.value))}>
          <option value={0}>幅：いっぱい</option>
          <option value={320}>320</option>
          <option value={358}>358</option>
          <option value={408}>408</option>
        </select>
      </div>
      <div className="pv-row">
        <span>seat {seat}</span>
        <select value={f?.style ?? "none"} onChange={(e) => edit(seat, e.target.value === "none" ? null : { style: e.target.value as StyleId })}>
          <option value="none">（未定）</option>
          {STYLES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <button onClick={() => edit(seat, { style: STYLES[(STYLES.indexOf(f?.style ?? "sumo") + 1) % STYLES.length]! })}>次</button>
      </div>
      {f && (
        <div className="pv-grid">
          {STAT_KEYS.map((k) => (
            <label key={k}>
              {k} {f.stats[k]}
              <input type="range" min={1} max={8} value={f.stats[k]} onChange={(e) => edit(seat, { stats: { ...f.stats, [k]: Number(e.target.value) } })} />
            </label>
          ))}
        </div>
      )}
      <div className="pv-grid">
        {([0, 1] as const).map((i) => (
          <label key={i}>
            hp{i} {s.hp[i]}
            <input
              type="range"
              min={0}
              max={100}
              value={s.hp[i]}
              onChange={(e) => {
                const hp = [...s.hp] as [number, number];
                hp[i] = Number(e.target.value);
                setS({ ...s, hp });
              }}
            />
          </label>
        ))}
      </div>
      <div className="pv-row">
        <button onClick={() => setBy(by === 0 ? 1 : 0)}>攻める人: {by}</button>
        <select value={result} onChange={(e) => setResult(e.target.value as StageStrike["result"])}>
          {RESULTS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select value={after} onChange={(e) => setAfter(e.target.value as StageEvent["position"])}>
          <option>standing</option>
          <option>clinch</option>
          <option>ground</option>
        </select>
        <label>
          <input type="checkbox" checked={ko} onChange={(e) => setKo(e.target.checked)} /> KO
        </label>
      </div>
      <div className="pv-kinds">
        {KINDS.map((k) => (
          <button key={k} onClick={() => play([{ by, kind: k, result, damage: result === "hit" ? 12 : 0 }], after, ko ? (by === 0 ? 1 : 0) : null)}>
            {k}
          </button>
        ))}
        <button onClick={() => play([{ by, kind: "heal", result: "hit", damage: 0, heal: 12 }], after)}>回復 +12</button>
        <button
          onClick={() =>
            play(
              [
                {
                  by,
                  kind: "perform",
                  result: "hit",
                  damage: 0,
                  effects: [
                    { who: by === 0 ? 1 : 0, stat: "power", dir: -1 },
                    { who: by === 0 ? 1 : 0, stat: "guard", dir: -1 },
                    { who: by, stat: "speed", dir: 1 },
                    { who: by, stat: "stamina", dir: 1 },
                  ],
                },
              ],
              after,
            )
          }
        >
          強化・弱体
        </button>
        <button
          onClick={() =>
            play(
              [
                { by: by === 0 ? 1 : 0, kind: "straight", result: "dodged", damage: 0 },
                { by, kind: "vanish", result: "hit", damage: 0 },
              ],
              after,
            )
          }
        >
          消えてかわす
        </button>
        <button
          onClick={() =>
            play(
              [
                { by, kind: "jab", result: "blocked", damage: 0 },
                { by: by === 0 ? 1 : 0, kind: "kick_mid", result: "hit", damage: 14 },
              ],
              after,
            )
          }
        >
          2 手
        </button>
      </div>
      <pre className="pv-log">{log.join("\n")}</pre>
    </div>
  );
}

const css = `
.pv { max-width: 460px; margin: 0 auto; padding: 12px 16px 40px; display: grid; gap: 10px; }
.pv-stage { margin: 0 auto; width: 100%; }
.pv-row, .pv-kinds { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; font-size: 13px; }
.pv-grid input { width: 100%; }
.pv button, .pv select { font: inherit; font-size: 13px; padding: 4px 9px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.pv button.on { background: var(--ink); color: var(--surface); }
.pv-log { font-size: 11px; color: var(--muted); margin: 0; min-height: 3em; }
`;
const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
