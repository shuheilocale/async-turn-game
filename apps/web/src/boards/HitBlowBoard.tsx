import { useEffect, useState } from "react";
import { HitBlow, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";

export function HitBlowBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as HitBlow.HitBlowView;
  const opponent: Seat | null = you === null ? null : you === 0 ? 1 : 0;
  const kind = s.phase === "setup" ? "secret" : "guess";
  const opponentSolved = opponent !== null && s.guesses[opponent].some((g) => g.hit === HitBlow.DIGITS);

  return (
    <div className="stack">
      {s.phase === "done" ? (
        <div className="secrets">
          {([0, 1] as Seat[]).map((seat) => (
            <div key={seat} className="secret">
              <span className="muted">{t("hitblow.secretOf", { name: names[seat] })}</span>
              <span className="digits">{s.secrets[seat]}</span>
            </div>
          ))}
        </div>
      ) : (
        you !== null && s.secrets[you] && (
          <div className="secret">
            <span className="muted">{t("hitblow.yourSecret")}</span>
            <span className="digits">{s.secrets[you]}</span>
          </div>
        )
      )}

      {interactive && (
        <div className="card">
          <p className="prompt">{t(kind === "secret" ? "hitblow.setSecret" : "hitblow.makeGuess")}</p>
          {kind === "guess" && opponentSolved && <p className="notice">{t("hitblow.lastChance")}</p>}
          <NumberPad
            selected={selected as HitBlow.HitBlowMove | null}
            onComplete={(value) => onSelect(value === null ? null : { kind, value })}
          />
        </div>
      )}
      {!interactive && s.phase === "setup" && you !== null && s.secretSet[you] && (
        <p className="muted center">{t("hitblow.waitSecret")}</p>
      )}

      {s.phase !== "setup" && (
        <>
          <p className="muted small center">{t("hitblow.hint")}</p>
          <div className="guess-columns">
            {(you === null ? ([0, 1] as Seat[]) : [you, opponent!]).map((seat) => (
              <GuessList
                key={seat}
                title={
                  you === null
                    ? names[seat]
                    : t(seat === you ? "hitblow.yourGuesses" : "hitblow.theirGuesses")
                }
                guesses={s.guesses[seat]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GuessList({ title, guesses }: { title: string; guesses: HitBlow.Guess[] }) {
  const { t } = useI18n();
  return (
    <section className="guess-list">
      <h3>{title}</h3>
      {guesses.length === 0 ? (
        <p className="muted small">{t("hitblow.none")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th />
              <th>{t("hitblow.hit")}</th>
              <th>{t("hitblow.blow")}</th>
            </tr>
          </thead>
          <tbody>
            {guesses.map((g, i) => (
              <tr key={i} className={g.hit === HitBlow.DIGITS ? "solved" : ""}>
                <td className="muted">{i + 1}</td>
                <td className="digits">{g.value}</td>
                <td>{g.hit}</td>
                <td>{g.blow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** 0〜9 のボタンで 3 桁を入れる。同じ数字は 2 回押せない。3 桁そろったら onComplete */
function NumberPad({
  selected,
  onComplete,
}: {
  selected: HitBlow.HitBlowMove | null;
  onComplete(value: string | null): void;
}) {
  const { t } = useI18n();
  const [digits, setDigits] = useState("");

  // 「やめる」で選択が取り消されたら入力も消す
  useEffect(() => {
    if (selected === null) setDigits("");
  }, [selected]);

  const press = (d: string) => {
    if (digits.length >= HitBlow.DIGITS || digits.includes(d)) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === HitBlow.DIGITS) onComplete(next);
  };

  return (
    <div className="numpad">
      <div className="slots">
        {Array.from({ length: HitBlow.DIGITS }, (_, i) => (
          <span key={i} className="slot">{digits[i] ?? ""}</span>
        ))}
      </div>
      <div className="keys">
        {"1234567890".split("").map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={digits.includes(d) || digits.length >= HitBlow.DIGITS}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className="clear"
          onClick={() => {
            setDigits("");
            onComplete(null);
          }}
        >
          {t("hitblow.clear")}
        </button>
      </div>
    </div>
  );
}
