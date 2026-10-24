import { useEffect, useRef, useState } from "react";
import { Doors, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./DoorsBoard.css";

const { POINTS, ROUNDS, setterOf, walkerOf, safeCount } = Doors;

/** 扉が開いて結果が出て、わなの場所が分かるまでを見せる時間（CSS の動きと合わせる） */
const REPLAY_MS = 2800;

/** 1 つの扉の見た目 */
interface DoorLook {
  /** 扉を開けて中を見せる（くぐった扉） */
  open: boolean;
  /** 開けた扉の中。セーフなら光、アウトなら落とし穴 */
  safe: boolean;
  /** 床の落とし穴。ghost は仕掛けようとしている影、own は自分が仕掛けたわな、shown は明かしたわな */
  pit: "ghost" | "own" | "shown" | null;
  /** くぐろうとしている扉 */
  picked: boolean;
  /** 床に出す札 */
  tag: string | null;
  /** 色を付ける人（仕掛け・くぐり） */
  seat: Seat;
}

/**
 * 3 つの扉。仕掛ける番は扉をタップするとわなの影が出て、くぐる番は扉をタップすると光る。
 * どちらも画面下の「これで決定」で確定する。くぐった回戦の結果は、扉が開いてわなの場所が分かるまでを
 * 短く再生する（自分がくぐったとき、相手のくぐった結果が届いたとき・開いたとき）
 */
export function DoorsBoard({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Doors.DoorsView;
  const sel = selected as Doors.DoorsMove | null;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const setting = myTurn && s.setter === you && !s.trapSet;
  const walking = myTurn && s.setter !== you && s.trapSet;
  const who = (seat: Seat) => (seat === you ? t("play.you") : t("game.doors.who", { name: names[seat] }));
  const doorName = (d: number) => t("game.doors.door", { n: POINTS[d]! });

  // 再生する回戦の番号。開いたときは、直前の回戦を相手がくぐっていれば再生する
  const last = s.history.at(-1) ?? null;
  const [replay, setReplay] = useState<{ index: number; key: number } | null>(() =>
    last && you !== null && walkerOf(s.history.length - 1) !== you ? { index: s.history.length - 1, key: 0 } : null,
  );
  /** 見たことのある回戦の数。増えたら、増えた最後の回戦を再生する */
  const seen = useRef(s.history.length);
  useEffect(() => {
    const prev = seen.current;
    seen.current = s.history.length;
    if (s.history.length > prev) setReplay({ index: s.history.length - 1, key: Date.now() });
  }, [s.history.length]);
  useEffect(() => {
    if (!replay) return;
    const timer = setTimeout(() => setReplay(null), REPLAY_MS);
    return () => clearTimeout(timer);
  }, [replay]);

  /** 扉に出す回戦の結果。再生中はその回戦、終局後は最後の回戦。なければ今の回戦を出す */
  const replayed = replay ? (s.history[replay.index] ?? null) : null;
  const shown = replayed ?? (playing ? null : last);
  const shownIndex = replayed ? replay!.index : s.history.length - 1;
  const animate = replayed !== null;
  // 再生中は、再生している回戦の点と一覧の行をまだ出さない（扉が開く前に結果が分からないように）
  const history = replayed ? s.history.slice(0, replay!.index) : s.history;
  const scoreOf = (seat: Seat) => history.reduce((sum, r, i) => sum + (walkerOf(i) === seat ? r.points : 0), 0);

  const look = (d: number): DoorLook => {
    if (shown) {
      const walker = walkerOf(shownIndex);
      const walked = shown.door === d;
      const trapped = shown.trap === d;
      return {
        open: walked,
        safe: shown.safe,
        pit: trapped ? "shown" : null,
        picked: false,
        tag: walked
          ? shown.safe
            ? `${t("game.doors.tag.safe")} +${shown.points}`
            : t("game.doors.tag.out")
          : trapped
            ? t("game.doors.tag.trap")
            : null,
        seat: walked ? walker : shown.setter,
      };
    }
    const base = { open: false, safe: false, picked: false };
    if (setting && sel?.door === d) return { ...base, pit: "ghost", tag: t("game.doors.tag.trapHere"), seat: s.setter };
    if (s.trap === d) return { ...base, pit: "own", tag: t("game.doors.tag.yourTrap"), seat: s.setter };
    if (walking && sel?.door === d) return { ...base, pit: null, picked: true, tag: t("game.doors.tag.walkHere"), seat: me };
    return { ...base, pit: null, tag: null, seat: s.setter };
  };

  const canTap = (setting || walking) && interactive;
  const tap = (d: number) => {
    // 再生中に触ったら、再生を飛ばすだけにする
    if (replayed) {
      setReplay(null);
      return;
    }
    if (!canTap) return;
    onSelect(sel?.door === d ? null : { door: d });
  };

  const resultText = (r: Doors.RoundResult, i: number) =>
    r.safe
      ? t("game.doors.result.safe", { who: who(walkerOf(i)), door: doorName(r.door), n: r.points, trap: doorName(r.trap) })
      : t("game.doors.result.out", { who: who(walkerOf(i)), door: doorName(r.door) });

  let note: string | null = null;
  if (replayed) note = null;
  else if (!playing) note = t("game.doors.over", { total: ROUNDS });
  else if (setting) note = sel ? t("game.doors.picked.set", { door: doorName(sel.door) }) : t("game.doors.choose.set", { name: names[opp] });
  else if (walking) note = sel ? t("game.doors.picked.walk", { door: doorName(sel.door) }) : t("game.doors.choose.walk", { name: names[opp] });
  else if (names[s.turn]) note = t(s.trapSet ? "game.doors.wait.walk" : "game.doors.wait.set", { name: names[s.turn] });

  const roundNo = (replayed ? replay!.index : Math.min(s.round, ROUNDS - 1)) + 1;
  const roleRound = replayed ? replay!.index : Math.min(s.round, ROUNDS - 1);

  return (
    <div className="doors">
      <div className="scores doors-scores">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className={`score seat${seat}`}>
            <span className="doors-who muted small">
              <span className="token dot" aria-hidden />
              <span className="doors-name">{names[seat]}</span>
            </span>
            <strong className="num">{scoreOf(seat)}</strong>
            <span className="doors-safes muted">{t("game.doors.safes", { n: safeCount(history, seat) })}</span>
          </div>
        ))}
      </div>

      <div className="doors-round">
        <span className="num">{t("game.doors.round", { n: roundNo, total: ROUNDS })}</span>
        <span className="doors-roles">
          <span className={`seat${setterOf(roleRound)}`}>
            <span className="token dot" aria-hidden />
            {t("game.doors.role.set", { who: who(setterOf(roleRound)) })}
          </span>
          <span className={`seat${walkerOf(roleRound)}`}>
            <span className="token dot" aria-hidden />
            {t("game.doors.role.walk", { who: who(walkerOf(roleRound)) })}
          </span>
        </span>
      </div>

      <div
        key={replayed ? replay!.key : "now"}
        className={`doors-hall ${animate ? "animate" : ""} ${shown ? "result" : ""} ${canTap ? "can" : ""}`}
      >
        {POINTS.map((points, d) => {
          const l = look(d);
          const className = [
            "doors-door",
            `seat${l.seat}`,
            l.open && "open",
            l.open && (l.safe ? "safe" : "out"),
            l.pit && `pit-${l.pit}`,
            l.picked && "picked",
            canTap && "can",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={d}
              type="button"
              className={className}
              disabled={!canTap && !replayed}
              aria-pressed={canTap ? sel?.door === d : undefined}
              aria-label={[doorName(d), l.tag].filter(Boolean).join(" ")}
              onClick={() => tap(d)}
            >
              <span className="doors-plaque" aria-hidden>
                <span className="doors-pips">
                  {Array.from({ length: points }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                {t("game.doors.pts", { n: points })}
              </span>
              <span className="doors-frame" aria-hidden>
                <span className="doors-inside">
                  {l.open && !l.safe && <span className="doors-hole" />}
                  {l.open && l.safe && <span className="doors-gain num">+{points}</span>}
                </span>
                <span className="doors-panel">
                  <span className="doors-knob" />
                </span>
              </span>
              <span className="doors-floor" aria-hidden>
                <span className="doors-pit" />
                {l.tag && <span className="doors-tag">{l.tag}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {replayed ? (
        <p className="board-note doors-replaying" role="status">
          <span className="muted">
            {t("game.doors.replay.walking", { n: replay!.index + 1, who: who(walkerOf(replay!.index)), door: doorName(replayed.door) })}
          </span>
          <strong className="doors-reveal">{resultText(replayed, replay!.index)}</strong>
        </p>
      ) : (
        <p className="board-note">
          {note && <span>{note}</span>}
          {playing && (setting || walking) && <span className="muted">{t("game.doors.hint")}</span>}
        </p>
      )}

      {last && !replayed && (
        <div className="doors-last">
          <span className="muted small">{t("game.doors.lastRound", { n: s.history.length })}</span>
          <span>{resultText(last, s.history.length - 1)}</span>
          <button
            type="button"
            className="ghost-button doors-again"
            onClick={() => setReplay({ index: s.history.length - 1, key: Date.now() })}
          >
            {t("game.doors.replay")}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <section className="doors-history">
          <h3 className="muted">{t("game.doors.history")}</h3>
          <p className="doors-legend muted" aria-hidden>
            <span>
              <i className="doors-mini trap" />
              {t("game.doors.legend.trap")}
            </span>
            <span>
              <i className="doors-mini walk" />
              {t("game.doors.legend.walk")}
            </span>
          </p>
          <ol className="history">
            {history.map((r, i) => {
              const walker = walkerOf(i);
              return (
                <li key={i} className={`seat${walker}`}>
                  <span className="muted num">{i + 1}</span>
                  <span className="doors-minis" role="img" aria-label={resultText(r, i)}>
                    {POINTS.map((p, d) => (
                      <i
                        key={d}
                        className={["doors-mini", r.trap === d && "trap", r.door === d && "walk"].filter(Boolean).join(" ")}
                      >
                        {p}
                      </i>
                    ))}
                  </span>
                  <span className="doors-row-who">
                    <span className="token dot" aria-hidden />
                    <span className="doors-name">{t("game.doors.walked", { who: who(walker) })}</span>
                  </span>
                  <strong className={`doors-row-result ${r.safe ? "safe num" : "out"}`}>
                    {r.safe ? `+${r.points}` : t("game.doors.tag.out")}
                  </strong>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
