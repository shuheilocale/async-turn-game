import type { CSSProperties } from "react";
import { Treasure, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import "./TreasureBoard.css";

const { SIZE, MAX_MOVES, DIRS } = Treasure;
type Dir = Treasure.Dir;

/*
 * マスの上に重ねる SVG の座標。1 マスを 10 とし、マスの中心を原点にして描いた絵を並べる。
 * マスの間のすき間（2px）のぶんだけ実際の位置とずれるが、1px 未満なので気にしない
 */
const U = 10;
const centerOf = (cell: number) => ({ x: (cell % SIZE) * U + U / 2, y: Math.floor(cell / SIZE) * U + U / 2 });
const ANGLE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };
const VEC: Record<Dir, [number, number]> = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
const at = (cell: number, angle = 0) => {
  const { x, y } = centerOf(cell);
  return `translate(${x} ${y})${angle ? ` rotate(${angle})` : ""}`;
};

/** 岩：でこぼこした灰色の石 */
function Rock({ cell, className = "" }: { cell: number; className?: string }) {
  return (
    <g className={`treasure-rock ${className}`} transform={at(cell)}>
      <path className="body" d="M-3.3 2.4-2.7-.9-.8-2.8 1.6-2.7 3.4-.6 3.1 2.4Z" />
      <path className="shine" d="M-1.7-.9-.4-1.9" />
    </g>
  );
}

/** 宝：横から見た宝石。マスの中心を原点に描く */
const GEM = (
  <>
    <path className="body" d="M-1.9-2.4H1.9L3.3-.7 0 3.2-3.3-.7Z" />
    <path className="cut" d="M-3.3-.7H3.3M-.9-2.4-1.5-.7 0 3.2 1.5-.7.9-2.4" />
  </>
);

/** 自分にだけ見えているものを囲む点線の枠 */
const SecretFrame = ({ cell }: { cell: number }) => (
  <rect className="treasure-secret" transform={at(cell)} x={-4.2} y={-4.2} width={8.4} height={8.4} rx={1.6} />
);

/**
 * 足あとの矢印。進む向きの右側へ少しずらして、行って戻った矢印が重ならないようにする。
 * ぶつかったときは、マスの境目で止まる短い矢印と、行き止まりの線
 */
function StepArrow({ from, dir, bumped, className }: { from: number; dir: Dir; bumped: boolean; className: string }) {
  return (
    <g className={`treasure-step ${bumped ? "bumped" : ""} ${className}`} transform={at(from, ANGLE[dir])}>
      {bumped ? <path d="M2.8 1H4M3.2 0 4.2 1 3.2 2M5 -.9V2.9" /> : <path d="M2.8 1H7M5.8-.2 7 1 5.8 2.2" />}
    </g>
  );
}

/** マスをタップすると、そこへ動かした影が出る。動かせるのはコマの上下左右のマスだけ */
export function TreasureBoard({ state, you, names, interactive, selected, onSelect }: BoardProps) {
  const { t } = useI18n();
  const s = state as Treasure.TreasureView;
  const sel = selected as Treasure.TreasureMove | null;
  const finished = s.result !== null;
  const found = new Set(s.found);
  const isRock = (cell: number) => s.rocks.includes(cell);

  // 動かせる先のマスと、その向き
  const targets = new Map<number, Dir>();
  if (interactive && !finished) {
    for (const dir of DIRS) {
      const to = Treasure.neighbor(s.piece, dir);
      if (to !== null) targets.set(to, dir);
    }
  }
  const selTo = sel ? Treasure.neighbor(s.piece, sel.dir) : null;
  const willBump = selTo !== null && isRock(selTo);

  const last = s.steps.at(-1) ?? null;
  const who = (seat: Seat) => (seat === you ? t("game.treasure.you") : t("game.treasure.who", { name: names[seat] }));
  const dirName = (dir: Dir) => t(`game.treasure.dir.${dir}`);
  // 自分にだけ見えているもの。終局後は全部見せるので、点線の枠は付けない
  const secretTreasure = !finished && you === 0 && s.treasure !== null;
  const secretRocks = !finished && you === 1 ? s.rocks.filter((r) => !found.has(r)) : [];
  const hasSecret = secretTreasure || secretRocks.length > 0;
  const cleared = s.result === "cleared";
  // 「あと n 手」の数字だけ大きくする（語順は言語ごとに違うので、文の中の位置で分ける）
  const [leftBefore, leftAfter] = t("game.treasure.left", { n: "\u0000" }).split("\u0000");

  const cellLabel = (i: number) => {
    const parts = [t("game.treasure.cell", { row: Math.floor(i / SIZE) + 1, col: (i % SIZE) + 1 })];
    if (i === s.start) parts.push(t("game.treasure.start"));
    if (i === s.piece) parts.push(t("game.treasure.piece"));
    if (i === s.treasure) parts.push(t("game.treasure.treasure"));
    if (isRock(i)) parts.push(t("game.treasure.rock"));
    const dir = targets.get(i);
    if (dir) parts.push(t("game.treasure.moveTo", { dir: dirName(dir) }));
    return parts.join(" ");
  };

  const nudge = last?.bumped ? VEC[last.dir] : null;

  return (
    <div className="treasure stack-sm">
      <div className={`grid-board treasure-grid ${you === null ? "" : `seat${you}`}`} role="grid">
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const dir = targets.get(i);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={["cell", dir && "can", dir && sel?.dir === dir && "picked"].filter(Boolean).join(" ")}
              disabled={!dir}
              onClick={() => dir && onSelect({ dir })}
              aria-label={cellLabel(i)}
              aria-pressed={dir ? sel?.dir === dir : undefined}
            />
          );
        })}

        {/* ここから下は飾り。タップはその下のマスに通す */}
        <svg className="treasure-layer" viewBox={`0 0 ${SIZE * U} ${SIZE * U}`} aria-hidden>
          {s.rocks.map((r) => {
            // いまぶつかった岩は揺らす。同じ岩にまたぶつかっても揺れるよう、key を変える
            const hit = last?.bumped && Treasure.neighbor(last.from, last.dir) === r;
            return (
              <Rock
                key={hit ? `${r}-${s.steps.length}` : r}
                cell={r}
                className={[found.has(r) && "found", hit && "hit"].filter(Boolean).join(" ")}
              />
            );
          })}
          {s.treasure !== null && !cleared && (
            <g className="treasure-gem" transform={at(s.treasure)}>
              {GEM}
            </g>
          )}
          {secretRocks.map((r) => (
            <SecretFrame key={r} cell={r} />
          ))}
          {secretTreasure && <SecretFrame cell={s.treasure!} />}

          {s.steps.map((st, n) => (
            <g key={n} className={`seat${st.seat}`}>
              <StepArrow {...st} className={n === s.steps.length - 1 ? "latest" : ""} />
            </g>
          ))}
          {/* スタートの文字は足あとの上に。ふちどりで、下を通る矢印と重なっても読めるようにする */}
          <text className="treasure-start" x={centerOf(s.start).x} y={centerOf(s.start).y + 4.1}>
            {t("game.treasure.start")}
          </text>

          {/* 選んだ手の影 */}
          {sel && (
            <g className={`seat${you ?? 0}`}>
              <StepArrow from={s.piece} dir={sel.dir} bumped={willBump} className="ghost" />
            </g>
          )}
          {sel && selTo !== null && !willBump && (
            <circle className="treasure-piece-body ghost" cx={centerOf(selTo).x} cy={centerOf(selTo).y} r={2.5} />
          )}

          {/* コマは位置が変わるとすべるように動く。ぶつかったときは岩の方へ少し寄って戻る */}
          <g className="treasure-piece" style={{ transform: `translate(${centerOf(s.piece).x}px, ${centerOf(s.piece).y}px)` }}>
            {cleared && <circle className="treasure-glow" r={3.6} />}
            <g
              key={s.steps.length}
              className={nudge ? "nudge" : ""}
              style={nudge ? ({ "--nx": `${nudge[0] * 1.6}px`, "--ny": `${nudge[1] * 1.6}px` } as CSSProperties) : undefined}
            >
              <circle className="treasure-piece-body" r={2.5} />
              <circle className="treasure-piece-dot" r={0.9} />
            </g>
            {/* 宝に着いたら、コマの上に宝を乗せる */}
            {cleared && <g className="treasure-gem got">{GEM}</g>}
          </g>
        </svg>
      </div>

      <p className="board-note">
        {last?.bumped && <span className="treasure-bumped">{t("game.treasure.bumped")}</span>}
        {last && (
          <span>{t(last.bumped ? "game.treasure.tried" : "game.treasure.moved", { who: who(last.seat), dir: dirName(last.dir) })}</span>
        )}
        {finished ? (
          <strong className={cleared ? "treasure-result cleared" : "treasure-result"}>
            {cleared
              ? t("game.treasure.cleared", { n: MAX_MOVES - s.movesLeft })
              : t("game.treasure.failed", { max: MAX_MOVES })}
          </strong>
        ) : (
          <span className="treasure-left">
            {leftBefore}
            <b className="num">{s.movesLeft}</b>
            {leftAfter}
          </span>
        )}
        <span
          className="treasure-pips"
          role="img"
          aria-label={t("game.treasure.used", { n: MAX_MOVES - s.movesLeft, max: MAX_MOVES })}
        >
          {Array.from({ length: MAX_MOVES }, (_, n) => {
            const st = s.steps[n];
            return <i key={n} className={st ? `seat${st.seat} ${st.bumped ? "bumped" : "used"}` : ""} />;
          })}
        </span>
        {interactive && !finished && <span>{t(willBump ? "game.treasure.willBump" : "game.treasure.pick")}</span>}
        {finished ? (
          <span className="muted">{t("game.treasure.revealed")}</span>
        ) : (
          <span className="muted">
            {you === null
              ? t("game.treasure.roleOf", { name0: names[0], name1: names[1] })
              : t(`game.treasure.role${you}`)}
          </span>
        )}
        {hasSecret && (
          <span className={`treasure-legend muted seat${you}`}>
            <i aria-hidden />
            {t("game.treasure.secret")}
          </span>
        )}
      </p>
    </div>
  );
}
