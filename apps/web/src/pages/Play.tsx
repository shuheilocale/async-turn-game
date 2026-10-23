import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView, Seat } from "@atg/core";
import { api, ApiRequestError } from "../api.ts";
import { boards } from "../boards/index.ts";
import { errorText, useI18n, type T } from "../i18n/index.tsx";
import { navigate } from "../router.ts";
import { GameGlyph, SeatToken } from "../icons.tsx";
import { followGame, lineIdToken, lineSession, pickAndSend, postToChat, type Card } from "../line.ts";
import { inviteCard, progressCard } from "../notify.ts";
import { shareLink } from "../share.ts";
import { savedGames } from "../storage.ts";

/** 相手の手を待つ間、何ミリ秒ごとに盤面を確認するか */
const POLL_MS = 5000;

export function Play({ id }: { id: string }) {
  const { t } = useI18n();
  const [token, setToken] = useState<string | undefined>(() => savedGames.get(id)?.token);
  const [view, setView] = useState<GameView | null>(null);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  /** トークに自動で送れなかったときに、送り先を選んで送るためのカード */
  const [notice, setNotice] = useState<Card | null>(null);

  // 「自分用リンク」(?t=...) で開かれたら、この端末に合言葉を保存して URL から消す
  useEffect(() => {
    const tk = new URLSearchParams(location.search).get("t");
    if (!tk) return;
    api.getGame(id, tk).then((v) => {
      if (v.you !== null) {
        savedGames.save(id, { token: tk, seat: v.you });
        setToken(tk);
      }
      navigate(`/g/${id}`, true);
    });
  }, [id]);

  // LINE から開いていて、この端末に合言葉がなければ、LINE アカウントで本人と確かめて発行してもらう
  useEffect(() => {
    const idToken = lineIdToken();
    if (token || !idToken) return;
    api.claim(id, idToken).then(
      (claimed) => {
        savedGames.save(id, claimed);
        setToken(claimed.token);
      },
      () => {}, // 参加者でなければ観戦のまま
    );
  }, [id, token]);

  const refresh = useCallback(async () => {
    try {
      setView(await api.getGame(id, token));
    } catch (e) {
      setMessage(errorText(t, e));
    }
    // t は言語切り替えで変わるが、ポーリングをやり直す必要はない
  }, [id, token]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // 盤面が進んだら、選びかけの手は取り消す
  useEffect(() => {
    setSelected(null);
    setNotice(null);
  }, [view?.version]);

  const myTurn =
    !!view && view.status.kind === "playing" && view.status.turn === view.you && !view.waitingForOpponent;

  // タブのタイトルで手番を知らせる（PC で別タブを見ていても気づける）
  useEffect(() => {
    const title = view ? t(`game.${view.gameType}.name`) : t("app.name");
    document.title = myTurn ? `${t("title.yourTurn")} | ${title}` : title;
    return () => {
      document.title = t("app.name");
    };
  }, [myTurn, t, view?.gameType]);

  /** 手を送る。送れたら true */
  async function submit(move: unknown = selected): Promise<boolean> {
    if (!view || !token || move === null) return false;
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.move(id, token, view.version, move);
      setView(next);
      setSelected(null);
      // 手番が相手に移ったとき・終局したときだけ知らせる（同じ人が続けて指すゲームでは知らせない）
      const handedOver = next.status.kind === "finished" || next.status.turn !== next.you;
      if (lineSession() && handedOver) {
        // 指したことを相手に LINE で知らせる。トークから開いていれば自動、そうでなければボタンで
        const me = next.players.find((p) => p.seat === next.you)?.name ?? "";
        const card = progressCard(t, next, t("line.moved", { name: me }));
        if (await postToChat(id, card)) setMessage(t("play.notified"));
        else setNotice(card);
      }
      return true;
    } catch (e) {
      setMessage(errorText(t, e));
      if (e instanceof ApiRequestError && e.status === 409) await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * 送り先を選んで LINE で送る。送り先を選ぶ画面が使えなければ、理由を出したうえで
   * カードのリンクをコピーする（トークに貼れば同じように開ける）
   */
  async function sendByPicker(card: Card, fallbackToLink: boolean): Promise<boolean> {
    const result = await pickAndSend(card);
    if (result.kind === "sent") setMessage(t("play.notified"));
    if (result.kind !== "failed") return result.kind === "sent";
    console.warn("shareTargetPicker failed", result.reason);
    if (fallbackToLink) await share(card.url, card.alt);
    setMessage(`${t("play.lineFailed")}（${result.reason}）`);
    return false;
  }

  /** 同じ 2 人で次の対局を作る（gameType を省くともう一局）。相手には LINE で知らせる */
  async function startNext(gameType?: string) {
    if (!view || !token || view.you === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.next(id, token, gameType);
      await goNext(next.id);
      const nextView = await api.getGame(next.id, token).catch(() => null);
      const me = view.players.find((p) => p.seat === view.you)?.name ?? "";
      if (nextView) await postToChat(next.id, progressCard(t, nextView, t("line.nextGame", { name: me })));
      navigate(`/g/${next.id}`);
    } catch (e) {
      setMessage(errorText(t, e));
      setBusy(false);
    }
  }

  /** 次の対局でも同じ合言葉で指せるので、席を入れ替えて保存しておく */
  async function goNext(nextId: string, andOpen = false) {
    if (token && view?.you != null) savedGames.save(nextId, { token, seat: view.you === 0 ? 1 : 0 });
    followGame(id, nextId);
    if (andOpen) navigate(`/g/${nextId}`);
  }

  async function share(url: string, text: string) {
    const result = await shareLink(url, text);
    if (result === "copied") setMessage(t("play.copied"));
    if (result === "failed") setMessage(t("play.copyFailed", { url }));
  }

  if (!view) return <p className="message">{message ?? t("play.loading")}</p>;

  const ui = boards[view.gameType];
  if (!ui) return <p className="message">{t("play.noBoard")}</p>;

  const gameName = t(`game.${view.gameType}.name`);
  const seatLabel = (seat: Seat) => t(`game.${view.gameType}.seat${seat}`);
  const names = { 0: "", 1: "" } as Record<Seat, string>;
  for (const p of view.players) names[p.seat] = p.name;

  return (
    <div className="play">
      <div className="play-head">
        <a href="/" className="back" aria-label={t("nav.home")} onClick={(e) => (e.preventDefault(), navigate("/"))}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </a>
        <GameGlyph id={view.gameType} className="small" />
        <h1>{gameName}</h1>
      </div>

      <div className="play-status">
        <StatusBanner t={t} view={view} names={names} seatLabel={seatLabel} />

        <div className="versus">
          {([0, 1] as Seat[]).map((seat) => (
            <div
              key={seat}
              className={[
                "player",
                `seat${seat}`,
                view.status.kind === "playing" && view.status.turn === seat && !view.waitingForOpponent && "turn",
                view.status.kind === "finished" &&
                  (view.status.winner === seat || view.status.coop === "cleared") &&
                  "winner",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <SeatToken gameType={view.gameType} seat={seat} />
              <span className="name">{names[seat] || t("play.waitingName")}</span>
              {view.you === seat && <span className="you">{t("play.you")}</span>}
            </div>
          ))}
        </div>

        {view.waitingForOpponent && view.inviteCode && (
          <section className="panel invite">
            <p>{t("play.invite.lead")}</p>
            {lineSession() && view.you !== null && (
              <button
                className="primary"
                onClick={async () => {
                  const card = inviteCard(t, view.gameType, id, view.inviteCode!, names[view.you!]);
                  await sendByPicker(card, true);
                }}
              >
                {t("play.invite.line")}
              </button>
            )}
            <button
              className={lineSession() ? "" : "primary"}
              onClick={() =>
                share(`${location.origin}/join/${id}?code=${view.inviteCode}`, t("play.invite.shareText", { game: gameName }))
              }
            >
              {t(lineSession() ? "play.invite.copy" : "play.invite.button")}
            </button>
          </section>
        )}

        {notice && (
          <section className="panel invite">
            <button
              className="primary"
              onClick={async () => {
                if (await sendByPicker(notice, false)) setNotice(null);
              }}
            >
              {t("play.notify.line")}
            </button>
          </section>
        )}

        {message && <p className="message">{message}</p>}
      </div>

      <div className="play-main">
        <ui.Board
          state={view.state}
          status={view.status}
          you={view.you}
          names={names}
          interactive={myTurn && !busy}
          selected={selected}
          onSelect={(m) => setSelected(m)}
          onSubmit={(m) => submit(m)}
        />
        {view.status.kind === "finished" && view.you !== null && (
          <div className="after-game">
            {view.nextGameId ? (
              <>
                <p>{t("play.nextReady")}</p>
                <button className="primary" onClick={() => goNext(view.nextGameId!, true)}>
                  {t("play.toNext")}
                </button>
              </>
            ) : (
              <>
                <button className="primary" disabled={busy} onClick={() => startNext()}>
                  {t("play.rematch")}
                </button>
                <button disabled={busy} onClick={() => setPicking(true)}>
                  {t("play.otherGame")}
                </button>
              </>
            )}
          </div>
        )}
        <GamePicker open={picking} onClose={() => setPicking(false)} onPick={(g) => (setPicking(false), startNext(g))} />

        <div className={`confirm ${selected !== null ? "show" : ""}`}>
          <button className="ghost-button" onClick={() => setSelected(null)} disabled={busy}>{t("play.cancel")}</button>
          <button className="primary" onClick={() => submit()} disabled={busy}>{t("play.confirm")}</button>
        </div>
      </div>

      <div className="play-extra">

        <details className="panel fold">
          <summary>{t("play.rules")}</summary>
          <p>{t(`game.${view.gameType}.rules`)}</p>
        </details>

        {token && (
          <details className="panel fold">
            <summary>{t("play.otherDevice")}</summary>
            <p className="muted">
              {t("play.otherDevice.lead")} <strong>{t("play.otherDevice.warn")}</strong>
            </p>
            <button onClick={() => share(`${location.origin}/g/${id}?t=${token}`, t("play.ownLinkText"))}>
              {t("play.otherDevice.button")}
            </button>
          </details>
        )}
      </div>
    </div>
  );
}

/** ほかのゲームで遊ぶときに、ゲームを選ぶシート */
function GamePicker({ open, onClose, onPick }: { open: boolean; onClose(): void; onPick(gameType: string): void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="sheet" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="sheet-body">
        <h1>{t("home.chooseGame")}</h1>
        <div className="game-tiles compact">
          {Object.keys(boards).map((gameType) => (
            <button key={gameType} type="button" className="game-tile" onClick={() => onPick(gameType)}>
              <GameGlyph id={gameType} />
              <span className="tile-name">{t(`game.${gameType}.name`)}</span>
            </button>
          ))}
        </div>
        <button className="ghost-button" onClick={onClose}>
          {t("home.close")}
        </button>
      </div>
    </dialog>
  );
}

function StatusBanner({
  t,
  view,
  names,
  seatLabel,
}: {
  t: T;
  view: GameView;
  names: Record<Seat, string>;
  seatLabel: (seat: Seat) => string;
}) {
  let text: string;
  let tone = "";
  const yours = view.you === null ? "" : ` seat${view.you}`;
  if (view.status.kind === "finished") {
    const w = view.status.winner;
    const coop = view.status.coop;
    text = coop
      ? t(coop === "cleared" ? "status.cleared" : "status.failed")
      :
      w === null
        ? t("status.draw")
        : w === view.you
          ? t("status.youWin")
          : t("status.winner", { name: names[w], seat: seatLabel(w) });
    tone = (w !== null && w === view.you) || coop === "cleared" ? `done won${yours}` : "done";
  } else if (view.waitingForOpponent) {
    text = t("status.waiting");
  } else if (view.you === null) {
    const turn = view.status.turn;
    text = t("status.spectating", { name: names[turn], seat: seatLabel(turn) });
  } else if (view.status.turn === view.you) {
    text = t("status.yourTurn");
    tone = `hot${yours}`;
  } else {
    text = t("status.theirTurn", { name: names[view.status.turn] });
  }
  return (
    <div className={`banner ${tone}`} role="status">
      {text}
    </div>
  );
}
