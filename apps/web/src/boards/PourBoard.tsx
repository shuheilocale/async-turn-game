import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pour, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./PourBoard.css";

const { RIM, MAX_EXTRA, MAX_POUR, FLOW_PER_SEC } = Pour;

/*
 * コップの絵の座標（viewBox 0 0 240 290）。ふちまでは 1 ml を 0.81px、ふちより上は盛り上がりが
 * 大きくなりすぎないよう 0.6px で描く
 */
const CX = 120;
const RIM_Y = 100;
const BOTTOM_Y = 262;
const BASE_Y = 276;
const SPOUT_Y = 46;
const PX_BELOW = (BOTTOM_Y - RIM_Y) / RIM;
const PX_ABOVE = 0.6;
/** 内側の壁の半分の幅（下すぼまり） */
const halfAt = (y: number) => 52 + (14 * (BOTTOM_Y - Math.max(RIM_Y, y))) / (BOTTOM_Y - RIM_Y);
const yOf = (ml: number) => (ml <= RIM ? BOTTOM_Y - ml * PX_BELOW : RIM_Y - (ml - RIM) * PX_ABOVE);

/** 相手の手を再生しはじめるまでの間（開いてすぐ動くと何が起きたか分からない） */
const REPLAY_DELAY_MS = 500;
/** 目隠しになった瞬間の「目隠し！」を出しておく時間 */
const BLIND_FLASH_MS = 1600;
/** 終局して霧が晴れる動きの時間 */
const FOG_LIFT_MS = 900;
/** 目隠しのあとの最低量を並べて見せる数 */
const LADDER = 6;

/**
 * 水が増えていく動き。start からの時間で amount まで注ぐ。mine は自分が今注いだ分。
 * from は注ぎはじめの水位で、目隠しで分からなければ null（水位は描かず、流れだけ見せる）
 */
interface Anim {
  from: number | null;
  amount: number;
  start: number;
  seat: Seat;
  mine: boolean;
  /** この手を含めた手の数。サーバからこの数まで手が届いたら、自分の手の動きを止める */
  count: number;
}

/** その時刻までに注いだ量 */
const pouredAt = (a: Anim, now: number) => Math.min(a.amount, (Math.max(0, now - a.start) * FLOW_PER_SEC) / 1000);

/** 水の形。ふちを越えたら、ふちの上に丸く盛り上がる */
function waterPath(level: number) {
  const bottom = `L${CX + 52} ${BOTTOM_Y} L${CX - 52} ${BOTTOM_Y} Z`;
  if (level <= RIM) {
    const y = yOf(level);
    const h = halfAt(y);
    return `M${CX - h} ${y} L${CX + h} ${y} ${bottom}`;
  }
  const dome = (level - RIM) * PX_ABOVE * 1.33;
  return `M${CX - 66} ${RIM_Y} C${CX - 30} ${RIM_Y - dome} ${CX + 30} ${RIM_Y - dome} ${CX + 66} ${RIM_Y} ${bottom}`;
}

/** 水面の線（少し明るく描く） */
function surfacePath(level: number) {
  if (level <= RIM) {
    const y = yOf(level);
    const h = halfAt(y);
    return `M${CX - h} ${y} L${CX + h} ${y}`;
  }
  const dome = (level - RIM) * PX_ABOVE * 1.33;
  return `M${CX - 66} ${RIM_Y} C${CX - 30} ${RIM_Y - dome} ${CX + 30} ${RIM_Y - dome} ${CX + 66} ${RIM_Y}`;
}

/** その水位の高さに引く横線。ふちより上は、ふちの幅で引く */
function lineAt(ml: number, over = 5) {
  const y = yOf(ml);
  const h = (ml <= RIM ? halfAt(y) : 66) + over;
  return { x1: CX - h, x2: CX + h, y1: y, y2: y };
}

/**
 * 霧（すりガラス）の形。目隠しの水位からふちまでのコップの内側と、ふちの上の盛り上がりまで覆う。
 * 下の端は少し波打たせて、霧らしく見せる
 */
function fogPath(from: number) {
  const y = yOf(from);
  const h = halfAt(y);
  const top = RIM_Y - 34;
  const waves = 4;
  const w = (2 * h) / waves;
  let bottom = "";
  for (let i = waves - 1; i >= 0; i--) {
    const x = CX - h + w * i;
    bottom += ` Q${x + w / 2} ${y + (i % 2 === 0 ? 3 : -3)} ${x} ${y}`;
  }
  return (
    `M${CX + h} ${y} L${CX + 68} ${RIM_Y} ` +
    `C${CX + 76} ${RIM_Y - 18} ${CX + 44} ${top} ${CX} ${top} ` +
    `C${CX - 44} ${top} ${CX - 76} ${RIM_Y - 18} ${CX - 68} ${RIM_Y} ` +
    `L${CX - h} ${y}${bottom} Z`
  );
}

/** すりガラスにつく水滴（霧の上に少し明るく描く） */
const DROPS = [
  [CX - 38, RIM_Y + 8, 2.4],
  [CX + 30, RIM_Y + 2, 1.8],
  [CX - 12, RIM_Y + 26, 1.6],
  [CX + 44, RIM_Y + 22, 2.2],
  [CX - 46, RIM_Y - 6, 1.5],
  [CX + 12, RIM_Y - 14, 1.9],
] as const;

/**
 * 「そそぐ」を押している間だけ水が出て、離した瞬間にその量を送る（確定を待たない）。
 * 相手が注いだ分は、開いたときや届いたときに、水が増えるところを同じ速さで再生する。
 * blind（目隠しの設定）を渡すと、みずそそぎ・ハードの盤になる。目隠し中は目隠しの水位より上を
 * 霧で覆い、水位も注いだ量も出さない。相手の手は、時間が量の手がかりになるので再生しない
 */
export function PourBoard({
  state,
  status,
  you,
  names,
  interactive,
  onSubmit,
  blind = null,
}: BoardProps & { blind?: Pour.BlindRule | null }) {
  const { t } = useI18n();
  const s = state as Pour.PourView;
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("game.pour.you") : t("game.pour.who", { name: names[seat] }));
  /** 今注げる最低の量（目隠しのあとは小さくなって、1 回ごとに増える） */
  const min = Pour.minPourFor(blind, s);
  const blindAt = Pour.blindStart(s);
  const ids = useId().replace(/:/g, "");

  /** 押しはじめた時刻。押していなければ null */
  const [press, setPress] = useState<number | null>(null);
  const pressRef = useRef<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [now, setNow] = useState(() => performance.now());
  /** 見たことのある手の数。増えたら、増えた最後の 1 手を再生する */
  const seen = useRef<number | null>(null);
  const last = s.pours.at(-1) ?? null;

  // 開いたときと、相手の手が届いたときに、直前の 1 手を再生する
  useEffect(() => {
    const prev = seen.current;
    seen.current = s.pours.length;
    if (!last) {
      setAnim(null);
      return;
    }
    if (prev === null ? last.seat === you : s.pours.length <= prev) return;
    // 自分が今注いだ分は、押していたときの動きをそのまま続ける
    if (anim?.mine && last.seat === you) return;
    // 目隠しで伏せた手は再生しない（流れていた時間で量が分かってしまう）
    if (last.amount === null || s.level === null) {
      setAnim(null);
      return;
    }
    const start = performance.now() + (prev === null ? REPLAY_DELAY_MS : 0);
    setAnim({ from: s.level - last.amount, amount: last.amount, start, seat: last.seat, mine: false, count: s.pours.length });
    // 手の数が変わったときだけ見る
  }, [s.pours.length]);

  // 押している間と再生している間は、毎フレーム水位を描き直す
  const moving = press !== null || anim !== null;
  useEffect(() => {
    if (!moving) return;
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  const pressed = press !== null ? Math.min(MAX_POUR, ((now - press) * FLOW_PER_SEC) / 1000) : 0;
  // 今描く水位。目隠しで分からなければ null
  const from = press !== null ? s.level : anim ? anim.from : s.level;
  const shown = from !== null ? from + (press !== null ? pressed : anim ? pouredAt(anim, now) : 0) : s.level;
  const animDone = anim !== null && pouredAt(anim, now) >= anim.amount;

  // 再生が終わったら止める。自分の手は、サーバからその手が届くまで待つ
  useEffect(() => {
    if (anim && animDone && (!anim.mine || s.pours.length >= anim.count)) setAnim(null);
  }, [animDone, s.pours.length]);

  // 目隠し中か。自分が注いでいる途中で目隠しの水位を越えたら、その場で霧がかかる
  const fogged = blind !== null && playing && (s.blind || (shown !== null && shown >= blind.from));

  // 霧がかかった瞬間に「目隠し！」を出す。終局で霧が晴れるときは、晴れる動きを見せる
  const [flash, setFlash] = useState(false);
  const [lifting, setLifting] = useState(false);
  const wasFogged = useRef(fogged);
  useEffect(() => {
    const before = wasFogged.current;
    wasFogged.current = fogged;
    if (fogged === before) return;
    const set = fogged ? setFlash : setLifting;
    set(true);
    const timer = setTimeout(() => set(false), fogged ? BLIND_FLASH_MS : FOG_LIFT_MS);
    return () => clearTimeout(timer);
  }, [fogged]);

  const start = () => {
    if (!myTurn || !interactive || pressRef.current !== null || anim?.mine) return;
    const time = performance.now();
    pressRef.current = time;
    setPress(time);
    setNow(time);
    setAnim(null); // 相手の手の再生中なら、終わりまで飛ばす
  };

  const finish = () => {
    const began = pressRef.current;
    if (began === null) return;
    pressRef.current = null;
    setPress(null);
    const amount = Pour.amountForHold(performance.now() - began, min);
    // 最低量に届く前に離しても、最低量までは出つづける
    setAnim({ from: s.level, amount, start: began, seat: me, mine: true, count: s.pours.length + 1 });
    onSubmit({ amount }).then((ok) => {
      if (!ok) setAnim(null);
    });
  };

  // 45 ml に届いたら、押したままでも止めて送る
  useEffect(() => {
    if (press !== null && now - press >= Pour.holdMsFor(MAX_POUR)) finish();
  }, [now, press]);

  // 押している途中で画面を離れたら、そこで離したことにする
  useEffect(() => {
    if (press === null) return;
    const stop = () => finish();
    const hidden = () => document.visibilityState === "hidden" && finish();
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [press]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start();
  };
  const isKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

  const limit = s.limit;
  // あふれたあと（もつ量が分かってから）は、盛り上がりをもつ量で止めて、外へこぼす
  const spilling = limit !== null && shown !== null && shown > limit;
  // 霧の中は描かない（目隠しの水位までで止める）
  const drawn = fogged ? (blind?.from ?? 0) : Math.min(shown ?? 0, limit ?? RIM + MAX_EXTRA);
  const pouring = press !== null || (anim !== null && !animDone && now >= anim.start);
  const replaying = anim !== null && !anim.mine && !animDone;
  // もつ量は、水が増える動きが終わってから見せる（再生の途中で結果が分からないように）
  const reveal = limit !== null && !(anim !== null && !animDone);
  const shownInt = shown === null ? 0 : Math.round(shown);
  // 自分の番に、今の水位から 1 回で届く範囲（最低・最大の線）。目隠し中は水位が分からないので引かない
  const showBand = myTurn && interactive && !anim && !fogged && s.level !== null;
  const minLine = lineAt((s.level ?? 0) + min);
  const maxLine = lineAt((s.level ?? 0) + MAX_POUR);
  // これまでの手ごとの水位（右の目盛りに印を付ける）。伏せた手からあとは分からない
  const levels = s.pours.reduce<(number | null)[]>((acc, p) => {
    const prev = acc.length > 0 ? acc.at(-1)! : 0;
    return [...acc, prev === null || p.amount === null ? null : prev + p.amount];
  }, []);

  const rimText = fogged
    ? t("game.pourhard.blindMin", { min })
    : spilling
      ? t("game.pour.overflowed")
      : shownInt < RIM
        ? t("game.pour.toRim", { n: RIM - shownInt })
        : shownInt === RIM
          ? t("game.pour.atRim")
          : t("game.pour.overRim", { n: shownInt - RIM });

  let note: string;
  if (press !== null) note = "";
  else if (replaying && anim) note = t("game.pour.replaying", { who: who(anim.seat) });
  else if (!playing) note = s.spilledBy !== null ? t("game.pour.spilled", { who: who(s.spilledBy) }) : "";
  else if (myTurn) note = t(fogged ? "game.pourhard.yourTurn" : "game.pour.yourTurn");
  else note = names[s.turn] ? t("game.pour.waiting", { name: names[s.turn] }) : "";
  const lastText =
    last && !replaying && press === null
      ? last.amount === null
        ? t("game.pourhard.pouredBlind", { who: who(last.seat) })
        : t("game.pour.poured", { who: who(last.seat), n: last.amount })
      : null;
  const bandText = myTurn && interactive && !anim && fogged ? t("game.pourhard.band", { min, max: MAX_POUR }) : null;

  // 目隠しのあとの最低量の並び。今の分の 2 つ前から見せ、今の分を光らせ、終わった分は薄くする。
  // 最低が 45 ml に届く回（last45）より先は同じなので出さない
  const last45 = blind ? Math.ceil((MAX_POUR - blind.firstMin) / blind.step) : 0;
  const ladderFrom = Math.max(0, Math.min(s.blindPours - 2, last45 - LADDER + 1));
  const ladder = blind
    ? Array.from({ length: LADDER }, (_, k) => ladderFrom + k).map((i) => ({
        i,
        ml: Pour.minPourFor(blind, { blind: true, blindPours: i }),
        mark: !s.blind ? "" : i < s.blindPours ? "done" : i === s.blindPours && playing ? "now" : "",
      }))
    : [];

  return (
    <div className={`pour stack-sm ${blind ? "pour-hard" : ""}`}>
      <div className={`pour-readout ${fogged ? "fogged" : ""}`} aria-live="off">
        <span className="muted small">{t("game.pour.now")}</span>
        <strong className="num">{fogged ? t("game.pourhard.unknown") : t("game.pour.ml", { n: shownInt })}</strong>
        <span className={`small ${spilling ? "pour-spilled-text" : shownInt > RIM && !fogged ? "pour-over" : ""}`}>{rimText}</span>
      </div>

      {blind && (
        <div className="pour-ladder">
          <span className="muted small pour-ladder-caption">
            {!s.blind
              ? t("game.pourhard.ladder", { from: blind.from })
              : s.blindPours === 0
                ? t("game.pourhard.count0")
                : t("game.pourhard.count", { n: s.blindPours })}
          </span>
          <ol aria-label={t("game.pourhard.ladderLabel")}>
            {ladderFrom > 0 && <li className="more" aria-hidden>…</li>}
            {ladder.map(({ i, ml, mark }) => (
              <li key={i} className={mark}>
                <span className="num">{ml}</span>
              </li>
            ))}
            {ladder.at(-1)!.ml < MAX_POUR && <li className="more" aria-hidden>…</li>}
          </ol>
        </div>
      )}

      <div
        className={`pour-cup seat${me} ${spilling ? "spilled" : ""}`}
        role="img"
        aria-label={fogged ? t("game.pourhard.cup", { rim: RIM }) : t("game.pour.cup", { n: s.level ?? shownInt, rim: RIM })}
      >
        <svg viewBox="0 0 240 290" aria-hidden>
          {blind && (
            <defs>
              <linearGradient id={`${ids}-fog`} x1="0" y1="1" x2="0" y2="0">
                <stop className="pour-fog-low" offset="0" />
                <stop className="pour-fog-mid" offset="0.35" />
                <stop className="pour-fog-high" offset="1" />
              </linearGradient>
              {/* 霧のふちをぼかす */}
              <filter id={`${ids}-soft`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="1.2" />
              </filter>
              {/* すりガラスのざらつき。白い細かな点を霧の形の中にだけ散らす（濃さは CSS の --frost） */}
              <filter id={`${ids}-frost`} x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
                <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 -0.12" result="speck" />
                <feComposite in="speck" in2="SourceGraphic" operator="in" />
              </filter>
            </defs>
          )}

          {/* 蛇口 */}
          <g className="pour-faucet">
            <rect x="58" y="4" width="24" height="10" rx="4" />
            <rect x="24" y="12" width="110" height="16" rx="8" />
            <rect x={CX - 10} y="20" width="20" height={SPOUT_Y - 20} rx="5" />
          </g>

          {/* コップの内側、流れ落ちる水、たまった水、コップ */}
          <path className="pour-glass-back" d={`M${CX - 66} ${RIM_Y} L${CX - 52} ${BOTTOM_Y} L${CX + 52} ${BOTTOM_Y} L${CX + 66} ${RIM_Y} Z`} />
          {pouring && <line className="pour-stream" x1={CX} y1={SPOUT_Y} x2={CX} y2={yOf(drawn) + 2} />}
          {drawn > 0 && (
            <>
              <path className="pour-water" d={waterPath(drawn)} />
              <path className="pour-surface" d={surfacePath(drawn)} />
            </>
          )}
          <path className="pour-glass" d={`M${CX - 68} ${RIM_Y} L${CX - 54} ${BASE_Y} L${CX + 54} ${BASE_Y} L${CX + 68} ${RIM_Y}`} />
          <path className="pour-glass-base" d={`M${CX - 52} ${BOTTOM_Y + 1} L${CX + 52} ${BOTTOM_Y + 1}`} />

          {/* ふち */}
          <text className="pour-rim-label" x={CX + 74} y={RIM_Y + 3.5}>
            {t("game.pour.rim")} {RIM}
          </text>

          {/* 目隠しになる高さ。霧がかかる前は点線で見せる */}
          {blind && (
            <g className="pour-blind-mark">
              {!fogged && !lifting && <line {...lineAt(blind.from, 3)} />}
              <text x={CX + 74} y={yOf(blind.from) + 3.5}>
                {t("game.pourhard.blindLine")} {blind.from}
              </text>
            </g>
          )}

          {/* これまでに注いだあとの水位の印。誰が注いだかの色。ふちの近くは文字と重なるので付けない */}
          {levels.map((ml, i) => {
            if (ml === null || ml > RIM - 6) return null;
            const { x2, y1 } = lineAt(ml, 3);
            return <line key={i} className={`pour-tick seat${s.pours[i]!.seat}`} x1={x2} x2={x2 + 7} y1={y1} y2={y1} />;
          })}

          {/* 1 回で届く範囲：点線（最低）から線（最大）まで */}
          {showBand && (
            <g className="pour-band">
              <line className="pour-line min" {...minLine} />
              <line className="pour-line max" {...maxLine} />
              <text x={minLine.x1 - 4} y={minLine.y1 + 3}>
                {t("game.pour.min")}
              </text>
              <text x={maxLine.x1 - 4} y={maxLine.y1 + 3}>
                {t("game.pour.max")}
              </text>
            </g>
          )}

          {/* 目隠しの霧（すりガラス）。注いでいる間はゆらぐ。終局したら晴れる */}
          {blind && (fogged || lifting) && (
            <g className={`pour-fog ${pouring ? "stirring" : ""} ${lifting && !fogged ? "lifting" : ""}`}>
              <path d={fogPath(blind.from)} fill={`url(#${ids}-fog)`} filter={`url(#${ids}-soft)`} />
              <path className="pour-frost" d={fogPath(blind.from)} filter={`url(#${ids}-frost)`} />
              {DROPS.map(([x, y, r], i) => (
                <circle key={i} className="pour-drop" cx={x} cy={y} r={r} />
              ))}
              {!flash && (
                <text className="pour-fog-mark" x={CX} y={(yOf(blind.from) + RIM_Y) / 2 + 8}>
                  ?
                </text>
              )}
            </g>
          )}

          {/* 目隠しになった瞬間 */}
          {blind && flash && fogged && (
            <g className="pour-flash">
              <rect x={CX - 52} y={(yOf(blind.from) + RIM_Y) / 2 - 15} width="104" height="30" rx="15" />
              <text x={CX} y={(yOf(blind.from) + RIM_Y) / 2 + 5}>
                {t("game.pourhard.blindNow")}
              </text>
            </g>
          )}

          {/* 終わったら、このコップがもった高さを見せる */}
          {reveal && (
            <g className="pour-limit">
              <line {...lineAt(limit, 9)} />
              <text x={CX - 79} y={yOf(limit) + 3}>
                {t("game.pour.limitLine")}
              </text>
            </g>
          )}

          {/* あふれた水 */}
          {spilling && (
            <g className="pour-spill">
              {/* ふちからこぼれて、コップの外を伝って落ちる水 */}
              <path d={`M${CX - 62} ${RIM_Y - 3} C${CX - 72} ${RIM_Y - 2} ${CX - 73} ${RIM_Y + 14} ${CX - 70} ${RIM_Y + 44} S${CX - 60} ${BASE_Y - 20} ${CX - 59} ${BASE_Y + 3}`} />
              <path className="thin" d={`M${CX + 60} ${RIM_Y - 3} C${CX + 71} ${RIM_Y - 2} ${CX + 72} ${RIM_Y + 16} ${CX + 69} ${RIM_Y + 60} S${CX + 60} ${BASE_Y - 10} ${CX + 58} ${BASE_Y + 3}`} />
              <ellipse className="pour-puddle" cx={CX} cy={BASE_Y + 5} rx={100} ry={5} />
            </g>
          )}
        </svg>
      </div>

      <p className="board-note">
        {lastText && <span className="muted">{lastText}</span>}
        {note && <span>{note}</span>}
        {showBand && <span className="muted">{t("game.pour.band", { min, max: MAX_POUR })}</span>}
        {bandText && <span className="muted">{bandText}</span>}
      </p>

      {myTurn && (
        <button
          type="button"
          className={`pour-button seat${me} ${press !== null ? "pressing" : ""}`}
          disabled={press === null && (!interactive || anim?.mine === true)}
          onPointerDown={onPointerDown}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          onKeyDown={(e) => {
            if (!isKey(e)) return;
            e.preventDefault();
            if (!e.repeat) start();
          }}
          onKeyUp={(e) => {
            if (!isKey(e)) return;
            e.preventDefault();
            finish();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="pour-button-label">
            {press === null
              ? t("game.pour.button")
              : fogged
                ? t("game.pourhard.pouring")
                : t("game.pour.pouring", { n: Math.round(pressed) })}
          </span>
          <span className="pour-button-hint">{press !== null ? t("game.pour.release") : t("game.pour.hold")}</span>
        </button>
      )}

      {!playing && reveal && (
        <p className="board-note pour-result">
          <strong>{limit === RIM ? t("game.pour.limitRim") : t("game.pour.limit", { n: limit, extra: limit - RIM })}</strong>
        </p>
      )}

      {s.pours.length > 0 && (
        <section className="pour-history">
          <h3 className="muted">{t("game.pour.history")}</h3>
          <ol className="history">
            {s.pours.map((p, i) => (
              <li key={i} className={`seat${p.seat} ${blindAt !== null && i >= blindAt ? "blind" : ""}`}>
                <span className="muted num">{i + 1}</span>
                <span className="pour-who">
                  <span className="token dot" aria-hidden />
                  <span>{who(p.seat)}</span>
                </span>
                <strong className="num">{p.amount === null ? `+${t("game.pourhard.unknown")}` : `+${p.amount}`}</strong>
                <span className="muted small pour-after">
                  {s.spilledBy !== null && reveal && i === s.pours.length - 1 ? (
                    <b className="pour-spilled-tag">{t("game.pour.spilledShort")}</b>
                  ) : blindAt === i ? (
                    <b className="pour-blind-tag">{t("game.pourhard.blindShort")}</b>
                  ) : null}
                  {t("game.pour.ml", { n: levels[i] ?? t("game.pourhard.unknown") })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** みずそそぎ・ハード：みずそそぎの盤に目隠しの設定を渡したもの */
export function PourHardBoard(props: BoardProps) {
  return <PourBoard {...props} blind={Pour.HARD_BLIND} />;
}
