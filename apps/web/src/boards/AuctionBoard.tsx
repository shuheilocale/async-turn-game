import { Auction, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";

export function AuctionBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Auction.AuctionView;
  const sel = selected as Auction.AuctionMove | null;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp: Seat = me === 0 ? 1 : 0;
  const carried = s.carried.reduce((a, b) => a + b, 0);
  const myBid = s.bids[me];
  const oppBid = s.bids[opp];

  return (
    <div className="stack auction">
      <div className="scores">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className="score">
            <span className="muted small">{names[seat]}</span>
            <strong>{s.scores[seat]}</strong>
          </div>
        ))}
      </div>

      {s.current !== null && (
        <div className="prize-area">
          <span className="muted small">
            {t("auction.round", { n: s.history.length + 1 })} / {Auction.CARDS.length}
          </span>
          <div className="card-face prize">{s.current}</div>
          <span className="muted small">{t("auction.prize")}</span>
          {carried > 0 && <span className="notice">{t("auction.carried", { n: carried })}</span>}
          <div className="bid-status">
            {you !== null && typeof myBid === "number" && <span>{t("auction.youBid", { n: myBid })}</span>}
            <span className="muted">{t(oppBid ? "auction.theyBid" : "auction.theyNotBid")}</span>
          </div>
        </div>
      )}

      {you !== null && (
        <section>
          <h3>{t("auction.yourHand")}</h3>
          <div className="hand">
            {s.hands[me].map((c) => (
              <button
                key={c}
                type="button"
                className={`card-face ${sel?.card === c ? "selected" : ""}`}
                disabled={!interactive}
                onClick={() => onSelect({ card: c })}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="muted">{t("auction.theirHand")}</h3>
        <div className="hand small">
          {s.hands[you === null ? 1 : opp].map((c) => (
            <span key={c} className="card-face mini">{c}</span>
          ))}
        </div>
      </section>

      {s.remaining.length > 0 && (
        <section>
          <h3 className="muted">{t("auction.remaining")}</h3>
          <div className="hand small">
            {s.remaining.map((c) => (
              <span key={c} className="card-face mini prize">{c}</span>
            ))}
          </div>
        </section>
      )}

      {s.history.length > 0 && (
        <section>
          <h3 className="muted">{t("auction.history")}</h3>
          <ol className="history">
            {s.history.map((r, i) => (
              <li key={i}>
                <span className="muted">{i + 1}.</span>
                <span className="card-face mini prize">{r.prizes.reduce((a, b) => a + b, 0)}</span>
                <span>
                  {names[me]} {r.bids[me]} – {r.bids[opp]} {names[opp]}
                </span>
                <span className={r.winner === null ? "muted" : r.winner === me ? "good" : ""}>
                  {r.winner === null ? t("auction.tie") : t("auction.wonBy", { name: names[r.winner] })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
