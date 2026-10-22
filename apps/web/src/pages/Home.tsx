import { useEffect, useState } from "react";
import type { GameStatus, GameView, Seat } from "@atg/core";
import { api } from "../api.ts";
import { boards } from "../boards/index.ts";
import { errorText, useI18n, type T } from "../i18n/index.tsx";
import { navigate } from "../router.ts";
import { savedGames, savedName } from "../storage.ts";

type SeatChoice = Seat | "random";

export function Home() {
  const { t } = useI18n();
  const [name, setName] = useState(savedName.get());
  const [gameType, setGameType] = useState(Object.keys(boards)[0]!);
  const [seat, setSeat] = useState<SeatChoice>("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      savedName.set(name);
      const res = await api.createGame({ gameType, name, seat });
      savedGames.save(res.id, { token: res.token, seat: res.seat });
      navigate(`/g/${res.id}`);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="tagline">{t("app.tagline")}</p>
      <MyGames />

      <section>
        <h2>{t("home.chooseGame")}</h2>
        <div className="game-cards">
          {Object.entries(boards).map(([id, ui]) => (
            <button
              key={id}
              type="button"
              className={`game-card ${id === gameType ? "active" : ""}`}
              aria-pressed={id === gameType}
              onClick={() => setGameType(id)}
            >
              <span className="icon" aria-hidden>{ui.icon}</span>
              <strong>{t(`game.${id}.name`)}</strong>
              <span className="desc">{t(`game.${id}.desc`)}</span>
              <span className="tags">
                <span className="tag">{t(`tag.${ui.length}`)}</span>
                {ui.hidden && <span className="tag hidden">{t("tag.hidden")}</span>}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h1>{t("home.create.title", { game: t(`game.${gameType}.name`) })}</h1>
        <p className="muted">{t("home.create.lead")}</p>
        <form onSubmit={create} className="form">
          <label>
            {t("home.name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder={t("home.namePlaceholder")}
            />
          </label>
          <label>
            {t("home.seat")}
            <select
              value={String(seat)}
              onChange={(e) => setSeat(e.target.value === "random" ? "random" : (Number(e.target.value) as Seat))}
            >
              <option value="random">{t("home.seat.random")}</option>
              <option value="0">{t("home.seat.first")}</option>
              <option value="1">{t("home.seat.second")}</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>{t("home.create")}</button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

const isMyTurn = (v: GameView) => v.status.kind === "playing" && v.status.turn === v.you && !v.waitingForOpponent;

function badge(t: T, v: GameView, status: GameStatus): { label: string; hot: boolean } {
  if (status.kind === "finished") return { label: t("badge.finished"), hot: false };
  if (v.waitingForOpponent) return { label: t("badge.waiting"), hot: false };
  return isMyTurn(v) ? { label: t("badge.yourTurn"), hot: true } : { label: t("badge.theirTurn"), hot: false };
}

function MyGames() {
  const { t } = useI18n();
  const [views, setViews] = useState<GameView[] | null>(null);

  useEffect(() => {
    const saved = savedGames.all();
    Promise.all(Object.entries(saved).map(([id, g]) => api.getGame(id, g.token).catch(() => null))).then((list) => {
      const ok = list.filter((v): v is GameView => v !== null);
      ok.sort((a, b) => Number(isMyTurn(b)) - Number(isMyTurn(a)) || b.updatedAt.localeCompare(a.updatedAt));
      setViews(ok);
    });
  }, []);

  if (views === null || views.length === 0) return null;

  return (
    <section className="card">
      <h2>{t("home.myGames")}</h2>
      <ul className="game-list">
        {views.map((v) => {
          const opponent = v.players.find((p) => p.seat !== v.you);
          const b = badge(t, v, v.status);
          return (
            <li key={v.id}>
              <a href={`/g/${v.id}`} onClick={(e) => (e.preventDefault(), navigate(`/g/${v.id}`))}>
                <span>
                  {boards[v.gameType]?.icon} {t(`game.${v.gameType}.name`)}
                  <span className="muted"> {t("home.vs", { name: opponent?.name ?? t("home.notJoined") })}</span>
                </span>
                <span className={`badge ${b.hot ? "hot" : ""}`}>{b.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
