import type { FighterStageProps } from "./types.ts";

/**
 * 仮の舞台（3D の担当が本物に差し替える）。ルール・画面の担当は、これを使って画面の流れを作れる。
 * 本物は three を dynamic import して 3D で描き、WebGL が使えなければ 2D の代わりを出す
 */
export function FighterStage({ fighters, mode, focus = 0, className = "" }: FighterStageProps) {
  const shown = mode === "custom" ? [fighters[focus]] : fighters;
  return (
    <div className={`fighter-stage-placeholder ${className}`} style={{ aspectRatio: "4 / 3", display: "grid", placeItems: "center" }}>
      {shown.map((f, i) => (
        <span key={i}>{f ? `${f.style} (${f.stats.power}/${f.stats.guard}/${f.stats.speed}/${f.stats.stamina})` : "?"}</span>
      ))}
    </div>
  );
}
