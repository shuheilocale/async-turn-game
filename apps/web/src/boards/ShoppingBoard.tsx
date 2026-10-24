import type { CSSProperties } from "react";
import { other, Shopping, type Seat } from "@atg/core";
import { useI18n, type T } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { ItemArt } from "./shopping/art.tsx";
import "./ShoppingBoard.css";

type ItemId = Shopping.ItemId;
const { ITEMS, SERIES, STEP, LOTS, SET_BONUS, BUDGET } = Shopping;

/** ボタンで増やす・減らす金額（万円） */
const BIG_STEP = 100;

/**
 * 金額（万円）を言語に合わせた書き方にする。日本語は「350万円」、英語は「¥3.5M」「¥500K」、
 * タイ語は「3.5 ล้านเยน」「5 แสนเยน」
 */
export function formatMoney(t: T, man: number): string {
  if (man === 0) return t("game.shopping.money.zero");
  const vars = { man: man.toLocaleString("en-US"), m: man / 100, k: man * 10, lakh: man / 10 };
  return t(man < 100 ? "game.shopping.money.small" : "game.shopping.money", vars);
}

const seriesOf = (id: ItemId) => ITEMS[id].series;

/** 品物の小さな札。クリーム色の地に絵と点数。下のふちの色がシリーズ */
function ItemTile({ id, size = "sm", named = false }: { id: ItemId; size?: "sm" | "xs"; named?: boolean }) {
  const { t } = useI18n();
  const name = t(`game.shopping.item.${id}`);
  return (
    <span className={`shop-tile ${size} series-${seriesOf(id)}`} role="img" aria-label={name} title={name}>
      <span className="shop-tile-face">
        <ItemArt id={id} />
        <span className="shop-tile-pts">{ITEMS[id].points}</span>
      </span>
      {named && <span className="shop-tile-name">{name}</span>}
    </span>
  );
}

/** 封をした封筒。入札したけれど金額は秘密、の印 */
function Envelope() {
  return (
    <svg viewBox="0 0 24 18" className="shop-envelope" aria-hidden>
      <rect x="1" y="1" width="22" height="16" rx="2.5" />
      <path d="M1.8 2.2 12 10l10.2-7.8" />
      <circle cx="12" cy="10" r="3.2" className="seal" />
    </svg>
  );
}

/**
 * ショーウィンドウに今の品物を飾り、下で金額を決める。決めた金額は「これで決定」で確定する。
 * 直前の競りの結果は、2 人の入札額を棒で並べて見せる
 */
export function ShoppingBoard({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Shopping.ShoppingView;
  const sel = selected as Shopping.ShoppingMove | null;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const money = (man: number) => formatMoney(t, man);
  /** 文の中で人を指す呼び名（「あなた」「〇〇さん」） */
  const who = (seat: Seat) => (seat === you ? t("play.you") : t("game.shopping.who", { name: names[seat] }));
  /** 表の見出しなどの短い呼び名 */
  const label = (seat: Seat) => (seat === you ? t("play.you") : names[seat]);
  const scores = [Shopping.scoreOf(s.owned[0], s.budgets[0]), Shopping.scoreOf(s.owned[1], s.budgets[1])] as const;
  const lot: ItemId[] = s.current ? [...s.carried, s.current] : [];
  const last = s.history.at(-1);

  // 入札額は「これで決定」を押すまで selected に持つ。まだ触っていなければ 0 円を表示する
  const budget = s.budgets[me];
  const amount = sel?.bid ?? 0;
  const setAmount = (man: number) =>
    onSelect({ bid: Math.min(budget, Math.max(0, Math.round(man / STEP) * STEP)) });
  const half = Math.floor(budget / 2 / STEP) * STEP;

  /** 相手（観戦者なら両方）の入札のようす */
  const bidNote = (seat: Seat) => {
    const bid = s.bids[seat];
    if (typeof bid === "number") return t("game.shopping.youBid", { money: money(bid) });
    if (!bid) return t("game.shopping.theyNotYet", { name: names[seat] });
    return s.budgets[seat] === 0
      ? t("game.shopping.theyBroke", { name: names[seat] })
      : t("game.shopping.theyBid", { name: names[seat] });
  };

  return (
    <div className="shopping">
      <div className="shop-wallets">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className={`shop-wallet seat${seat} ${playing && s.turn === seat ? "turn" : ""}`}>
            <span className="shop-wallet-name">{names[seat]}</span>
            <span className="shop-wallet-label">{t("game.shopping.budget")}</span>
            <strong className="shop-wallet-money">{money(s.budgets[seat])}</strong>
            <span className="shop-wallet-bar" aria-hidden>
              <span style={{ width: `${(100 * s.budgets[seat]) / BUDGET}%` }} />
            </span>
            <span className="shop-wallet-score">
              {t("game.shopping.score")} <b>{scores[seat].total}</b>
            </span>
          </div>
        ))}
      </div>

      {last && (
        <div className="shop-result" key={s.history.length}>
          <div className="shop-result-head">
            <span className="shop-result-items">
              {last.items.map((id) => (
                <ItemTile key={id} id={id} size="xs" />
              ))}
            </span>
            <span className="shop-result-text">
              <span className="muted small">{t("game.shopping.result", { n: s.history.length })}</span>
              <strong>
                {last.winner !== null
                  ? t("game.shopping.wonBy", { who: who(last.winner), money: money(last.bids[last.winner]) })
                  : s.current === null
                    ? t("game.shopping.unsold")
                    : t("game.shopping.tie")}
              </strong>
            </span>
          </div>
          <div className="shop-result-bars">
            {([me, opp] as Seat[]).map((seat, i) => {
              const top = Math.max(...last.bids, 1);
              const style = { "--w": `${(100 * last.bids[seat]) / top}%`, "--delay": `${0.15 + i * 0.2}s` } as CSSProperties;
              return (
                <div key={seat} className={`shop-result-row seat${seat} ${last.winner === seat ? "won" : ""}`} style={style}>
                  <span className="shop-result-name">{label(seat)}</span>
                  <span className="shop-result-bar">
                    <span />
                  </span>
                  <span className="shop-result-amt">{money(last.bids[seat])}</span>
                  {last.winner === seat && <span className="shop-stamp">{t("game.shopping.sold")}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {playing && s.current && (
        <div className="shop-window">
          <div className="shop-awning" aria-hidden />
          <div className="shop-window-head">
            <span>{t("game.shopping.lot", { n: s.history.length + 1, total: LOTS })}</span>
            {s.upcoming.length > 0 ? (
              <span className="shop-next">
                {t("game.shopping.next")}
                <span className="shop-next-box" role="img" aria-label={t("game.shopping.nextHidden")}>
                  ?
                </span>
              </span>
            ) : (
              <span className="shop-next last">{t("game.shopping.lastItem")}</span>
            )}
          </div>

          {s.carried.length > 0 && (
            <div className="shop-bundle">
              <strong>{t("game.shopping.bundle")}</strong>
              <span>{t("game.shopping.bundleNote", { n: lot.length })}</span>
            </div>
          )}

          <div className={`shop-stage ${lot.length > 1 ? "multi" : ""}`}>
            <span className="shop-spot" aria-hidden />
            {lot.map((id) => (
              <span key={id} className={`shop-stage-item ${id === s.current ? "main" : "side"}`}>
                <ItemArt id={id} />
              </span>
            ))}
            <span className="shop-pedestal" aria-hidden />
          </div>

          <div className="shop-tags">
            {lot.map((id) => (
              <div key={id} className={`shop-tag series-${seriesOf(id)}`}>
                <span className="shop-series">{t(`game.shopping.series.${seriesOf(id)}`)}</span>
                <span className="shop-tag-name">{t(`game.shopping.item.${id}`)}</span>
                <span className="shop-tag-pts">{t("game.shopping.points", { n: ITEMS[id].points })}</span>
              </div>
            ))}
          </div>

          <div className="shop-bidstate">
            {(you === null ? ([0, 1] as Seat[]) : [opp]).map((seat) => (
              <span key={seat} className={`shop-bidnote seat${seat} ${s.bids[seat] ? "done" : ""}`}>
                {s.bids[seat] ? <Envelope /> : <span className="shop-dots" aria-hidden />}
                {bidNote(seat)}
              </span>
            ))}
            {you !== null && typeof s.bids[me] === "number" && (
              <span className={`shop-bidnote seat${me} done mine`}>
                <Envelope />
                {bidNote(me)}
              </span>
            )}
          </div>
        </div>
      )}

      {myTurn && (
        <div className={`shop-bid seat${me}`}>
          <div className="shop-bid-head">
            <span>{t("game.shopping.yourBid")}</span>
            <span className="muted">
              {t("game.shopping.ofBudget", { p: budget > 0 ? Math.round((100 * amount) / budget) : 0 })}
            </span>
          </div>
          <output className={`shop-bid-amount ${sel ? "" : "unset"}`} aria-live="polite">
            {money(amount)}
          </output>
          <div className="shop-steps">
            {[-BIG_STEP, -STEP, STEP, BIG_STEP].map((d) => {
              const step = t(Math.abs(d) === BIG_STEP ? "game.shopping.step.big" : "game.shopping.step.small");
              return (
                <button
                  key={d}
                  type="button"
                  className={d < 0 ? "minus" : "plus"}
                  disabled={!interactive || (d < 0 ? amount === 0 : amount >= budget)}
                  aria-label={t(d < 0 ? "game.shopping.minus" : "game.shopping.plus", { step })}
                  onClick={() => setAmount(amount + d)}
                >
                  {d < 0 ? "−" : "+"}
                  {step}
                </button>
              );
            })}
          </div>
          <input
            type="range"
            className="shop-slider"
            min={0}
            max={budget}
            step={STEP}
            value={amount}
            disabled={!interactive}
            aria-label={t("game.shopping.slider")}
            style={{ "--fill": `${budget > 0 ? (100 * amount) / budget : 0}%` } as CSSProperties}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="shop-quick">
            {[
              { man: 0, text: t("game.shopping.pass") },
              { man: half, text: t("game.shopping.half") },
              { man: budget, text: t("game.shopping.all") },
            ].map(({ man, text }, i) => (
              <button
                key={i}
                type="button"
                className={sel?.bid === man ? "selected" : ""}
                aria-pressed={sel?.bid === man}
                disabled={!interactive}
                onClick={() => setAmount(man)}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="shop-bid-hint muted">{t("game.shopping.choose")}</p>
        </div>
      )}

      {playing && !myTurn && (
        <p className="board-note">
          {you !== null && s.budgets[me] === 0
            ? t("game.shopping.youBroke")
            : names[s.turn] && t(you !== null && typeof s.bids[me] === "number" ? "game.shopping.waiting" : "game.shopping.thinking", { name: names[s.turn] })}
        </p>
      )}

      {!playing && (
        <div className="shop-final">
          <h3>{t("game.shopping.final")}</h3>
          <table>
            <thead>
              <tr>
                <th />
                {([me, opp] as Seat[]).map((seat) => (
                  <th key={seat} className={`seat${seat}`}>
                    {label(seat)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{t("game.shopping.final.items")}</th>
                <td>{scores[me].items}</td>
                <td>{scores[opp].items}</td>
              </tr>
              <tr>
                <th>{t("game.shopping.final.bonus")}</th>
                <td>+{scores[me].bonus}</td>
                <td>+{scores[opp].bonus}</td>
              </tr>
              <tr>
                <th>
                  {t("game.shopping.final.money")}
                  <small>{t("game.shopping.moneyRule")}</small>
                </th>
                {([me, opp] as Seat[]).map((seat) => (
                  <td key={seat}>
                    +{scores[seat].money}
                    <small>{money(s.budgets[seat])}</small>
                  </td>
                ))}
              </tr>
              <tr className="total">
                <th>{t("game.shopping.final.total")}</th>
                {([me, opp] as Seat[]).map((seat) => (
                  <td key={seat} className={status.kind === "finished" && status.winner === seat ? `win seat${seat}` : ""}>
                    {scores[seat].total}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {s.carried.length > 0 && (
            <div className="shop-leftover">
              <span className="muted small">{t("game.shopping.leftover")}</span>
              {s.carried.map((id) => (
                <ItemTile key={id} id={id} size="xs" />
              ))}
            </div>
          )}
        </div>
      )}

      <section className="shop-shelves">
        {([me, opp] as Seat[]).map((seat) => (
          <Shelf
            key={seat}
            seat={seat}
            title={seat === you ? t("game.shopping.shelf.mine") : t("game.shopping.shelf.theirs", { name: names[seat] })}
            owned={s.owned[seat]}
            points={scores[seat].items + scores[seat].bonus}
          />
        ))}
      </section>

      {s.upcoming.length > 0 && (
        <section>
          <h3 className="muted">{t("game.shopping.upcoming")}</h3>
          <div className="shop-upcoming">
            {s.upcoming.map((id) => (
              <ItemTile key={id} id={id} named />
            ))}
          </div>
        </section>
      )}

      {s.history.length > 0 && (
        <section>
          <h3 className="muted">{t("game.shopping.history")}</h3>
          <div className="shop-history-head muted" aria-hidden>
            <span />
            <span />
            <span>{label(me)}</span>
            <span>{label(opp)}</span>
          </div>
          <ol className="history shop-history">
            {s.history.map((r, i) => (
              <li key={i}>
                <span className="muted">{i + 1}</span>
                <span className="shop-history-items">
                  {r.items.map((id) => (
                    <ItemTile key={id} id={id} size="xs" />
                  ))}
                </span>
                {([me, opp] as Seat[]).map((seat) => (
                  <span key={seat} className={`shop-history-bid seat${seat} ${r.winner === seat ? "won" : ""}`}>
                    {money(r.bids[seat])}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** 手に入れた品物の棚。シリーズごとにまとめ、そろったシリーズにはボーナスの札を付ける */
function Shelf({ seat, title, owned, points }: { seat: Seat; title: string; owned: ItemId[]; points: number }) {
  const { t } = useI18n();
  const groups = SERIES.map((series) => ({ series, items: owned.filter((id) => seriesOf(id) === series) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <div className={`shop-shelf seat${seat}`}>
      <div className="shop-shelf-head">
        <span className="shop-shelf-title">{title}</span>
        <span className="shop-shelf-pts">{t("game.shopping.points", { n: points })}</span>
      </div>
      <div className="shop-shelf-board">
        {groups.length === 0 ? (
          <span className="muted small">{t("game.shopping.shelf.empty")}</span>
        ) : (
          groups.map((g) => {
            const complete = g.items.length >= Shopping.PER_SERIES;
            return (
              <div key={g.series} className={`shop-group series-${g.series} ${complete ? "complete" : ""}`}>
                {g.items.map((id) => (
                  <ItemTile key={id} id={id} />
                ))}
                {complete && <span className="shop-set-badge">{t("game.shopping.set", { n: SET_BONUS })}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
