import { useEffect, useRef, useState } from "react";
import type { GameStatus, GameView, Seat } from "@atg/core";
import { api } from "../api.ts";
import { boards } from "../boards/index.ts";
import { errorText, useI18n, type T } from "../i18n/index.tsx";
import { GameGlyph } from "../icons.tsx";
import { navigate } from "../router.ts";
import { savedGames, savedName } from "../storage.ts";

type SeatChoice = Seat | "random";

export function Home() {
  const { t } = useI18n();
  const [gameType, setGameType] = useState<string | null>(null);

  return (
    <div className="home">
      <MyGames />
      <section className="pick">
        <h2 className="section-title">{t("home.chooseGame")}</h2>
        <div className="game-tiles">
          {Object.entries(boards).map(([id, ui]) => (
            <button key={id} type="button" className="game-tile" onClick={() => setGameType(id)}>
              <GameGlyph id={id} />
              <span className="tile-name">{t(`game.${id}.name`)}</span>
              <span className="tile-meta">
                <span className={`len len-${ui.length}`}>{t(`tag.${ui.length}`)}</span>
                {ui.hidden && <span className="len hidden">{t("tag.hidden")}</span>}
              </span>
            </button>
          ))}
        </div>
      </section>
      <CreateSheet gameType={gameType} onClose={() => setGameType(null)} />
    </div>
  );
}

/** ゲームを選ぶと開く作成画面。スマホでは下から出るシート、PC では中央の小窓 */
function CreateSheet({ gameType, onClose }: { gameType: string | null; onClose(): void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(savedName.get());
  const [seat, setSeat] = useState<SeatChoice>("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (gameType && !d.open) {
      setError(null);
      setSeat("random");
      d.showModal();
    }
    if (!gameType && d.open) d.close();
  }, [gameType]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!gameType) return;
    setBusy(true);
    setError(null);
    try {
      savedName.set(name);
      const res = await api.createGame({ gameType, name, seat });
      savedGames.save(res.id, { token: res.token, seat: res.seat });
      onClose();
      navigate(`/g/${res.id}`);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const seatName = (s: Seat) => {
    const general = t(s === 0 ? "home.seat.first" : "home.seat.second");
    const mark = gameType ? t(`game.${gameType}.seat${s}`) : general;
    return mark === general ? general : t("home.seat.with", { seat: general, mark });
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      {gameType && (
        <form onSubmit={create} className="sheet-body">
          <div className="sheet-head">
            <GameGlyph id={gameType} className="large" />
            <div>
              <h1>{t(`game.${gameType}.name`)}</h1>
              <p className="muted">{t(`game.${gameType}.desc`)}</p>
            </div>
          </div>

          <label className="field">
            <span>{t("home.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder={t("home.namePlaceholder")}
            />
          </label>

          <fieldset className="field">
            <legend>{t("home.seat")}</legend>
            <div className="segmented">
              {(["random", 0, 1] as SeatChoice[]).map((v) => (
                <label key={String(v)} className={seat === v ? "on" : ""}>
                  <input type="radio" name="seat" checked={seat === v} onChange={() => setSeat(v)} />
                  {v === "random" ? t("home.seat.random") : seatName(v)}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="error">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              {t("home.close")}
            </button>
            <button className="primary" disabled={busy}>{t("home.create")}</button>
          </div>
          <p className="muted small">{t("home.create.lead")}</p>
        </form>
      )}
    </dialog>
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
    <section className="my-games">
      <h2 className="section-title">{t("home.myGames")}</h2>
      <ul className="game-list">
        {views.map((v) => {
          const opponent = v.players.find((p) => p.seat !== v.you);
          const b = badge(t, v, v.status);
          return (
            <li key={v.id}>
              <a href={`/g/${v.id}`} onClick={(e) => (e.preventDefault(), navigate(`/g/${v.id}`))}>
                <GameGlyph id={v.gameType} className="small" />
                <span className="row-text">
                  <strong>{t(`game.${v.gameType}.name`)}</strong>
                  <span className="muted">{t("home.vs", { name: opponent?.name ?? t("home.notJoined") })}</span>
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
