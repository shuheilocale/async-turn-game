import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Fight, other, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { FighterStage } from "./fight/stage/FighterStage.tsx";
import { topAfter } from "./fight/stage/ground.ts";
import type { FighterLook, StageEvent } from "./fight/stage/types.ts";
import { FxArrow, MoveIcon, PositionIcon, StyleIcon } from "./fight/art.tsx";
import "./FightBoard.css";

type Fighter = Fight.Fighter;
type FighterStats = Fight.FighterStats;
type StyleId = Fight.StyleId;
type Technique = Fight.Technique;
const {
  MARTIAL_STYLES,
  CROSSOVER_STYLES,
  STYLES,
  STAT_KEYS,
  STAT_MIN,
  STAT_MAX,
  STAT_TOTAL,
  MAX_HP,
  EXCHANGES,
  POSITIONS,
  activeEffects,
  ambushBonus,
  chainCount,
  dropBonus,
  techniqueNow,
  techniqueOf,
  usableMoves,
  usesLeft,
} = Fight;

/** キャラ作りのバックボーンの分け方（格闘技・異種格闘技） */
const STYLE_GROUPS = { martial: MARTIAL_STYLES, crossover: CROSSOVER_STYLES } as const;
type StyleGroup = keyof typeof STYLE_GROUPS;
const groupOf = (style: StyleId): StyleGroup => ((CROSSOVER_STYLES as readonly StyleId[]).includes(style) ? "crossover" : "martial");

/** 3D の舞台が再生の終わりを知らせてこなかったときに、結果を出すまでの時間（再生は KO でなければ 1〜3.5 秒ほど） */
const EVENT_FALLBACK_MS = 7000;
/** 威力の目安を何段階の点で見せるか */
const POWER_PIPS = 4;

const look = (f: Fighter | null, seat: Seat): FighterLook | null => (f ? { style: f.style, stats: f.stats, seat } : null);
const moveName = (t: T, style: StyleId, act: string) => t(`game.fight.move.${style}.${act}`);
const sumOf = (s: FighterStats) => STAT_KEYS.reduce((a, k) => a + s[k], 0);

/** 攻防の結果を 3D の舞台に渡す形にする。id は再生のたびに変える（同じ攻防をもう一度見るときも） */
function toEvent(ex: Fight.Exchange, id: number): StageEvent {
  return {
    id,
    strikes: ex.strikes.map(({ by, act, kind, result, damage, heal, effects }) => ({
      by,
      act,
      kind,
      result,
      damage,
      ...(heal && { heal }),
      ...(effects && { effects: effects.map((e) => ({ who: e.who, stat: e.stat, dir: e.amount > 0 ? (1 as const) : (-1 as const) })) }),
    })),
    position: ex.position,
    ko: ex.ko,
  };
}

/** 寝技で上にいる人。記録を頭から順にたどる（3D の舞台が攻防の再生で決めるのと同じ決め方） */
const topOf = (history: Fight.Exchange[]): Seat => history.reduce<Seat>((top, ex) => topAfter(toEvent(ex, 0), ex.from, top), 0);

/**
 * 格闘ゲーム「バックボーン・ファイト」。キャラ作り（バックボーンのカードとパラメータの振り分け）と、
 * 戦い（3D の舞台・体力・位置・技のボタン）の 2 つの画面がある。どちらも決めたものは画面下の「これで決定」で確定する
 */
export function FightBoard(props: BoardProps) {
  const v = props.state as Fight.FightView;
  return v.phase === "build" ? <BuildPhase {...props} /> : <FightPhase {...props} />;
}

/* ---------- キャラ作り ---------- */

function BuildPhase({ state, you, names, interactive, onSelect }: BoardProps) {
  const { t } = useI18n();
  const v = state as Fight.FightView;
  // 観戦者は青コーナーから見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const canBuild = you !== null && !v.built[me];
  const [style, setStyle] = useState<StyleId | null>(null);
  const [group, setGroup] = useState<StyleGroup>("martial");
  // スマホではバックボーンの並びの中だけをスクロールするので、タブを替えたら頭に戻す
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [group]);
  const [stats, setStats] = useState<FighterStats>({ power: 5, guard: 5, speed: 5, stamina: 5 });
  /** ポイントを自分で動かしたか。動かしていなければ、バックボーンを選ぶとおすすめの振り分けにする */
  const [custom, setCustom] = useState(false);
  const left = STAT_TOTAL - sumOf(stats);
  const ready = style !== null && left === 0;

  const propose = (s: StyleId | null, st: FighterStats) => {
    if (!interactive) return;
    onSelect(s !== null && sumOf(st) === STAT_TOTAL ? { type: "build", style: s, stats: st } : null);
  };
  const chooseStyle = (id: StyleId) => {
    const st = custom ? stats : { ...STYLES[id].build };
    setStyle(id);
    setStats(st);
    propose(id, st);
  };
  const bump = (key: Fight.StatKey, d: number) => {
    const st = { ...stats, [key]: stats[key] + d };
    setStats(st);
    setCustom(true);
    propose(style, st);
  };
  const recommend = () => {
    if (!style) return;
    const st = { ...STYLES[style].build };
    setStats(st);
    setCustom(false);
    propose(style, st);
  };

  // 相手を待つ間に作っておいたキャラは、自分の番になったら「これで決定」を出す。
  // 対局画面は盤面が進むと選びかけの手を取り消すので、それより後に出す
  useEffect(() => {
    if (!interactive || !ready) return;
    const timer = setTimeout(() => onSelect({ type: "build", style, stats }));
    return () => clearTimeout(timer);
    // 番が来たときだけ出し直す（選び直しは propose で出している）
  }, [interactive]);

  const fighters: [FighterLook | null, FighterLook | null] = [look(v.fighters[0], 0), look(v.fighters[1], 1)];
  if (canBuild) fighters[me] = style ? { style, stats, seat: me } : null;
  const stage = <FighterStage mode="custom" fighters={fighters} focus={me} className="fight-stage" />;

  if (!canBuild) {
    const mine = v.fighters[me];
    const waiting = names[v.turn] ? t("game.fight.wait.build", { name: names[v.turn] }) : null;
    return (
      <div className="fight">
        <div className={`fight-screen seat${me}`}>{stage}</div>
        {you !== null && mine && <FighterCard fighter={mine} seat={me} title={t("game.fight.youBuilt")} />}
        <p className="board-note">{waiting && <span>{waiting}</span>}</p>
      </div>
    );
  }

  let note: string;
  if (!interactive && v.turn !== me) note = t("game.fight.wait.build", { name: names[v.turn] });
  else if (!style) note = t("game.fight.chooseStyle");
  else if (ready) note = t("game.fight.buildReady");
  else note = t("game.fight.buildHint");

  return (
    <div className="fight">
      <div className={`fight-screen building seat${me}`}>{stage}</div>
      {v.built[opp] && <p className={`fight-flag seat${opp}`}>{t("game.fight.theyBuilt", { name: names[opp] })}</p>}
      <p className="board-note">{note}</p>

      <section className={`fight-build seat${me}`}>
        <div className="fight-build-head">
          <h3 className="muted">{t("game.fight.stylesTitle")}</h3>
          <div className="fight-groups" role="tablist" aria-label={t("game.fight.stylesTitle")}>
            {(Object.keys(STYLE_GROUPS) as StyleGroup[]).map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                id={`fight-group-${g}`}
                aria-selected={group === g}
                aria-controls="fight-styles"
                className={`fight-group ${group === g ? "on" : ""}`}
                onClick={() => setGroup(g)}
              >
                {t(`game.fight.group.${g}`)}
                <span className="fight-group-count num">{STYLE_GROUPS[g].length}</span>
                {style && groupOf(style) === g && <span className="fight-group-dot" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={list}
          id="fight-styles"
          className="fight-styles"
          role="radiogroup"
          aria-labelledby={`fight-group-${group}`}
        >
          {STYLE_GROUPS[group].map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={style === id}
              className={`fight-style-card ${style === id ? "on" : ""}`}
              onClick={() => chooseStyle(id)}
            >
              <span className="fight-style-head">
                <StyleIcon style={id} className="fight-style-icon" />
                <span className="fight-style-name">{t(`game.fight.style.${id}`)}</span>
              </span>
              <span className="fight-style-line good">
                <b>{t("game.fight.goodLabel")}</b>
                {t(`game.fight.good.${id}`)}
              </span>
              <span className="fight-style-line weak">
                <b>{t("game.fight.weakLabel")}</b>
                {t(`game.fight.weak.${id}`)}
              </span>
            </button>
          ))}
        </div>

        <div className="fight-stats">
          <div className="fight-stats-head">
            <h3 className="muted">{t("game.fight.statsTitle")}</h3>
            <span className={`fight-left num ${left === 0 ? "done" : ""}`} aria-live="polite">
              {left === 0 ? t("game.fight.leftDone") : t("game.fight.left", { n: left })}
            </span>
          </div>
          {STAT_KEYS.map((key) => {
            const label = t(`game.fight.stat.${key}`);
            return (
              <div key={key} className="fight-stat-row">
                <span className="fight-stat-label">
                  <span>{label}</span>
                  <small className="muted">{t(`game.fight.statNote.${key}`)}</small>
                </span>
                <button
                  type="button"
                  className="fight-step"
                  disabled={stats[key] <= STAT_MIN}
                  aria-label={t("game.fight.minus", { stat: label })}
                  onClick={() => bump(key, -1)}
                >
                  −
                </button>
                <span className="fight-pips" aria-hidden>
                  {Array.from({ length: STAT_MAX }, (_, i) => (
                    <i key={i} className={i < stats[key] ? "on" : ""} />
                  ))}
                </span>
                <output className="fight-stat-value num">{stats[key]}</output>
                <button
                  type="button"
                  className="fight-step"
                  disabled={stats[key] >= STAT_MAX || left <= 0}
                  aria-label={t("game.fight.plus", { stat: label })}
                  onClick={() => bump(key, 1)}
                >
                  +
                </button>
              </div>
            );
          })}
          {style && (
            <button type="button" className="ghost-button fight-recommend" onClick={recommend}>
              {t("game.fight.recommend")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** 決まったキャラの札（バックボーンとパラメータ） */
function FighterCard({ fighter, seat, title }: { fighter: Fighter; seat: Seat; title: string }) {
  const { t } = useI18n();
  return (
    <div className={`fight-card seat${seat}`}>
      <span className="muted small">{title}</span>
      <span className="fight-card-style">
        <StyleIcon style={fighter.style} className="fight-style-icon" />
        <strong>{t(`game.fight.style.${fighter.style}`)}</strong>
      </span>
      <StatLine stats={fighter.stats} />
    </div>
  );
}

/** パラメータを 1 行で（攻 6・防 4 … の代わりに、名前と数を並べる） */
function StatLine({ stats }: { stats: FighterStats }) {
  const { t } = useI18n();
  return (
    <span className="fight-statline">
      {STAT_KEYS.map((key) => (
        <span key={key}>
          {t(`game.fight.stat.${key}`)} <b className="num">{stats[key]}</b>
        </span>
      ))}
    </span>
  );
}

/* ---------- 戦い ---------- */

function FightPhase({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const v = state as Fight.FightView;
  const fighters = v.fighters as [Fighter, Fighter];
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myPick = you !== null && typeof v.picks[you] === "string" ? (v.picks[you] as string) : null;
  const choosing = playing && you !== null && v.turn === you && myPick === null;
  const sel = selected as { type: "act"; act: string } | null;
  const who = (seat: Seat) => (seat === you ? t("play.you") : t("game.fight.who", { name: names[seat] }));

  // 再生中の攻防（舞台に渡す event の id ごとに 1 回だけ再生される）。終わったら null に戻し、古い event を持ち続けない。
  // 開いたときは「まだ見ていない攻防」だけを再生する：相手が後から選んで決着した直前の攻防（自分が後に選んだ攻防は、
  // 決定したときに見ている）。観戦者は再生しない。開いている間に攻防が増えたら、増えた攻防を再生する
  const last = v.history.length - 1;
  const ids = useRef(1);
  const [shown, setShown] = useState<{ index: number; id: number } | null>(() =>
    last >= 0 && you !== null && Fight.firstPicker(last) === you ? { index: last, id: ids.current++ } : null,
  );
  const seen = useRef(v.history.length);
  const play = (index: number) => setShown({ index, id: ids.current++ });
  const finish = (id: number) => setShown((now) => (now?.id === id ? null : now));
  useEffect(() => {
    const prev = seen.current;
    seen.current = v.history.length;
    if (v.history.length > prev) play(v.history.length - 1);
  }, [v.history.length]);
  // 3D の舞台が終わりを知らせてこなくても、しばらくしたら結果を出す（ふつうは onEventDone が先に来る）
  useEffect(() => {
    if (!shown) return;
    const id = shown.id;
    const timer = setTimeout(() => finish(id), EVENT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [shown?.id]);
  const replaying = shown !== null;

  const event = useMemo(() => (shown && v.history[shown.index] ? toEvent(v.history[shown.index]!, shown.id) : null), [shown?.id]);
  const before = (i: number): [number, number] => (i > 0 ? v.history[i - 1]!.hp : [MAX_HP, MAX_HP]);
  // 再生中は、再生している攻防の前の体力・位置を見せる（当たる前に減らないように）
  const hp = replaying ? before(shown.index) : v.hp;
  const position = replaying ? v.history[shown.index]!.from : v.position;
  const round = replaying ? shown.index + 1 : Math.min(v.exchange + 1, EXCHANGES);
  const history = replaying ? v.history.slice(0, shown.index) : v.history;
  const top = topOf(history);
  // 続いている強化・弱体（再生中は、再生している攻防の前の分）
  const fx = activeEffects(history);
  const lastEx = !replaying ? v.history.at(-1) : undefined;

  let note: string | null = null;
  let sub: string | null = null;
  if (!playing || replaying) note = null;
  else if (choosing) {
    note = sel ? t("game.fight.picked", { move: moveName(t, fighters[me].style, sel.act) }) : t("game.fight.choose");
    if (v.picks[opp] === true) sub = t("game.fight.theyPicked", { name: names[opp] });
  } else if (you !== null && myPick) {
    note = t("game.fight.youPicked", { move: moveName(t, fighters[me].style, myPick) });
    sub = names[opp] ? t("game.fight.wait.pick", { name: names[opp] }) : null;
  } else if (names[v.turn]) note = t("game.fight.wait.pick", { name: names[v.turn] });

  return (
    <div className="fight">
      <div className={`fight-screen seat${me}`}>
        <FighterStage
          mode="fight"
          fighters={[look(fighters[0], 0), look(fighters[1], 1)]}
          me={me}
          event={event}
          hp={hp}
          position={position}
          top={top}
          onEventDone={finish}
          className="fight-stage"
        />
        {replaying && (
          <button type="button" className="fight-skip" onClick={() => setShown(null)}>
            {t("game.fight.skip")}
          </button>
        )}
      </div>

      <div className="fight-bars">
        {([me, opp] as Seat[]).map((seat) => (
          <HpBar
            key={seat}
            seat={seat}
            name={names[seat] || t(`game.fight.seat${seat}`)}
            fighter={fighters[seat]}
            hp={hp[seat]}
            fx={fx.filter((e) => e.who === seat)}
          />
        ))}
      </div>

      <div className="fight-ring">
        <span className="fight-round">
          <span className="num">{t("game.fight.exchange", { n: round })}</span>
          <span className="muted num">{t("game.fight.of", { total: EXCHANGES })}</span>
        </span>
        <span className="fight-positions" role="img" aria-label={`${t("game.fight.posTitle")}: ${t(`game.fight.pos.${position}`)}`}>
          {POSITIONS.map((p) => (
            <span key={p} className={`fight-pos ${p === position ? "on" : ""}`} aria-hidden>
              <PositionIcon position={p} />
              {t(`game.fight.pos.${p}`)}
            </span>
          ))}
        </span>
      </div>

      {replaying ? (
        <p className="board-note fight-playing" role="status">
          {t("game.fight.r.playing")}
        </p>
      ) : (
        lastEx && (
          <ExchangeResult
            ex={lastEx}
            index={v.history.length - 1}
            fighters={fighters}
            names={names}
            you={you}
            who={who}
            onReplay={() => play(v.history.length - 1)}
          />
        )
      )}

      {!playing && !replaying && <FinalResult v={v} status={status} who={who} />}

      {(note || sub) && (
        <p className="board-note">
          {note && <span>{note}</span>}
          {sub && <span className="muted">{sub}</span>}
        </p>
      )}

      {choosing && !replaying && (
        <section className={`fight-moves seat${me}`}>
          <h3 className="muted">{t("game.fight.moves")}</h3>
          <MoveList
            fighters={fighters}
            seat={me}
            history={v.history}
            position={v.position}
            selected={sel?.act ?? null}
            disabled={!interactive}
            onPick={(act) => onSelect(sel?.act === act ? null : { type: "act", act })}
          />
        </section>
      )}

      {playing && (
        <details className={`fight-theirs seat${opp}`}>
          <summary>{t("game.fight.theirMoves", { name: names[opp] || t(`game.fight.seat${opp}`) })}</summary>
          <MoveList fighters={fighters} seat={opp} history={v.history} position={v.position} selected={null} disabled compact />
        </details>
      )}

      {history.length > 0 && (
        <section className="fight-history">
          <h3 className="muted">{t("game.fight.history")}</h3>
          <ol className="history">
            {history.map((ex, i) => (
              <li key={i}>
                <span className="muted num">{i + 1}</span>
                <PositionIcon position={ex.from} className="fight-history-pos" />
                <span className="fight-history-acts">
                  {([me, opp] as Seat[]).map((seat) => (
                    <span key={seat} className={`seat${seat}`}>
                      {moveName(t, fighters[seat].style, ex.acts[seat])}
                    </span>
                  ))}
                </span>
                <span className="fight-history-dmg num">
                  {([me, opp] as Seat[]).map((seat) => (
                    <span key={seat} className={`seat${seat}`}>
                      {ex.hp[seat]}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** 体力のバー。名前・バックボーン・パラメータと、続いている強化・弱体も添える */
function HpBar({ seat, name, fighter, hp, fx }: { seat: Seat; name: string; fighter: Fighter; hp: number; fx: Fight.Effect[] }) {
  const { t } = useI18n();
  const ratio = hp / MAX_HP;
  return (
    <div className={`fight-hp seat${seat} ${ratio <= 0.3 ? "low" : ""}`}>
      <span className="fight-hp-who">
        <span className="token dot" aria-hidden />
        <span className="fight-hp-name">{name}</span>
        <strong className="fight-hp-num num">{hp}</strong>
      </span>
      <span
        className="fight-hp-bar"
        role="meter"
        aria-label={`${name} ${t("game.fight.hp")}`}
        aria-valuemin={0}
        aria-valuemax={MAX_HP}
        aria-valuenow={hp}
      >
        <span style={{ "--hp": `${ratio * 100}%` } as CSSProperties} />
      </span>
      {fx.length > 0 && (
        <ul className="fight-fx" aria-label={t("game.fight.fxTitle")}>
          {fx.map((e) => {
            const stat = t(`game.fight.stat.${e.stat}`);
            const up = e.amount > 0;
            return (
              <li
                key={`${e.stat}${up ? "+" : "-"}`}
                className={`fight-fx-chip ${up ? "up" : "down"}`}
                aria-label={t("game.fight.fxLeft", { stat, dir: t(up ? "game.fight.fxUp" : "game.fight.fxDown"), n: e.left })}
              >
                <FxArrow up={up} />
                <span aria-hidden>{stat}</span>
                <b className="num" aria-hidden>
                  {e.left}
                </b>
              </li>
            );
          })}
        </ul>
      )}
      <span className="fight-hp-style">
        <StyleIcon style={fighter.style} className="fight-style-icon tiny" />
        {t(`game.fight.style.${fighter.style}`)}
      </span>
      <StatLine stats={fighter.stats} />
    </div>
  );
}

/**
 * 技のボタンの並び。今の位置で使えない技・使い切った技は押せず、使える位置や残りの回数を出す。
 * 読みは今の形で、続けるほど強い技は今の上乗せも出す
 */
function MoveList({
  fighters,
  seat,
  history,
  position,
  selected,
  disabled,
  compact = false,
  onPick,
}: {
  fighters: [Fighter, Fighter];
  seat: Seat;
  history: Fight.Exchange[];
  position: Fight.Position;
  selected: string | null;
  disabled: boolean;
  compact?: boolean;
  onPick?(act: string): void;
}) {
  const { t } = useI18n();
  const style = fighters[seat].style;
  const usable = new Set(usableMoves(style, position).map((m) => m.id));
  const top = Math.max(...STYLES[style].moves.map((m) => m.power));
  return (
    <div className={`fight-move-list ${compact ? "compact" : ""}`}>
      {STYLES[style].moves.map((base) => {
        const m = techniqueNow(fighters, history, seat, base.id) ?? base;
        const left = usesLeft(base, history, seat);
        const here = usable.has(m.id) && left !== 0;
        const tags = moveTags(t, m, {
          left,
          chain: chainCount(base, history, seat),
          ambush: ambushBonus(base, history, fighters, seat),
          drop: dropBonus(base, history, seat),
        });
        // 守りに回ると多くくらうバックボーン（トゥクトゥク運転手）は、守りの技にそのことを添える
        if (m.cls === "guard" && (STYLES[style].taken?.guarding ?? 1) > 1) tags.push(t("game.fight.tag.exposed"));
        const label = t(`game.fight.move.${style}.${m.id}`);
        const sub = m.guard && m.guard !== "focus" ? (`game.fight.guard.${m.guard}` as const) : (`game.fight.kind.${m.kind}` as const);
        const body = (
          <>
            <MoveIcon tech={m} className={`fight-move-icon cls-${m.cls}`} />
            <span className="fight-move-text">
              <span className="fight-move-name">
                {label}
                <small className="muted">
                  {t(`game.fight.cls.${m.cls}`)}・{t(sub)}
                </small>
              </span>
              {!compact && <span className="fight-move-edge">{t(`game.fight.edge.${m.sure ? "sure" : (m.guard ?? m.cls)}`)}</span>}
              <span className="fight-move-tags">
                {m.cls !== "guard" && (
                  <span className="fight-move-power" aria-label={t("game.fight.power")}>
                    {Array.from({ length: POWER_PIPS }, (_, i) => (
                      <i key={i} className={i < Math.round((Math.min(m.power, top) / top) * POWER_PIPS) ? "on" : ""} />
                    ))}
                  </span>
                )}
                {tags.map((tag) => (
                  <span key={tag} className="fight-tag">
                    {tag}
                  </span>
                ))}
                {left === 0 ? (
                  <span className="fight-tag off">{t("game.fight.tag.usedUp")}</span>
                ) : (
                  !usable.has(m.id) && (
                    <span className="fight-tag off">
                      {t("game.fight.only", { pos: m.where.map((p) => t(`game.fight.pos.${p}`)).join("・") })}
                    </span>
                  )
                )}
              </span>
            </span>
          </>
        );
        if (compact) {
          return (
            <div key={m.id} className={`fight-move ${here ? "" : "off"}`}>
              {body}
            </div>
          );
        }
        return (
          <button
            key={m.id}
            type="button"
            className={`fight-move ${selected === m.id ? "on" : ""} ${here ? "" : "off"}`}
            disabled={disabled || !here}
            aria-pressed={selected === m.id}
            onClick={() => onPick?.(m.id)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 技の小さな札：速い・遅い、決まったあとの位置、回復・強化・弱体、残りの回数、特別な効果。
 * left は残りの回数（限りがなければ null）、chain は続けるほど強い技の今の回数、ambush は身を隠した次の技の今の上乗せ、
 * drop は見せ技の次の技（ビートドロップ）の今の上乗せ
 */
function moveTags(
  t: T,
  m: Technique,
  { left, chain, ambush, drop }: { left: number | null; chain: number; ambush: number; drop: number },
): string[] {
  const tags: string[] = [];
  if (m.read) tags.push(t("game.fight.tag.read", { cls: t(`game.fight.cls.${m.cls}`) }));
  if (m.sure) tags.push(t("game.fight.tag.sure"));
  if (m.chip !== undefined) tags.push(t("game.fight.tag.tough"));
  if (m.ambush) tags.push(ambush > 0 ? t("game.fight.tag.ambushNow", { n: ambush }) : t("game.fight.tag.ambush"));
  if (m.drop) tags.push(drop > 0 ? t("game.fight.tag.dropNow", { n: drop }) : t("game.fight.tag.drop"));
  if (m.quick >= 1) tags.push(t("game.fight.fast"));
  if (m.quick <= -1) tags.push(t("game.fight.slow"));
  if (m.to) tags.push(t("game.fight.toPos", { pos: t(`game.fight.pos.${m.to}`) }));
  if (m.heal) tags.push(t("game.fight.tag.heal", { n: m.heal }));
  for (const fx of m.fx ?? []) {
    const stat = t(`game.fight.stat.${fx.stat}`);
    tags.push(t(fx.to === "self" ? "game.fight.tag.selfUp" : "game.fight.tag.foeDown", { stat }));
    if (fx.stack) tags.push(t("game.fight.tag.stack"));
  }
  if (m.swap) tags.push(t("game.fight.tag.swap"));
  if (m.chain) tags.push(chain > 0 ? t("game.fight.tag.chainNow", { n: chain * m.chain.per }) : t("game.fight.tag.chain"));
  if (m.wild) tags.push(t("game.fight.tag.wild"));
  if (m.encore) tags.push(t("game.fight.tag.encore"));
  if (left !== null && left > 0) tags.push(t("game.fight.tag.uses", { n: left }));
  return tags;
}

/**
 * 攻防の結果を文にする。「はるさんのフック → あなたのダッキングでかわされた」など。
 * you は自分の席（観戦者は null）、who は文の中の呼び名（「あなた」「〇〇さん」）
 */
export function describeExchange(
  t: T,
  ex: Fight.Exchange,
  fighters: [Fighter, Fighter],
  names: Record<Seat, string>,
  you: Seat | null,
  who: (seat: Seat) => string,
): { main: string; notes: string[] } {
  const [x, y] = ex.strikes as [Fight.Strike, Fight.Strike];
  const name = (s: Fight.Strike) => moveName(t, fighters[s.by].style, s.act);
  /** 「あなたのジャブ」「はるさんのジャブ」（英語は your jab / Haru's jab） */
  const whose = (s: Fight.Strike) =>
    s.by === you ? t("game.fight.whose.you", { move: name(s) }) : t("game.fight.whose.name", { name: names[s.by], move: name(s) });
  const vars = { x: whose(x), y: whose(y), a: who(x.by), m: name(x), b: who(y.by), n: name(y) };
  const yTech = techniqueOf(fighters[y.by].style, y.act);
  /** ため（回復・強化・弱体）が決まった */
  const charged = (s: Fight.Strike) => s.result === "hit" && techniqueOf(fighters[s.by].style, s.act)?.guard === "focus";
  let main: string;
  if (charged(x) && charged(y)) main = t("game.fight.r.focusBoth", vars);
  else if (charged(y) && x.result === "hit") main = t("game.fight.r.focusHit", vars);
  else if (charged(y)) main = t("game.fight.r.focusCalm", { ...vars, x: whose(y), a: who(x.by), m: name(x) });
  else if (charged(x)) main = t("game.fight.r.focusCalm", { ...vars, x: whose(x), a: who(y.by), m: name(y) });
  else if (x.result === "blocked") main = t("game.fight.r.blocked", vars);
  else if (x.result === "dodged") main = t("game.fight.r.dodged", vars);
  else if (x.result === "countered")
    main = t(yTech?.cls === "strike" ? "game.fight.r.stopped" : yTech?.cls === "grab" ? "game.fight.r.outgrabbed" : "game.fight.r.returned", vars);
  else if (x.result === "hit" && y.result === "hit") main = t("game.fight.r.trade", vars);
  else if (x.result === "hit") main = t(yTech?.cls === "strike" ? "game.fight.r.first" : "game.fight.r.landed", vars);
  else main = t("game.fight.r.wait", vars);

  const notes: string[] = [];
  if (ex.brk) notes.push(t("game.fight.r.break"));
  else if (ex.position !== ex.from)
    notes.push(ex.position === "standing" ? t("game.fight.r.toStanding") : t("game.fight.r.toPos", { pos: t(`game.fight.pos.${ex.position}`) }));
  if (ex.ko !== null) notes.push(ex.ko === you ? t("game.fight.r.downYou") : t("game.fight.r.down", { who: who(ex.ko) }));
  // 回復と、付いた（移った）強化・弱体。続く長さは攻防のあとの記録から
  for (const s of ex.strikes) {
    if (s.heal) notes.push(t("game.fight.r.heal", { who: who(s.by), n: s.heal }));
    for (const e of s.effects ?? []) {
      const stat = t(`game.fight.stat.${e.stat}`);
      const target = e.who === you ? t("game.fight.fx.you", { stat }) : t("game.fight.fx.name", { name: names[e.who], stat });
      const turns = ex.fx?.find((f) => f.who === e.who && f.stat === e.stat && Math.sign(f.amount) === Math.sign(e.amount))?.left ?? 0;
      notes.push(t(e.amount > 0 ? "game.fight.r.fxUp" : "game.fight.r.fxDown", { target, n: Math.abs(e.amount), turns }));
    }
  }
  // 英語の「your jab → …」は文の頭を大文字にする
  const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return { main: cap(main), notes: notes.map(cap) };
}

/** 直前の攻防の結果。文と、2 人が受けたダメージ */
function ExchangeResult({
  ex,
  index,
  fighters,
  names,
  you,
  who,
  onReplay,
}: {
  ex: Fight.Exchange;
  index: number;
  fighters: [Fighter, Fighter];
  names: Record<Seat, string>;
  you: Seat | null;
  who: (seat: Seat) => string;
  onReplay(): void;
}) {
  const { t } = useI18n();
  const me: Seat = you ?? 0;
  const { main, notes } = describeExchange(t, ex, fighters, names, you, who);
  const taken = (seat: Seat) => ex.strikes.filter((s) => s.by !== seat).reduce((a, s) => a + s.damage, 0);
  const healed = (seat: Seat) => ex.strikes.filter((s) => s.by === seat).reduce((a, s) => a + (s.heal ?? 0), 0);
  return (
    <div className="fight-result" key={index}>
      <span className="muted small">{t("game.fight.lastExchange", { n: index + 1 })}</span>
      <strong className="fight-result-main">{main}</strong>
      {notes.length > 0 && <span className="fight-result-notes">{notes.join(" / ")}</span>}
      <span className="fight-result-dmg">
        {([me, other(me)] as Seat[]).map((seat) => (
          <span key={seat} className={`seat${seat} ${taken(seat) > 0 ? "hurt" : ""}`}>
            <span className="token dot" aria-hidden />
            {who(seat)} <b className="num">{taken(seat) > 0 ? `−${taken(seat)}` : healed(seat) > 0 ? "" : "±0"}</b>
            {healed(seat) > 0 && <b className="num fight-healed">+{healed(seat)}</b>}
          </span>
        ))}
      </span>
      <button type="button" className="ghost-button fight-again" onClick={onReplay}>
        {t("game.fight.replay")}
      </button>
    </div>
  );
}

/** 終局の大きな表示。KO か判定か引き分けか */
function FinalResult({ v, status, who }: { v: Fight.FightView; status: BoardProps["status"]; who: (seat: Seat) => string }) {
  const { t } = useI18n();
  if (status.kind !== "finished") return null;
  const lastEx = v.history.at(-1);
  const ko = lastEx?.ko ?? null;
  const winner = status.winner;
  const [a, b] = winner === null ? v.hp : [v.hp[winner], v.hp[other(winner)]];
  let big: string;
  let text: string;
  if (ko !== null && winner !== null) {
    big = t("game.fight.over.ko");
    text = t("game.fight.over.koBy", { who: who(winner), n: v.history.length });
  } else if (winner !== null) {
    big = t("game.fight.over.decision");
    text = t("game.fight.over.decisionBy", { who: who(winner), a, b });
  } else {
    big = t("game.fight.over.draw");
    text = t("game.fight.over.even", { a, b });
  }
  return (
    <div className={`fight-final ${winner !== null ? `seat${winner}` : ""} ${ko !== null ? "ko" : ""}`} role="status">
      <strong className="fight-final-big">{big}</strong>
      <span>{text}</span>
    </div>
  );
}
