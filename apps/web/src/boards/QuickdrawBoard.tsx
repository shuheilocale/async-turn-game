import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { other, Quickdraw, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./QuickdrawBoard.css";

const { MAX_MS, ROUNDS } = Quickdraw;

/**
 * 準備のすぐあとのタップは数えない（ミリ秒）。準備を押した指が続けて触れただけなので、
 * おてつきにしない。合図はいつもこれよりあと（1.5 秒より前には出ない）
 */
const GRACE_MS = 300;

/** 秒を 0.001 秒まで（反応時間は整数ミリ秒なので、丸めのずれは出ない） */
const sec3 = (ms: number) => (ms / 1000).toFixed(3);

/** 押した時刻。イベントの時刻（performance.now() と同じ物差し）が使えればそれを、だめなら今 */
function eventTime(e: { timeStamp: number }) {
  const now = performance.now();
  return e.timeStamp > 0 && e.timeStamp <= now && now - e.timeStamp < 1000 ? e.timeStamp : now;
}

type Phase =
  /** 自分の番：準備を押す前 */
  | "ready"
  /** 自分の番だが、前の回戦の結果を見せている（「次の回戦へ」で ready） */
  | "reveal"
  /** この画面で準備して、待ち・合図・押したあと（送っている間も） */
  | "running"
  /** 準備したまま画面を開き直した：おてつきにする */
  | "lost"
  /** 別の画面（別のタブ）で準備した */
  | "elsewhere"
  /** 相手の番・観戦 */
  | "watch"
  | "over";

/**
 * 合図で早押しするタップ面。「準備」はまずサーバに送り、受け付けられてから待ちはじめる。
 * 合図までの待ち時間は、受け付けられた応答（state.delay）で初めて届く。押したら反応時間（整数ミリ秒）をすぐ送る。
 * 準備したことは記録に残るので、開き直したらおてつきの手を送って、やり直しをできなくする
 */
export function QuickdrawBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Quickdraw.QuickdrawView;
  const me: Seat = you ?? 0;
  const playing = status.kind === "playing";
  const idx = s.rounds.length - 1;
  const cur = s.rounds[idx]!;
  const prev = idx > 0 ? s.rounds[idx - 1]! : null;
  const myTurn = playing && you !== null && s.turn === you;
  const opp = other(me);
  const who = (seat: Seat) => (seat === you ? t("game.quickdraw.you") : t("game.quickdraw.who", { name: names[seat] }));

  /** この画面で準備した挑戦（待ちはじめた時刻）と、押した結果（おてつきなら ms: null） */
  const [run, setRun] = useState<{ round: number; at: number } | null>(null);
  const [hit, setHit] = useState<{ round: number; ms: number | null; timeout?: boolean } | null>(null);
  const runRef = useRef(run);
  const hitRef = useRef(hit);
  /** 合図を出した回戦。合図を描いた時刻（反応時間の起点）は signalRef に持つ */
  const [signal, setSignal] = useState<number | null>(null);
  const signalRef = useRef<{ round: number; at: number } | null>(null);
  /** 送っている手。送れなかったら retry に残して、もう一度送れるようにする */
  const [sending, setSending] = useState<"ready" | "hit" | "foul" | null>(null);
  const sendingRef = useRef(false);
  const [retry, setRetry] = useState<"hit" | "foul" | null>(null);
  /** 開いたときにもう「準備した」状態だった回戦。この画面では待っていないので、おてつきにする */
  const openedRunning = useRef(playing && you !== null && cur.running === you ? idx : null);
  const failSent = useRef<number | null>(null);
  /** おてつき扱いにした回戦。やり直しはできないことを、送ったあとも出しておく */
  const [lostRound, setLostRound] = useState<number | null>(null);
  /** 「次の回戦へ」で見終えた回戦（これより前の回戦の結果は、タップ面には出さない） */
  const [seen, setSeen] = useState(-1);
  const padRef = useRef<HTMLDivElement>(null);

  const runHere = run !== null && run.round === idx;
  const signalHere = signal === idx;
  const hitHere = hit !== null && hit.round === idx ? hit : null;
  const myTry = you !== null ? cur.tries[you] : null;
  /** 前の回戦の結果（出ていれば） */
  const prevDone = prev && Quickdraw.roundResult(prev) ? prev : null;

  let phase: Phase;
  if (!playing) phase = "over";
  else if (!myTurn) phase = "watch";
  else if (cur.running === you) phase = runHere ? "running" : sending === "ready" ? "ready" : openedRunning.current === idx ? "lost" : "elsewhere";
  else if (prevDone && seen < idx - 1 && myTry === null) phase = "reveal";
  else phase = "ready";

  async function send(move: Quickdraw.QuickdrawMove, kind: "ready" | "hit" | "foul"): Promise<boolean> {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(kind);
    setRetry(null);
    const ok = await onSubmit(move);
    sendingRef.current = false;
    setSending(null);
    if (!ok && kind !== "ready") setRetry(kind);
    return ok;
  }

  /** 準備：サーバが受け付けてから待ちはじめる（合図までの待ち時間は、その応答で届く） */
  async function begin() {
    if (phase !== "ready" || !interactive) return;
    const round = idx;
    const ok = await send({ kind: "ready" }, "ready");
    if (!ok) return;
    runRef.current = { round, at: performance.now() };
    setRun(runRef.current);
    // キーボードでも押せるよう、タップ面に移す
    requestAnimationFrame(() => padRef.current?.focus({ preventScroll: true }));
  }

  /** 押した：合図の前ならおてつき、あとなら反応時間をすぐ送る。押したあとはもう押し直せない */
  function strike(at: number, timeout = false) {
    const r = runRef.current;
    if (!r || r.round !== idx || hitRef.current?.round === r.round) return;
    if (at - r.at < GRACE_MS) return;
    const sig = signalRef.current;
    const ms = sig && sig.round === r.round && at >= sig.at ? Quickdraw.toMs(at - sig.at) : null;
    hitRef.current = { round: r.round, ms, timeout };
    setHit(hitRef.current);
    send(ms === null ? { kind: "foul" } : { kind: "tap", ms }, ms === null ? "foul" : "hit");
  }

  // 終わったら、この画面で持っていた挑戦の記録を捨てる（お試しの「もう一度」で最初から遊べるように）
  useEffect(() => {
    if (playing) return;
    runRef.current = null;
    signalRef.current = null;
    hitRef.current = null;
    openedRunning.current = null;
    failSent.current = null;
    setRun(null);
    setSignal(null);
    setHit(null);
    setRetry(null);
    setLostRound(null);
    setSeen(-1);
  }, [playing]);

  // 待ち時間がたったら合図を出す。描き替えと同じフレームで時刻を取り、そこから反応時間を測る
  const waiting = phase === "running" && !signalHere && !hitHere;
  const delay = s.delay;
  useEffect(() => {
    const r = runRef.current;
    if (!waiting || delay === null || !r) return;
    let frame = 0;
    const timer = setTimeout(
      () => {
        // 描き替えをこのフレームで済ませ（flushSync）、描き終えた時刻を起点にする。それより前のタップはおてつき
        frame = requestAnimationFrame(() => {
          if (hitRef.current?.round === r.round) return;
          flushSync(() => setSignal(r.round));
          signalRef.current = { round: r.round, at: performance.now() };
        });
      },
      Math.max(0, r.at + delay - performance.now()),
    );
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [waiting, delay]);

  // 合図から 3 秒たっても押さなければ、3 秒で送る
  const counting = phase === "running" && signalHere && !hitHere;
  useEffect(() => {
    const sig = signalRef.current;
    if (!counting || !sig) return;
    const timer = setTimeout(() => strike(sig.at + MAX_MS, true), Math.max(0, sig.at + MAX_MS - performance.now()));
    return () => clearTimeout(timer);
  }, [counting]);

  // 準備したまま開き直したら、おてつきの手を 1 回だけ送る（送れなければボタンで送り直す）
  useEffect(() => {
    if (phase !== "lost" || !interactive || failSent.current === idx) return;
    failSent.current = idx;
    sendFoul();
  }, [phase, interactive, idx]);

  async function sendFoul() {
    const round = idx;
    if (await send({ kind: "foul" }, "foul")) setLostRound(round);
  }

  const tappable = phase === "running" && !hitHere;
  const onPadDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    strike(eventTime(e));
  };
  const onPadKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (!e.repeat) strike(eventTime(e));
  };

  const results = s.rounds.filter((r) => Quickdraw.roundResult(r) !== null);
  const { wins, total } = Quickdraw.tally(s.rounds);

  // ---------- タップ面の中身 ----------

  /** 前の回戦の結果をタップ面に大きく出す（相手の番の間と、自分の番の「次の回戦へ」の前） */
  const showPrev = phase === "reveal" || (phase === "watch" && myTry === null && prevDone !== null);
  let mode: string;
  let body: ReactNode;
  if (phase === "running" && hitHere) {
    mode = hitHere.ms === null ? "foul" : "hit";
    body =
      hitHere.ms === null ? (
        <FoulMark t={t} sub={t("game.quickdraw.foulSub")} />
      ) : (
        <>
          <span className="qd-label">{t("game.quickdraw.reaction")}</span>
          <Time ms={hitHere.ms} t={t} />
          {hitHere.timeout && <span className="qd-sub">{t("game.quickdraw.timeout")}</span>}
        </>
      );
  } else if (phase === "running") {
    mode = signalHere ? "go" : "wait";
    body = signalHere ? (
      <>
        <GoMark />
        <strong className="qd-go-text">{t("game.quickdraw.go")}</strong>
      </>
    ) : (
      <>
        <span className="qd-ring" aria-hidden />
        <strong className="qd-big">{t("game.quickdraw.wait")}</strong>
        <span className="qd-sub">{t("game.quickdraw.waitSub")}</span>
        <span className="qd-foot">{t("game.quickdraw.waitFoul")}</span>
      </>
    );
  } else if (phase === "ready") {
    mode = "ready";
    const firstTry = cur.tries[cur.first];
    body = (
      <>
        <p className="qd-lead">
          <strong>
            {cur.first === me ? t("game.quickdraw.yourFirst", { n: idx + 1 }) : t("game.quickdraw.yourSecond", { n: idx + 1, who: who(cur.first) })}
          </strong>
          {firstTry === "hidden" && <span className="muted qd-lock">{t("game.quickdraw.theirsHidden", { who: who(cur.first) })}</span>}
        </p>
        <button type="button" className={`qd-ready seat${me}`} disabled={!interactive || sending !== null} onClick={begin}>
          <span className="qd-ready-label">{sending === "ready" ? t("game.quickdraw.sending") : t("game.quickdraw.ready")}</span>
        </button>
        <p className="qd-hint">
          <span>{t("game.quickdraw.howTo")}</span>
          <span className="muted">{t("game.quickdraw.readyHint")}</span>
        </p>
      </>
    );
  } else if (phase === "lost" || phase === "elsewhere") {
    mode = phase;
    body = phase === "lost" ? <FoulMark t={t} sub={t("game.quickdraw.lost")} /> : <p className="qd-lead">{t("game.quickdraw.elsewhere")}</p>;
  } else if (showPrev && prevDone) {
    mode = "reveal";
    body = (
      <>
        <RoundCard t={t} round={prevDone} n={idx} who={who} you={you} big />
        {phase === "reveal" ? (
          <button type="button" className={`primary qd-next seat${me}`} onClick={() => setSeen(idx - 1)}>
            {t("game.quickdraw.next", { n: idx + 1 })}
          </button>
        ) : (
          <WatchLine t={t} cur={cur} n={idx + 1} name={names[s.turn]} />
        )}
      </>
    );
  } else if (phase === "watch" && myTry !== null && myTry !== "hidden") {
    // 先に挑戦した自分の記録。相手には伏せてある
    mode = myTry.ms === null ? "mine foul" : "mine";
    body = (
      <>
        <span className="qd-label">{t("game.quickdraw.mine")}</span>
        {myTry.ms === null ? <FoulMark t={t} /> : <Time ms={myTry.ms} t={t} />}
        <span className={`qd-hidden qd-lock seat${me}`}>{t("game.quickdraw.hiddenFrom", { name: names[opp] })}</span>
        <WatchLine t={t} cur={cur} n={idx + 1} name={names[s.turn]} />
      </>
    );
  } else {
    mode = "idle";
    body = (
      <>
        <span className="qd-ring dim" aria-hidden />
        <WatchLine t={t} cur={cur} n={idx + 1} name={names[s.turn]} />
        {you === null && cur.tries.some((x) => x === "hidden") && <span className="muted small qd-lock">{t("game.quickdraw.hiddenAll")}</span>}
      </>
    );
  }

  const challenging = phase === "ready" || phase === "running" || phase === "lost" || phase === "elsewhere";
  // おてつき扱いにしたことは、その回戦が見えている間（次の自分の挑戦を始めるまで）出しておく
  const lostShown = lostRound !== null && !challenging && (lostRound === idx || lostRound === idx - 1);
  // タップ面に出している回戦は、下の一覧に重ねて出さない
  const listed = results.filter((r) => !(showPrev && r === prevDone)).reverse();

  return (
    <div className={`qd seat${me}`}>
      <Strip t={t} rounds={s.rounds} wins={wins} total={total} who={who} playing={playing} />
      {lostShown && <p className="qd-notice">{t("game.quickdraw.lostDone", { n: lostRound + 1 })}</p>}
      {phase === "over" ? (
        <>
          <Final t={t} rounds={s.rounds} wins={wins} total={total} winner={status.kind === "finished" ? status.winner : null} who={who} />
          {listed.map((r, i) => (
            <RoundCard key={s.rounds.indexOf(r)} t={t} round={r} n={s.rounds.indexOf(r) + 1} who={who} you={you} fresh={i === 0} />
          ))}
        </>
      ) : (
        <>
          <div
            ref={padRef}
            className={`qd-pad seat${me} ${mode}`}
            role={tappable ? "button" : undefined}
            tabIndex={tappable ? 0 : undefined}
            aria-label={tappable ? t("game.quickdraw.padLabel") : undefined}
            aria-live="polite"
            onPointerDown={tappable ? onPadDown : undefined}
            onKeyDown={tappable ? onPadKey : undefined}
            onContextMenu={(e) => e.preventDefault()}
          >
            {body}
            {(sending === "hit" || sending === "foul") && <span className="qd-sending">{t("game.quickdraw.sending")}</span>}
          </div>
          {retry === "hit" && hitHere && hitHere.ms !== null && (
            <button type="button" className="primary" onClick={() => send({ kind: "tap", ms: hitHere.ms! }, "hit")}>
              {t("game.quickdraw.resend")}
            </button>
          )}
          {retry === "foul" && (hitHere?.ms === null || phase === "lost") && (
            <button type="button" className="primary" onClick={phase === "lost" ? sendFoul : () => send({ kind: "foul" }, "foul")}>
              {t(phase === "lost" ? "game.quickdraw.lostSend" : "game.quickdraw.resend")}
            </button>
          )}
          {listed.length > 0 && (
            <section className="qd-history">
              <h3 className="muted">{t("game.quickdraw.history")}</h3>
              {listed.map((r) => (
                <RoundCard key={s.rounds.indexOf(r)} t={t} round={r} n={s.rounds.indexOf(r) + 1} who={who} you={you} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 相手の番・観戦のときの一行（だれが挑戦中か、だれの番か） */
function WatchLine({ t, cur, n, name }: { t: T; cur: Quickdraw.RoundView; n: number; name: string }) {
  const started = cur.tries[0] !== null || cur.tries[1] !== null;
  const text =
    cur.running !== null
      ? t("game.quickdraw.challenging", { name })
      : started
        ? t("game.quickdraw.waitingTry", { name })
        : t("game.quickdraw.waitingFirst", { n, name });
  return <p className={`qd-watch ${cur.running !== null ? "live" : ""}`}>{text}</p>;
}

/** 反応時間を大きく（0.287 秒） */
function Time({ ms, t }: { ms: number; t: T }) {
  return (
    <strong className="qd-time">
      <span className="num">{sec3(ms)}</span>
      <small>{t("game.quickdraw.secUnit")}</small>
    </strong>
  );
}

/** 合図のぎざぎざの形（角が 12 個。外の点と内の点を交互に結ぶ） */
const BURST =
  Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12 - Math.PI / 2;
    const r = i % 2 === 0 ? 96 : 70;
    return `${i === 0 ? "M" : "L"}${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}`;
  }).join("") + "Z";

/** 合図：ぎざぎざの形と、大きな「！」（絵文字ではなく図で描く） */
function GoMark() {
  return (
    <svg className="qd-go-mark" viewBox="0 0 200 200" aria-hidden>
      <path className="qd-burst" d={BURST} />
      <rect className="qd-bang" x="86" y="42" width="28" height="78" rx="14" />
      <circle className="qd-bang" cx="100" cy="146" r="15" />
    </svg>
  );
}

/** おてつき：斜めの線で消した丸と、大きな文字 */
function FoulMark({ t, sub }: { t: T; sub?: string }) {
  return (
    <>
      <svg className="qd-foul-mark" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="24" />
        <path d="M15 49 49 15" />
      </svg>
      <strong className="qd-foul-text">{t("game.quickdraw.foulBig")}</strong>
      {sub && <span className="qd-sub">{sub}</span>}
    </>
  );
}

/** 勝ち数と、3 回戦の印（勝った人の色・引き分け・今の回戦・まだの回戦） */
function Strip({
  t,
  rounds,
  wins,
  total,
  who,
  playing,
}: {
  t: T;
  rounds: Quickdraw.RoundView[];
  wins: [number, number];
  total: [number, number];
  who: (seat: Seat) => string;
  playing: boolean;
}) {
  const done = rounds.some((r) => Quickdraw.roundResult(r) !== null);
  const side = (seat: Seat) => (
    <div className={`qd-side seat${seat}`}>
      <span className="qd-who">
        <span className="token dot" aria-hidden />
        <span>{who(seat)}</span>
      </span>
      <span className="qd-wins">
        <strong className="num">{wins[seat]}</strong>
        <span className="small">{t("game.quickdraw.wins")}</span>
      </span>
    </div>
  );
  return (
    <section className="qd-strip">
      <div className="qd-strip-row">
        {side(0)}
        <ol className="qd-pips">
          {Array.from({ length: ROUNDS }, (_, i) => {
            const r = rounds[i];
            const res = r ? Quickdraw.roundResult(r) : null;
            const cls = res ? (res.winner === null ? "draw" : `won seat${res.winner}`) : r && playing ? `now seat${r.first}` : "later";
            return (
              <li key={i} className={`qd-pip ${cls}`} title={t("game.quickdraw.round", { n: i + 1 })}>
                <span className="num">{res && res.winner === null ? "=" : i + 1}</span>
              </li>
            );
          })}
        </ol>
        {side(1)}
      </div>
      {done && (
        <p className="qd-sum muted small">
          {t("game.quickdraw.total")}
          <span className="num seat0">{sec3(total[0])}</span>
          <span aria-hidden>/</span>
          <span className="num seat1">{sec3(total[1])}</span>
        </p>
      )}
    </section>
  );
}

/** 1 回戦の結果。2 人の反応時間を棒で並べ、勝った方を強調する（短い棒ほど速い） */
function RoundCard({
  t,
  round,
  n,
  who,
  you,
  fresh = false,
  big = false,
}: {
  t: T;
  round: Quickdraw.RoundView;
  n: number;
  who: (seat: Seat) => string;
  you: Seat | null;
  fresh?: boolean;
  big?: boolean;
}) {
  const res = Quickdraw.roundResult(round)!;
  // 棒の長さの物差し：遅い方の記録（0.5 秒より短ければ 0.5 秒）。おてつきは端まで
  const scale = Math.max(500, ...res.ms.map((ms) => ms ?? 0));
  const [a, b] = res.ms;
  let foot: string;
  if (res.winner === null) foot = a === null ? t("game.quickdraw.bothFoul") : t("game.quickdraw.draw");
  else if (a === null || b === null) foot = t("game.quickdraw.foulBy", { who: who(a === null ? 0 : 1) });
  else foot = t("game.quickdraw.diff", { sec: sec3(Math.abs(a - b)) });
  return (
    <section className={`qd-card ${fresh ? "fresh" : ""} ${big ? "big" : ""}`}>
      <header className="qd-card-head">
        <strong>{t(big || fresh ? "game.quickdraw.result" : "game.quickdraw.round", { n })}</strong>
        <span className="muted small">{t("game.quickdraw.first", { who: who(round.first) })}</span>
      </header>
      <ul className="qd-rows">
        {([0, 1] as Seat[]).map((seat) => {
          const ms = res.ms[seat];
          const width = ms === null ? 100 : Math.max(2, (ms / scale) * 100);
          return (
            <li key={seat} className={`seat${seat} ${res.winner === seat ? "won" : ""} ${seat === you ? "me" : ""} ${ms === null ? "foul" : ""}`}>
              <span className="token dot" aria-hidden />
              <span className="qd-row-name">{who(seat)}</span>
              <span className="qd-row-time">
                {ms === null ? (
                  t("game.quickdraw.foul")
                ) : (
                  <>
                    <span className="num">{sec3(ms)}</span>
                    <small>{t("game.quickdraw.secUnit")}</small>
                  </>
                )}
              </span>
              <span className="qd-row-tag">{res.winner === seat && <b className="qd-won">{t("game.quickdraw.win")}</b>}</span>
              <span className="qd-bar" aria-hidden>
                <span style={{ width: `${width}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="qd-card-foot muted small">{foot}</p>
    </section>
  );
}

/** 終局：どうやって決まったか（勝ち数・反応時間の合計・引き分け、2 勝で決着） */
function Final({
  t,
  rounds,
  wins,
  total,
  winner,
  who,
}: {
  t: T;
  rounds: Quickdraw.RoundView[];
  wins: [number, number];
  total: [number, number];
  winner: Seat | null;
  who: (seat: Seat) => string;
}) {
  let text: string;
  if (winner === null) text = t("game.quickdraw.drawAll");
  else if (wins[0] !== wins[1]) text = t("game.quickdraw.byWins", { who: who(winner), a: wins[winner], b: wins[other(winner)] });
  else text = t("game.quickdraw.bySum", { who: who(winner), a: sec3(total[winner]), b: sec3(total[other(winner)]) });
  return (
    <p className="board-note qd-final">
      <strong>{text}</strong>
      {rounds.length < ROUNDS && <span className="muted">{t("game.quickdraw.early")}</span>}
    </p>
  );
}
