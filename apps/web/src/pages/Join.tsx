import { useEffect, useState } from "react";
import type { GameView } from "@atg/core";
import { api } from "../api.ts";
import { asLang, errorText, translator, useI18n } from "../i18n/index.tsx";
import { GameGlyph } from "../icons.tsx";
import { lineIdToken, lineSession, postToChat } from "../line.ts";
import { progressCard } from "../notify.ts";
import { navigate } from "../router.ts";
import { savedGames, savedName } from "../storage.ts";

export function Join({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const code = new URLSearchParams(location.search).get("code") ?? "";
  const [view, setView] = useState<GameView | null>(null);
  const [name, setName] = useState(() => savedName.get() || lineSession()?.displayName || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // すでに参加済みの端末なら対局画面へ
    if (savedGames.get(id)) {
      navigate(`/g/${id}`, true);
      return;
    }
    // LINE から開いていて、すでにこの対局の参加者（作った本人が別の端末で開いた など）なら対局画面へ
    const idToken = lineIdToken();
    (idToken ? api.claim(id, idToken) : Promise.reject())
      .then((claimed) => {
        savedGames.save(id, claimed);
        navigate(`/g/${id}`, true);
      })
      .catch(() => api.getGame(id).then(setView, (e) => setError(errorText(t, e))));
    // t は言語切り替えで変わるが、読み込み直す必要はない
  }, [id]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      savedName.set(name);
      const res = await api.joinGame(id, { inviteCode: code, name, lang, idToken: lineIdToken() });
      savedGames.save(id, { token: res.token, seat: res.seat });
      // 招待カードを開いたトークに「参加しました」と知らせる（作った人に通知が届く）
      const joined = await api.getGame(id, res.token).catch(() => null);
      if (joined) {
        // 作った人の言語で知らせる
        const host = joined.players.find((p) => p.seat !== res.seat);
        const tr = translator(asLang(host?.lang) ?? lang);
        await postToChat(id, progressCard(tr, joined, tr("line.joined", { name: name.trim() || tr("home.namePlaceholder") })));
      }
      navigate(`/g/${id}`, true);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  const host = view?.players[0]?.name ?? "";
  const game = view ? t(`game.${view.gameType}.name`) : "";

  return (
    <section className="panel join">
      {view && <GameGlyph id={view.gameType} className="large" />}
      <h1>{view ? t("join.from", { host, game }) : t("join.title")}</h1>
      {view && <p className="muted">{t(`game.${view.gameType}.rules`)}</p>}
      {view && !view.waitingForOpponent ? (
        <p className="error">{t("join.alreadyFull")}</p>
      ) : (
        <form onSubmit={join} className="form">
          <label className="field">
            <span>{t("home.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder={t("home.namePlaceholder")}
            />
          </label>
          <button className="primary" disabled={busy || !view}>{t("join.submit")}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
