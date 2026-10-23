import { useEffect, useState, type CSSProperties } from "react";
import { Balloon, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./BalloonBoard.css";

const { MAX_TAPS, TURNS, airOf } = Balloon;

/*
 * 風船の絵（viewBox 0 0 240 290）。いちばん大きいときの形を描いておき、結び目を中心に
 * 空気の量だけ縮めて見せる。大きさは空気の量だけで決まり、割れる回数のヒントになる変化は出さない
 */
const KNOT_X = 120;
const KNOT_Y = 212;
const BODY = "M120 20C172 20 208 60 208 110C208 158 170 196 130 207L120 212L110 207C70 196 32 158 32 110C32 60 68 20 120 20Z";
const scaleOf = (air: number) => 0.4 + Math.min(air, 40) * 0.0175;
/** 割れたときに飛び散るかけら：向き（度）と飛ぶ距離 */
const SHARDS = [
  [-90, 92],
  [-40, 104],
  [10, 96],
  [55, 86],
  [100, 70],
  [145, 88],
  [190, 100],
  [235, 90],
] as const;

/** 開いてすぐ相手の分をふくらませる（割れる）までの間 */
const REPLAY_DELAY_MS = 450;

/**
 * 風船をタップした回数だけ空気を入れる（その手番では 5 回まで）。画面下の「これで決定」で確定する。
 * 決定するまでは、割れるかどうか分からない
 */
export function BalloonBoard({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Balloon.BalloonView;
  const sel = selected as Balloon.BalloonMove | null;
  const pending = sel?.taps ?? 0;
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("game.balloon.you") : t("game.balloon.who", { name: names[seat] }));
  const last = s.puffs.at(-1) ?? null;

  // 開いたときは、相手が直前に入れた分をふくらませるところから見せる
  const [grown, setGrown] = useState(() => !(last && last.seat !== you));
  useEffect(() => {
    if (grown) return;
    const timer = setTimeout(() => setGrown(true), REPLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [grown]);
  /** タップのたびに増やして、ぷくっとふくらむ動きをやり直す。上限で押したときは揺らす */
  const [bump, setBump] = useState(0);
  const [nope, setNope] = useState(0);

  const baseAir = grown ? s.air : s.air - (last?.taps ?? 0);
  const shownAir = baseAir + pending;
  const popped = s.poppedBy !== null && grown;
  const scale = scaleOf(shownAir);
  // 割れたときのかけらは、風船のまん中から飛ぶ
  const centerY = KNOT_Y - 96 * scale;

  const tap = () => {
    if (!myTurn || !interactive) return;
    if (pending >= MAX_TAPS) {
      setNope((n) => n + 1);
      return;
    }
    onSelect({ taps: pending + 1 });
    setBump((n) => n + 1);
  };

  let note: string;
  if (!playing) note = s.poppedBy !== null ? t("game.balloon.popped", { who: who(s.poppedBy) }) : t("game.balloon.survived");
  else if (myTurn)
    note =
      pending === 0
        ? t("game.balloon.yourTurn")
        : pending >= MAX_TAPS
          ? t("game.balloon.full")
          : t("game.balloon.ready", { n: pending });
  else note = names[s.turn] ? t("game.balloon.waiting", { name: names[s.turn] }) : "";
  /** 点の横に添える単位（英語ではなし） */
  const unit = t("game.balloon.unit");
  const lastText = last && playing ? t("game.balloon.puffed", { who: who(last.seat), n: last.taps }) : null;

  return (
    <div className="balloon stack-sm">
      <div className="scores balloon-scores">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className={`score seat${seat} ${playing && s.turn === seat ? "turn" : ""}`}>
            <span className="muted small">
              <span className="token dot" aria-hidden />
              <span className="balloon-name">{names[seat]}</span>
            </span>
            <strong>
              {airOf(s.puffs, seat)}
              {unit && <small>{unit}</small>}
            </strong>
          </div>
        ))}
      </div>
      <p className="balloon-meta muted small">
        <span>{t("game.balloon.total", { n: s.air })}</span>
        {playing && <span>{t("game.balloon.left", { n: TURNS - s.puffs.length })}</span>}
      </p>

      <button
        type="button"
        className={`balloon-stage seat${me} ${myTurn && interactive ? "can" : ""}`}
        disabled={!myTurn || !interactive}
        onClick={tap}
        aria-label={`${t("game.balloon.stage", { n: shownAir })}${myTurn ? ` ${t("game.balloon.tapHere")}` : ""}`}
      >
        <svg viewBox="0 0 240 290" aria-hidden>
          {/* ひもと結び目は大きさが変わっても動かない */}
          <path className="balloon-string" d="M120 220C111 233 129 246 120 260C114 270 123 278 120 288" />
          {!popped && (
            <g key={nope} className={nope > 0 ? "balloon-nope" : ""}>
              <g className="balloon-body" style={{ transform: `scale(${scale})` }}>
                <g key={bump} className={bump > 0 ? "balloon-bump" : ""}>
                  <path className="balloon-rubber" d={BODY} />
                  <ellipse className="balloon-shine" cx="80" cy="72" rx="14" ry="27" transform="rotate(-28 80 72)" />
                </g>
              </g>
              {/* 入れる前の大きさを点線で残す */}
              {pending > 0 && (
                <path className="balloon-before" d={BODY} style={{ transform: `scale(${scaleOf(baseAir)})` }} />
              )}
            </g>
          )}
          {popped && (
            <g className="balloon-burst">
              <path className="balloon-rubber balloon-gone" d={BODY} style={{ transform: `scale(${scale})` }} />
              {SHARDS.map(([deg, dist], i) => (
                <path
                  key={i}
                  className="balloon-shard"
                  d={`M${KNOT_X - 7} ${centerY - 4}l6 -5 7 3 2 7 -8 3z`}
                  style={
                    {
                      "--dx": `${Math.cos((deg * Math.PI) / 180) * dist * scale}px`,
                      "--dy": `${Math.sin((deg * Math.PI) / 180) * dist * scale}px`,
                      "--turn": `${deg * 2}deg`,
                    } as CSSProperties
                  }
                />
              ))}
              {/* 結び目に残ったゴム */}
              <path className="balloon-rubber balloon-scrap" d="M111 214l3-9 4 4 3-7 4 6 3-3 2 9z" />
            </g>
          )}
          <path className="balloon-rubber" d={`M${KNOT_X - 7} 221L${KNOT_X + 7} 221L${KNOT_X} ${KNOT_Y + 1}Z`} />
        </svg>
        {pending > 0 && !popped && <span className="balloon-adding num">{t("game.balloon.adding", { n: pending })}</span>}
        {myTurn && interactive && pending === 0 && <span className="balloon-hint">{t("game.balloon.tapHere")}</span>}
        {popped && <span className="balloon-pop">{t("game.balloon.pop")}</span>}
      </button>

      {myTurn && (
        <div className={`balloon-controls seat${me}`}>
          <span className="balloon-taps">
            <span className="muted small">{t("game.balloon.taps")}</span>
            <span className="balloon-pips" aria-hidden>
              {Array.from({ length: MAX_TAPS }, (_, i) => (
                <span key={i} className={i < pending ? "on" : ""} />
              ))}
            </span>
            <strong className="num">
              {pending} / {MAX_TAPS}
            </strong>
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={pending === 0 || !interactive}
            onClick={() => onSelect(pending > 1 ? { taps: pending - 1 } : null)}
          >
            {t("game.balloon.undo")}
          </button>
        </div>
      )}

      <p className="board-note">
        {lastText && <span className="muted">{lastText}</span>}
        {note && <span>{note}</span>}
        {playing && <span className="muted">{t("game.balloon.range")}</span>}
        {!playing && s.burstAt !== null && (
          <strong className="balloon-result">
            {t(s.poppedBy !== null ? "game.balloon.burstAt" : "game.balloon.wouldBurst", { n: s.burstAt })}
          </strong>
        )}
      </p>

      {s.puffs.length > 0 && (
        <section className="balloon-history">
          <h3 className="muted">{t("game.balloon.history")}</h3>
          <ol className="history">
            {s.puffs.map((p, i) => {
              const total = s.puffs.slice(0, i + 1).reduce((sum, q) => sum + q.taps, 0);
              return (
                <li key={i} className={`seat${p.seat}`}>
                  <span className="muted num">{i + 1}</span>
                  <span className="balloon-who">
                    <span className="token dot" aria-hidden />
                    <span>{who(p.seat)}</span>
                  </span>
                  <strong className="num">+{p.taps}</strong>
                  <span className="muted small balloon-after">
                    {s.poppedBy !== null && i === s.puffs.length - 1 && (
                      <b className="balloon-popped-tag">{t("game.balloon.short.pop")}</b>
                    )}
                    {t("game.balloon.count", { n: total })}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
