import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { botMove, getGame, IllegalMoveError, type GameStatus, type Seat } from "@atg/core";
import { boards } from "../boards/index.ts";
import { botName, coopText, useI18n, type T } from "../i18n/index.tsx";
import { GameGlyph, SeatToken } from "../icons.tsx";
import { navigate } from "../router.ts";
import { savedName } from "../storage.ts";
import { tourOf, type TourStep } from "../tour.ts";

/** コンピュータが指すまでの間（すぐ指すと何が起きたか分からないので少し待つ） */
const BOT_DELAY_MS = 700;
/**
 * 時間を使うゲーム（stampMove を持つ）のお試しでは、1 手ごとに時計をこれだけ進める。
 * サーバの代わりに「今の時刻 + 指した数 × これ」を手に書き込み、育つ様子などを短い時間で見られるようにする
 */
const LEARN_STEP_MS = 12 * 3_600_000;

/**
 * 「ルールを学ぶ」：サーバを使わず、この端末だけで 1 局ためす画面。
 * 対戦ゲームはコンピュータ（packages/core の botMove）が相手。コンピュータがいないゲーム
 * （協力ゲームなど）は、ひとりで 2 人分を動かす。ゲームごとの案内（tours/）を上に重ねて出せる
 */
export function Learn({ gameType }: { gameType: string }) {
  const { t } = useI18n();
  const def = getGame(gameType);
  const ui = boards[gameType];
  const [state, setState] = useState(() => def?.initialState(Math.random));
  const [selected, setSelected] = useState<unknown | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [moves, setMoves] = useState(0);
  /** この局で指した手の数（コンピュータの手も数える）。お試しの時計に使う */
  const [plies, setPlies] = useState(0);
  const steps = tourOf(gameType);
  const [step, setStep] = useState<number | null>(steps.length > 0 ? 0 : null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${t("learn.label")} | ${t(`game.${gameType}.name`)}`;
  }, [t, gameType]);

  const withBot = !!def && !ui?.coop && (!!def.botMove || !!def.legalMoves);
  const status: GameStatus | null = def && state !== undefined ? def.status(state) : null;
  const turn = status?.kind === "playing" ? status.turn : null;
  // コンピュータが相手なら自分はいつも先手。ひとりで 2 人分なら、今の手番の人として見る
  const you: Seat = withBot ? 0 : (turn ?? 0);
  const botTurn = withBot && turn === 1;

  const apply = useCallback(
    (move: unknown, seat: Seat): boolean => {
      if (!def || state === undefined) return false;
      const parsed = def.parseMove(move);
      try {
        if (parsed === null) throw new IllegalMoveError("bad_move");
        // サーバと同じく時刻を書き込む。お試しでは 1 手ごとに時計を進める
        const stamped = def.stampMove ? def.stampMove(parsed, Date.now() + plies * LEARN_STEP_MS) : parsed;
        setState(def.applyMove(state, stamped, seat));
        setPlies((n) => n + 1);
        setSelected(null);
        setMessage(null);
        return true;
      } catch (e) {
        if (!(e instanceof IllegalMoveError)) throw e;
        setMessage(t(`error.${e.code}`));
        return false;
      }
    },
    [def, state, t, plies],
  );

  // コンピュータの番なら、少し待ってから指す
  useEffect(() => {
    if (!botTurn || !def || state === undefined) return;
    const timer = setTimeout(() => {
      const move = botMove(def, state, 1, Math.random);
      if (move !== null) apply(move, 1);
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [botTurn, def, state, apply]);

  if (!def || !ui || state === undefined || !status) return <p className="message">{t("play.noBoard")}</p>;

  const names: Record<Seat, string> = withBot
    ? { 0: savedName.get() || t("play.you"), 1: botName(t) }
    : { 0: t(`game.${gameType}.seat0`), 1: t(`game.${gameType}.seat1`) };
  const view = def.viewState ? def.viewState(state, you, status.kind === "finished") : state;

  /** 自分の手。案内の「指したら進む」もここで進める */
  const play = (move: unknown) => {
    const ok = apply(move, you);
    if (ok) {
      setMoves((n) => n + 1);
      if (step !== null && steps[step]?.advance === "move") setStep(step + 1 < steps.length ? step + 1 : null);
    }
    return ok;
  };

  const restart = () => {
    setState(def.initialState(Math.random));
    setSelected(null);
    setMessage(null);
    setMoves(0);
    setPlies(0);
  };

  return (
    <div className="play learn" ref={root}>
      <div className="play-head">
        <a href="/" className="back" aria-label={t("nav.home")} onClick={(e) => (e.preventDefault(), navigate("/"))}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </a>
        <GameGlyph id={gameType} className="small" />
        <h1>{t(`game.${gameType}.name`)}</h1>
        <span className="learn-label">{t("learn.label")}</span>
      </div>

      <div className="play-status">
        <div className={`banner ${status.kind === "playing" && !botTurn ? `hot seat${you}` : ""}`} role="status">
          {bannerText(t, status, names, withBot, botTurn, gameType)}
        </div>
        <div className="versus">
          {([0, 1] as Seat[]).map((seat) => (
            <div key={seat} className={`player seat${seat} ${turn === seat ? "turn" : ""}`}>
              <SeatToken gameType={gameType} seat={seat} />
              <span className="name">{names[seat]}</span>
              {withBot && seat === 0 && names[0] !== t("play.you") && <span className="you">{t("play.you")}</span>}
            </div>
          ))}
        </div>
        {message && <p className="message">{message}</p>}
      </div>

      <div className="play-main">
        <ui.Board
          state={view}
          status={status}
          you={you}
          names={names}
          interactive={status.kind === "playing" && !botTurn}
          selected={selected}
          onSelect={setSelected}
          onSubmit={async (m) => play(m)}
        />
        {status.kind === "finished" && (
          <div className="after-game">
            <button className="primary" onClick={() => navigate(`/?create=${gameType}`)}>
              {t("learn.create")}
            </button>
            <button onClick={restart}>{t("learn.again")}</button>
          </div>
        )}
        <div className={`confirm ${selected !== null ? "show" : ""}`}>
          <button className="ghost-button" onClick={() => setSelected(null)}>
            {t("play.cancel")}
          </button>
          <button className="primary" onClick={() => selected !== null && play(selected)}>
            {t("play.confirm")}
          </button>
        </div>
      </div>

      <div className="play-extra">
        {step === null && steps.length > 0 && (
          <button className="ghost-button" onClick={() => setStep(0)}>
            {t("learn.tour.show")}
          </button>
        )}
        <details className="panel fold" open={steps.length === 0}>
          <summary>{t("play.rules")}</summary>
          <p>{t(`game.${gameType}.rules`)}</p>
        </details>
      </div>

      {step !== null && steps[step] && (
        <Tour
          root={root}
          step={steps[step]}
          index={step}
          count={steps.length}
          moves={moves}
          onNext={() => setStep(step + 1 < steps.length ? step + 1 : null)}
          onClose={() => setStep(null)}
        />
      )}
    </div>
  );
}

function bannerText(
  t: T,
  status: GameStatus,
  names: Record<Seat, string>,
  withBot: boolean,
  botTurn: boolean,
  gameType: string,
): string {
  if (status.kind === "finished") {
    if (status.coop) return coopText(t, gameType, status.coop);
    if (status.winner === null) return t("status.draw");
    if (withBot && status.winner === 0) return t("status.youWin");
    return t("status.winner", { name: names[status.winner], seat: t(`game.${gameType}.seat${status.winner}`) });
  }
  if (botTurn) return t("learn.botThinking");
  if (withBot) return t("status.yourTurn");
  return t("learn.both", { seat: names[status.turn] });
}

/** 光らせる場所。まだ画面にない（コンピュータの番で手札が隠れている など）ときは盤を光らせる */
const findTarget = (root: HTMLElement | null, step: TourStep) =>
  (step.target ? root?.querySelector(step.target) : null) ?? root?.querySelector(".play-main > *") ?? null;

/**
 * 案内の吹き出し。target の場所を枠で光らせ、その下（入らなければ上）に出す。
 * 画面は暗くせず、盤はそのまま触れる（「指したら進む」案内のため）
 */
function Tour({
  root,
  step,
  index,
  count,
  moves,
  onNext,
  onClose,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  step: TourStep;
  index: number;
  count: number;
  moves: number;
  onNext(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // 光らせる場所の位置を追いかける（盤の大きさは画面の幅や手の進み方で変わる）
  useLayoutEffect(() => {
    let frame = 0;
    let last = "";
    const update = () => {
      const el = findTarget(root.current, step);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${r.top},${r.left},${r.width},${r.height}` : "";
      if (key !== last) {
        last = key;
        setRect(r);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [root, step, moves]);

  // 初めて出たときに、光らせる場所が見えるようにする
  useEffect(() => {
    findTarget(root.current, step)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [root, step]);

  // 画面の下は「これで決定」が出る場所なので空けておく。指して進む案内は盤の上に出す
  const gap = 12;
  const reserve = 104;
  const cardHeight = card.current?.offsetHeight ?? 140;
  const fitsBelow = rect !== null && rect.bottom + gap + cardHeight < window.innerHeight - reserve;
  const fitsAbove = rect !== null && rect.top - gap - cardHeight > gap;
  const top =
    rect === null
      ? 96
      : step.advance !== "move" && fitsBelow
        ? rect.bottom + gap
        : fitsAbove
          ? rect.top - gap - cardHeight
          : gap;
  const last = index === count - 1;

  return (
    <>
      {rect && (
        <div
          className="tour-ring"
          aria-hidden
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="tour-card" ref={card} role="dialog" aria-live="polite" style={{ top }}>
        <p>{t(step.text)}</p>
        <div className="tour-actions">
          <span className="tour-count num">
            {index + 1} / {count}
          </span>
          <button className="ghost-button" onClick={onClose}>
            {t("learn.tour.close")}
          </button>
          {step.advance === "move" ? (
            <span className="tour-hint">{t("learn.tour.makeMove")}</span>
          ) : (
            <button className="primary" onClick={onNext}>
              {t(last ? "learn.tour.done" : "learn.tour.next")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
