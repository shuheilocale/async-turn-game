import { useCallback, useEffect, useState } from "react";
import type { GameView, Seat } from "@atg/core";
import { api, ApiRequestError } from "../api.ts";
import { boards } from "../boards/index.ts";
import { errorText, useI18n, type T } from "../i18n/index.tsx";
import { navigate } from "../router.ts";
import { GameGlyph, SeatToken } from "../icons.tsx";
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
  useEffect(() => setSelected(null), [view?.version]);

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

  async function submit() {
    if (!view || !token || selected === null) return;
    setBusy(true);
    setMessage(null);
    try {
      setView(await api.move(id, token, view.version, selected));
      setSelected(null);
    } catch (e) {
      setMessage(errorText(t, e));
      if (e instanceof ApiRequestError && e.status === 409) await refresh();
    } finally {
      setBusy(false);
    }
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
                view.status.kind === "finished" && view.status.winner === seat && "winner",
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
            <button
              className="primary"
              onClick={() =>
                share(`${location.origin}/join/${id}?code=${view.inviteCode}`, t("play.invite.shareText", { game: gameName }))
              }
            >
              {t("play.invite.button")}
            </button>
          </section>
        )}

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
        />
        <div className={`confirm ${selected !== null ? "show" : ""}`}>
          <button className="ghost-button" onClick={() => setSelected(null)} disabled={busy}>{t("play.cancel")}</button>
          <button className="primary" onClick={submit} disabled={busy}>{t("play.confirm")}</button>
        </div>
      </div>

      <div className="play-extra">
        {message && <p className="message">{message}</p>}

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
    text =
      w === null
        ? t("status.draw")
        : w === view.you
          ? t("status.youWin")
          : t("status.winner", { name: names[w], seat: seatLabel(w) });
    tone = w !== null && w === view.you ? `done won${yours}` : "done";
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
