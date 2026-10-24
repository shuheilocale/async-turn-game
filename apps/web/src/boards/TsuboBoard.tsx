import { useEffect, useState, type CSSProperties } from "react";
import { other, Tsubo, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./TsuboBoard.css";

const { COLS, ROWS, CELLS, KORI, COLD, LEVEL_NAMES } = Tsubo;
type Level = Tsubo.Level;

/*
 * 背中の絵の座標（viewBox 0 0 VW VH）。マスは背骨の左右に 3 列ずつで、背骨のぶん SPINE だけあける。
 * マスのボタンは絵の上に重ね、位置はこの座標の割合で決める
 */
const VW = 100;
const VH = 112;
const GX = 10;
const GY = 27;
const GW = 80;
const SPINE = 3;
const CELL_W = (GW - SPINE) / COLS;
const ROW_H = 11;
const GH = ROW_H * ROWS;
const colOf = (cell: number) => cell % COLS;
const rowOf = (cell: number) => Math.floor(cell / COLS);
const cx = (cell: number) => GX + colOf(cell) * CELL_W + (colOf(cell) >= COLS / 2 ? SPINE : 0) + CELL_W / 2;
const cy = (cell: number) => GY + rowOf(cell) * ROW_H + ROW_H / 2;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const at = (cell: number) => `translate(${cx(cell)} ${cy(cell)})`;
const levelName = (level: Level) => LEVEL_NAMES[level];

/** 腕：半袖から出て、体の横に沿わせて下ろしている（うつぶせで施術を受ける姿勢） */
const ARMS = "M5.4 37 4.1 63 5 92M94.6 37 95.9 63 95 92";

/**
 * 背中のうしろ姿：うつぶせのお客さんを上から見たところ。頭（つむじ）と、体の横に下ろした腕、
 * 半袖のゆったりした服、背骨。腕は太い線を 2 回重ねて（ふちの色 → 中の色）描き、袖でつけ根を隠す
 */
function BackArt() {
  return (
    <g className="tsubo-body">
      <path className="arm-edge" d={ARMS} />
      <path className="arm" d={ARMS} />
      <path className="skin" d="M45.2 15.5 44.8 21.8h10.4l-.4-6.3Z" />
      <circle className="head" cx="50" cy="10.6" r="8.4" />
      <path className="swirl" d="M50.9 9.9a1.2 1.2 0 1 0-1.5 1.4 2.5 2.5 0 1 0 2.8-3.2" />
      <path
        className="shirt"
        d="M42 20.4C35 21 22 22 14.5 24 10.5 25.2 6 28.5 2.8 35.5L8.7 39.6C8.4 55 9 75 8.8 85L7.6 108.5Q50 111 92.4 108.5L91.2 85C91 75 91.6 55 91.3 39.6L97.2 35.5C94 28.5 89.5 25.2 85.5 24 78 22 65 21 58 20.4 53 22.2 47 22.2 42 20.4Z"
      />
      {/* 袖のつけ根の縫い目と、えりのふち */}
      <path className="seam" d="M14.5 24C12.2 28 10.2 33 8.9 38.8M85.5 24C87.8 28 89.8 33 91.1 38.8M43.2 21.2Q50 23.6 56.8 21.2" />
      <path className="spine" d={`M50 ${GY - 2.5}V${GY + GH + 1.5}`} />
    </g>
  );
}

/** こり：小さな結び目。missed はほぐしきれなかったこり、placing は置いたばかり */
function Knot({ cell, className = "" }: { cell: number; className?: string }) {
  return (
    <g transform={at(cell)}>
      <g className={`tsubo-knot ${className}`}>
        <circle className="halo" r={4.3} />
        <path d="M-2.9 1.2C-3.4-1.6-.4-3.1 1.1-1.7 2.5-.4 1.2 2.4-.7 1.9-2.4 1.4-1.4-1.6.6-1.6 2.6-1.6 3.4.6 2.6 2.3" />
      </g>
    </g>
  );
}

/** 指の跡。近さの段階の色で塗る。faded は、こりがほぐれる前に押した跡 */
function Print({ cell, level, faded, latest }: { cell: number; level: Level; faded: boolean; latest: boolean }) {
  return (
    <g transform={at(cell)}>
      <g className={["tsubo-print", `lv-${levelName(level)}`, faded && "faded", latest && "latest"].filter(Boolean).join(" ")}>
        <ellipse className="pad" rx={3.3} ry={4} />
        <path className="ridge" d="M-2.1 1.5C-2.3-1.8 2.3-1.8 2.1 1.5M-1 1.9C-1.1-.4 1.1-.4 1 1.9M-2.6-1.2C-1.5-3.5 1.5-3.5 2.6-1.2" />
      </g>
    </g>
  );
}

/** ほぐれたこり。押したばかりなら、ふわっと広がる輪と光 */
function Loosened({ cell, latest }: { cell: number; latest: boolean }) {
  return (
    <g transform={at(cell)}>
      <g className={`tsubo-loose ${latest ? "latest" : ""}`}>
        {latest && <circle className="burst" r={4.2} />}
        {latest && <path className="rays" d="M0-6.6V-5.4M4.7-4.7 3.8-3.8M6.6 0H5.4M4.7 4.7 3.8 3.8M0 6.6V5.4M-4.7 4.7-3.8 3.8M-6.6 0H-5.4M-4.7-4.7-3.8-3.8" />}
        <circle className="ring" r={4.1} />
        <path className="check" d="M-1.9.2-.5 1.6 2.1-1.2" />
      </g>
    </g>
  );
}

/** 盤の下の、残りのこりの印（結び目か、ほぐれた丸） */
const MiniKnot = ({ loose }: { loose: boolean }) => (
  <svg viewBox="-5 -5 10 10" className={`tsubo-mini ${loose ? "loose" : "tight"}`} aria-hidden>
    {loose ? (
      <>
        <circle className="ring" r={4.1} />
        <path className="check" d="M-1.9.2-.5 1.6 2.1-1.2" />
      </>
    ) : (
      <path d="M-2.9 1.2C-3.4-1.6-.4-3.1 1.1-1.7 2.5-.4 1.2 2.4-.7 1.9-2.4 1.4-1.4-1.6.6-1.6 2.6-1.6 3.4.6 2.6 2.3" />
    )}
  </svg>
);

/**
 * 背中のマスに、お客さんはこりを置き（3 か所選んで「これで決定」）、施術する人は 1 か所ずつ押す（押すとすぐ送る）。
 * 回戦が終わった直後の人の番では、まず終わった回戦の結果（こりの場所）を見せ、「つぎへ」で次に進む
 */
export function TsuboBoard({ state, status, you, names, interactive, selected, onSelect, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Tsubo.TsuboView;
  const rounds = s.rounds;
  const idx = rounds.length - 1;
  const cur = rounds[idx]!;
  const playing = status.kind === "playing";
  const turn = playing ? Tsubo.turnOf(rounds) : null;
  const me: Seat = you ?? 0;
  const myTurn = playing && you !== null && turn === you;
  const doneCount = rounds.filter((_, i) => Tsubo.isRoundOver(rounds, i)).length;

  /** 文の中で使う呼び名（「あなた」「〇〇さん」。名前がまだなければ「相手」） */
  const who = (seat: Seat) =>
    seat === you ? t("game.tsubo.you") : names[seat] ? t("game.tsubo.who", { name: names[seat] }) : t("game.tsubo.opponent");
  const label = (seat: Seat) => (seat === you ? t("game.tsubo.you") : names[seat] || t("game.tsubo.opponent"));
  const levelText = (level: Level) => t(`game.tsubo.level.${levelName(level)}`);

  /** 「つぎへ」で閉じた結果の数。自分の番で、まだ閉じていない結果があれば先に見せる */
  const [acked, setAcked] = useState(0);
  /** 上のつまみで選んで見ている回戦 */
  const [picked, setPicked] = useState<number | null>(null);
  /** お客さんが置きかけているこり（3 か所そろったら「これで決定」に渡す） */
  const [picks, setPicks] = useState<number[]>([]);
  const [full, setFull] = useState(false);
  /** 押して、サーバの返事を待っているマス */
  const [pending, setPending] = useState<number | null>(null);

  // 回戦が進んだら、置きかけのこりと、選んで見ていた回戦を捨てる
  const stage = `${idx}-${cur.kori === null ? "hide" : "search"}`;
  useEffect(() => {
    setPicks([]);
    setFull(false);
    setPicked(null);
  }, [stage]);
  // 押した記録が届いたら、待っている印を消す
  useEffect(() => setPending(null), [cur.presses.length, idx]);
  // 「やめる」で選んだ手が取り消されたら、置いたこりも外す
  useEffect(() => {
    if (selected === null && picks.length === KORI) setPicks([]);
  }, [selected]);
  // お試しの「もう一度」などで最初に戻ったら、閉じた結果の数も戻す
  useEffect(() => {
    if (acked > doneCount) setAcked(doneCount);
  }, [acked, doneCount]);

  const gate = myTurn && doneCount > acked;
  const shownIdx =
    picked !== null && picked <= idx
      ? picked
      : gate
        ? doneCount - 1
        : // 相手がこりを置いている間は、終わったばかりの回戦を見せておく
          playing && !myTurn && cur.kori === null && idx > 0
          ? idx - 1
          : idx;
  const r = rounds[shownIdx]!;
  const live = shownIdx === idx && myTurn && !gate;
  const hiding = live && cur.kori === null;
  const searching = live && cur.kori !== null;
  const over = Tsubo.isRoundOver(rounds, shownIdx);
  const cap = Tsubo.capOf(rounds, shownIdx);
  const kori = Array.isArray(r.kori) ? r.kori : null;
  const presses = r.presses;
  const pressAt = new Map(presses.map((p) => [p.cell, p]));
  const foundCount = Tsubo.foundOf(r);
  const lastHit = presses.map((p) => p.level).lastIndexOf(0);
  const latest = presses.at(-1) ?? null;
  const customer = r.customer;
  const searcher = Tsubo.searcherOf(r);
  // 自分の置いたこり（伏せずに届いている、まだ終わっていない回戦）
  const mine = !over && kori !== null && you === customer;
  const missed = over && kori !== null ? kori.filter((k) => !pressAt.has(k)) : [];
  /** 結び目を描くか（自分の置いたこり・終わった回戦のこり） */
  const showKori = kori !== null && (mine || over);

  const canTap = (cell: number) =>
    interactive && (hiding || (searching && pending === null && !pressAt.has(cell)));

  const tap = async (cell: number) => {
    if (!canTap(cell)) return;
    if (hiding) {
      const has = picks.includes(cell);
      if (!has && picks.length >= KORI) return setFull(true);
      const next = has ? picks.filter((c) => c !== cell) : [...picks, cell];
      setPicks(next);
      setFull(false);
      onSelect(next.length === KORI ? { kind: "hide", cells: next } : null);
      return;
    }
    setPending(cell);
    if (!(await onSubmit({ kind: "press", cell }))) setPending(null);
  };

  const cellLabel = (cell: number) => {
    const parts = [t("game.tsubo.cell", { row: rowOf(cell) + 1, col: colOf(cell) + 1 })];
    const p = pressAt.get(cell);
    if (p) parts.push(t("game.tsubo.cell.pressed", { level: levelText(p.level) }));
    else if ((showKori && kori.includes(cell)) || (hiding && picks.includes(cell))) parts.push(t("game.tsubo.cell.kori"));
    return parts.join(" ");
  };

  /** それぞれの席が施術した回戦の結果（押した回数と、ほぐした数・施術中か） */
  const scoreOf = (seat: Seat) => {
    const i = rounds.findIndex((x) => Tsubo.searcherOf(x) === seat);
    const x = rounds[i];
    if (!x || x.kori === null) return { text: t("game.tsubo.score.none"), sub: "" };
    const n = t("game.tsubo.score.times", { n: x.presses.length });
    if (!Tsubo.isRoundOver(rounds, i)) return { text: n, sub: t("game.tsubo.score.now") };
    const f = Tsubo.foundOf(x);
    return { text: n, sub: f === KORI ? t("game.tsubo.score.all") : t("game.tsubo.score.some", { n: f }) };
  };
  const winner = status.kind === "finished" ? status.winner : undefined;
  const first = rounds[0]!;
  const byFound = status.kind === "finished" && rounds.length === 2 && Tsubo.foundOf(first) !== Tsubo.foundOf(rounds[1]!);

  // 押したばかりの近さを、マスの上に吹き出しで出す（端のマスでもはみ出さないように寄せる）
  const bubble = latest && (
    <span
      key={`${shownIdx}-${presses.length}`}
      className={`tsubo-bubble lv-${levelName(latest.level)}`}
      style={{
        left: `clamp(16%, ${pct(cx(latest.cell), VW)}, 84%)`,
        top: pct(cy(latest.cell) - ROW_H / 2, VH),
      }}
      aria-hidden
    >
      {levelText(latest.level)}
    </span>
  );

  // ---------- 盤の下の説明 ----------
  const notes: { key: string; text: string; className?: string }[] = [];
  const add = (key: string, text: string, className?: string) => notes.push({ key, text, className });
  if (hiding) {
    add("lead", t("game.tsubo.hide.lead"));
    if (full) add("full", t("game.tsubo.hide.full"), "tsubo-warn");
    else if (picks.length === KORI) add("ready", t("game.tsubo.hide.ready", { who: who(searcher) }));
    add("secret", t("game.tsubo.hide.secret", { who: who(searcher) }), "muted");
  } else if (over) {
    add(
      "done",
      foundCount === KORI
        ? t("game.tsubo.done.all", { who: who(searcher), n: presses.length })
        : t("game.tsubo.done.some", { who: who(searcher), n: presses.length, found: foundCount }),
      "tsubo-done",
    );
    add("revealed", t("game.tsubo.revealed"), "muted");
    if (missed.length > 0) add("missed", t("game.tsubo.missed"), "muted");
    if (byFound && shownIdx === idx) add("byFound", t("game.tsubo.byFound"), "muted");
    // 相手が次の回戦のこりを置いている間は、終わった回戦を見せながら待つ
    if (playing && !myTurn && shownIdx < idx && cur.kori === null) {
      add("waitHide", t("game.tsubo.wait.hide", { who: who(cur.customer) }));
    }
  } else if (r.kori === null) {
    add("waitHide", t("game.tsubo.wait.hide", { who: who(customer) }));
  } else {
    if (latest) add("latest", t("game.tsubo.latest", { who: who(searcher), level: levelText(latest.level) }));
    if (searching) {
      // 押し方の説明は、その回戦で最初に押すまでだけ出す
      if (presses.length === 0) add("lead", t("game.tsubo.search.lead"));
      if (shownIdx > 0) {
        add(
          "goal",
          Tsubo.foundOf(first) === KORI
            ? t("game.tsubo.goal.beat", { n: cap })
            : t("game.tsubo.goal.more", { found: Tsubo.foundOf(first) }),
          "tsubo-goal",
        );
      }
      if (presses.length === 0) add("noUndo", t("game.tsubo.search.noUndo"), "muted");
    } else {
      add("waitSearch", t("game.tsubo.wait.search", { who: who(searcher) }), "muted");
    }
    if (mine) add("mine", t("game.tsubo.mine", { who: who(searcher) }), "muted");
    if (lastHit > 0 && presses.slice(0, lastHit).some((p) => p.level > 0)) add("faded", t("game.tsubo.faded"), "muted");
  }

  return (
    <div className="tsubo">
      {/* 2 人の施術の結果。1 回戦の施術が始まってから出す */}
      {first.kori !== null && (
        <div className="scores tsubo-scores">
          {([me, other(me)] as Seat[]).map((seat) => {
            const sc = scoreOf(seat);
            return (
              <div key={seat} className={`score seat${seat} ${winner === seat ? "won" : ""}`}>
                <span className="tsubo-score-name muted small">
                  <span className="token dot" aria-hidden />
                  <span>{label(seat)}</span>
                </span>
                <span className="tsubo-score-value">
                  <strong className="num">{sc.text}</strong>
                  {sc.sub && <span className="muted small">{sc.sub}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="tsubo-head">
        {rounds.length > 1 ? (
          <div className="tsubo-tabs" role="tablist">
            {rounds.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === shownIdx}
                className={i === shownIdx ? "on" : ""}
                onClick={() => setPicked(i === idx && !gate ? null : i)}
              >
                {t("game.tsubo.round", { n: i + 1 })}
              </button>
            ))}
          </div>
        ) : (
          <span className="tsubo-round">{t("game.tsubo.round", { n: 1 })}</span>
        )}
        <span className="tsubo-roles muted small">
          {t("game.tsubo.roles", { customer: who(customer), searcher: who(searcher) })}
        </span>
      </div>

      <div className={`tsubo-back seat${me} ${hiding ? "hiding" : ""} ${searching ? "searching" : ""}`}>
        <svg className="tsubo-art" viewBox={`0 0 ${VW} ${VH}`} aria-hidden>
          <BackArt />
          {Array.from({ length: CELLS }, (_, cell) =>
            pressAt.has(cell) || (hiding && picks.includes(cell)) || (showKori && kori.includes(cell)) ? null : (
              <circle key={cell} className="tsubo-spot" cx={cx(cell)} cy={cy(cell)} r={1.05} />
            ),
          )}
          {/* 自分の置いたこり・終わった回戦のこり（ほぐれたものは指の跡の方で描く） */}
          {showKori &&
            kori.filter((k) => !pressAt.has(k)).map((k) => <Knot key={k} cell={k} className={over ? "missed" : "mine"} />)}
          {hiding && picks.map((k) => <Knot key={k} cell={k} className="placing" />)}
          {presses.map((p, i) =>
            p.level === 0 ? (
              <Loosened key={p.cell} cell={p.cell} latest={i === presses.length - 1} />
            ) : (
              <Print key={p.cell} cell={p.cell} level={p.level} faded={!over && i < lastHit} latest={i === presses.length - 1} />
            ),
          )}
          {pending !== null && searching && (
            <g transform={at(pending)}>
              <g className="tsubo-pending">
                <ellipse rx={3.3} ry={4} />
              </g>
            </g>
          )}
        </svg>
        <div
          className="tsubo-grid"
          role="grid"
          aria-label={t("game.tsubo.back")}
          style={{
            left: pct(GX, VW),
            top: pct(GY, VH),
            width: pct(GW, VW),
            height: pct(GH, VH),
            gridTemplateColumns: `repeat(${COLS / 2}, 1fr) ${pct(SPINE, GW)} repeat(${COLS / 2}, 1fr)`,
          }}
        >
          {Array.from({ length: CELLS }, (_, cell) => {
            const can = canTap(cell);
            const style: CSSProperties = {
              gridRow: rowOf(cell) + 1,
              gridColumn: colOf(cell) + 1 + (colOf(cell) >= COLS / 2 ? 1 : 0),
            };
            return (
              <button
                key={cell}
                type="button"
                role="gridcell"
                className={`tsubo-cell ${can ? "can" : ""}`}
                style={style}
                disabled={!can}
                aria-pressed={hiding ? picks.includes(cell) : undefined}
                aria-label={cellLabel(cell)}
                onClick={() => void tap(cell)}
              />
            );
          })}
        </div>
        {!hiding && bubble}
      </div>

      <div className="tsubo-meter">
        {hiding ? (
          <div className="tsubo-meter-item">
            <span className="muted small">{t("game.tsubo.hide.count")}</span>
            <span className="tsubo-minis">
              {Array.from({ length: KORI }, (_, i) => (
                <span key={i} className={i < picks.length ? "on" : "off"}>
                  <MiniKnot loose={false} />
                </span>
              ))}
            </span>
          </div>
        ) : (
          <>
            <div className="tsubo-meter-item">
              <span className="muted small">{t("game.tsubo.knots")}</span>
              <span className="tsubo-minis" role="img" aria-label={`${t("game.tsubo.knots")} ${KORI - foundCount}`}>
                {Array.from({ length: KORI }, (_, i) => (
                  <span key={i} className="on">
                    <MiniKnot loose={i < foundCount} />
                  </span>
                ))}
              </span>
            </div>
            <div className="tsubo-meter-item">
              <span className="muted small">{t("game.tsubo.presses")}</span>
              <span className="tsubo-count">
                <strong className="num">{presses.length}</strong>
                <span className="muted small">{t("game.tsubo.cap", { n: cap })}</span>
              </span>
            </div>
          </>
        )}
      </div>

      <p className="board-note tsubo-note">
        {notes.map((n) => (
          <span key={n.key} className={n.className}>
            {n.text}
          </span>
        ))}
        {searching && !over && (
          <span className="tsubo-left">{t("game.tsubo.left", { n: cap - presses.length })}</span>
        )}
      </p>

      {gate && (
        <button
          type="button"
          className="primary tsubo-next"
          onClick={() => {
            setAcked(doneCount);
            setPicked(null);
          }}
        >
          {t("game.tsubo.next")}
        </button>
      )}

      {!hiding && (
        <div className="tsubo-legend" aria-label={t("game.tsubo.legend")}>
          <span className="muted small tsubo-legend-title">{t("game.tsubo.legend")}</span>
          <ul>
            {([1, 2, 3, COLD] as Level[]).map((level) => (
              <li key={level} className={`lv-${levelName(level)}`}>
                <i aria-hidden />
                <b>{levelText(level)}</b>
                <span className="muted small">{t(`game.tsubo.dist.${levelName(level)}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
