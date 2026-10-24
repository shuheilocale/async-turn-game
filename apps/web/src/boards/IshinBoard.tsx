import { useEffect, useRef, useState } from "react";
import { Ishin, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { heart, Picture, pictureOf } from "./ishin/pictures.tsx";
import "./IshinBoard.css";

const { ROUNDS, MAX_SCORE, CLEAR_SCORE, CHOICES, firstOf, percentOf, tierOf, questionOf } = Ishin;
type Move = Ishin.IshinMove;
type Result = Ishin.RoundResult;

const HEART = heart(12, 12.5, 10);

function Heart({ on = false, className = "" }: { on?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`ishin-heart ${on ? "on" : ""} ${className}`} aria-hidden>
      <path d={HEART} />
    </svg>
  );
}

/** 鍵（相手の答えはまだないしょ） */
const Lock = () => (
  <svg viewBox="0 0 24 24" className="ishin-lock" aria-hidden>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" />
  </svg>
);

/** 見る人に合わせた呼び方と、選択肢の言葉 */
function useWords(you: Seat | null, names: Record<Seat, string>) {
  const { t } = useI18n();
  const nameOf = (seat: Seat) => names[seat] || t(`game.ishin.seat${seat}`);
  /** 見ている人は「わたし」、相手は「〇〇さん」 */
  const who = (seat: Seat) => (seat === you ? t("game.ishin.me") : t("game.ishin.who", { name: nameOf(seat) }));
  const isWho = (q: string) => questionOf(q)?.genre === "who";
  /** 選ぶときの言葉。「どっちが？」の 0・1 は席なので、見る人から見た「わたし／あなた」にする */
  const pickLabel = (q: string, i: number) => {
    if (!isWho(q)) return t(`game.ishin.q.${q}.${i}`);
    if (i === 2) return t("game.ishin.who.both");
    if (i === 3) return t("game.ishin.who.neither");
    if (you === null) return who(i as Seat);
    return t(i === you ? "game.ishin.who.me" : "game.ishin.who.you");
  };
  /** 見せ合いの言葉。「どっちが？」の 0・1 は「わたし／〇〇さん」（誰の答えでも同じ人を指すように） */
  const showLabel = (q: string, i: number) => (isWho(q) && i < 2 ? who(i as Seat) : pickLabel(q, i));
  return { t, who, isWho, pickLabel, showLabel };
}

type Words = ReturnType<typeof useWords>;

/** 開いたときにまだ見ていないはずの見せ合い。直前の問題を後に答えたのが相手なら、その問題 */
function unseenOf(s: Ishin.IshinView, you: Seat | null): number | null {
  const last = s.history.length - 1;
  return last >= 0 && you !== null && other(firstOf(last)) !== you ? last : null;
}

/** 選択肢を並べる順。「どっちが？」は「わたし」を先にする */
const orderOf = (isWho: boolean, me: Seat) => (isWho ? [me, other(me), 2, 3] : Array.from({ length: CHOICES }, (_, i) => i));

/**
 * 上に問題の数と 12 このハート、まん中に質問と 4 つの選択肢。自分の番では「自分の答え」→「相手の答えの予想」の
 * 順にカードをタップし、画面下の「これで決定」で確定する。2 人とも出したら見せ合いを出し、
 * 終わったら相性の ％ と、ふたりの答えの一覧を出す
 */
export function IshinBoard({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const s = state as Ishin.IshinView;
  const words = useWords(you, names);
  const { t, who } = words;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;

  // 見せ合いを出す問題。開いたときは、直前の問題を相手が締めくくっていれば（まだ見ていなければ）出す
  const [reveal, setReveal] = useState<number | null>(() => unseenOf(s, you));
  /** 見たことのある問題の数。増えたら、増えた最後の問題を見せ合う */
  const seen = useRef(s.history.length);
  useEffect(() => {
    const prev = seen.current;
    seen.current = s.history.length;
    if (s.history.length > prev) setReveal(s.history.length - 1);
    else if (s.history.length < prev) setReveal(null);
  }, [s.history.length]);
  // はじめは観戦者として届き、合言葉がそろってから席が分かることがある（?t= のリンク・LINE で開いたとき）
  const lastYou = useRef(you);
  useEffect(() => {
    if (lastYou.current === null && you !== null) setReveal(unseenOf(s, you));
    lastYou.current = you;
  }, [you]);
  const revealed = reveal === null ? undefined : s.history[reveal];

  const question = s.questions[Math.min(s.round, ROUNDS - 1)];
  const nameOfTurn = s.turn === null ? "" : who(s.turn);

  return (
    <div className="ishin">
      <div className="ishin-top">
        <span className="ishin-round">
          {playing && !revealed
            ? t("game.ishin.round", { n: s.round + 1, total: ROUNDS })
            : t("game.ishin.hearts", { n: s.score, max: MAX_SCORE })}
        </span>
        <Hearts history={s.history} now={playing && !revealed ? s.round : null} />
      </div>

      {revealed ? (
        <Reveal
          key={reveal}
          r={revealed}
          index={reveal!}
          you={you}
          words={words}
          last={reveal === ROUNDS - 1}
          onNext={() => setReveal(null)}
        />
      ) : !playing ? (
        <Final score={s.score} words={words} />
      ) : (
        question && (
          <>
            <QuestionCard id={question} words={words} />
            {myTurn ? (
              <Picker
                key={`${s.round}-${you}`}
                q={question}
                me={me}
                opp={opp}
                partnerDone={s.answered[opp]}
                interactive={interactive}
                selected={selected as Move | null}
                onSelect={onSelect}
                words={words}
              />
            ) : (
              <Waiting s={s} q={question} me={me} opp={opp} you={you} words={words} turnName={nameOfTurn} />
            )}
          </>
        )
      )}

      {s.history.length > 0 && (
        <Log history={s.history} me={me} words={words} title={t(playing ? "game.ishin.history" : "game.ishin.answers")} />
      )}
    </div>
  );
}

/** 12 このハート。1 問ぶん 2 こずつ並べ、当たった予想の数だけ塗る */
function Hearts({ history, now }: { history: Result[]; now: number | null }) {
  const { t } = useI18n();
  const score = history.reduce((n, r) => n + r.hits.filter(Boolean).length, 0);
  return (
    <span className="ishin-hearts" role="img" aria-label={t("game.ishin.hearts", { n: score, max: MAX_SCORE })}>
      {Array.from({ length: ROUNDS }, (_, i) => (
        <span key={i} className={`ishin-pair ${i === now ? "now" : ""}`}>
          {[0, 1].map((seat) => (
            <Heart key={seat} on={history[i]?.hits[seat] ?? false} />
          ))}
        </span>
      ))}
    </span>
  );
}

function QuestionCard({ id, words }: { id: string; words: Words }) {
  const { t } = words;
  const genre = questionOf(id)?.genre ?? "who";
  return (
    <section className="ishin-q">
      <span className="ishin-genre">{t(`game.ishin.genre.${genre}`)}</span>
      <p className="ishin-q-text">{t(`game.ishin.q.${id}`)}</p>
    </section>
  );
}

/**
 * 自分の番：「自分の答え」と「相手の答えの予想」を選ぶ。2 つそろったら onSelect に手を渡し、
 * 画面下の「これで決定」が出る。どちらを選んでいるかは上の 2 つの段で切り替えられる
 */
function Picker({
  q,
  me,
  opp,
  partnerDone,
  interactive,
  selected,
  onSelect,
  words,
}: {
  q: string;
  me: Seat;
  opp: Seat;
  partnerDone: boolean;
  interactive: boolean;
  selected: Move | null;
  onSelect(move: unknown | null): void;
  words: Words;
}) {
  const { t, who, isWho, pickLabel } = words;
  const [draft, setDraft] = useState<{ answer: number | null; guess: number | null }>({ answer: null, guess: null });
  const [step, setStep] = useState<"answer" | "guess">("answer");

  // 画面下の「取り消し」で選んだ手が消えたら、はじめからにする
  useEffect(() => {
    if (selected === null && draft.answer !== null && draft.guess !== null) {
      setDraft({ answer: null, guess: null });
      setStep("answer");
    }
  }, [selected]);

  const pick = (i: number) => {
    if (!interactive) return;
    const next = step === "answer" ? { ...draft, answer: i } : { ...draft, guess: i };
    setDraft(next);
    if (step === "answer" && next.guess === null) setStep("guess");
    onSelect(next.answer !== null && next.guess !== null ? { answer: next.answer, guess: next.guess } : null);
  };

  const partner = who(opp);
  const stepButton = (kind: "answer" | "guess", no: number) => {
    const value = draft[kind];
    return (
      <button
        type="button"
        className={`ishin-step seat${me} ${step === kind ? "on" : ""} ${value !== null ? "done" : ""}`}
        aria-pressed={step === kind}
        disabled={!interactive}
        onClick={() => setStep(kind)}
      >
        <span className="ishin-step-no">{no}</span>
        <span className="ishin-step-name">{kind === "answer" ? t("game.ishin.step.answer") : t("game.ishin.step.guess", { who: partner })}</span>
        <span className={`ishin-step-value ${value === null ? "empty" : ""}`}>{value === null ? "…" : pickLabel(q, value)}</span>
      </button>
    );
  };

  const done = draft.answer !== null && draft.guess !== null;
  return (
    <>
      {partnerDone && (
        <p className={`ishin-partner seat${opp}`}>
          <Lock />
          <span>{t("game.ishin.partnerDone", { who: partner })}</span>
        </p>
      )}
      <div className="ishin-steps">
        {stepButton("answer", 1)}
        {stepButton("guess", 2)}
      </div>
      <p className="ishin-ask" role="status">
        {step === "answer" ? t("game.ishin.ask.answer") : t("game.ishin.ask.guess", { who: partner })}
        {done && <span className="muted">{t("game.ishin.ask.done")}</span>}
      </p>
      <div className={`ishin-choices can picking-${step}`}>
        {orderOf(isWho(q), me).map((i) => {
          const isAnswer = draft.answer === i;
          const isGuess = draft.guess === i;
          return (
            <button
              key={i}
              type="button"
              className={["ishin-choice", `seat${me}`, isAnswer && "answer", isGuess && "guess"].filter(Boolean).join(" ")}
              aria-pressed={step === "answer" ? isAnswer : isGuess}
              disabled={!interactive}
              onClick={() => pick(i)}
            >
              {isAnswer && <span className="ishin-badge answer">{t("game.ishin.badge.answer")}</span>}
              {isGuess && (
                <span className="ishin-badge guess">
                  <Heart on />
                  {t("game.ishin.badge.guess")}
                </span>
              )}
              <Picture name={pictureOf(q, i)} />
              <span className="ishin-choice-label">{pickLabel(q, i)}</span>
            </button>
          );
        })}
      </div>
      {isWho(q) && <p className="board-note muted small">{t("game.ishin.whoHint", { who: partner })}</p>}
    </>
  );
}

/** 小さな答えのカード */
function Mini({ q, choice, cap, seat, kind, words }: { q: string; choice: number; cap: string; seat: Seat; kind: "answer" | "guess"; words: Words }) {
  return (
    <div className={`ishin-mini ${kind} seat${seat}`}>
      <Picture name={pictureOf(q, choice)} />
      <span className="ishin-mini-label">{words.showLabel(q, choice)}</span>
      <span className="ishin-mini-cap">{cap}</span>
    </div>
  );
}

/** 相手の番：自分が先に出していれば自分の答えと予想、相手の分は伏せたカード */
function Waiting({
  s,
  q,
  me,
  opp,
  you,
  words,
  turnName,
}: {
  s: Ishin.IshinView;
  q: string;
  me: Seat;
  opp: Seat;
  you: Seat | null;
  words: Words;
  turnName: string;
}) {
  const { t, who, isWho, pickLabel } = words;
  const mine = you === null ? null : s.picks[you];
  if (mine) {
    return (
      <>
        <div className="ishin-mine">
          <Mini q={q} choice={mine.answer} cap={t("game.ishin.yours")} seat={me} kind="answer" words={words} />
          <Mini q={q} choice={mine.guess} cap={t("game.ishin.yourGuess")} seat={me} kind="guess" words={words} />
          <div className={`ishin-mini secret seat${opp}`}>
            <span className="ishin-secret-mark ishin-thinking">?</span>
            <span className="ishin-mini-label">{who(opp)}</span>
            <span className="ishin-mini-cap">{t("game.ishin.hidden")}</span>
          </div>
        </div>
        <p className="board-note">
          <span>{t("game.ishin.waitPartner", { who: who(opp) })}</span>
          <span className="muted">{t("game.ishin.secret")}</span>
        </p>
      </>
    );
  }
  // 相手が先に答える番（観戦者は誰かが答えている）。選択肢は先に見せておく
  return (
    <>
      <div className="ishin-choices dim">
        {orderOf(isWho(q), me).map((i) => (
          <button key={i} type="button" className="ishin-choice" disabled>
            <Picture name={pictureOf(q, i)} />
            <span className="ishin-choice-label">{pickLabel(q, i)}</span>
          </button>
        ))}
      </div>
      <p className="board-note">
        <span className="ishin-thinking">
          {you === null ? t("game.ishin.thinking", { who: turnName }) : t("game.ishin.waitFirst", { who: who(opp) })}
        </span>
        {s.answered.some(Boolean) && <span className="muted">{t("game.ishin.secret")}</span>}
      </p>
    </>
  );
}

/** 見せ合い。1 人の答えと、それを当てようとした相手の予想を左右に並べ、当たっていればハートでつなぐ */
function Reveal({
  r,
  index,
  you,
  words,
  last,
  onNext,
}: {
  r: Result;
  index: number;
  you: Seat | null;
  words: Words;
  last: boolean;
  onNext(): void;
}) {
  const { t, who } = words;
  const me: Seat = you ?? 0;
  const gain = r.hits.filter(Boolean).length;
  // 先に「わたしの答え」と、それを当てようとした相手の予想
  const rows = ([me, other(me)] as Seat[]).map((seat) => ({ seat, guesser: other(seat), hit: r.hits[other(seat)] }));
  return (
    <section className="ishin-reveal" aria-live="polite">
      <div className="ishin-reveal-head">
        <span className="ishin-reveal-title">{t("game.ishin.reveal.title", { n: index + 1 })}</span>
        <p className="ishin-q-text">{t(`game.ishin.q.${r.question}`)}</p>
      </div>
      {rows.map(({ seat, guesser, hit }) => (
        <div key={seat} className={`ishin-match ${hit ? "hit" : ""}`}>
          <Mini
            q={r.question}
            choice={r.picks[seat].answer}
            cap={t("game.ishin.reveal.answer", { who: who(seat) })}
            seat={seat}
            kind="answer"
            words={words}
          />
          <span className={`ishin-link ${hit ? "hit" : ""}`} role="img" aria-label={t(hit ? "game.ishin.reveal.hit" : "game.ishin.reveal.miss")}>
            {hit ? (
              <Heart on />
            ) : (
              <span className="ishin-miss" aria-hidden>
                ×
              </span>
            )}
          </span>
          <Mini
            q={r.question}
            choice={r.picks[guesser].guess}
            cap={t("game.ishin.reveal.guess", { who: who(guesser) })}
            seat={guesser}
            kind="guess"
            words={words}
          />
        </div>
      ))}
      <p className={`ishin-gain ${gain > 0 ? "hit" : ""}`}>
        {gain === 2 ? t("game.ishin.reveal.all") : gain > 0 ? t("game.ishin.reveal.gain", { n: gain }) : t("game.ishin.reveal.none")}
      </p>
      <button type="button" className="primary ishin-next" onClick={onNext}>
        {t(last ? "game.ishin.toResult" : "game.ishin.next")}
      </button>
    </section>
  );
}

/** 相性：ハートの形のメーターに、％ の高さまで色を入れる */
function Final({ score, words }: { score: number; words: Words }) {
  const { t } = words;
  const pct = percentOf(score);
  const tier = tierOf(pct);
  const shape = heart(60, 58, 52);
  // 色を入れる高さ。ハートの形は上下 4.4〜101.3 にあるので、その範囲で割合を取る
  const top = 101.3 - (96.9 * pct) / 100;
  return (
    <section className="ishin-result">
      <span className="ishin-result-title">{t("game.ishin.result.title")}</span>
      <svg viewBox="0 0 120 106" className="ishin-gauge" role="img" aria-label={`${pct}%`}>
        <defs>
          <clipPath id="ishin-heart-clip">
            <path d={shape} />
          </clipPath>
          <clipPath id="ishin-level-clip">
            <rect x="0" y={top} width="120" height={106 - top} />
          </clipPath>
        </defs>
        <path className="shape" d={shape} />
        <g clipPath="url(#ishin-heart-clip)">
          <g className="level">
            <rect x="0" y={top} width="120" height={106 - top} />
            {/* 光は色が入ったところにだけ見せる */}
            <path className="shine" d="M27 33c2-7 7-11 13-12" clipPath="url(#ishin-level-clip)" />
          </g>
        </g>
      </svg>
      <strong className="ishin-pct">
        {pct}
        <small>%</small>
      </strong>
      <p className="ishin-tier">{t(`game.ishin.tier.${tier}`)}</p>
      <p className="ishin-tier-text muted">{t(`game.ishin.tierText.${tier}`)}</p>
      <p className="ishin-score">{t(score >= CLEAR_SCORE ? "game.ishin.result.cleared" : "game.ishin.result.failed", { goal: CLEAR_SCORE })}</p>
    </section>
  );
}

/** これまでの問題（終局後は「ふたりの答え」）。1 問ごとに、2 人の答えと予想 */
function Log({ history, me, words, title }: { history: Result[]; me: Seat; words: Words; title: string }) {
  const { t, who, showLabel } = words;
  return (
    <section className="ishin-log">
      <h3 className="muted">{title}</h3>
      <ol>
        {history.map((r, i) => (
          <li key={i}>
            <div className="ishin-log-head">
              <span className="ishin-log-no">{i + 1}</span>
              <span className="ishin-log-q">{t(`game.ishin.q.${r.question}`)}</span>
              <span className="ishin-pair">
                {[0, 1].map((seat) => (
                  <Heart key={seat} on={r.hits[seat]!} />
                ))}
              </span>
            </div>
            {([me, other(me)] as Seat[]).map((seat) => (
              <div key={seat} className={`ishin-log-row seat${seat}`}>
                <span className="ishin-log-who">
                  <span className="token dot" aria-hidden />
                  <span>{who(seat)}</span>
                </span>
                <span className="ishin-log-pick answer">
                  <Picture name={pictureOf(r.question, r.picks[seat].answer)} />
                  <span>{showLabel(r.question, r.picks[seat].answer)}</span>
                </span>
                <span className="ishin-log-pick guess">
                  <span className="tag">{t("game.ishin.guessShort")}</span>
                  <span>{showLabel(r.question, r.picks[seat].guess)}</span>
                  {r.hits[seat] && <Heart on />}
                </span>
              </div>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
