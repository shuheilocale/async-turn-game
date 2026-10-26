import { useEffect, useRef, useState } from "react";
import type { GameStatus, GameView, Seat } from "@atg/core";
import { api } from "../api.ts";
import { boards, CATEGORIES, categoryOf, type Category } from "../boards/index.ts";
import { coopText, errorText, freeText, useI18n, type T } from "../i18n/index.tsx";
import { GameGlyph } from "../icons.tsx";
import { lineIdToken, lineSession } from "../line.ts";
import { navigate } from "../router.ts";
import { savedCategory, savedFinishedOpen, savedGames, savedName } from "../storage.ts";

type SeatChoice = Seat | "random";

export function Home() {
  const { t } = useI18n();
  // 「ルールを学ぶ」の「このゲームで対局を作る」から来たら（/?create=<ID>）、作成画面を開く
  const [gameType, setGameType] = useState<string | null>(() => {
    const id = new URLSearchParams(location.search).get("create");
    return id && boards[id] ? id : null;
  });
  useEffect(() => {
    if (location.search) history.replaceState(null, "", "/");
  }, []);

  return (
    <div className="home">
      <MyGames />
      <GamePicker onPick={setGameType} />
      <CreateSheet gameType={gameType} onClose={() => setGameType(null)} />
      <footer className="home-footer">
        <a href="/privacy" onClick={(e) => (e.preventDefault(), navigate("/privacy"))}>
          {t("privacy.link")}
        </a>
      </footer>
    </div>
  );
}

/**
 * ゲームの一覧。上の切り替えで種類を絞り込める。「すべて」のときは種類ごとの見出しで区切る。
 * 選んだ種類は端末に覚えておく
 */
function GamePicker({ onPick }: { onPick(gameType: string): void }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Category | "all">(() => {
    const saved = savedCategory.get();
    return (CATEGORIES as readonly string[]).includes(saved) ? (saved as Category) : "all";
  });
  const choose = (next: Category | "all") => {
    setFilter(next);
    savedCategory.set(next);
  };
  const entries = Object.entries(boards);
  const groups = CATEGORIES.map((cat) => ({ cat, ids: entries.filter(([, ui]) => categoryOf(ui) === cat).map(([id]) => id) }))
    .filter((g) => g.ids.length > 0 && (filter === "all" || filter === g.cat));

  const tile = (id: string) => (
    <button key={id} type="button" className="game-tile" onClick={() => onPick(id)}>
      <GameGlyph id={id} />
      <span className="tile-name">{t(`game.${id}.name`)}</span>
      <span className="tile-meta">
        <span className={`len len-${boards[id]!.length}`}>{t(`tag.${boards[id]!.length}`)}</span>
      </span>
    </button>
  );

  return (
    <section className="pick">
      <h2 className="section-title">{t("home.chooseGame")}</h2>
      <div className="category-chips" role="tablist" aria-label={t("home.chooseGame")}>
        {(["all", ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={filter === cat}
            className={`chip ${filter === cat ? "on" : ""}`}
            onClick={() => choose(cat)}
          >
            {t(`cat.${cat}`)}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.cat} className="category-group">
          {filter === "all" && <h3 className="category-title">{t(`cat.${g.cat}`)}</h3>}
          <div className="game-tiles">{g.ids.map(tile)}</div>
        </div>
      ))}
    </section>
  );
}

/** ゲームを選ぶと開く作成画面。スマホでは下から出るシート、PC では中央の小窓 */
function CreateSheet({ gameType, onClose }: { gameType: string | null; onClose(): void }) {
  const { t, lang } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(() => savedName.get() || lineSession()?.displayName || "");
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
      const res = await api.createGame({ gameType, name, seat, lang, idToken: lineIdToken() });
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
          <button
            type="button"
            className="learn-link"
            onClick={() => {
              onClose();
              navigate(`/learn/${gameType}`);
            }}
          >
            {t("learn.button")}
          </button>
        </form>
      )}
    </dialog>
  );
}

/**
 * この端末に保存した対局に加えて、LINE から使っているときは LINE アカウントで参加している対局も集める
 * （別の端末で作った・参加した対局も一覧に出る）
 */
async function loadSaved() {
  const idToken = lineIdToken();
  if (idToken) {
    try {
      const known = savedGames.all();
      const mine = await api.myGames(idToken);
      await Promise.all(
        mine
          .filter((g) => !known[g.id])
          .map(async (g) => {
            const claimed = await api.claim(g.id, idToken);
            savedGames.save(g.id, claimed);
          }),
      );
    } catch {
      // LINE の確認に失敗しても、この端末に保存した対局は出す
    }
  }
  return savedGames.all();
}

/** 自分の番で、急かしてよい対局。順番のないゲーム（いつでも指せる）は入れない */
const isMyTurn = (v: GameView) =>
  v.status.kind === "playing" && !v.status.free && v.status.turn === v.you && !v.waitingForOpponent;

function badge(t: T, v: GameView, status: GameStatus): { label: string; hot: boolean } {
  if (status.kind === "finished") {
    const label = status.coop ? coopText(t, v.gameType, status.coop, "badge") : t("badge.finished");
    return { label, hot: false };
  }
  if (v.waitingForOpponent) return { label: t("badge.waiting"), hot: false };
  // 順番のないゲームは急かさない（「いつでも」の落ち着いた札）
  if (status.free) return { label: freeText(t, v.gameType, "badge"), hot: false };
  return isMyTurn(v) ? { label: t("badge.yourTurn"), hot: true } : { label: t("badge.theirTurn"), hot: false };
}

/** 相手の番・参加待ちの対局を、はじめに何件まで出すか（あなたの番の対局は全部出す） */
const WAITING_LIMIT = 5;

function MyGames() {
  const { t } = useI18n();
  const [views, setViews] = useState<GameView[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [finishedOpen, setFinishedOpen] = useState(savedFinishedOpen.get);

  useEffect(() => {
    loadSaved()
      .then((saved) => Promise.all(Object.entries(saved).map(([id, g]) => api.getGame(id, g.token).catch(() => null))))
      .then((list) => {
        const ok = list.filter((v): v is GameView => v !== null);
        ok.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setViews(ok);
      });
  }, []);

  if (views === null || views.length === 0) return null;

  // あなたの番 → 相手の番・参加待ち・いつでも指せる → 終わった対局（折りたたみ）の順に分ける
  const mine = views.filter(isMyTurn);
  const waiting = views.filter((v) => !isMyTurn(v) && v.status.kind !== "finished");
  const finished = views.filter((v) => v.status.kind === "finished");
  const hidden = showAll ? 0 : Math.max(0, waiting.length - WAITING_LIMIT);

  const row = (v: GameView) => {
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
  };

  return (
    <section className="my-games">
      <h2 className="section-title">{t("home.myGames")}</h2>
      {mine.length + waiting.length > 0 && (
        <ul className="game-list">
          {mine.map(row)}
          {waiting.slice(0, waiting.length - hidden).map(row)}
          {hidden > 0 && (
            <li>
              <button type="button" className="more" onClick={() => setShowAll(true)}>
                {t("home.showMore", { n: hidden })}
              </button>
            </li>
          )}
        </ul>
      )}
      {finished.length > 0 && (
        <details
          className="panel fold finished-games"
          open={finishedOpen}
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            setFinishedOpen(open);
            savedFinishedOpen.set(open);
          }}
        >
          <summary>{t("home.finished", { n: finished.length })}</summary>
          <ul className="game-list flat">{finished.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
