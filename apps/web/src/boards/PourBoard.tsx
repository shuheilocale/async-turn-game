import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pour, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./PourBoard.css";

const { RIM, MAX_EXTRA, MIN_POUR, MAX_POUR, FLOW_PER_SEC } = Pour;

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

/** 水が増えていく動き。start からの時間で from → to まで上がる。mine は自分が今注いだ分 */
interface Anim {
  from: number;
  to: number;
  start: number;
  seat: Seat;
  mine: boolean;
}

/** その時刻の水位 */
const levelAt = (a: Anim, now: number) => a.from + Math.min(a.to - a.from, (Math.max(0, now - a.start) * FLOW_PER_SEC) / 1000);

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
 * 「そそぐ」を押している間だけ水が出て、離した瞬間にその量を送る（確定を待たない）。
 * 相手が注いだ分は、開いたときや届いたときに、水が増えるところを同じ速さで再生する
 */
export function PourBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Pour.PourView;
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("game.pour.you") : t("game.pour.who", { name: names[seat] }));

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
    const start = performance.now() + (prev === null ? REPLAY_DELAY_MS : 0);
    setAnim({ from: s.level - last.amount, to: s.level, start, seat: last.seat, mine: false });
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
  const shown = press !== null ? s.level + pressed : anim ? levelAt(anim, now) : s.level;
  const animDone = anim !== null && levelAt(anim, now) >= anim.to;

  // 再生が終わったら止める。自分の手は、サーバから新しい水位が届くまで待つ
  useEffect(() => {
    if (anim && animDone && (!anim.mine || s.level >= anim.to)) setAnim(null);
  }, [animDone, s.level]);

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
    const amount = Pour.amountForHold(performance.now() - began);
    // 20 ml に届く前に離しても、20 ml までは出つづける
    setAnim({ from: s.level, to: s.level + amount, start: began, seat: me, mine: true });
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
  const spilling = limit !== null && shown > limit;
  const drawn = Math.min(shown, limit ?? RIM + MAX_EXTRA);
  const pouring = press !== null || (anim !== null && !animDone && now >= anim.start);
  const replaying = anim !== null && !anim.mine && !animDone;
  // もつ量は、水が増える動きが終わってから見せる（再生の途中で結果が分からないように）
  const reveal = limit !== null && !(anim !== null && !animDone);
  const shownInt = Math.round(shown);
  // 自分の番に、今の水位から 1 回で届く範囲（最低・最大の線）
  const showBand = myTurn && interactive && !anim;
  const minLine = lineAt(s.level + MIN_POUR);
  const maxLine = lineAt(s.level + MAX_POUR);
  // これまでの手ごとの水位（右の目盛りに印を付ける）
  const levels = s.pours.reduce<number[]>((acc, p) => [...acc, (acc.at(-1) ?? 0) + p.amount], []);

  const rimText = spilling
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
  else if (myTurn) note = t("game.pour.yourTurn");
  else note = names[s.turn] ? t("game.pour.waiting", { name: names[s.turn] }) : "";
  const lastText = last && !replaying && press === null ? t("game.pour.poured", { who: who(last.seat), n: last.amount }) : null;

  return (
    <div className="pour stack-sm">
      <div className="pour-readout" aria-live="off">
        <span className="muted small">{t("game.pour.now")}</span>
        <strong className="num">{t("game.pour.ml", { n: shownInt })}</strong>
        <span className={`small ${spilling ? "pour-spilled-text" : shownInt > RIM ? "pour-over" : ""}`}>{rimText}</span>
      </div>

      <div
        className={`pour-cup seat${me} ${spilling ? "spilled" : ""}`}
        role="img"
        aria-label={t("game.pour.cup", { n: s.level, rim: RIM })}
      >
        <svg viewBox="0 0 240 290" aria-hidden>
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

          {/* これまでに注いだあとの水位の印。誰が注いだかの色。ふちの近くは文字と重なるので付けない */}
          {levels.map((ml, i) => {
            if (ml > RIM - 6) return null;
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
        {showBand && <span className="muted">{t("game.pour.band", { min: MIN_POUR, max: MAX_POUR })}</span>}
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
            {press !== null ? t("game.pour.pouring", { n: Math.round(pressed) }) : t("game.pour.button")}
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
              <li key={i} className={`seat${p.seat}`}>
                <span className="muted num">{i + 1}</span>
                <span className="pour-who">
                  <span className="token dot" aria-hidden />
                  <span>{who(p.seat)}</span>
                </span>
                <strong className="num">+{p.amount}</strong>
                <span className="muted small pour-after">
                  {s.spilledBy !== null && reveal && i === s.pours.length - 1 ? (
                    <b className="pour-spilled-tag">{t("game.pour.spilledShort")}</b>
                  ) : null}
                  {t("game.pour.ml", { n: levels[i]! })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
