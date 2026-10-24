import { useEffect, useRef, useState } from "react";
import { Chain, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./ChainBoard.css";

const { PADS, adderOf, showTiming } = Chain;
const PAD_LIST = Array.from({ length: PADS }, (_, i) => i);

/** 自分の番が始まってから、並びを光らせはじめるまでの間（ミリ秒） */
const LEAD_MS = 900;
/** 押したパッドが光っている時間 */
const PRESS_MS = 240;

/** 紫の星（viewBox 0 0 100 100）。とがった 5 つの角と、くぼんだ 5 つの角を交互につなぐ */
const STAR = `M${Array.from({ length: 10 }, (_, k) => {
  const a = ((-90 + k * 36) * Math.PI) / 180;
  const r = k % 2 === 0 ? 38 : 16;
  return `${(50 + r * Math.cos(a)).toFixed(1)} ${(54 + r * Math.sin(a)).toFixed(1)}`;
}).join("L")}Z`;

/** パッドの形。色だけでなく形でも区別できるように 0 丸・1 三角・2 四角・3 星 */
function PadShape({ pad }: { pad: number }) {
  if (pad === 0) return <circle cx="50" cy="50" r="31" className="chain-shape" />;
  if (pad === 1) return <path d="M50 16L86 78H14Z" className="chain-shape" />;
  if (pad === 2) return <rect x="23" y="23" width="54" height="54" rx="5" className="chain-shape" />;
  return <path d={STAR} className="chain-shape" />;
}

/** 並びの 1 つを小さく描いた札（足した人の色の線つき） */
function Chip({ pad, seat, miss = false }: { pad: number; seat?: Seat; miss?: boolean }) {
  return (
    <span className={`chain-chip pad${pad} ${seat !== undefined ? `seat${seat} by` : ""} ${miss ? "miss" : ""}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <PadShape pad={pad} />
      </svg>
    </span>
  );
}

type Phase =
  /** 相手の番・観戦 */
  | "watch"
  /** 自分の番の始め：並びを光らせて見せている */
  | "replay"
  /** まねして押している（まねし終えたら 1 つ足す） */
  | "input"
  /** 最後まで合っていて 1 つ足した：送っている */
  | "sending"
  /** まちがえた：その場で止めて送っている */
  | "missed"
  | "over";

/**
 * 4 つのパッド。自分の番の始めに、これまでの並びを 1 回だけ光らせて見せる（その間は押せない）。
 * 押すたびにその場で合っているか確かめ、まちがえた瞬間に止めて送る。最後まで合っていたら、
 * 次の 1 回で足すパッドを選んで送る（どちらも確定を待たずにすぐ送る）
 */
export function ChainBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Chain.ChainState;
  const n = s.seq.length;
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("game.chain.you") : t("game.chain.who", { name: names[seat] }));
  const padName = (pad: number) => t(`game.chain.pad${pad}`);
  /** この手番を表す名前。5 秒ごとの確認で同じ盤面が届いても変わらず、並びが伸びたら変わる */
  const key = `${n}:${s.seq.join("")}`;

  /** 並びを見せ終えた手番 */
  const [shown, setShown] = useState<string | null>(null);
  /** 見せている途中の位置（-1 は光らせはじめる前の間）と、いま光っているか */
  const [lit, setLit] = useState<{ key: string; index: number; on: boolean } | null>(null);
  /** この手番で押したパッド */
  const [input, setInput] = useState<{ key: string; taps: number[] } | null>(null);
  /** 押したパッドを少しの間だけ光らせる。count を増やして波紋の動きをやり直す */
  const [press, setPress] = useState<{ pad: number; count: number; on: boolean } | null>(null);
  /** 送れなかった手番。もう一度送るボタンを出す */
  const [failed, setFailed] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const taps = input?.key === key ? input.taps : [];
  const wrongAt = taps.findIndex((pad, i) => i < n && pad !== s.seq[i]);

  let phase: Phase;
  if (!playing) phase = "over";
  else if (!myTurn) phase = "watch";
  else if (n > 0 && shown !== key) phase = "replay";
  else if (wrongAt >= 0) phase = "missed";
  else if (taps.length > n) phase = "sending";
  else phase = "input";

  // 自分の番が始まったら、並びを最初から 1 回だけ光らせる。長い並びほど少し速く、最後の 1 つは長め
  const replaying = phase === "replay";
  useEffect(() => {
    if (!replaying) return;
    const { flashMs, gapMs, lastMs } = showTiming(n);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    setLit({ key, index: -1, on: false });
    let time = LEAD_MS;
    for (let i = 0; i < n; i++) {
      const on = i === n - 1 ? lastMs : flashMs;
      at(time, () => setLit({ key, index: i, on: true }));
      at(time + on, () => setLit({ key, index: i, on: false }));
      time += on + gapMs;
    }
    at(time, () => setShown(key));
    return () => timers.forEach(clearTimeout);
  }, [replaying, key]);

  // 押したパッドの光は少しで消す
  useEffect(() => {
    if (!press?.on) return;
    const count = press.count;
    const timer = setTimeout(() => setPress((p) => (p && p.count === count ? { ...p, on: false } : p)), PRESS_MS);
    return () => clearTimeout(timer);
  }, [press]);

  async function send(move: number[]) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setFailed(null);
    const ok = await onSubmit({ taps: move });
    sendingRef.current = false;
    setSending(false);
    if (!ok) setFailed(key);
  }

  const canTap = phase === "input" && interactive && !sending;
  function tap(pad: number) {
    if (!canTap) return;
    const next = [...taps, pad];
    const i = next.length - 1;
    setInput({ key, taps: next });
    setPress((p) => ({ pad, count: (p?.count ?? 0) + 1, on: true }));
    // まちがえたらその場で止めて送る。最後まで合っていて 1 つ足したら送る
    if ((i < n && pad !== s.seq[i]) || i === n) send(next);
  }

  // ---------- 光らせるパッドと印 ----------

  const showing = phase === "replay" && lit?.key === key && lit.on ? lit.index : null;
  const litPad = phase === "replay" ? (showing !== null ? s.seq[showing]! : null) : press?.on ? press.pad : null;
  /** いま光っているのが、相手が足した最後の 1 つか */
  const newest = showing !== null && showing === n - 1;
  const miss = phase === "missed" ? { index: wrongAt, pad: taps[wrongAt]! } : phase === "over" ? s.miss : null;
  const answer = miss ? s.seq[miss.index]! : null;
  const addable = phase === "input" && taps.length === n && interactive;

  // ---------- いま何個目か ----------

  let head: string;
  let sub: string | null = t("game.chain.total", { n });
  /** 並びの点：済んだ数、いまの位置、まちがえた位置 */
  let done = 0;
  let now: number | null = null;
  let bad: number | null = null;
  if (phase === "replay") {
    const index = lit?.key === key ? lit.index : -1;
    head = index < 0 ? t("game.chain.look") : t("game.chain.nth", { i: index + 1 });
    done = index + 1;
  } else if (phase === "input" && taps.length < n) {
    head = t("game.chain.nth", { i: taps.length + 1 });
    done = taps.length;
    now = taps.length;
  } else if (phase === "input" && n === 0) {
    head = t("game.chain.nth", { i: 1 });
    sub = null;
  } else if (phase === "input" || phase === "sending") {
    head = t("game.chain.allRight");
    sub = null;
    done = n;
    now = n;
  } else if (phase === "missed") {
    head = t("game.chain.nth", { i: wrongAt + 1 });
    done = wrongAt;
    bad = wrongAt;
  } else if (phase === "watch") {
    head = names[s.turn] ? t("game.chain.waiting", { name: names[s.turn] }) : "";
    sub = t("game.chain.length", { n });
    done = n;
  } else if (s.miss) {
    head = t("game.chain.missed", { who: who(s.miss.seat), i: s.miss.index + 1 });
    done = s.miss.index;
    bad = s.miss.index;
  } else {
    head = t("game.chain.drawn", { n });
    sub = null;
    done = n;
  }
  /** 足す 1 つの枠を点の後ろに出すか（自分がまねしている間だけ） */
  const addSlot = phase === "input" || phase === "sending";

  // ---------- 説明 ----------

  let note: string | null = null;
  let hint: string | null = null;
  if (phase === "replay") {
    note = lit?.key === key && lit.index >= 0 ? t("game.chain.showing") : t("game.chain.look");
    hint = t("game.chain.lastIs", { who: who(adderOf(n - 1)) });
  } else if (phase === "input" && interactive) {
    // 押せないとき（相手の参加待ちなど）は、押してと書かない
    note = n === 0 ? t("game.chain.first") : taps.length < n ? t("game.chain.copy") : t("game.chain.add");
    if (n === 0) hint = t("game.chain.firstHint");
  } else if (phase === "sending") {
    note = failed === key ? t("game.chain.failed") : t("game.chain.sending");
  } else if (phase === "missed") {
    note = failed === key ? t("game.chain.failed") : t("game.chain.wrongNow");
  } else if (phase === "over" && s.miss && answer !== null) {
    note = t("game.chain.missedDetail", { right: padName(answer), wrong: padName(s.miss.pad) });
  }
  const lastAdded = phase === "watch" && n > 0 ? { pad: s.seq[n - 1]!, seat: adderOf(n - 1) } : null;

  return (
    <div className="chain stack-sm">
      <div className="chain-progress" aria-live="polite">
        <p className="chain-count">
          {head && <strong>{head}</strong>}
          {sub && <span className="muted">{sub}</span>}
        </p>
        {n > 0 && phase !== "over" && (
          <ol className="chain-dots" aria-hidden>
            {s.seq.map((_, i) => (
              <li key={i} className={i === bad ? "bad" : i === now ? "now" : i < done ? "on" : ""} />
            ))}
            {addSlot && <li className={`add ${now === n ? "now" : ""}`}>+</li>}
          </ol>
        )}
      </div>

      <div className={`chain-pads ${canTap ? "can" : ""} ${replaying ? "replaying" : ""}`}>
        {PAD_LIST.map((pad) => (
          <button
            key={pad}
            type="button"
            className={[
              "chain-pad",
              `pad${pad}`,
              litPad === pad && "lit",
              litPad === pad && newest && "newest",
              miss?.pad === pad && "wrong",
              answer === pad && "answer",
              addable && "addable",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!canTap}
            onClick={() => tap(pad)}
            aria-label={padName(pad)}
          >
            <svg viewBox="0 0 100 100" className="chain-face" aria-hidden>
              <PadShape pad={pad} />
            </svg>
            {press?.pad === pad && <span key={press.count} className="chain-ripple" aria-hidden />}
            {miss?.pad === pad && (
              <svg viewBox="0 0 100 100" className="chain-cross" aria-hidden>
                <path d="M28 28L72 72M72 28L28 72" />
              </svg>
            )}
            {litPad === pad && newest && <span className="chain-tag">{t("game.chain.newTag")}</span>}
            {answer === pad && <span className="chain-tag answer">{t("game.chain.answer")}</span>}
          </button>
        ))}
      </div>

      <p className="board-note">
        {note && <span>{note}</span>}
        {hint && <span className="muted">{hint}</span>}
        {lastAdded && (
          <span className="chain-added muted">
            {t("game.chain.added", { who: who(lastAdded.seat) })}
            <Chip pad={lastAdded.pad} />
          </span>
        )}
        {failed === key && (phase === "sending" || phase === "missed") && (
          <button type="button" className="ghost-button chain-retry" disabled={sending} onClick={() => send(taps)}>
            {t("game.chain.retry")}
          </button>
        )}
      </p>

      {phase === "over" && n > 0 && (
        <section className="chain-review">
          <h3 className="muted">{t("game.chain.review", { n })}</h3>
          <ol className="chain-strip">
            {s.seq.map((pad, i) => (
              <li key={i}>
                <Chip pad={pad} seat={adderOf(i)} miss={s.miss?.index === i} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
