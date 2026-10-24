import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Memory, other, type GameStatus, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./MemoryBoard.css";

type Flip = Memory.Flip;

/** 相手の番を再生するとき、次の 1 枚をめくるまでの間（開いてすぐ動くと何が起きたか分からない） */
const STEP_MS = 700;
/** 2 枚目が表になってから、そろった 2 枚が取った人の側へ動きだすまで（表に返る動きの 0.45 秒を含む） */
const MATCH_PEEK_MS = 1000;
/** ちがう絵の 2 枚を見せておく時間。過ぎたら裏に戻す */
const MISS_PEEK_MS = 1600;
/** そろった 2 枚が取った人の側へ動く時間 */
const FLY_MS = 560;

/**
 * 盤の動きの段階。idle = 落ち着いている、peek = 2 枚目までめくって 2 枚を見せている、
 * fly = そろった 2 枚が取った人の側へ動いている
 */
type Stage = "idle" | "peek" | "fly";

/** 星の頂点（外側 14・内側 6 を交互に） */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = ((-90 + i * 36) * Math.PI) / 180;
  const r = i % 2 === 0 ? 14 : 6;
  return `${(20 + r * Math.cos(a)).toFixed(2)} ${(21.5 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

/** 札の絵（viewBox 0 0 40 40）。言葉なしで見分けられるよう、形と色の両方を変える */
const SHAPES: Record<Memory.FaceName, ReactNode> = {
  circle: <circle cx="20" cy="20" r="12.5" />,
  triangle: <path d="M20 7.5 33.5 31H6.5z" />,
  star: <path d={`M${STAR}z`} />,
  heart: (
    <path d="M20 33C20 33 6 24.5 6 15.5 6 11 9.5 8 13.25 8 16.2 8 18.7 9.8 20 12.5 21.3 9.8 23.8 8 26.75 8 30.5 8 34 11 34 15.5 34 24.5 20 33 20 33z" />
  ),
  // 大きい円から、右上にずらした円をくり抜いた三日月
  moon: <path d="M19.44 7.01A13 13 0 1 0 32.1 24.75 11 11 0 0 1 19.44 7.01z" />,
  drop: <path d="M20 5C20 5 9 17 9 24.5a11 11 0 0 0 22 0C31 17 20 5 20 5z" />,
};

const faceName = (face: number): Memory.FaceName => Memory.FACES[face] ?? "circle";

function Shape({ face }: { face: number }) {
  const name = faceName(face);
  return (
    <svg viewBox="0 0 40 40" className={`memory-shape ${name}`} aria-hidden>
      {SHAPES[name]}
    </svg>
  );
}

/** そろった 2 枚がその人の側へ動いてくる、小さな 2 枚組。arriving なら着くまで場所だけとっておく */
function Pair({ face, arriving }: { face: number; arriving: boolean }) {
  return (
    <span className={`memory-pair ${arriving ? "arriving" : ""}`}>
      <span className="memory-mini">
        <Shape face={face} />
      </span>
      <span className="memory-mini">
        <Shape face={face} />
      </span>
    </span>
  );
}

/** 開いたときに再生しはじめる記録の位置。再生するものがなければ記録の数（＝再生しない） */
function replayStart(flips: Flip[], you: Seat | null, status: GameStatus): number {
  const seat = replaySeat(flips, you, status);
  if (seat === null) return flips.length;
  // 参加者は、自分の番（か、相手の手で終局した）ときだけ相手の番をふり返る
  if (you !== null) {
    const mine = status.kind === "playing" ? status.turn === you : flips.at(-1)?.seat !== you;
    if (!mine) return flips.length;
  }
  return Memory.lastTurnStart(flips, seat) ?? flips.length;
}

/** ふり返る番の人。参加者なら相手、観戦者なら最後に終わった番の人 */
function replaySeat(flips: Flip[], you: Seat | null, status: GameStatus): Seat | null {
  if (you !== null) return other(you);
  if (status.kind === "playing") return other(status.turn);
  return flips.at(-1)?.seat ?? null;
}

/**
 * 4×3 に並べた札。上に相手の取った組、下に自分の取った組を並べる。札をタップするとすぐ送ってめくる
 * （1 枚目もその場で記録するので、やり直しはできない）。
 * 相手の番に起きたこと（めくった札とその絵）は、開いたときや届いたときに 1 枚ずつ再生する。
 * 盤に出しているのは記録の最初の shown 枚までの様子で、届いた記録に少しずつ追いつく
 */
export function MemoryBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Memory.MemoryView;
  const flips = s.flips;
  // 観戦者は先手側から見る
  const me: Seat = you ?? 0;
  const opp = other(me);
  const playing = status.kind === "playing";
  const myTurn = playing && you !== null && s.turn === you;
  const who = (seat: Seat) => (seat === you ? t("play.you") : t("game.memory.who", { name: names[seat] || "…" }));

  /** 盤に出し終えた記録の枚数。flips より少なければ、続きを順に再生する */
  const [shownState, setShown] = useState(() => replayStart(flips, you, status));
  const [stageState, setStage] = useState<Stage>("idle");
  // 記録が巻き戻った（お試しでやり直した・次の対局に移った など）ときは、直すまで今の様子をそのまま出す
  const rewound = shownState > flips.length;
  const shown = rewound ? flips.length : shownState;
  const stage: Stage = rewound ? "idle" : stageState;
  /** この枚数より前の記録は、自分がめくった札でも間をあけて再生する（開いたときと「もう一度見る」） */
  const slowUntil = useRef(flips.length);
  /** タップして、サーバの返事を待っている札 */
  const [pending, setPending] = useState<number | null>(null);
  const cardEls = useRef<(HTMLButtonElement | null)[]>([]);
  const trayEls = useRef<Record<Seat, HTMLDivElement | null>>({ 0: null, 1: null });

  // 返事が届いたら（記録が増えたら）、待っている印を外す
  useEffect(() => setPending(null), [flips.length]);

  // 観戦者として開いたあとで席が分かった（自分用リンクや LINE で合言葉を受け取った）ら、開き直したことにする
  const seatShown = useRef(you);
  useEffect(() => {
    if (seatShown.current === you) return;
    seatShown.current = you;
    slowUntil.current = flips.length;
    setStage("idle");
    setShown(replayStart(flips, you, status));
  }, [you]);

  // 記録に追いつくまで、1 枚ずつめくり、そろったら取った人の側へ動かし、ちがえば少し見せて裏に戻す
  useEffect(() => {
    if (rewound) {
      setShown(flips.length);
      setStage("idle");
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (stage === "peek") {
      const match = flips[shown - 2]!.face === flips[shown - 1]!.face;
      timer = setTimeout(() => setStage(match ? "fly" : "idle"), match ? MATCH_PEEK_MS : MISS_PEEK_MS);
    } else if (stage === "fly") {
      timer = setTimeout(() => setStage("idle"), FLY_MS);
    } else if (shown < flips.length) {
      // 自分が今めくった札はすぐ返す。相手の札と、ふり返りのときは間をあける
      const slow = shown < slowUntil.current || flips[shown]!.seat !== you;
      timer = setTimeout(
        () => {
          setShown(shown + 1);
          // 奇数番目（2 枚目）をめくったら、2 枚を見せる
          if (shown % 2 === 1) setStage("peek");
        },
        slow ? STEP_MS : 0,
      );
    }
    return () => clearTimeout(timer);
  }, [shown, stage, flips.length, rewound]);

  // そろった 2 枚を、取った人の側に出した小さな 2 枚組の場所まで動かす
  useLayoutEffect(() => {
    if (stage !== "fly") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const pair = [flips[shown - 2]!, flips[shown - 1]!];
    const minis = trayEls.current[pair[0]!.seat]?.querySelectorAll(".memory-pair.arriving .memory-mini");
    const anims = pair.map(({ card }, i) => {
      const el = cardEls.current[card];
      const target = minis?.[i];
      if (!el || !target) return null;
      const from = el.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      return el.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` }], {
        duration: FLY_MS,
        easing: "cubic-bezier(0.45, 0, 0.4, 1)",
        fill: "forwards",
      });
    });
    return () => anims.forEach((a) => a?.cancel());
  }, [stage, shown]);

  const settled = shown === flips.length && stage === "idle";
  /** いま盤に出している 2 枚（2 枚目までめくって見せているところ）。なければ null */
  const current = stage !== "idle" ? ([flips[shown - 2]!, flips[shown - 1]!] as const) : null;
  const matched = current !== null && current[0].face === current[1].face;
  /** 盤の上で取られたことになっている札（見せている 2 枚は、動き終わるまで場に残す） */
  const limit = current ? shown - 2 : shown;
  const owners = Memory.ownersAt(flips, limit);
  const open = shown % 2 === 1 ? flips[shown - 1]!.card : null;
  const up = new Set<number>([...(open !== null ? [open] : []), ...(current ? current.map((f) => f.card) : [])]);
  const seenCards = new Set(flips.slice(0, shown).map((f) => f.card));
  /** 札ごとに、盤に出している範囲で最後にめくったときの絵 */
  const faceOf = (card: number): number | null => {
    for (let i = shown - 1; i >= 0; i--) if (flips[i]!.card === card) return flips[i]!.face;
    return s.faces[card] ?? null;
  };

  // 取った組（取った順）。動いている 2 枚は、着く場所だけ先にとっておく
  const taken: Record<Seat, { face: number; arriving: boolean }[]> = { 0: [], 1: [] };
  for (let i = 0; i + 1 < limit; i += 2) {
    const [a, b] = [flips[i]!, flips[i + 1]!];
    if (a.face === b.face) taken[a.seat].push({ face: a.face, arriving: false });
  }
  if (current && stage === "fly") taken[current[0].seat].push({ face: current[0].face, arriving: true });
  const pairs = (seat: Seat) => taken[seat].filter((p) => !p.arriving).length;
  const left = Memory.PAIRS - pairs(0) - pairs(1);

  /** 今の再生が相手の番のふり返りか（自分の手の動きなら false） */
  const replayingSeat: Seat | null = settled
    ? null
    : (() => {
        const f = current ? current[1] : flips[shown];
        if (!f) return null;
        return f.seat !== you || shown < slowUntil.current ? f.seat : null;
      })();
  const target = replaySeat(flips, you, status);
  const replayFrom = target === null ? null : Memory.lastTurnStart(flips, target);

  const tap = async (card: number) => {
    if (!interactive || !myTurn || !settled || pending !== null) return;
    if (s.owners[card] !== null || card === Memory.openCard(flips)) return;
    setPending(card);
    const ok = await onSubmit({ card });
    if (!ok) setPending(null);
  };

  const replay = () => {
    if (replayFrom === null) return;
    slowUntil.current = flips.length;
    setStage("idle");
    setShown(replayFrom);
  };

  const skip = () => {
    setStage("idle");
    setShown(flips.length);
  };

  /** 盤の下に出す一言 */
  const note = (): { text: string; sub?: string } => {
    if (replayingSeat !== null) return { text: t("game.memory.replaying", { who: who(replayingSeat) }) };
    if (current) return { text: t(matched ? "game.memory.match" : "game.memory.miss") };
    if (!playing) return { text: t("game.memory.over") };
    const last = flips.at(-1);
    const lastTry = flips.length % 2 === 0 && last ? ([flips[flips.length - 2]!, last] as const) : null;
    if (myTurn) {
      if (open !== null) return { text: t("game.memory.pickSecond") };
      if (lastTry && lastTry[0].seat === you && lastTry[0].face === lastTry[1].face) return { text: t("game.memory.again") };
      const gained = replayFrom === null ? 0 : pairsTakenFrom(flips, replayFrom, opp);
      return {
        text: t("game.memory.pickFirst"),
        sub: gained > 0 ? t("game.memory.theyTook", { who: who(opp), n: gained }) : undefined,
      };
    }
    if (you !== null && last?.seat === you && lastTry) return { text: t("game.memory.passed", { name: names[s.turn] || "…" }) };
    if (open !== null) return { text: t("game.memory.theirSecond", { name: names[s.turn] || "…" }) };
    return { text: t("game.memory.theirTurn", { name: names[s.turn] || "…" }) };
  };
  const { text, sub } = note();

  const tray = (seat: Seat) => (
    <div
      ref={(el) => {
        trayEls.current[seat] = el;
      }}
      className={["memory-tray", `seat${seat}`, seat === me ? "mine" : "theirs", playing && s.turn === seat && "turn"]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="memory-who">
        <span className={`token dot seat${seat}`} aria-hidden />
        <span className="memory-name">{seat === you ? t("play.you") : names[seat] || "…"}</span>
      </span>
      <span className="memory-pairs">
        {taken[seat].map((p, i) => (
          <Pair key={i} face={p.face} arriving={p.arriving} />
        ))}
      </span>
      <span className="memory-count" aria-label={t("game.memory.count", { who: who(seat), n: pairs(seat) })}>
        <strong>{pairs(seat)}</strong>
        <span>{t(pairs(seat) === 1 ? "game.memory.unit1" : "game.memory.unit")}</span>
      </span>
    </div>
  );

  return (
    <div className="memory">
      {tray(opp)}

      <div className="memory-grid" style={{ gridTemplateColumns: `repeat(${Memory.COLS}, minmax(0, 1fr))` }}>
        {owners.map((owner, card) => {
          const face = faceOf(card);
          const isUp = up.has(card) && face !== null;
          const gone = owner !== null;
          const flying = stage === "fly" && current?.some((f) => f.card === card);
          const can = interactive && myTurn && settled && pending === null && !gone && card !== open;
          const n = card + 1;
          const label =
            owner !== null
            ? t("game.memory.card.taken", { n, who: who(owner) })
            : isUp
              ? t("game.memory.card.up", { n, face: t(`game.memory.face.${faceName(face)}`) })
              : t(seenCards.has(card) ? "game.memory.card.seen" : "game.memory.card.down", { n });
          const cls = [
            "memory-card",
            isUp && "up",
            gone && "gone",
            gone && `seat${owner}`,
            !gone && !isUp && seenCards.has(card) && "seen",
            current?.some((f) => f.card === card) && (matched ? "match" : "miss"),
            current && matched && `seat${current[0].seat}`,
            flying && "flying",
            pending === card && "pressed",
            can && "can",
          ];
          return (
            <button
              key={card}
              ref={(el) => {
                cardEls.current[card] = el;
              }}
              type="button"
              className={cls.filter(Boolean).join(" ")}
              aria-label={label}
              aria-disabled={!can}
              onClick={() => tap(card)}
            >
              {gone ? (
                // 取られた札の場所。終局後は、どこに何があったかを薄く見せる
                <span className="memory-slot">{!playing && face !== null && <Shape face={face} />}</span>
              ) : (
                <span className="memory-inner">
                  <span className="memory-back" />
                  <span className="memory-front">{face !== null && <Shape face={face} />}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tray(me)}

      <div className="memory-note" role="status">
        <p className="board-note">
          <span>{text}</span>
          {sub && <span className="muted">{sub}</span>}
        </p>
        {replayingSeat !== null ? (
          <button type="button" className="ghost-button memory-replay" onClick={skip}>
            {t("game.memory.skip")}
          </button>
        ) : (
          settled &&
          playing &&
          replayFrom !== null &&
          target !== null && (
            <button type="button" className="ghost-button memory-replay" onClick={replay}>
              {t("game.memory.replay", { who: who(target) })}
            </button>
          )
        )}
        {playing && <span className="muted small">{t("game.memory.left", { n: left })}</span>}
      </div>
    </div>
  );
}

/** 記録の from 枚目から、seat が取った組の数 */
function pairsTakenFrom(flips: Flip[], from: number, seat: Seat): number {
  let n = 0;
  for (let i = from; i + 1 < flips.length; i += 2) {
    const [a, b] = [flips[i]!, flips[i + 1]!];
    if (a.seat === seat && a.face === b.face) n++;
  }
  return n;
}
