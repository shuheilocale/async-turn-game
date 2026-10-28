import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mochi, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { ActIcon, CareIcon, CareShape, Creature, ItemSvg, Outdoors, ROOM, Room, shapeOf, SparkShape, sparkOf, type Spark } from "./mochi/art.tsx";
import { savedMochiSeen } from "../storage.ts";
import "./MochiBoard.css";

const {
  CARES,
  ITEMS,
  ACTS,
  ACT_DEFS,
  conditionAt,
  wantOf,
  moodOf,
  happeningOf,
  bodyColor,
  nowOf,
  dayOf,
  stageOf,
  stageProgress,
  lastCareOf,
  actsAt,
  isFollowUp,
  feelingOf,
  likesOf,
  ADULT,
  HATCH,
} = Mochi;
type State = Mochi.MochiState;
type Care = Mochi.Care;
type Act = Mochi.Act;
type Happening = Mochi.Happening;

/** 体の色の混ざり方（青 → ラベンダー → さくら色 → オレンジ）を見せる帯 */
const MIX_BAR = `linear-gradient(90deg, ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => bodyColor([8 - k, k])).join(", ")})`;

/** 盤を描き直す間隔。具合はゆっくり変わるので、30 秒ごとで十分 */
const TICK_MS = 30_000;
/** お世話のあとの喜ぶ動きと文を出しておく時間 */
const REACT_MS = 3600;
/** おでかけのときは、部屋の代わりにおでかけ先をこの時間だけ見せる */
const OUTING_MS = 7000;
/** 開いたとき、この時間より前のおでかけは見せない */
const OUTING_FRESH_MS = 24 * 3_600_000;

/** やることがおでかけなら、その行き先 */
const placeOf = (act?: Act) => (act ? (ACT_DEFS[act] as Mochi.ActDef).place : undefined);

/** 端末の時計。TICK_MS ごとと、画面に戻ってきたときに進める */
function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, TICK_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

/** 留守のあいだのできごとの文 */
export function happeningText(t: T, h: Happening): string {
  switch (h.kind) {
    case "found":
      if (h.place) return t("game.mochi.hap.foundAt", { item: t(`game.mochi.itemIn.${h.item}`), place: t(`game.mochi.place.${h.place}`) });
      return t(h.walk ? "game.mochi.hap.foundWalk" : "game.mochi.hap.found", { item: t(`game.mochi.itemIn.${h.item}`) });
    case "hatched":
      return t("game.mochi.hap.hatched");
    case "grew":
      return t("game.mochi.hap.grew");
    case "dream":
      return t(`game.mochi.dream.${h.topic}`);
    case "moment":
      return t(`game.mochi.moment.${h.topic}`);
    case "egg":
      return t(`game.mochi.egg.${h.topic}`);
  }
}

/** 「〇分前」など。未来（お試しで時計を進めたとき）は「たった今」 */
function agoText(t: T, ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("game.mochi.ago.now");
  if (min < 60) return t("game.mochi.ago.min", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("game.mochi.ago.hour", { n: hours });
  return t("game.mochi.ago.day", { n: Math.floor(hours / 24) });
}

interface Reaction {
  key: number;
  care: Care;
  act?: Act;
  matched: boolean;
  /** 卵のときのお世話 */
  egg: boolean;
  /** 好き・苦手なやることだったか（New ははじめて分かった） */
  feel?: "likeNew" | "like" | "dislikeNew" | "dislike";
}

/** やることの名前（やることのない前からの手は、お世話の名前） */
const actName = (t: T, care: Care, act?: Act) => (act ? t(`game.mochi.act.${act}`) : t(`game.mochi.care.${care}`));
/** だれが何をしたか */
export const didText = (t: T, care: Care, act: Act | undefined, who: string) =>
  act ? t(`game.mochi.actDid.${act}`, { who }) : t(`game.mochi.did.${care}`, { who });

/**
 * 上に段階と日数、まん中にもちの部屋、その下に今のようす・できごと・具合。順番はないので、参加者にはいつでも
 * 6 つのお世話のボタン（押すとすぐに送る。罰はないので確かめない）。もちはいつでもさわれる（手にはならない）。
 * 下に、ふたりのお世話の回数（それぞれがさいごにしたお世話も）と体の色、たからもの。
 * おとなになったら姿と日数・回数・たからものを出す
 */
export function MochiBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const s = state as State;
  const { t } = useI18n();
  const clock = useClock();
  const finished = status.kind === "finished";
  const now = finished && s.adultAt !== null ? s.adultAt : nowOf(s, clock);
  const c = conditionAt(s, now);
  const stage = c.stage;
  const mood = finished ? "happy" : moodOf(c);
  const want = finished ? null : wantOf(s, c);
  const happening = finished ? null : happeningOf(s, now, c);
  const ready = !finished && c.growth >= ADULT;
  const color = bodyColor(s.bySeat);
  const moves = s.bySeat[0] + s.bySeat[1];
  /** 参加者なら、いつでもお世話できる（観戦者は見るだけ） */
  const carer = !finished && you !== null;

  const nameOf = (seat: Seat) => names[seat] || t(`game.mochi.seat${seat}`);
  const who = (seat: Seat) => (seat === you ? t("game.mochi.you") : t("game.mochi.who", { name: nameOf(seat) }));

  // お世話が増えたら（自分でも相手でも）、喜ぶ動きをしばらく出す
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const seen = useRef(moves);
  const knownSeen = useRef(s.known?.length ?? 0);
  useEffect(() => {
    // お世話のあとも卵のままなら、卵へのお世話
    const egg = stageOf(s.growth) === "egg";
    const known = s.known?.length ?? 0;
    if (moves > seen.current && s.last) {
      const act = s.last.act;
      const feeling = act ? feelingOf(s.seed, act) : null;
      const fresh = known > knownSeen.current;
      const feel = feeling === "like" ? (fresh ? "likeNew" : "like") : feeling === "dislike" ? (fresh ? "dislikeNew" : "dislike") : undefined;
      setReaction({ key: moves, care: s.last.care, act, matched: s.last.matched, egg, feel });
      if (placeOf(act)) savedMochiSeen.set(s.seed, moves);
    }
    if (moves < seen.current) setReaction(null);
    seen.current = moves;
    knownSeen.current = known;
  }, [moves]);
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), placeOf(reaction.act) ? OUTING_MS : REACT_MS);
    return () => clearTimeout(timer);
  }, [reaction?.key]);

  // 開いたとき、この端末でまだ見ていないおでかけ（相手が連れていった など）が最後のお世話なら、その様子を見せる
  useEffect(() => {
    const last = s.last;
    if (finished || !last || !placeOf(last.act) || Date.now() - last.at > OUTING_FRESH_MS) return;
    if (savedMochiSeen.get(s.seed) >= moves) return;
    savedMochiSeen.set(s.seed, moves);
    setReaction({ key: moves, care: last.care, act: last.act, matched: last.matched, egg: false });
  }, []);
  const outing = reaction ? placeOf(reaction.act) : undefined;

  // さわったときの、ぷにっ（手にはならない）
  const [taps, setTaps] = useState(0);

  /** やることを選んでいるお世話（選ぶ画面を開いている） */
  const [open, setOpen] = useState<Care | null>(null);
  const care = (which: Care, act?: Act) => {
    if (!interactive) return;
    setOpen(null);
    void onSubmit(act ? { care: which, act } : { care: which });
  };
  /** 今選べるやること。卵のあいだは空（お世話を押すとすぐに送る） */
  const options = carer ? actsAt(s, c) : [];
  const follows = options.filter(isFollowUp);
  const pickCare = (which: Care) => {
    if (stage === "egg" || options.length === 0) care(which);
    else setOpen((cur) => (cur === which ? null : which));
  };

  /** このお世話のときに日記に残ったできごと（お世話した人には「さっきの留守のあいだ」になる） */
  const lastEntry = s.diary.at(-1);
  const committed = s.last && lastEntry?.at === s.last.at ? lastEntry : undefined;
  const newTreasure = s.last ? s.treasures.find((x) => x.at === s.last!.at) : undefined;

  return (
    <div className={`mochi ${finished ? "done" : ""}`}>
      <Head s={s} stage={stage} growth={c.growth} now={now} finished={finished} />

      <section className="mochi-room-box">
        <svg
          viewBox={`0 0 ${ROOM.w} ${ROOM.h}`}
          className="mochi-room"
          role="img"
          aria-label={t("game.mochi.room", { stage: t(`game.mochi.stage.${stage}`), mood: t(`game.mochi.mood.${mood}`) })}
        >
          <Scene key={outing ? `out-${reaction!.key}` : "room"} outing={outing} shelf={s.treasures.map((x) => x.item)}>
            <g transform={`translate(180 ${ROOM.floor})`}>
              <g className={outing ? "mochi-walk-in" : undefined}>
                <g
                  className={[
                    "mochi-hit",
                    !carer && !finished ? "waiting" : "",
                    reaction ? "reacting" : "",
                    outing ? "outing" : "",
                    ready ? "ready" : "",
                    finished ? "cheer" : "",
                  ].join(" ")}
                  onPointerDown={() => setTaps((n) => n + 1)}
                >
                  <g key={taps} className={taps > 0 ? "mochi-squish" : ""}>
                    <Creature
                      stage={stage}
                      form={s.form}
                      color={color}
                      mood={outing ? "happy" : mood}
                      eggProgress={stage === "egg" ? Math.min(1, c.growth / HATCH) : 0}
                      delighted={!!reaction?.matched || reaction?.feel === "like" || reaction?.feel === "likeNew" || finished}
                      accessory={s.accessory}
                    />
                  </g>
                </g>
                <Sparks stage={stage} form={s.form} reaction={reaction} taps={taps} asleep={mood === "asleep"} ready={ready || finished} />
                {want && !reaction && <WantBubble stage={stage} form={s.form} care={want} />}
              </g>
            </g>
          </Scene>
        </svg>
        {outing && (
          <span key={reaction!.key} className="mochi-place-tag">
            {t(`game.mochi.place.${outing}`)}
          </span>
        )}
        {taps > 0 && (
          <span key={taps} className="mochi-tap-text" aria-hidden>
            {t(stage === "egg" ? "game.mochi.react.tapEgg" : "game.mochi.react.tap")}
          </span>
        )}
      </section>

      <Notes
        t={t}
        s={s}
        stage={stage}
        mood={mood}
        want={want}
        ready={ready}
        finished={finished}
        happening={happening}
        committed={committed?.happening ?? null}
        reaction={reaction}
        newTreasure={!!newTreasure && reaction !== null}
        lastText={s.last ? `${didText(t, s.last.care, s.last.act, who(s.last.seat))}・${agoText(t, clock - s.last.at)}` : null}
      />

      {finished ? (
        <Final s={s} />
      ) : (
        <>
          {stage !== "egg" && <Meters t={t} needs={c.needs} asleep={c.asleep} />}
          {carer && (
            <section className="mochi-cares-box">
              <p className="mochi-prompt">{t("game.mochi.carePrompt")}</p>
              {follows.length > 0 && (
                <div className="mochi-follow">
                  <span className="mochi-follow-title">{t("game.mochi.follow")}</span>
                  <div className="mochi-follow-row">
                    {follows.map((a) => (
                      <button key={a} type="button" className="mochi-act follow" disabled={!interactive} onClick={() => care(ACT_DEFS[a].care, a)}>
                        <CareIcon care={ACT_DEFS[a].care} />
                        <span className="mochi-act-name">{t(`game.mochi.act.${a}`)}</span>
                        {want === ACT_DEFS[a].care && <span className="mochi-care-mark">{t("game.mochi.want.mark")}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mochi-cares">
                {CARES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`mochi-care care-${k} ${want === k ? "wanted" : ""} ${open === k ? "open" : ""}`}
                    disabled={!interactive}
                    aria-expanded={stage === "egg" ? undefined : open === k}
                    onClick={() => pickCare(k)}
                  >
                    <CareIcon care={k} />
                    <span className="mochi-care-name">{t(`game.mochi.care.${k}`)}</span>
                    {want === k && <span className="mochi-care-mark">{t("game.mochi.want.mark")}</span>}
                  </button>
                ))}
              </div>
              {open && (
                <ActSheet
                  t={t}
                  s={s}
                  c={c}
                  care={open}
                  options={options}
                  disabled={!interactive}
                  onPick={(a) => care(open, a)}
                  onClose={() => setOpen(null)}
                />
              )}
            </section>
          )}
        </>
      )}

      {stage !== "egg" && <Likes t={t} s={s} />}

      <Two t={t} s={s} names={names} you={you} color={color} clock={clock} />
      <Treasures t={t} s={s} open={finished} />
    </div>
  );
}

/** 具合への効き方を、↑↓ の小さな札で */
function Effects({ t, act }: { t: T; act: Act }) {
  const e = ACT_DEFS[act].effect as Partial<Mochi.Needs>;
  const chips = (["tummy", "joy", "sleepy"] as const)
    .map((k) => ({ k, v: e[k] ?? 0 }))
    .filter((x) => Math.abs(x.v) >= 3);
  return (
    <span className="mochi-effects">
      {chips.map(({ k, v }) => (
        <span key={k} className={`mochi-effect e-${k} ${v > 0 ? "up" : "down"}`}>
          {t(`game.mochi.need.${k}`)}
          <b aria-hidden>{(v > 0 ? "↑" : "↓").repeat(Math.abs(v) >= 30 ? 2 : 1)}</b>
        </span>
      ))}
    </span>
  );
}

/**
 * お世話を押したあとの、やることを選ぶ画面。今選べるものと、こどもになったら選べるもの（押せない）。
 * たからもので増えるものがまだあれば、そのことを一言。好き・苦手が分かったものには印
 */
function ActSheet({
  t,
  s,
  c,
  care,
  options,
  disabled,
  onPick,
  onClose,
}: {
  t: T;
  s: State;
  c: Mochi.Condition;
  care: Care;
  options: Act[];
  disabled: boolean;
  onPick(act: Act): void;
  onClose(): void;
}) {
  const known = new Set(s.known ?? []);
  const mine = ACTS.filter((a) => ACT_DEFS[a].care === care);
  const shown = mine.filter((a) => options.includes(a) || ACT_DEFS[a].unlock === "child");
  const moreByItems = mine.some((a) => {
    const u = ACT_DEFS[a].unlock as Mochi.ActDef["unlock"];
    return typeof u === "object" && "item" in u && !options.includes(a);
  });
  return (
    <div className={`mochi-sheet care-${care}`} role="group" aria-label={t(`game.mochi.ask.${care}`)}>
      <div className="mochi-sheet-head">
        <CareIcon care={care} />
        <span>{t(`game.mochi.ask.${care}`)}</span>
        <button type="button" className="mochi-sheet-close" aria-label={t("game.mochi.close")} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mochi-acts">
        {shown.map((a) => {
          const locked = !options.includes(a);
          const feeling = known.has(a) ? feelingOf(s.seed, a) : null;
          return (
            <button
              key={a}
              type="button"
              className={`mochi-act ${locked ? "locked" : ""} ${isFollowUp(a) ? "follow" : ""} ${feeling ?? ""}`}
              disabled={disabled || locked}
              onClick={() => onPick(a)}
            >
              <ActIcon act={a} />
              <span className="mochi-act-text">
                <span className="mochi-act-name">
                  {t(`game.mochi.act.${a}`)}
                  {feeling === "like" && <HeartMark label={t("game.mochi.likes.like")} />}
                  {feeling === "dislike" && <span className="mochi-act-tag">{t("game.mochi.likes.dislike")}</span>}
                </span>
                {locked ? (
                  <span className="mochi-act-lock">{t("game.mochi.lock.child")}</span>
                ) : ACT_DEFS[a].care === "walk" ? (
                  <Finds t={t} s={s} act={a} />
                ) : (
                  <Effects t={t} act={a} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      {moreByItems && <p className="mochi-sheet-note muted">{t("game.mochi.lock.items")}</p>}
    </div>
  );
}

/** おでかけの行き先で見つかるもの。持っているものは絵、まだのものは「？」 */
function Finds({ t, s, act }: { t: T; s: State; act: Act }) {
  const place = (ACT_DEFS[act] as Mochi.ActDef).place!;
  const have = new Set(s.treasures.map((x) => x.item));
  return (
    <span className="mochi-finds">
      {Mochi.PLACE_ITEMS[place].map((item) =>
        have.has(item) ? (
          <ItemSvg key={item} item={item} className="mochi-find" />
        ) : (
          <span key={item} className="mochi-find unknown" aria-label={t("game.mochi.notYet")}>
            ?
          </span>
        ),
      )}
    </span>
  );
}

function HeartMark({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 24 24" className="mochi-heart" role="img" aria-label={label}>
      <path d="M12 20C6 15.6 3.6 12.6 3.6 9.6a4 4 0 0 1 8.4-1.6 4 4 0 0 1 8.4 1.6c0 3-2.4 6-8.4 10.4z" />
    </svg>
  );
}

/** このもちの好み（好きなこと 3 つと苦手なこと 1 つ）。分かったものだけ名前を出し、ほかは「？」 */
function Likes({ t, s }: { t: T; s: State }) {
  const { likes, dislike } = likesOf(s.seed);
  const known = new Set(s.known ?? []);
  const slot = (a: Act) =>
    known.has(a) ? (
      <span key={a} className="mochi-like-chip on">
        {t(`game.mochi.act.${a}`)}
      </span>
    ) : (
      <span key={a} className="mochi-like-chip">
        ？
      </span>
    );
  return (
    <section className="mochi-likes">
      <h3>{t("game.mochi.likes.title")}</h3>
      <div className="mochi-like-row">
        <span className="mochi-like-label like">
          <HeartMark label="" />
          {t("game.mochi.likes.like")}
        </span>
        {likes.map(slot)}
      </div>
      <div className="mochi-like-row">
        <span className="mochi-like-label">{t("game.mochi.likes.dislike")}</span>
        {slot(dislike)}
      </div>
      {known.size < likes.length + 1 && <p className="muted mochi-like-hint">{t("game.mochi.likes.hint")}</p>}
    </section>
  );
}

/** 段階・日数・つぎの姿までの進み */
function Head({ s, stage, growth, now, finished }: { s: State; stage: Mochi.Stage; growth: number; now: number; finished: boolean }) {
  const { t } = useI18n();
  const progress = finished ? 1 : stage === "child" && growth >= ADULT ? 1 : stageProgress(growth);
  return (
    <div className="mochi-head">
      <span className={`mochi-stage stage-${stage}`}>{t(`game.mochi.stage.${stage}`)}</span>
      {s.bornAt !== null && <span className="mochi-day">{t("game.mochi.day", { n: dayOf(s, now) })}</span>}
      <span className="mochi-steps" aria-hidden>
        {Mochi.STAGES.map((k, i) => (
          <span key={k} className={`mochi-step ${Mochi.STAGES.indexOf(stage) >= i ? "on" : ""}`} />
        ))}
      </span>
      {!finished && (
        <span className="mochi-growth" role="meter" aria-label={t("game.mochi.growth")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

/** 部屋か、おでかけ先の景色。切りかわるときは、ふわっと出す */
function Scene({ outing, shelf, children }: { outing?: Mochi.Place; shelf: Mochi.Item[]; children: ReactNode }) {
  return <g className="mochi-scene">{outing ? <Outdoors place={outing}>{children}</Outdoors> : <Room shelf={shelf}>{children}</Room>}</g>;
}

/** ほしいもの（部屋の中の吹き出し） */
function WantBubble({ stage, form, care }: { stage: Mochi.Stage; form: Mochi.Form | null; care: Care }) {
  const { w, h } = shapeOf(stage, form);
  const x = w * 0.44 + 6;
  const y = -h - 18;
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      {/* ゆれる動き（CSS の transform）は内側に付ける。外側の位置（transform 属性）を上書きしないように */}
      <g className="mochi-bubble">
        <circle cx={-10} cy={22} r="2.6" className="mochi-bubble-bg" />
        <circle cx={-4} cy={16} r="3.6" className="mochi-bubble-bg" />
        <rect x="-2" y="-16" width="34" height="30" rx="13" className="mochi-bubble-bg" />
        <svg x="3" y="-13" width="24" height="24" viewBox="0 0 24 24" className="mochi-icon">
          <CareShape care={care} />
        </svg>
      </g>
    </g>
  );
}

/** 喜んだとき・さわったとき・眠っているときの小さなしるし */
function Sparks({
  stage,
  form,
  reaction,
  taps,
  asleep,
  ready,
}: {
  stage: Mochi.Stage;
  form: Mochi.Form | null;
  reaction: Reaction | null;
  taps: number;
  asleep: boolean;
  ready: boolean;
}) {
  const { w, h } = stage === "egg" ? { w: 68, h: 84 } : shapeOf(stage, form);
  const top = -h - 6;
  const list: { kind: Spark; x: number; y: number; delay: number; className?: string }[] = [];
  if (reaction) {
    const kind: Spark = reaction.egg ? "heart" : sparkOf(reaction.care);
    [-0.34, 0.06, 0.38, -0.1].forEach((dx, i) => list.push({ kind, x: dx * w, y: top + (i % 2) * 8, delay: i * 0.18 }));
    if (reaction.matched) [-0.5, 0.52].forEach((dx, i) => list.push({ kind: "star", x: dx * w, y: top + 16, delay: 0.3 + i * 0.2 }));
  }
  return (
    <g className="mochi-sparks" aria-hidden>
      {list.map((p, i) => (
        <g key={`${reaction?.key}-${i}`} transform={`translate(${p.x} ${p.y})`}>
          <g className="mochi-p" style={{ animationDelay: `${p.delay}s` }}>
            <SparkShape kind={p.kind} />
          </g>
        </g>
      ))}
      {taps > 0 && (
        <g key={`tap-${taps}`} transform={`translate(${((taps * 37) % 60) - 30} ${top + 4})`}>
          <g className="mochi-p quick">
            <SparkShape kind="heart" />
          </g>
        </g>
      )}
      {asleep && !reaction && (
        <g transform={`translate(${w * 0.34} ${top + 6})`}>
          {[0, 1, 2].map((i) => (
            <g key={i} className="mochi-z" style={{ animationDelay: `${i * 1.1}s` }}>
              <SparkShape kind="z" />
            </g>
          ))}
        </g>
      )}
      {ready && (
        <g>
          {[
            [-0.62, -0.5],
            [0.6, -0.8],
            [-0.3, -1.1],
            [0.66, -0.2],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x! * w} ${y! * h})`}>
              <g className="mochi-twinkle" style={{ animationDelay: `${i * 0.5}s` }}>
                <SparkShape kind="star" />
              </g>
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

/** 部屋の下の文：お世話への反応・できごと・ほしいもの・最後のお世話 */
function Notes({
  t,
  s,
  stage,
  mood,
  want,
  ready,
  finished,
  happening,
  committed,
  reaction,
  newTreasure,
  lastText,
}: {
  t: T;
  s: State;
  stage: Mochi.Stage;
  mood: Mochi.Mood;
  want: Care | null;
  ready: boolean;
  finished: boolean;
  happening: Happening | null;
  committed: Happening | null;
  reaction: Reaction | null;
  newTreasure: boolean;
  lastText: string | null;
}) {
  if (finished) return null;
  const lines: { text: string; className: string; item?: Mochi.Item }[] = [];
  if (reaction) {
    const text = reaction.egg
      ? t(`game.mochi.eggReact.${reaction.care}`)
      : reaction.act
        ? t(`game.mochi.actReact.${reaction.act}`)
        : t(`game.mochi.react.${reaction.care}`);
    lines.push({ text: reaction.matched ? `${t("game.mochi.react.matched")} ${text}` : text, className: "react" });
    if (reaction.feel && reaction.act) {
      lines.push({ text: t(`game.mochi.feel.${reaction.feel}`, { act: t(`game.mochi.act.${reaction.act}`) }), className: `feel ${reaction.feel}` });
    }
    if (committed) lines.push({ text: happeningText(t, committed), className: "hap", item: committed.kind === "found" ? committed.item : undefined });
    if (newTreasure) lines.push({ text: t("game.mochi.newTreasure"), className: "new" });
  } else if (happening) {
    lines.push({ text: happeningText(t, happening), className: "hap", item: happening.kind === "found" ? happening.item : undefined });
  } else if (committed) {
    lines.push({ text: happeningText(t, committed), className: "hap past", item: committed.kind === "found" ? committed.item : undefined });
  }

  const feeling = ready
    ? t("game.mochi.ready")
    : stage === "egg"
      ? t("game.mochi.want.egg")
      : want
        ? t(`game.mochi.want.${want}`)
        : mood === "asleep"
          ? t("game.mochi.want.asleep")
          : t("game.mochi.want.none");

  return (
    <section className="mochi-note" aria-live="polite">
      {lines.map((l, i) => (
        <p key={`${l.className}-${i}`} className={`mochi-note-line ${l.className}`}>
          {l.item && <ItemSvg item={l.item} />}
          <span>{l.text}</span>
        </p>
      ))}
      <p className={`mochi-feeling ${want ? "want" : ""}`}>
        {want && <CareIcon care={want} />}
        <span>{feeling}</span>
      </p>
      {lastText && <p className="mochi-last muted">{lastText}</p>}
    </section>
  );
}

/** おなか・きげん・ねむけ */
function Meters({ t, needs, asleep }: { t: T; needs: Mochi.Needs; asleep: boolean }) {
  const rows: { key: "tummy" | "joy" | "sleepy"; value: number; icon: Care }[] = [
    { key: "tummy", value: needs.tummy, icon: "feed" },
    { key: "joy", value: needs.joy, icon: "pet" },
    { key: "sleepy", value: needs.sleepy, icon: "sleep" },
  ];
  return (
    <section className="mochi-meters">
      {rows.map((r) => (
        <div key={r.key} className={`mochi-meter m-${r.key} ${r.key === "sleepy" && asleep ? "asleep" : ""}`}>
          <CareIcon care={r.icon} />
          <span className="mochi-meter-name">{t(`game.mochi.need.${r.key}`)}</span>
          <span
            className="mochi-bar"
            role="meter"
            aria-label={t(`game.mochi.need.${r.key}`)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(r.value)}
          >
            <span style={{ width: `${Math.max(3, Math.round(r.value))}%` }} />
          </span>
        </div>
      ))}
    </section>
  );
}

/** ふたりのお世話の回数と、それぞれがさいごにしたお世話、混ざった体の色 */
function Two({
  t,
  s,
  names,
  you,
  color,
  clock,
}: {
  t: T;
  s: State;
  names: Record<Seat, string>;
  you: Seat | null;
  color: string;
  clock: number;
}) {
  const total = s.bySeat[0] + s.bySeat[1];
  const share = total === 0 ? 0.5 : s.bySeat[1] / total;
  const nameOf = (seat: Seat) => (seat === you ? t("game.mochi.you") : names[seat] || t(`game.mochi.seat${seat}`));
  return (
    <section className="mochi-two">
      <h3>{t("game.mochi.two")}</h3>
      <div className="mochi-two-row">
        {([0, 1] as Seat[]).map((seat) => {
          const last = lastCareOf(s, seat);
          return (
            <div key={seat} className={`mochi-two-cell seat${seat}`}>
              <span className="mochi-two-who">
                <span className="token dot" aria-hidden />
                <span className="mochi-two-name">{nameOf(seat)}</span>
                <span className="mochi-two-count">{t("game.mochi.times", { n: s.bySeat[seat] })}</span>
              </span>
              {/* さいごにしたお世話。いちばん新しいお世話には色を付ける */}
              <span className={`mochi-two-last ${last && s.last?.seat === seat && s.last.at === last.at ? "latest" : ""}`}>
                {last ? (
                  <>
                    <CareIcon care={last.care} />
                    <span>
                      {actName(t, last.care, last.act)}・{agoText(t, clock - last.at)}
                    </span>
                  </>
                ) : (
                  <span>{t("game.mochi.lastNone")}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mochi-mix" aria-hidden>
        <span className="mochi-mix-bar" style={{ background: MIX_BAR }}>
          <span className="mochi-mix-pin" style={{ left: `${share * 100}%`, background: color }} />
        </span>
      </div>
      <p className="mochi-two-note muted">{t("game.mochi.colorNote")}</p>
    </section>
  );
}

/** たからものの一覧。まだ見つけていないものは、うすい「？」 */
function Treasures({ t, s, open }: { t: T; s: State; open: boolean }) {
  const found = new Map<Mochi.Item, number>();
  for (const x of s.treasures) if (!found.has(x.item)) found.set(x.item, x.at);
  const latest = s.treasures.at(-1);
  return (
    <details className="mochi-treasures panel fold" open={open || undefined}>
      <summary>
        {t("game.mochi.treasures")}
        <span className="mochi-count num">
          {found.size} / {ITEMS.length}
        </span>
      </summary>
      {found.size === 0 && <p className="muted mochi-empty">{t("game.mochi.treasuresEmpty")}</p>}
      <ul className="mochi-items">
        {ITEMS.map((item) => {
          const at = found.get(item);
          if (at === undefined)
            return (
              <li key={item} className="mochi-item-tile unknown" aria-label={t("game.mochi.notYet")}>
                <span className="mochi-q" aria-hidden>
                  ?
                </span>
              </li>
            );
          return (
            <li key={item} className={`mochi-item-tile ${latest?.item === item && latest.at === s.last?.at ? "new" : ""}`}>
              <ItemSvg item={item} />
              <span className="mochi-item-name">{t(`game.mochi.item.${item}`)}</span>
              <span className="mochi-item-day muted">{t("game.mochi.foundOn", { n: dayOf(s, at) })}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** おとなになったときの姿・日数・回数・多かったお世話 */
function Final({ s }: { s: State }) {
  const { t } = useI18n();
  const form = s.form ?? "harmony";
  const total = s.bySeat[0] + s.bySeat[1];
  const top = [...CARES].sort((a, b) => s.cares[b] - s.cares[a] || CARES.indexOf(a) - CARES.indexOf(b)).filter((k) => s.cares[k] > 0).slice(0, 3);
  const kinds = new Set(s.treasures.map((x) => x.item)).size;
  return (
    <section className="mochi-final">
      <p className="mochi-final-lead">{t("game.mochi.final.lead")}</p>
      <h2 className="mochi-final-name">{t(`game.mochi.form.${form}`)}</h2>
      <p className="mochi-final-desc">{t(`game.mochi.formDesc.${form}`)}</p>
      {s.accessory && <p className="mochi-final-desc accessory">{t(`game.mochi.accessoryDesc.${s.accessory}`)}</p>}
      <dl className="mochi-stats">
        <div>
          <dt>{t("game.mochi.final.days")}</dt>
          <dd>{t("game.mochi.final.daysValue", { n: s.adultAt !== null ? dayOf(s, s.adultAt) : 1 })}</dd>
        </div>
        <div>
          <dt>{t("game.mochi.final.cares")}</dt>
          <dd>{t("game.mochi.times", { n: total })}</dd>
        </div>
        <div>
          <dt>{t("game.mochi.final.treasures")}</dt>
          <dd>{t("game.mochi.final.treasuresValue", { n: kinds })}</dd>
        </div>
      </dl>
      {top.length > 0 && (
        <div className="mochi-most">
          <span className="mochi-most-title muted">{t("game.mochi.final.most")}</span>
          <ul>
            {top.map((k) => (
              <li key={k}>
                <CareIcon care={k} />
                <span>{t(`game.mochi.care.${k}`)}</span>
                <span className="num">{s.cares[k]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
