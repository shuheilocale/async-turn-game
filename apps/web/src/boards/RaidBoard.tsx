import { useEffect, useRef, useState, type ReactNode } from "react";
import { Fight, other, Raid, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { Figure } from "./fight/stage/FallbackStage.tsx";
import { StyleIcon } from "./fight/art.tsx";
import { BossArt, BossIcon, type Mood } from "./raid/bosses.tsx";
import "./fight/stage/FighterStage.css";
import "./RaidBoard.css";

type StyleId = Fight.StyleId;
type Act = Raid.Act;
type RoundLog = Raid.RoundLog;
type View = Raid.RaidView;
const {
  BOSS_COUNT,
  MAX_ROUNDS,
  EFFECT_ROUNDS,
  EFFECT_MUL,
  SPECIAL,
  SPECIAL_HIT,
  BOSS_GUARD_MUL,
  BOSS_CHARGE_MUL,
  ROLE_OF,
  actsFor,
  firstPicker,
  heroOf,
  intentDamage,
  resolve,
  restBreakOf,
} = Raid;

const ROLES = ["attack", "tank", "healer", "support"] as const;
type Role = (typeof ROLES)[number];
const roleOf = (style: StyleId): Role => ROLE_OF[heroOf(style).special];

/** 結果の再生の長さ（ミリ秒）。CSS の raid-* のアニメーションの遅れと合わせる */
const PLAY_MS = 2300;

/* ---------- 言葉 ---------- */

/** 見る人に合わせた呼び方（見ている人は「あなた」、相手は「〇〇さん」）と、キャラ・行動・必殺技の言葉 */
function useWords(you: Seat | null, names: Record<Seat, string>) {
  const { t } = useI18n();
  const nameOf = (seat: Seat) => names[seat] || t(`game.raid.seat${seat}`);
  const who = (seat: Seat) => (seat === you ? t("game.raid.you") : t("game.raid.who", { name: nameOf(seat) }));
  const styleName = (style: StyleId) => t(`game.fight.style.${style}`).replaceAll("​", "");
  const spName = (style: StyleId) => t(`game.fight.move.${style}.${heroOf(style).act}`);
  const actName = (act: Act, style: StyleId | undefined) => (act === "special" && style ? spName(style) : t(`game.raid.act.${act}`));
  const bossName = (boss: Raid.BossId) => t(`game.raid.boss.${boss}`);
  const moveName = (boss: Raid.BossId, kind: Raid.IntentKind) => t(`game.raid.move.${boss}.${kind}`);
  return { t, who, nameOf, styleName, spName, actName, bossName, moveName };
}
type Words = ReturnType<typeof useWords>;

/** 必殺技の説明（1 行目）と、添える注意（起こせる・重ねられる） */
function specialLines(t: T, style: StyleId, pal: string): string[] {
  const k = heroOf(style).special;
  const pct = (x: number) => Math.round(x * 100);
  const vars: Record<string, string | number> = { who: pal, r: EFFECT_ROUNDS };
  if (k === "blast" || k === "evade") vars.n = SPECIAL_HIT[k];
  if (k === "rescue") vars.n = SPECIAL.rescueHeal;
  if (k === "heal") Object.assign(vars, { n: SPECIAL.healPal, m: SPECIAL.healSelf });
  if (k === "healAll") vars.n = SPECIAL.healAll;
  if (k === "selfheal") vars.n = SPECIAL.selfheal;
  if (k === "hype" || k === "break") vars.p = EFFECT_MUL[k][0];
  if (k === "weaken") vars.p = pct(EFFECT_MUL.weaken[0]);
  const lines = [t(`game.raid.sp.${k}`, vars)];
  if (k === "heal" || k === "healAll" || k === "rescue") lines.push(t("game.raid.sp.revive"));
  if (k === "hype" || k === "break" || k === "weaken") lines.push(t("game.raid.sp.stack"));
  return lines;
}

/* ---------- 小さな部品 ---------- */

function RoleChip({ role }: { role: Role }) {
  const { t } = useI18n();
  return <span className={`raid-role ${role}`}>{t(`game.raid.role.${role}`)}</span>;
}

/** 体力のバー。low になると色を変える */
function HpBar({ hp, max, className = "" }: { hp: number; max: number; className?: string }) {
  const ratio = Math.max(0, Math.min(1, hp / max));
  const level = ratio > 0.5 ? "good" : ratio > 0.25 ? "mid" : "low";
  return (
    <span className={`raid-hp ${level} ${className}`} role="img" aria-label={`${hp} / ${max}`}>
      <span className="raid-hp-fill" style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

/** 行動の印（攻める = こぶし、守る = 盾、かばう = 腕を広げた人、ためる = きらめき、必殺技 = 星、おうえん = メガホン） */
const ACT_ART: Record<Act, ReactNode> = {
  attack: (
    <>
      <rect x="4" y="8" width="13" height="10" rx="3" fill="currentColor" stroke="none" />
      <path d="M8 8v4M12 8v4" className="raid-icon-cut" strokeWidth="1.5" />
      <path d="M19.5 7l2-2M20.5 12h2.5M19.5 17l2 2" strokeWidth="1.8" />
    </>
  ),
  guard: <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="currentColor" stroke="none" />,
  cover: (
    <>
      <circle cx="9" cy="6" r="2.6" fill="currentColor" stroke="none" />
      <path d="M9 10v6M9 16l-2.5 5M9 16l2.5 5M4 11l5 1 5-1" strokeWidth="2" />
      <path d="M16 6.5 22 9v4c0 3.5-2.5 5.6-6 6.5" strokeWidth="2" />
    </>
  ),
  charge: (
    <>
      <path d="M12 3c.8 4.5 2.5 6.2 7 7-4.5.8-6.2 2.5-7 7-.8-4.5-2.5-6.2-7-7 4.5-.8 6.2-2.5 7-7z" fill="currentColor" stroke="none" />
      <path d="M19 16v4M17 18h4" strokeWidth="1.6" />
    </>
  ),
  special: (
    <path d="M12 2.5l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.4l-5.6 3.1 1.3-6.2L3 9l6.3-.7z" fill="currentColor" stroke="none" />
  ),
  cheer: (
    <>
      <path d="M4 10v4l4 1 9 5V4L8 9z" fill="currentColor" stroke="none" />
      <path d="M8 15l1.5 5h3l-1.5-4.4" strokeWidth="1.8" />
      <path d="M20 9.5q1.5 2.5 0 5" strokeWidth="1.8" />
    </>
  ),
};

function ActIcon({ act, className = "" }: { act: Act; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`raid-icon ${className}`} aria-hidden>
      {ACT_ART[act]}
    </svg>
  );
}

/** 予告の印（ねらい・2 人まとめて・盾・ため・ひと休み） */
function IntentIcon({ kind }: { kind: Raid.IntentKind }) {
  const art: Record<Raid.IntentKind, ReactNode> = {
    hit: (
      <>
        <circle cx="12" cy="12" r="7.5" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeWidth="2" />
      </>
    ),
    smash: (
      <>
        <path d="M13 2 6 13h5l-2 9 8-12h-5z" fill="currentColor" stroke="none" />
      </>
    ),
    sweep: (
      <>
        <path d="M3 14q9-10 18 0" strokeWidth="2.4" />
        <path d="M17.5 9.5 21 14l-5 .8" strokeWidth="2.2" />
        <circle cx="7" cy="19" r="2" fill="currentColor" stroke="none" />
        <circle cx="17" cy="19" r="2" fill="currentColor" stroke="none" />
      </>
    ),
    guard: <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="currentColor" stroke="none" />,
    charge: (
      <>
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M5 19l2-2" strokeWidth="1.8" />
      </>
    ),
    nova: (
      <>
        <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" strokeDasharray="2.5 2.5" />
      </>
    ),
    rest: (
      <>
        <path d="M5 6h6l-6 7h6M13 12h5l-5 6h5" strokeWidth="2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="raid-icon" aria-hidden>
      {art[kind]}
    </svg>
  );
}

/* ---------- 盤 ---------- */

/**
 * ふたりのボス戦。はじめはキャラ選び（31 人のカードと、選んだキャラの持ち味）、そのあとはボス戦
 * （2D の舞台・ボスの予告・2 人の体力・行動のボタン・前のラウンドの結果）。決めたものは画面下の「これで決定」で確定する
 */
export function RaidBoard(props: BoardProps) {
  const v = props.state as View;
  return v.phase === "pick" ? <PickPhase {...props} /> : <BattlePhase {...props} />;
}

/* ---------- キャラ選び ---------- */

function PickPhase({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const v = state as View;
  const words = useWords(you, names);
  const { t, who, styleName } = words;
  const me: Seat = you ?? 0;
  const pal = other(me);
  const mine = v.heroes[me];
  const palHero = v.heroes[pal];
  const canPick = you !== null && !mine;
  const [style, setStyle] = useState<StyleId | null>((selected as { style?: StyleId } | null)?.style ?? null);
  const [role, setRole] = useState<Role | "all">("all");

  const choose = (s: StyleId) => {
    setStyle(s);
    if (interactive) onSelect({ type: "pick", style: s });
  };
  // 相手を待つ間に選んでおいたキャラは、番が来たら「これで決定」を出す（盤面が進むと選びかけは取り消されるので、そのあとに）
  useEffect(() => {
    if (!interactive || !style) return;
    const timer = setTimeout(() => onSelect({ type: "pick", style }));
    return () => clearTimeout(timer);
  }, [interactive]);

  const list = Fight.STYLE_IDS.filter((s) => role === "all" || roleOf(s) === role);
  const shown = mine?.style ?? style;

  let note: string;
  if (!canPick) note = you !== null && v.turn !== null ? t("game.raid.pick.wait", { who: who(v.turn) }) : "";
  else if (!interactive && v.turn !== null) note = t("game.raid.pick.waitFirst", { who: who(v.turn) });
  else if (style) note = t("game.raid.pick.ready");
  else note = t("game.raid.pick.choose");

  return (
    <div className="raid">
      <section className="raid-pick-head">
        <div className="raid-lineup" aria-label={t("game.raid.bossOf", { n: 1, total: BOSS_COUNT })}>
          {v.bosses.map((b, i) => (
            <span key={b} className="raid-lineup-boss">
              <BossIcon boss={b} />
              <span className="raid-lineup-name">
                <b className="num">{i + 1}</b> {words.bossName(b)}
              </span>
              <small className="muted">{t(`game.raid.trait.${b}`)}</small>
            </span>
          ))}
        </div>
        <PickStage v={v} me={me} preview={shown ?? null} />
      </section>

      {palHero && (
        <p className={`raid-flag seat${pal}`}>
          <StyleIcon style={palHero.style} className="raid-flag-icon" />
          {t("game.raid.pick.partner", { who: who(pal), style: styleName(palHero.style), role: t(`game.raid.role.${roleOf(palHero.style)}`) })}
        </p>
      )}
      <p className="board-note">{note}</p>

      {shown && <HeroDetail style={shown} seat={me} title={mine ? t("game.raid.pick.yours") : undefined} words={words} />}

      {canPick && (
        <section className="raid-picker">
          <div className="raid-picker-head">
            <h3 className="muted">{t("game.raid.pick.title")}</h3>
            <small className="muted">{t("game.raid.pick.hint")}</small>
          </div>
          <div className="raid-roles" role="tablist" aria-label={t("game.raid.pick.title")}>
            {(["all", ...ROLES] as const).map((r) => (
              <button key={r} type="button" role="tab" aria-selected={role === r} className={`raid-role-tab ${r} ${role === r ? "on" : ""}`} onClick={() => setRole(r)}>
                {r === "all" ? t("game.raid.roleAll") : t(`game.raid.role.${r}`)}
              </button>
            ))}
          </div>
          <div className="raid-styles" role="radiogroup" aria-label={t("game.raid.pick.title")}>
            {list.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={style === s}
                className={`raid-style ${style === s ? "on" : ""} seat${me}`}
                onClick={() => choose(s)}
              >
                <StyleIcon style={s} className="raid-style-icon" />
                <span className="raid-style-name">{styleName(s)}</span>
                <RoleChip role={roleOf(s)} />
                <span className="raid-style-sp muted">{words.spName(s)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** キャラ選びの舞台：選んだキャラ（と、もう決まった相棒）を、今回の最初のボスの前に並べる */
function PickStage({ v, me, preview }: { v: View; me: Seat; preview: StyleId | null }) {
  const pal = other(me);
  const look = (seat: Seat, style: StyleId | null | undefined) =>
    style ? { style, stats: Fight.STYLES[style].build, seat } : null;
  return (
    <div className="raid-arena small">
      <svg viewBox="0 0 360 170" className="raid-scene" aria-hidden>
        <rect x="0" y="146" width="360" height="24" className="raid-ground" />
        <g transform="translate(0 12)">
          <Figure look={look(pal, v.heroes[pal]?.style)} x={70} facing={1} hit={false} down={false} />
        </g>
        <g transform="translate(0 14)">
          <Figure look={look(me, preview)} x={140} facing={1} hit={false} down={false} />
        </g>
        <g transform="translate(278 156) scale(0.8)">
          <g className="raid-boss idle">
            <BossArt boss={v.bosses[0]!} mood="angry" />
          </g>
        </g>
      </svg>
    </div>
  );
}

/** 選んだキャラの持ち味（役・体力・攻撃・かたさ・待ち時間・必殺技） */
function HeroDetail({ style, seat, title, words }: { style: StyleId; seat: Seat; title?: string; words: Words }) {
  const { t, styleName, spName } = words;
  const h = heroOf(style);
  const stats: [string, string][] = [
    [t("game.raid.stat.hp"), `${h.maxHp}`],
    [t("game.raid.stat.atk"), `${Math.round(h.atk)}`],
    [t("game.raid.stat.def"), `${Math.round(100 / h.taken)}`],
    [t("game.raid.stat.cd"), t("game.raid.stat.cdValue", { n: h.cooldown })],
  ];
  return (
    <div className={`raid-detail seat${seat}`}>
      {title && <span className="muted small">{title}</span>}
      <div className="raid-detail-head">
        <StyleIcon style={style} className="raid-detail-icon" />
        <strong>{styleName(style)}</strong>
        <RoleChip role={roleOf(style)} />
      </div>
      <dl className="raid-stats">
        {stats.map(([k, val]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{val}</dd>
          </div>
        ))}
      </dl>
      <div className="raid-sp">
        <span className="raid-sp-label">
          <ActIcon act="special" />
          {t("game.raid.pick.special")}：<b>{spName(style)}</b>
        </span>
        {specialLines(t, style, t("game.raid.pal")).map((line) => (
          <span key={line} className="raid-sp-line">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- ボス戦 ---------- */

/** 開いたときにまだ見ていないはずの結果。直前のラウンドを先に選んだのが自分なら（相手が締めくくった）、そのラウンド */
const unseenOf = (v: View, you: Seat | null) => {
  const last = v.history.length - 1;
  return last >= 0 && you !== null && firstPicker(last) === you ? last : null;
};

function BattlePhase({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const v = state as View;
  const words = useWords(you, names);
  const { t, who } = words;
  const me: Seat = you ?? 0;
  const pal = other(me);
  const playing = status.kind === "playing";
  const heroes = v.heroes as [Raid.Hero, Raid.Hero];
  const myPick = you !== null && typeof v.picks[you] === "string" ? (v.picks[you] as Act) : null;
  const choosing = playing && you !== null && v.turn === you && myPick === null;
  const sel = (selected as { type: "act"; act: Act } | null)?.act ?? null;

  // 結果の再生。開いたときは、まだ見ていない結果だけ。開いている間にラウンドが進んだら、進んだラウンドを
  const ids = useRef(1);
  const [shown, setShown] = useState<{ index: number; id: number } | null>(() => {
    const i = unseenOf(v, you);
    return i === null ? null : { index: i, id: ids.current++ };
  });
  const seen = useRef(v.history.length);
  useEffect(() => {
    const prev = seen.current;
    seen.current = v.history.length;
    if (v.history.length > prev) setShown({ index: v.history.length - 1, id: ids.current++ });
  }, [v.history.length]);
  useEffect(() => {
    if (!shown) return;
    const id = shown.id;
    const timer = setTimeout(() => setShown((now) => (now?.id === id ? null : now)), PLAY_MS);
    return () => clearTimeout(timer);
  }, [shown?.id]);
  const playLog = shown ? v.history[shown.index] : undefined;
  const lastLog = v.history.at(-1);

  const round = Math.min(v.round + 1, MAX_ROUNDS);
  const over = v.phase === "over";

  let note: ReactNode = null;
  if (playing && you !== null) {
    if (choosing) {
      const mineDown = heroes[me].hp <= 0;
      note = (
        <>
          <span>
            {mineDown
              ? t("game.raid.note.down", { who: who(pal) })
              : sel
                ? t("game.raid.note.picked", { act: words.actName(sel, heroes[me].style) })
                : t("game.raid.note.choose")}
          </span>
          {v.picks[pal] === true && <span className="muted">{t("game.raid.note.partnerDone", { who: who(pal) })}</span>}
        </>
      );
    } else if (myPick) {
      note = (
        <>
          <span>{t("game.raid.note.youPicked", { act: words.actName(myPick, heroes[me].style) })}</span>
          <span className="muted">{t("game.raid.note.waitPick", { who: who(pal) })}</span>
        </>
      );
    } else if (v.turn !== null) note = t("game.raid.note.waitFirst", { who: who(v.turn) });
  }

  return (
    <div className="raid">
      <div className="raid-main">
        <div className="raid-top">
          <BossTrack v={v} words={words} />
          {!over && (
            <span className="raid-round num">
              {t("game.raid.round", { n: round })} <span className="muted">{t("game.raid.roundOf", { max: MAX_ROUNDS })}</span>
            </span>
          )}
        </div>
        <Arena v={v} me={me} playing={playLog ? { log: playLog, id: shown!.id } : null} words={words} onSkip={() => setShown(null)} />
        {over ? <Final v={v} me={me} words={words} /> : v.intent && <IntentCard v={v} me={me} words={words} />}
      </div>

      <div className="raid-side">
        <div className="raid-party">
          {([me, pal] as Seat[]).map((seat) => (
            <HeroCard key={seat} v={v} seat={seat} me={me} you={you} words={words} />
          ))}
        </div>

        {playing && <p className="board-note">{note}</p>}

        {choosing && (
          <ActionPicker
            key={`${v.round}-${me}`}
            v={v}
            me={me}
            interactive={interactive}
            selected={sel}
            onSelect={(act) => onSelect(act ? { type: "act", act } : null)}
            words={words}
          />
        )}

        {lastLog && <RoundResult log={lastLog} me={me} heroes={heroes} words={words} onReplay={() => setShown({ index: v.history.length - 1, id: ids.current++ })} />}
      </div>
    </div>
  );
}

/** 3 体のボスの並び（倒した・今・これから） */
function BossTrack({ v, words }: { v: View; words: Words }) {
  const { t } = words;
  return (
    <ol className="raid-track" aria-label={t("game.raid.bossOf", { n: Math.min(v.stage + 1, BOSS_COUNT), total: BOSS_COUNT })}>
      {v.bosses.map((b, i) => (
        <li key={b} className={i < v.stage ? "done" : i === v.stage ? "now" : "next"} title={words.bossName(b)}>
          <BossIcon boss={b} />
          {i < v.stage && (
            <svg viewBox="0 0 24 24" className="raid-track-check" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}

/** 予告の文（だれに・何を）と、防がずに受ける目安 */
function intentLine(v: Pick<View, "intent" | "heroes">, words: Words): string {
  const { t, who } = words;
  const intent = v.intent!;
  return t(`game.raid.intent.${intent.kind}`, intent.target !== undefined ? { target: who(intent.target) } : {});
}

function IntentCard({ v, me, words }: { v: View; me: Seat; words: Words }) {
  const { t, who } = words;
  const intent = v.intent!;
  const boss = v.bosses[v.stage]!;
  const hits = ([me, other(me)] as Seat[])
    .map((seat) => ({ seat, n: intentDamage(v, seat) }))
    .filter((x) => x.n > 0);
  const vars: Record<string, string | number> = {
    p: intent.kind === "guard" ? Math.round(BOSS_GUARD_MUL * 100) : BOSS_CHARGE_MUL,
    n: restBreakOf(v.stage),
  };
  return (
    <section className={`raid-intent ${intent.kind}`} aria-live="polite">
      <span className="raid-intent-label">{t("game.raid.intentLabel")}</span>
      <div className="raid-intent-main">
        <span className="raid-intent-icon">
          <IntentIcon kind={intent.kind} />
        </span>
        <span className="raid-intent-text">
          <b>{words.moveName(boss, intent.kind)}</b>
          <span>{intentLine(v, words)}</span>
        </span>
      </div>
      {hits.length > 0 && (
        <div className="raid-intent-dmg">
          {hits.map((x) => (
            <span key={x.seat} className={`raid-intent-hit seat${x.seat}`}>
              {t("game.raid.dmgTo", { who: who(x.seat), n: x.n })}
            </span>
          ))}
        </div>
      )}
      <small className="raid-intent-hint">{t(`game.raid.hint.${intent.kind}`, vars)}</small>
    </section>
  );
}

/** 2D の舞台：左に 2 人（バックボーン・ファイトの 2D の姿）、右にボス。結果を再生するときは動きと数字を出す */
function Arena({
  v,
  me,
  playing,
  words,
  onSkip,
}: {
  v: View;
  me: Seat;
  playing: { log: RoundLog; id: number } | null;
  words: Words;
  onSkip(): void;
}) {
  const { t } = words;
  const pal = other(me);
  const log = playing?.log;
  // 再生中は、そのラウンドのボス（倒したボスも）を出す
  const stage = log ? log.stage : Math.min(v.stage, BOSS_COUNT - 1);
  const boss = v.bosses[stage]!;
  const intent = log ? log.intent : v.intent;
  const cleared = v.cleared && !log;
  const bossHp = log ? log.bossHp : v.bossHp;
  const bossMax = Raid.bossMaxHp(boss, stage);
  const bossActed = !!log && !log.defeated && !log.interrupted;
  const bossAttacks = bossActed && ["hit", "smash", "sweep", "nova"].includes(log.intent.kind);

  let mood: Mood = "angry";
  if (log) mood = log.defeated || log.dealt[0] + log.dealt[1] > 0 ? "strain" : "angry";
  else if (intent?.kind === "rest") mood = "sleepy";
  else if (intent?.kind === "guard") mood = "smug";

  const x: Record<Seat, number> = { [pal]: 62, [me]: 130 } as Record<Seat, number>;
  const heroes = v.heroes;
  const targeted = (seat: Seat) =>
    !log && !!intent && heroes[seat]!.hp > 0 && (intent.target === seat || intent.kind === "sweep" || intent.kind === "nova");
  const lookOf = (seat: Seat) => {
    const h = heroes[seat]!;
    return { style: h.style, stats: Fight.STYLES[h.style].build, seat };
  };
  const bossCls = [
    "raid-boss",
    log ? "" : "idle",
    log && log.dealt[0] + log.dealt[1] > 0 ? "hurt" : "",
    log?.defeated ? "defeated" : "",
    bossAttacks ? "attacks" : "",
    !log && intent?.kind === "guard" ? "guarding" : "",
    !log && intent?.kind === "charge" ? "charging" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const fx = log ? [] : v.effects;

  return (
    <div className={`raid-arena ${boss}`}>
      <div className="raid-bossbar">
        <span className="raid-bossname">{words.bossName(boss)}</span>
        <HpBar hp={cleared ? 0 : bossHp} max={bossMax} className="boss" />
        <span className="raid-bosshp num">
          {cleared ? 0 : bossHp}
          <span className="muted"> / {bossMax}</span>
        </span>
      </div>
      {fx.length > 0 && (
        <div className="raid-effects">
          {fx.map((e) => (
            <span key={e.kind} className={`raid-effect ${e.kind}`}>
              {t(`game.raid.fx.${e.kind}`)}
              {e.level === 2 && <b> {t("game.raid.fxLevel2")}</b>}
              <span className="muted"> {t("game.raid.fxLeft", { n: e.left })}</span>
            </span>
          ))}
        </div>
      )}
      <svg viewBox="0 0 360 200" className="raid-scene" aria-hidden key={playing?.id ?? "idle"}>
        <rect x="0" y="176" width="360" height="24" className="raid-ground" />
        {([pal, me] as Seat[]).map((seat) => {
          const h = heroes[seat]!;
          const down = (log ? log.hp[seat] : h.hp) <= 0;
          const dealt = log?.dealt[seat] ?? 0;
          const taken = log?.taken[seat] ?? 0;
          const healed = log?.healed[seat] ?? 0;
          const charged = !log && h.charged && !down;
          return (
            <g key={seat} transform={`translate(0 ${seat === me ? 44 : 40})`}>
              {charged && <ellipse cx={x[seat]} cy={140} rx={26} ry={6} className="raid-aura" />}
              <g className={`raid-hero ${dealt > 0 ? "lunge" : ""} ${taken > 0 ? "hit" : ""}`}>
                <Figure look={lookOf(seat)} x={x[seat]} facing={1} hit={false} down={down} />
              </g>
              {targeted(seat) && (
                <g className={`raid-target ${intent?.kind}`} transform={`translate(${x[seat]} 12)`}>
                  <circle r="9" />
                  <path d="M0 -13v6M0 7v6M-13 0h6M7 0h6" />
                </g>
              )}
              {dealt > 0 && (
                <text x={300 - (seat === me ? 0 : 26)} y={seat === me ? 30 : 4} className="raid-num dealt" textAnchor="middle">
                  {dealt}
                </text>
              )}
              {taken > 0 && (
                <text x={x[seat]} y={20} className="raid-num taken" textAnchor="middle">
                  −{taken}
                </text>
              )}
              {healed > 0 && (
                <text x={x[seat] + 18} y={34} className="raid-num healed" textAnchor="middle">
                  +{healed}
                </text>
              )}
            </g>
          );
        })}
        <g transform="translate(276 186)">
          {!log && intent?.kind === "guard" && <path d="M-74 -40 Q-82 -90 -64 -132" className="raid-shield" />}
          {!log && intent?.kind === "charge" && <circle cx="0" cy="-66" r="76" className="raid-charge" />}
          <g className={bossCls}>{cleared ? null : <BossArt boss={boss} mood={mood} />}</g>
          {!log && intent?.kind === "rest" && (
            <text x="34" y="-126" className="raid-zz">
              z z
            </text>
          )}
          {log && log.bossHeal > 0 && (
            <text x="0" y="-150" className="raid-num healed late" textAnchor="middle">
              +{log.bossHeal}
            </text>
          )}
        </g>
      </svg>
      {playing && (
        <button type="button" className="raid-skip" onClick={onSkip}>
          {t("game.raid.skip")}
        </button>
      )}
    </div>
  );
}

/** 1 人分の札：キャラ・体力・ため・必殺技の残り・このラウンドで選んだか */
function HeroCard({ v, seat, me, you, words }: { v: View; seat: Seat; me: Seat; you: Seat | null; words: Words }) {
  const { t, who, styleName } = words;
  const h = v.heroes[seat]!;
  const def = heroOf(h.style);
  const down = h.hp <= 0;
  const pick = v.picks[seat];
  const playing = v.phase === "battle";
  let pickText: string | null = null;
  if (playing) {
    if (typeof pick === "string") pickText = words.actName(pick, h.style);
    else if (pick === true) pickText = t("game.raid.picked");
    else if (v.turn === seat) pickText = t("game.raid.thinking");
  }
  return (
    <div className={`raid-hero-card seat${seat} ${down ? "down" : ""} ${seat === me && you !== null ? "me" : ""}`}>
      <div className="raid-hero-head">
        <StyleIcon style={h.style} className="raid-hero-icon" />
        <span className="raid-hero-names">
          <b>{who(seat)}</b>
          <small className="muted">{styleName(h.style)}</small>
        </span>
        {pickText && <span className={`raid-pick-state ${typeof pick === "string" || pick === true ? "done" : "wait"}`}>{pickText}</span>}
      </div>
      <div className="raid-hero-hp">
        <HpBar hp={h.hp} max={def.maxHp} />
        <span className="num">
          {h.hp}
          <span className="muted">/{def.maxHp}</span>
        </span>
      </div>
      <div className="raid-hero-tags">
        <RoleChip role={roleOf(h.style)} />
        {down && <span className="raid-tag down">{t("game.raid.down")}</span>}
        {h.charged && !down && <span className="raid-tag charged">{t("game.raid.charged")}</span>}
        <span className={`raid-tag sp ${h.cooldown === 0 ? "ready" : ""}`}>
          <ActIcon act="special" />
          {words.spName(h.style)}
          <span className="muted">{h.cooldown === 0 ? t("game.raid.ready") : t("game.raid.cooldown", { n: h.cooldown })}</span>
        </span>
      </div>
    </div>
  );
}

/** 行動のボタン。それぞれに、相棒がためる（何もしない）としたときの見込み（与える・受ける・回復）を添える */
function ActionPicker({
  v,
  me,
  interactive,
  selected,
  onSelect,
  words,
}: {
  v: View;
  me: Seat;
  interactive: boolean;
  selected: Act | null;
  onSelect(act: Act | null): void;
  words: Words;
}) {
  const { t, who } = words;
  const pal = other(me);
  const heroes = v.heroes as [Raid.Hero, Raid.Hero];
  const h = heroes[me];
  const legal = actsFor(heroes, me);
  const all: Act[] = h.hp <= 0 ? ["cheer"] : ["attack", "guard", "cover", "charge", "special"];
  const battle: Raid.Battle = {
    heroes,
    bosses: v.bosses,
    stage: v.stage,
    bossHp: v.bossHp,
    bossRounds: v.bossRounds,
    intent: v.intent,
    effects: v.effects,
  };
  const palAct: Act = heroes[pal].hp <= 0 ? "cheer" : "charge";
  const preview = (act: Act) => {
    const acts: [Act, Act] = me === 0 ? [act, palAct] : [palAct, act];
    return resolve(battle, acts, v.round).log;
  };
  const noteOf = (act: Act): string => {
    if (act === "special") return specialLines(t, h.style, who(pal))[0]!;
    if (act === "cover" || act === "cheer") return t(`game.raid.actNote.${act}`, { who: who(pal) });
    if (act === "attack") return t("game.raid.actNote.attack", { n: preview("attack").dealt[me] });
    return t(`game.raid.actNote.${act}`);
  };
  const chips = (act: Act): string[] => {
    if (!legal.includes(act)) return [];
    const log = preview(act);
    const out: string[] = [];
    if (log.dealt[me] > 0 && act !== "attack") out.push(t("game.raid.preview.dealt", { n: log.dealt[me] }));
    if (log.healed[0] + log.healed[1] > 0) out.push(t("game.raid.preview.healed", { n: log.healed[0] + log.healed[1] }));
    if (intentDamage(v, me) > 0 || (act === "cover" && intentDamage(v, pal) > 0) || log.taken[me] > 0)
      out.push(log.taken[me] > 0 ? t("game.raid.preview.taken", { n: log.taken[me] }) : t("game.raid.preview.none"));
    return out;
  };

  return (
    <section className="raid-actions" role="radiogroup" aria-label={t("game.raid.note.choose")}>
      {all.map((act) => {
        const ok = legal.includes(act);
        const label = act === "special" ? words.spName(h.style) : t(`game.raid.act.${act}`);
        return (
          <button
            key={act}
            type="button"
            role="radio"
            aria-checked={selected === act}
            disabled={!ok || !interactive}
            className={`raid-act ${act} ${selected === act ? "on" : ""}`}
            onClick={() => onSelect(selected === act ? null : act)}
          >
            <span className="raid-act-head">
              <ActIcon act={act} />
              <b>{label}</b>
              {act === "special" && !ok && <span className="raid-act-cd">{t("game.raid.cooldown", { n: h.cooldown })}</span>}
            </span>
            <span className="raid-act-note">{noteOf(act)}</span>
            {ok && chips(act).length > 0 && (
              <span className="raid-act-chips">
                {chips(act).map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}

/** 前のラウンドの結果を、起きた順の文にする */
function resultLines(log: RoundLog, me: Seat, heroes: [Raid.Hero, Raid.Hero], words: Words): { text: string; tone: string }[] {
  const { t, who, bossName, moveName } = words;
  const pal = other(me);
  const lines: { text: string; tone: string }[] = [];
  for (const seat of [me, pal] as Seat[]) {
    const act = words.actName(log.acts[seat], heroes[seat].style);
    if (log.dealt[seat] > 0) lines.push({ text: t("game.raid.result.dealt", { who: who(seat), act, n: log.dealt[seat] }), tone: "dealt" });
    else lines.push({ text: t("game.raid.result.act", { who: who(seat), act }), tone: "plain" });
  }
  for (const seat of [me, pal] as Seat[])
    if (log.healed[seat] > 0) lines.push({ text: t("game.raid.result.healed", { who: who(seat), n: log.healed[seat] }), tone: "healed" });
  for (const fx of log.added) lines.push({ text: t("game.raid.result.added", { fx: t(`game.raid.fx.${fx}`), r: Raid.EFFECT_ROUNDS }), tone: "fx" });
  if (log.defeated) {
    lines.push({ text: t("game.raid.result.defeated", { boss: bossName(log.boss) }), tone: "win" });
  } else {
    lines.push({ text: t("game.raid.result.bossMove", { boss: bossName(log.boss), move: moveName(log.boss, log.intent.kind) }), tone: "boss" });
    if (log.interrupted) lines.push({ text: t("game.raid.result.interrupted"), tone: "fx" });
    if (log.restStopped) lines.push({ text: t("game.raid.result.restStopped"), tone: "fx" });
    let any = false;
    for (const seat of [me, pal] as Seat[])
      if (log.taken[seat] > 0) {
        any = true;
        lines.push({ text: t("game.raid.result.taken", { who: who(seat), n: log.taken[seat] }), tone: "taken" });
      }
    if (!any && !log.interrupted && ["hit", "smash", "sweep", "nova"].includes(log.intent.kind))
      lines.push({ text: t("game.raid.result.noDamage"), tone: "fx" });
    if (log.bossHeal > 0) lines.push({ text: t("game.raid.result.bossHeal", { n: log.bossHeal }), tone: "boss" });
  }
  for (const seat of [me, pal] as Seat[]) {
    if (log.downed[seat]) lines.push({ text: t("game.raid.result.downed", { who: who(seat) }), tone: "taken" });
    if (log.revived[seat]) lines.push({ text: t("game.raid.result.revived", { who: who(seat) }), tone: "healed" });
  }
  return lines;
}

function RoundResult({
  log,
  me,
  heroes,
  words,
  onReplay,
}: {
  log: RoundLog;
  me: Seat;
  heroes: [Raid.Hero, Raid.Hero];
  words: Words;
  onReplay(): void;
}) {
  const { t } = words;
  return (
    <section className="raid-result">
      <div className="raid-result-head">
        <h3>{t("game.raid.result.title", { n: log.round + 1 })}</h3>
        <button type="button" className="ghost-button raid-replay" onClick={onReplay}>
          {t("game.raid.replay")}
        </button>
      </div>
      <ul>
        {resultLines(log, me, heroes, words).map((l, i) => (
          <li key={i} className={l.tone}>
            {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 終わったときのまとめ（クリアか、どうして負けたか・ラウンド数・2 人が与えたダメージ） */
function Final({ v, me, words }: { v: View; me: Seat; words: Words }) {
  const { t, who } = words;
  const total = (seat: Seat) => v.history.reduce((a, r) => a + r.dealt[seat], 0);
  const sum = total(0) + total(1);
  const reason = v.cleared
    ? t("game.raid.end.cleared")
    : v.heroes.every((h) => (h?.hp ?? 0) <= 0)
      ? t("game.raid.end.down")
      : t("game.raid.end.time", { max: MAX_ROUNDS });
  return (
    <section className={`raid-final ${v.cleared ? "cleared" : "failed"}`}>
      <strong>{reason}</strong>
      <span className="muted">{t("game.raid.end.stats", { rounds: v.history.length, dealt: sum })}</span>
      <div className="raid-final-mvp">
        {([me, other(me)] as Seat[]).map((seat) => (
          <span key={seat} className={`seat${seat}`}>
            {t("game.raid.end.mvp", { who: who(seat), n: total(seat) })}
          </span>
        ))}
      </div>
    </section>
  );
}

/** LINE で相手に知らせる文（キャラを選んだ・行動を選んだ） */
export function raidMovedText(t: T, move: unknown, name: string): string {
  return t((move as Raid.RaidMove).type === "pick" ? "game.raid.moved.pick" : "game.raid.moved.act", { name });
}
