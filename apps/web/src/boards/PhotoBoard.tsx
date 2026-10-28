import { useEffect, useRef, useState, type ReactNode } from "react";
import { other, Photo, type Seat } from "@atg/core";
import { ApiRequestError } from "../api.ts";
import { errorText, useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { PhotoReadError, samplePhoto, shrinkPhoto, type Shrunk } from "./photo/image.ts";
import { localPhotoId, remember, uploadPhoto, usePhotoUrl, type PhotoGame } from "./photo/media.ts";
import "./PhotoBoard.css";

/**
 * きょうのおだい写真の盤。上にお題、まんなかに 2 人の写真の枠（自分・相手）、下にアルバム（そろったページ）。
 * 写真をえらぶ → 端末の中で縮める（image.ts）→ プレビューとひとこと → 「出す」で送って（media.ts）、写真の ID を手に載せて指す。
 * お試し（game がない）では写真を送らず、この端末の中だけで見せる。見本の絵でも試せる
 */

type Phase = "idle" | "reading" | "sending";

interface Draft {
  shrunk: Shrunk;
  preview: string;
  /** 送れた写真の ID。手を指せなかったときに、もう一度送らずに使う */
  sentId?: string;
}

/** 始まりと終わりの日。同じ日なら 1 つだけ */
const dateRange = (from: string, to: string) => (from === to ? from : `${from} – ${to}`);

export const photoMovedText = (t: T, move: unknown, name: string) =>
  t(`game.photo.did.${(move as Photo.PhotoMove).kind}`, { name });

export function PhotoBoard({ state, status, you, names, interactive, onSubmit, game }: BoardProps) {
  const { t, lang } = useI18n();
  const s = state as Photo.PhotoView;
  const finished = status.kind === "finished";
  const me: Seat = you ?? 0;
  const partner = other(me);
  const last = s.pages.at(-1);
  /** 枠に出すもの：今のお題の写真。そろって待っているあいだ・終わったあとは、そろったページ */
  const showing = s.topic === null ? last : undefined;
  const topic = s.topic ?? last?.topic ?? null;
  const entryOf = (seat: Seat): Photo.Entry | "hidden" | null => (showing ? showing.entries[seat] : s.entries[seat]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState<{ id: string; seat: Seat; note: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // お題が進んだら、えらびかけの写真は片づける
  useEffect(() => {
    if (s.topic === null) setDraft(null);
    setError(null);
  }, [s.round, s.topic]);

  // お試しで、もう 1 人に切り替えたら、えらびかけの写真は片づける
  useEffect(() => {
    setDraft(null);
    setNote("");
  }, [you]);

  const mine = s.entries[me];
  const canPick = interactive && you !== null && s.topic !== null && phase === "idle";
  const canRedraw =
    interactive && s.topic !== null && !s.entries[0] && !s.entries[1] && s.redrawsLeft > 0 && !draft && phase === "idle";

  async function pick(file: File | undefined, sample = false) {
    if (!file && !sample) return;
    setPhase("reading");
    setError(null);
    try {
      const shrunk = sample ? await samplePhoto(Math.random()) : await shrinkPhoto(file!);
      if (draft) URL.revokeObjectURL(draft.preview);
      setDraft({ shrunk, preview: URL.createObjectURL(shrunk.blob) });
      if (mine && typeof mine === "object" && !draft) setNote(mine.note);
    } catch (e) {
      setError(t(e instanceof PhotoReadError && e.code === "too_large" ? "error.photo_too_large" : "game.photo.err.read"));
    } finally {
      setPhase("idle");
      if (input.current) input.current.value = "";
    }
  }

  async function send() {
    if (!draft) return;
    setPhase("sending");
    setError(null);
    try {
      let id = draft.sentId;
      if (!id) {
        if (game) id = await uploadPhoto(game, draft.shrunk.blob);
        else remember((id = localPhotoId()), draft.shrunk.blob);
        const sentId = id;
        setDraft((d) => d && { ...d, sentId });
      }
      if (await onSubmit({ kind: "photo", photo: id, note })) {
        setDraft(null);
        setNote("");
      } else setError(t("game.photo.err.move"));
    } catch (e) {
      setError(e instanceof ApiRequestError ? errorText(t, e) : t("game.photo.err.network"));
    } finally {
      setPhase("idle");
    }
  }

  const choose = () => input.current?.click();
  const dateOf = (at: number) => new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(at);
  const nameOf = (seat: Seat) => (seat === you ? t("game.photo.you") : t("game.photo.who", { name: names[seat] }));

  return (
    <div className="photo">
      <input
        ref={input}
        className="photo-file"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {finished ? (
        <header className="photo-topic done">
          <span className="photo-round">
            {t("game.photo.albumDone", { n: s.pages.length })}
            {s.pages.length > 0 && ` · ${dateRange(dateOf(s.pages[0]!.at), dateOf(s.pages.at(-1)!.at))}`}
          </span>
          <h2 className="photo-topic-text">{t("game.photo.albumTitle")}</h2>
        </header>
      ) : (
        topic && (
          <header className="photo-topic">
            <span className="photo-round num">{t("game.photo.round", { n: s.round + 1, total: Photo.ROUNDS })}</span>
            <h2 className="photo-topic-text">{t(`game.photo.topic.${topic}`)}</h2>
            {canRedraw && (
              <button type="button" className="ghost-button photo-redraw" onClick={() => onSubmit({ kind: "redraw" })}>
                <Icon name="redraw" />
                {t("game.photo.redraw", { n: s.redrawsLeft })}
              </button>
            )}
          </header>
        )
      )}

      {!finished && topic && (
        <div className="photo-pair">
          {([you === null ? 0 : me, you === null ? 1 : partner] as Seat[]).map((seat) => (
            <Frame
              key={seat}
              seat={seat}
              label={nameOf(seat)}
              entry={entryOf(seat)}
              open={!!showing}
              game={game}
              draft={seat === you ? draft : null}
              phase={seat === you ? phase : "idle"}
              canPick={seat === you && canPick && !mine && !draft}
              onPick={choose}
              onSample={!game && seat === you && canPick && !mine && !draft ? () => pick(undefined, true) : undefined}
              onZoom={(id, n) => setZoom({ id, seat, note: n })}
              t={t}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="photo-error" role="alert">
          {error}
        </p>
      )}

      {draft && s.topic !== null && (
        <section className="photo-compose">
          <label className="photo-note">
            <span>{t("game.photo.note")}</span>
            <input
              type="text"
              value={note}
              maxLength={Photo.NOTE_MAX}
              placeholder={t("game.photo.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              disabled={phase !== "idle"}
            />
            <span className="photo-count num">
              {[...note].length} / {Photo.NOTE_MAX}
            </span>
          </label>
          <p className="photo-hint">{t(game ? "game.photo.privacy" : "game.photo.learnLocal")}</p>
          <div className="photo-actions">
            <button
              type="button"
              disabled={phase !== "idle"}
              onClick={() => {
                URL.revokeObjectURL(draft.preview);
                setDraft(null);
                setError(null);
              }}
            >
              {t("game.photo.cancel")}
            </button>
            <button type="button" disabled={phase !== "idle"} onClick={choose}>
              {t("game.photo.repick")}
            </button>
            <button type="button" className="primary" disabled={phase !== "idle" || !interactive} onClick={send}>
              {phase === "sending" ? t("game.photo.sending") : t("game.photo.send")}
            </button>
          </div>
        </section>
      )}

      {!draft && mine && typeof mine === "object" && s.topic !== null && you !== null && (
        <section className="photo-wait">
          <p>{t("game.photo.secret", { name: names[partner] })}</p>
          {canPick && (
            <button type="button" className="ghost-button" onClick={choose}>
              {t("game.photo.retake")}
            </button>
          )}
        </section>
      )}

      {s.waiting && (
        <section className="photo-met">
          <p className="photo-met-title">{t("game.photo.both")}</p>
          {interactive ? (
            <>
              <button type="button" className="primary" onClick={() => onSubmit({ kind: "next" })}>
                {t("game.photo.next")}
                <Icon name="next" />
              </button>
              <p className="photo-hint">{t("game.photo.nextHint")}</p>
            </>
          ) : null}
        </section>
      )}

      <section className="photo-album" aria-label={t("game.photo.album")}>
        <div className="photo-album-head">
          <h3>{t("game.photo.album")}</h3>
          <span className="num muted">{t("game.photo.albumCount", { n: s.pages.length, total: Photo.ROUNDS })}</span>
        </div>
        {s.pages.length === 0 ? (
          <p className="muted photo-album-empty">{t("game.photo.albumEmpty")}</p>
        ) : (
          <ol className="photo-pages">
            {s.pages.map((page, i) => (
              <li key={i} className="photo-page">
                <div className="photo-page-head">
                  <span className="photo-page-no num">{i + 1}</span>
                  <span className="photo-page-topic">{t(`game.photo.topic.${page.topic}`)}</span>
                  <time className="muted small">{dateOf(page.at)}</time>
                </div>
                <div className="photo-page-pair">
                  {([0, 1] as Seat[]).map((seat) => (
                    <figure key={seat} className={`photo-thumb seat${seat}`}>
                      <button
                        type="button"
                        className="photo-thumb-button"
                        aria-label={t("game.photo.photoOf", { name: nameOf(seat) })}
                        onClick={() => setZoom({ id: page.entries[seat].photo, seat, note: page.entries[seat].note })}
                      >
                        <PhotoImg id={page.entries[seat].photo} open game={game} alt="" t={t} />
                      </button>
                      <figcaption>
                        <span className="photo-who">{nameOf(seat)}</span>
                        {page.entries[seat].note && <span className="photo-said">{page.entries[seat].note}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Zoom zoom={zoom} game={game} label={zoom ? nameOf(zoom.seat) : ""} onClose={() => setZoom(null)} t={t} />
    </div>
  );
}

function Frame({
  seat,
  label,
  entry,
  open,
  game,
  draft,
  phase,
  canPick,
  onPick,
  onSample,
  onZoom,
  t,
}: {
  seat: Seat;
  label: string;
  entry: Photo.Entry | "hidden" | null;
  open: boolean;
  game: PhotoGame | undefined;
  draft: Draft | null;
  phase: Phase;
  canPick: boolean;
  onPick(): void;
  onSample?: () => void;
  onZoom(id: string, note: string): void;
  t: T;
}) {
  const real = entry && entry !== "hidden" ? entry : null;
  let body: ReactNode;
  if (draft) {
    body = (
      <>
        <img src={draft.preview} alt={t("game.photo.preview")} />
        <span className="photo-badge">{t("game.photo.preview")}</span>
      </>
    );
  } else if (real) {
    body = (
      <button type="button" className="photo-frame-button" onClick={() => onZoom(real.photo, real.note)} aria-label={t("game.photo.photoOf", { name: label })}>
        <PhotoImg id={real.photo} open={open} game={game} alt="" t={t} />
        {!open && <span className="photo-badge">{t("game.photo.sent")}</span>}
      </button>
    );
  } else if (entry === "hidden") {
    body = (
      <div className="photo-empty">
        <Icon name="lock" />
        <strong>{t("game.photo.sent")}</strong>
        <span>{t("game.photo.hiddenHint")}</span>
      </div>
    );
  } else if (canPick) {
    body = (
      <div className="photo-empty">
        <button type="button" className="photo-pick" onClick={onPick}>
          <Icon name="camera" />
          <strong>{t("game.photo.pick")}</strong>
          <span>{t("game.photo.pickHint")}</span>
        </button>
        {onSample && (
          <button type="button" className="ghost-button photo-sample" onClick={onSample}>
            {t("game.photo.sample")}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <div className="photo-empty">
        <Icon name="image" />
        <span>{t("game.photo.notYet")}</span>
      </div>
    );
  }
  return (
    <figure className={`photo-slot seat${seat} ${seat === 0 ? "first" : ""}`}>
      <div className={`photo-frame ${real || draft ? "filled" : "empty"} ${entry === "hidden" ? "hidden-entry" : ""}`}>
        {body}
        {phase !== "idle" && (
          <div className="photo-busy" role="status">
            <span className="photo-spinner" aria-hidden />
            {t(phase === "reading" ? "game.photo.reading" : "game.photo.sending")}
          </div>
        )}
      </div>
      <figcaption>
        <span className="photo-who">{label}</span>
        {real?.note && <span className="photo-said">{real.note}</span>}
      </figcaption>
    </figure>
  );
}

/** 写真 1 枚。読み込むまではうすい色の四角、読めなければ案内 */
function PhotoImg({ id, open, game, alt, t }: { id: string; open: boolean; game: PhotoGame | undefined; alt: string; t: T }) {
  const url = usePhotoUrl(id, open, game);
  const [broken, setBroken] = useState(false);
  if (url === "failed" || broken) return <span className="photo-missing">{t("game.photo.missing")}</span>;
  if (!url) return <span className="photo-loading" aria-hidden />;
  return <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

/** 写真を大きく見る */
function Zoom({
  zoom,
  game,
  label,
  onClose,
  t,
}: {
  zoom: { id: string; seat: Seat; note: string } | null;
  game: PhotoGame | undefined;
  label: string;
  onClose(): void;
  t: T;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (zoom && d && !d.open) d.showModal();
    if (!zoom && d?.open) d.close();
  }, [zoom]);
  return (
    <dialog ref={dialog} className="photo-zoom" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      {zoom && (
        <figure className={`seat${zoom.seat}`}>
          <PhotoImg id={zoom.id} open game={game} alt={t("game.photo.photoOf", { name: label })} t={t} />
          <figcaption>
            <span className="photo-who">{label}</span>
            {zoom.note && <span className="photo-said">{zoom.note}</span>}
          </figcaption>
        </figure>
      )}
      <button type="button" className="primary" onClick={onClose}>
        {t("home.close")}
      </button>
    </dialog>
  );
}

function Icon({ name }: { name: "camera" | "lock" | "image" | "redraw" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" className={`photo-icon ${name}`} aria-hidden>
      {name === "camera" && (
        <>
          <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
          <circle cx="12" cy="12.5" r="3.6" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.4" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </>
      )}
      {name === "image" && (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M4.5 16.5l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" />
          <circle cx="15.5" cy="9.5" r="1.4" />
        </>
      )}
      {name === "redraw" && (
        <>
          <path d="M19 12a7 7 0 1 1-2.05-4.95" />
          <path d="M19.5 4.5v4h-4" />
        </>
      )}
      {name === "next" && <path d="M5 12h13M13 7l5 5-5 5" />}
    </svg>
  );
}
