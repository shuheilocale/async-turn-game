import { Bluff, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./BluffBoard.css";

type Action = Bluff.BluffAction;

/** チップの増減を「+2」「−1」の形にする */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** チップ 1 枚。色はその席の色 */
function Chip({ seat, ghost = false }: { seat: Seat; ghost?: boolean }) {
  return <span className={`bluff-chip seat${seat} ${ghost ? "ghost" : ""}`} aria-hidden />;
}

/** カード。value が null なら伏せたまま。revealed は終局後に表にした（それまで伏せていた）カード */
function Card({ value, size, revealed = false }: { value: number | null; size: "big" | "mid" | "normal" | "mini"; revealed?: boolean }) {
  const { t } = useI18n();
  const className = ["card-face", "bluff-card", size, value === null && "back", revealed && "revealed"]
    .filter(Boolean)
    .join(" ");
  return value === null ? (
    <span className={className} role="img" aria-label={t("game.bluff.hidden")} />
  ) : (
    <span className={className}>{value}</span>
  );
}

/** 卓に今の回戦を、下に選べる 2 つの手を出す。手を選ぶと「これで決定」で確定する */
export function BluffBoard({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Bluff.BluffView;
  const sel = selected as Bluff.BluffMove | null;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("play.you") : t("game.bluff.who", { name: names[seat] }));
  /** 一覧などで手前側の人を指す短い呼び名 */
  const myLabel = you === null ? names[me] : t("play.you");
  const actionName = (a: Action) => t(`game.bluff.action.${a}`);

  const last = s.acts.at(-1);
  /** 上乗せして、相手の答えを待っている人 */
  const raiser = playing && last?.action === "bet" ? last.seat : null;
  const prev = s.history.at(-1);
  // 選んだ手で自分が足すチップ（確定前の見込み）も場に薄く出す
  const adding = sel?.action === "bet" || sel?.action === "call" ? 1 : 0;
  const pot = s.stakes[0] + s.stakes[1];
  const chips = (seat: Seat) => Array.from({ length: s.stakes[seat] }, (_, i) => <Chip key={`${seat}-${i}`} seat={seat} />);

  const resultText = (r: Bluff.RoundView) =>
    r.showdown
      ? t("game.bluff.result.showdown", { who: who(r.winner), n: r.won })
      : t("game.bluff.result.fold", { loser: who(other(r.winner)), who: who(r.winner) });

  return (
    <div className="bluff">
      <div className="scores">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className={`score seat${seat}`}>
            <span className="muted small">
              <Chip seat={seat} />
              <span className="bluff-name">{names[seat]}</span>
            </span>
            <strong>{signed(s.scores[seat])}</strong>
          </div>
        ))}
      </div>

      {playing && (
        <div className="bluff-table">
          <div className="bluff-round">
            <span>{t("game.bluff.round", { n: s.round + 1, total: Bluff.ROUNDS })}</span>
            <span>{t("game.bluff.firstMover", { who: who(Bluff.firstMover(s.round)) })}</span>
          </div>
          <div className="bluff-seat">
            <Card value={s.cards[opp]} size="mid" />
            <span className="bluff-label">{t("game.bluff.theirCard", { name: names[opp] })}</span>
          </div>
          <div className="bluff-pot">
            <span className="bluff-chips">
              {chips(opp)}
              {chips(me)}
              {adding > 0 && <Chip seat={me} ghost />}
            </span>
            <span>
              {t("game.bluff.pot")} <strong>{pot + adding}</strong>
            </span>
          </div>
          <div className="bluff-seat">
            <Card value={s.cards[me]} size="big" />
            <span className="bluff-label">
              {you === null ? t("game.bluff.theirCard", { name: names[me] }) : t("game.bluff.yourCard")}
            </span>
          </div>
          {s.acts.length > 0 && (
            <ol className="bluff-acts">
              {s.acts.map((a, i) => (
                <li key={i} className={`seat${a.seat}`}>
                  {who(a.seat)} <strong>{actionName(a.action)}</strong>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 回戦が終わった直後（次の回戦でまだ誰も動いていない）と終局後は、直前の回戦の結果を見せる */}
      {prev && s.acts.length === 0 && (
        <div className="bluff-last">
          <span className="bluff-last-cards">
            {([me, opp] as Seat[]).map((seat) => (
              <span key={seat} className="bluff-last-card">
                <Card value={prev.cards[seat]} size="normal" />
                <span className="bluff-name">{seat === me ? myLabel : names[seat]}</span>
              </span>
            ))}
          </span>
          <span className="muted small">{t("game.bluff.lastRound", { n: s.history.length })}</span>
          <span>{resultText(prev)}</span>
        </div>
      )}

      {raiser !== null && raiser !== you ? (
        <div className={`bluff-alert seat${raiser}`} role="status">
          <strong>{t("game.bluff.theyBet", { name: names[raiser] })}</strong>
          <span>{myTurn ? t("game.bluff.answer") : t("game.bluff.thinking", { name: names[s.turn] })}</span>
        </div>
      ) : (
        playing && (
          <p className="board-note">
            {myTurn ? t("game.bluff.choose") : names[s.turn] && t("game.bluff.thinking", { name: names[s.turn] })}
          </p>
        )
      )}

      {myTurn && (
        <div className={`bluff-actions seat${me}`}>
          {Bluff.legalActions(s.acts).map((a) => (
            <button
              key={a}
              type="button"
              className={`bluff-action ${sel?.action === a ? "selected" : ""}`}
              aria-pressed={sel?.action === a}
              disabled={!interactive}
              onClick={() => onSelect({ action: a })}
            >
              <span className="bluff-action-name">{actionName(a)}</span>
              <span className="bluff-action-hint">{t(`game.bluff.hint.${a}`)}</span>
            </button>
          ))}
        </div>
      )}

      {!playing && (
        <p className="board-note">
          <span>{t("game.bluff.over", { total: Bluff.ROUNDS })}</span>
          {s.history.some((r) => !r.showdown) && <span className="muted">{t("game.bluff.revealed")}</span>}
        </p>
      )}

      {s.history.length > 0 && (
        <section>
          <h3 className="muted">{t("game.bluff.history")}</h3>
          <div className="bluff-history-head muted" aria-hidden>
            <span />
            <span>{myLabel}</span>
            <span>{names[opp]}</span>
          </div>
          <ol className="history">
            {s.history.map((r, i) => {
              const gain = r.winner === me ? r.won : -r.won;
              // おりた回戦のカードが表になっているのは終局後だけ。それまで伏せていたことが分かるようにする
              const opened = !playing && !r.showdown;
              return (
                <li key={i}>
                  <span className="muted">{i + 1}</span>
                  <Card value={r.cards[me]} size="mini" revealed={opened && you === null} />
                  <Card value={r.cards[opp]} size="mini" revealed={opened} />
                  <span className="small">
                    {r.showdown ? t("game.bluff.short.showdown") : t("game.bluff.short.fold", { who: who(other(r.winner)) })}
                  </span>
                  <strong className={`bluff-gain ${gain > 0 ? "good" : ""}`}>{signed(gain)}</strong>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
