import { other, Sotto, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./SottoBoard.css";

type Action = Sotto.SottoAction;

/** 札 1 枚。value が null なら伏せたまま。label は数字のかわりに読み上げる文 */
function Card({
  value,
  size = "normal",
  className = "",
  label,
}: {
  value: number | null;
  size?: "big" | "mid" | "normal" | "mini";
  className?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const cls = ["card-face", "sotto-card", size, value === null && "back", className].filter(Boolean).join(" ");
  return value === null ? (
    <span className={cls} role="img" aria-label={t("game.sotto.hidden")} />
  ) : (
    <span className={cls} aria-label={label}>
      {value}
    </span>
  );
}

/** 待てる回数の目印（砂時計）。used なら使った分として砂のない形にする */
function Hourglass({ used, pending }: { used: boolean; pending: boolean }) {
  return (
    <svg viewBox="0 0 16 20" className={`sotto-hourglass ${used ? "used" : ""} ${pending ? "pending" : ""}`} aria-hidden>
      <path d="M3 1.5h10M3 18.5h10" className="frame" />
      <path d="M4.2 1.5 8 10l3.8-8.5M4.2 18.5 8 10l3.8 8.5" className="frame" />
      {!used && <path d="M5.4 3.4h5.2L8 9.2z" className="sand" />}
      {!used && <path d="M8 13.6l2.6 3.6H5.4z" className="sand" />}
    </svg>
  );
}

/**
 * 上に相手の伏せた札、中央に場の一番上の札、下に自分の札。下の「出す」「待つ」で選び、
 * 画面下の「これで決定」で確定する
 */
export function SottoBoard({ state, status, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Sotto.SottoView;
  const sel = selected as Sotto.SottoMove | null;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("play.you") : t("game.sotto.who", { name: names[seat] }));
  const list = (cards: number[]) => cards.join(t("game.sotto.and"));
  const legal = playing ? Sotto.legalActions(s) : [];

  const top = s.pile.at(-1);
  const last = s.last;
  /** 直前に相手が待ったなら、その人 */
  const waitedBy = playing && last?.action === "wait" && last.seat !== you ? last.seat : null;
  /** 直前の手でライフが減った（減ったライフの印を揺らす） */
  const lostNow = (last?.missed.length ?? 0) > 0;
  const myHand = s.hands[me];
  const oppHand = s.hands[opp];
  /** 出す札（自分の一番小さい札） */
  const nextCard = myTurn ? (myHand[0] ?? null) : null;
  // 終局後は伏せていた札も表になる。観戦者には 2 人分とも、参加者には相手の分だけ伏せていた
  const revealedClass = (seat: Seat) => (!playing && seat !== you ? "revealed" : "");

  const hint = (a: Action) => {
    if (a === "play") return nextCard === null ? "" : t("game.sotto.hint.play", { card: nextCard });
    if (s.waits === 0) return t("game.sotto.hint.noWaits");
    if (oppHand.length === 0) return t("game.sotto.hint.alone");
    return t("game.sotto.hint.wait", { n: s.waits });
  };

  const prompt = () => {
    if (!legal.includes("wait")) return oppHand.length === 0 ? t("game.sotto.alone") : t("game.sotto.mustPlay");
    return t("game.sotto.choose");
  };

  /** 札の並び。終局後に表にした札は点線で囲む */
  const hand = (seat: Seat) => {
    const cards = s.hands[seat];
    if (cards.length === 0) return <span className="sotto-empty muted small">{t("game.sotto.noCards")}</span>;
    return (
      <div className="sotto-hand">
        {cards.map((c, i) => {
          // 自分の一番小さい札が次に出す札。「出す」を選んでいれば少し持ち上げる
          const next = seat === me && you !== null && playing && i === 0;
          const slot = ["sotto-slot", next && "next", next && sel?.action === "play" && "lift"];
          return (
            <span key={i} className={slot.filter(Boolean).join(" ")}>
              {next && <span className="sotto-next-tag">{t("game.sotto.next")}</span>}
              <Card
                value={c}
                size={next ? "mid" : "normal"}
                className={[next && `seat${me}`, c !== null && revealedClass(seat)].filter(Boolean).join(" ")}
              />
            </span>
          );
        })}
      </div>
    );
  };

  // 相手が待ったことは「まだ大きい札しかない」という合図なので、待った人の札のそばに吹き出しで目立たせる
  const waited = waitedBy !== null && (
    <div className={`sotto-waited seat${waitedBy} ${waitedBy === me ? "down" : ""}`} role="status">
      <Hourglass used={false} pending={false} />
      <strong>{t("game.sotto.theyWaited", { name: names[waitedBy] })}</strong>
    </div>
  );

  return (
    <div className="sotto">
      {/* ライフと待てる回数。2 人で共有 */}
      <div className="sotto-meters">
        <div className="sotto-meter" role="img" aria-label={t("game.sotto.livesLeft", { n: s.lives })}>
          <span className="sotto-meter-name">{t("game.sotto.lives")}</span>
          <span className="sotto-lives">
            {Array.from({ length: Sotto.LIVES }, (_, i) => (
              <span
                key={i}
                className={`sotto-life ${i < s.lives ? "" : "lost"} ${lostNow && i === s.lives ? "just-lost" : ""}`}
              />
            ))}
          </span>
        </div>
        <div className="sotto-meter" role="img" aria-label={t("game.sotto.waitsLeft", { n: s.waits })}>
          <span className="sotto-meter-name">{t("game.sotto.waits")}</span>
          <span className="sotto-waits">
            {Array.from({ length: Sotto.WAITS }, (_, i) => (
              // 選んだ「待つ」で使う分（残りの一番右）を点滅させる
              <Hourglass key={i} used={i >= s.waits} pending={sel?.action === "wait" && i === s.waits - 1} />
            ))}
          </span>
        </div>
      </div>

      <div className="sotto-table">
        <div className={`sotto-side seat${opp}`}>
          <span className="sotto-label">
            <span className="sotto-dot" aria-hidden />
            <span className="sotto-name">{t("game.sotto.theirHand", { name: names[opp] })}</span>
            {oppHand.length > 0 && <span className="muted">{t("game.sotto.count", { n: oppHand.length })}</span>}
          </span>
          {hand(opp)}
          {waitedBy === opp && waited}
        </div>

        <div className="sotto-pile">
          {top ? (
            <Card key={top.card} value={top.card} size="big" className={`seat${top.seat} placed`} />
          ) : (
            <span className="card-face sotto-card big placeholder" aria-hidden />
          )}
          <span className="sotto-pile-label">
            {top ? t("game.sotto.pileTop", { who: who(top.seat) }) : t("game.sotto.pileEmpty")}
          </span>
        </div>

        <div className={`sotto-side mine seat${me}`}>
          {waitedBy === me && waited}
          {hand(me)}
          <span className="sotto-label">
            <span className="sotto-dot" aria-hidden />
            <span className="sotto-name">
              {you === null ? t("game.sotto.theirHand", { name: names[me] }) : t("game.sotto.yourHand")}
            </span>
            {myHand.length > 0 && <span className="muted">{t("game.sotto.count", { n: myHand.length })}</span>}
          </span>
        </div>
      </div>

      {/* ミスのときは、何が起きたかを出す */}
      {last?.card != null && last.missed.length > 0 && (
        <div className="sotto-alert" role="status">
          <strong>
            {t("game.sotto.mistake", {
              who: who(last.seat),
              card: last.card,
              holder: who(other(last.seat)),
              missed: list(last.missed),
            })}
          </strong>
          <span>{t("game.sotto.mistakeSub", { missed: list(last.missed) })}</span>
        </div>
      )}

      {playing && (
        <p className="board-note">
          {!myTurn && last?.action === "wait" && last.seat === you && <strong>{t("game.sotto.youWaited")}</strong>}
          <span>{myTurn ? prompt() : names[s.turn] && t("game.sotto.thinking", { name: names[s.turn] })}</span>
          <span className="muted">{t("game.sotto.promise")}</span>
        </p>
      )}

      {myTurn && (
        <div className={`sotto-actions seat${me}`}>
          {(["play", "wait"] as Action[]).map((a) => (
            <button
              key={a}
              type="button"
              className={`sotto-action ${sel?.action === a ? "selected" : ""}`}
              aria-pressed={sel?.action === a}
              disabled={!interactive || !legal.includes(a)}
              onClick={() => onSelect({ action: a })}
            >
              <span className="sotto-action-name">{t(`game.sotto.action.${a}`)}</span>
              <span className="sotto-action-hint">{hint(a)}</span>
            </button>
          ))}
        </div>
      )}

      {!playing && (
        <p className="board-note">
          <span>{t(status.kind === "finished" && status.coop === "cleared" ? "game.sotto.cleared" : "game.sotto.failed")}</span>
          {([0, 1] as Seat[]).some((seat) => revealedClass(seat) && s.hands[seat].length > 0) && (
            <span className="muted">{t("game.sotto.revealed")}</span>
          )}
        </p>
      )}

      {s.pile.length > 0 && (
        <section>
          <h3 className="muted">{t("game.sotto.history")}</h3>
          <ol className="sotto-flow">
            {s.pile.map((p) => {
              const missed = s.mistakes.find((m) => m.card === p.card)?.missed ?? [];
              return (
                <li key={p.card}>
                  <Card value={p.card} size="mini" className={`seat${p.seat} played`} />
                  {missed.map((c) => (
                    <Card
                      key={c}
                      value={c}
                      size="mini"
                      className={`seat${other(p.seat)} discarded`}
                      label={t("game.sotto.discarded", { card: c })}
                    />
                  ))}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
