import type { ActionKind, StageEvent, StageStrike } from "./types.ts";

/**
 * 攻防の技の並べ方と、寝技で上になる人の決め方。three を使わない小さなファイルにして、
 * 盤（FightBoard）からも読めるようにする（開き直したときに、記録から今の上下を求めるため）
 */

type Position = StageEvent["position"];

export const isDefense = (k: ActionKind) => k === "block" || k === "dodge";
/** 当たると位置関係が変わる技 */
export const isGrapple = (k: ActionKind) => k === "clinch" || k === "takedown" || k === "throw" || k === "submission";

/** 守りの技（block / dodge）のうち、となりの技の結果ですでに見せられるものを省く */
export function mergeStrikes(strikes: StageStrike[]): StageStrike[] {
  return strikes.filter((s, i) => {
    if (!isDefense(s.kind)) return true;
    const near = [strikes[i - 1], strikes[i + 1]].filter((x): x is StageStrike => !!x && x.by !== s.by && !isDefense(x.kind));
    return !near.some((x) => (s.kind === "block" ? x.result === "blocked" : x.result === "dodged"));
  });
}

/**
 * 攻防のあと、寝技で上になる人（buildExchange と同じ決め方）。
 * 位置関係を変えた組み技がタックル・投げならその人。技で移らずに寝技になったときは、最後に技を出した人
 */
export function topAfter(ev: Pick<StageEvent, "strikes" | "position">, position: Position, top: 0 | 1): 0 | 1 {
  if (ev.position === position) return top;
  const strikes = mergeStrikes(ev.strikes);
  const s = strikes.find((x) => x.result === "hit" && isGrapple(x.kind));
  if (s) return ev.position === "ground" && (s.kind === "takedown" || s.kind === "throw") ? s.by : top;
  return ev.position === "ground" ? (strikes[strikes.length - 1]?.by ?? 0) : top;
}
