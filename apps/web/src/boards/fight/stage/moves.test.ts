import { describe, expect, it } from "vitest";
import { bodyOf, NEUTRAL_STATS } from "./body.ts";
import { basePoseOf, buildExchange, distOf, mergeStrikes, sampleTrack, type ExchangeCtx, type Position, type Side } from "./moves.ts";
import { topAfter } from "./ground.ts";
import { newPose, P } from "./pose.ts";
import type { ActionKind, StageEvent, StageStrike, StyleId } from "./types.ts";

const KINDS: ActionKind[] = [
  "jab",
  "straight",
  "hook",
  "uppercut",
  "kick_high",
  "kick_mid",
  "kick_low",
  "spin_kick",
  "knee",
  "elbow",
  "push",
  "clinch",
  "takedown",
  "throw",
  "submission",
  "block",
  "dodge",
  "counter",
  "projectile",
  "swing",
  "perform",
  "heal",
  "vanish",
];
const RESULTS: StageStrike["result"][] = ["hit", "blocked", "dodged", "countered", "whiff"];
const POSITIONS: Position[] = ["standing", "clinch", "ground"];

function ctxOf(position: Position, styles: [StyleId, StyleId] = ["boxing", "judo"], top: 0 | 1 = 0): ExchangeCtx {
  const dist = distOf(position);
  const sides = styles.map((style, i) => {
    const d = bodyOf(NEUTRAL_STATS, style);
    const side: Side = { d, style, base: newPose(), mirror: i === 1 };
    const role = position === "ground" ? (i === top ? "top" : "bottom") : null;
    return { ...side, base: basePoseOf(side, position, role, dist) };
  }) as [Side, Side];
  return { sides, position, top, dist };
}

describe("1 回の攻防の段取り", () => {
  const pairs: [StyleId, StyleId][] = [
    ["boxing", "judo"],
    ["magician", "robot"],
    ["chef", "idol"],
    ["taichi", "nurse"],
  ];
  for (const styles of pairs)
    it(`${styles.join("・")}：どの技・結果・位置関係でも、壊れない動きを作る`, { timeout: 20000 }, () => {
      const out = newPose();
      for (const position of POSITIONS)
        for (const kind of KINDS)
          for (const result of RESULTS) {
            const ev: StageEvent = { id: 1, strikes: [{ by: 0, kind, result, damage: 10 }], position, ko: null };
            const ex = buildExchange(ev, ctxOf(position, styles));
            for (const f of ex.fx) {
              expect(f.at).toBeGreaterThanOrEqual(0);
              expect(f.until).toBeGreaterThanOrEqual(f.at);
              expect(f.until).toBeLessThanOrEqual(ex.end + 1e-9);
            }
            expect(ex.end).toBeGreaterThan(0.3);
            expect(ex.end).toBeLessThan(6);
            for (const c of ex.clips) {
              expect(c.start).toBeGreaterThanOrEqual(-1e-9);
              let prev = -Infinity;
              for (const k of c.track.keys) {
                expect(k.t).toBeGreaterThanOrEqual(prev);
                prev = k.t;
                for (const v of k.pose) expect(Number.isFinite(v)).toBe(true);
              }
              // 途中の時刻でも姿勢が数になる
              const w = sampleTrack(c.track, c.track.end * 0.37, out);
              expect(w).toBeGreaterThanOrEqual(0);
              expect(w).toBeLessThanOrEqual(1);
              for (const v of out) expect(Number.isFinite(v)).toBe(true);
            }
            for (const imp of ex.impacts) {
              expect(imp.at).toBeGreaterThan(0);
              expect(imp.at).toBeLessThan(ex.end);
            }
          }
    });

  it("当たった・防がれた技では、当たる瞬間を 1 回だけ知らせる。空振り・守りの技は受ける人の動きだけ", () => {
    const hit = buildExchange({ id: 1, strikes: [{ by: 1, kind: "hook", result: "hit", damage: 12 }], position: "standing", ko: null }, ctxOf("standing"));
    expect(hit.impacts).toHaveLength(1);
    expect(hit.impacts[0]).toMatchObject({ target: 0, by: 1, zone: "head", damage: 12 });
    expect(hit.clips.filter((c) => c.who === 1)).toHaveLength(1);
    expect(hit.clips.filter((c) => c.who === 0)).toHaveLength(1);
    const block = buildExchange({ id: 2, strikes: [{ by: 0, kind: "block", result: "hit", damage: 0 }], position: "standing", ko: null }, ctxOf("standing"));
    expect(block.impacts).toHaveLength(0);
  });

  it("タックルが決まると、攻めた人が上になって寝技に移る", () => {
    const ex = buildExchange({ id: 1, strikes: [{ by: 1, kind: "takedown", result: "hit", damage: 6 }], position: "ground", ko: null }, ctxOf("standing"));
    expect(ex.position).toBe("ground");
    expect(ex.top).toBe(1);
    expect(ex.dist).toBeCloseTo(distOf("ground"));
    expect(ex.switchAt).toBeGreaterThan(0.5);
    // 技の最後の姿勢は、新しい位置関係の構え（下の人はあお向け）
    const def = ex.clips.find((c) => c.who === 0)!;
    const last = def.track.keys[def.track.keys.length - 1]!;
    expect(last.w).toBe(1);
    expect(last.pose[P.hip + 1]).toBeLessThan(0.2);
  });

  it("技で移らなかったときは、最後にゆっくり位置関係を移す", () => {
    const ex = buildExchange({ id: 1, strikes: [{ by: 0, kind: "jab", result: "blocked", damage: 0 }], position: "clinch", ko: null }, ctxOf("standing"));
    expect(ex.position).toBe("clinch");
    expect(ex.clips.filter((c) => c.start >= ex.switchAt - 1)).not.toHaveLength(0);
    expect(ex.end).toBeGreaterThan(ex.switchAt);
  });

  it("KO では、倒れる人が倒れ終わってから攻防が終わる", () => {
    const ex = buildExchange({ id: 1, strikes: [{ by: 0, kind: "kick_high", result: "hit", damage: 30 }], position: "standing", ko: 1 }, ctxOf("standing"));
    expect(ex.ko?.who).toBe(1);
    expect(ex.ko!.downAt).toBeGreaterThan(ex.ko!.at);
    expect(ex.end).toBeGreaterThan(ex.ko!.downAt);
    const fall = ex.clips.filter((c) => c.who === 1).at(-1)!;
    const last = fall.track.keys[fall.track.keys.length - 1]!;
    expect(last.pose[P.hip + 1]).toBeLessThan(0.2);
  });

  it("返された技のあとに返し技が続くときは、返し技を 2 回見せない", () => {
    const strikes: StageStrike[] = [
      { by: 0, kind: "jab", result: "countered", damage: 0 },
      { by: 1, kind: "counter", result: "hit", damage: 9 },
    ];
    const ex = buildExchange({ id: 1, strikes, position: "standing", ko: null }, ctxOf("standing"));
    expect(ex.impacts.filter((i) => i.target === 0)).toHaveLength(1);
    // 続きがないときは、受けた人が返し技を出して当てる
    const alone = buildExchange({ id: 2, strikes: [strikes[0]!], position: "standing", ko: null }, ctxOf("standing"));
    expect(alone.impacts).toHaveLength(1);
    expect(alone.impacts[0]).toMatchObject({ target: 0, by: 1, kind: "counter" });
  });

  it("となりの技の結果で見せられる守りの技は省く", () => {
    const strikes: StageStrike[] = [
      { by: 0, kind: "straight", result: "blocked", damage: 0 },
      { by: 1, kind: "block", result: "hit", damage: 0 },
      { by: 1, kind: "dodge", result: "hit", damage: 0 },
    ];
    expect(mergeStrikes(strikes).map((s) => s.kind)).toEqual(["straight", "dodge"]);
  });

  it("腕の長い人どうしは少し離れ、手を前へ出す構えどうしでも手が重ならない", () => {
    const sidesOf = (speed: number, styles: [StyleId, StyleId]) =>
      styles.map((style) => {
        const d = bodyOf({ ...NEUTRAL_STATS, speed }, style);
        const side: Side = { d, style, base: newPose() };
        return { ...side, base: basePoseOf(side, "standing", null, 1) };
      }) as [Side, Side];
    expect(distOf("standing", sidesOf(8, ["boxing", "boxing"]))).toBeGreaterThan(distOf("standing", sidesOf(2, ["boxing", "boxing"])));
    // 柔道どうし（両手を前へ出す）は、ボクシングどうしより離れる
    expect(distOf("standing", sidesOf(5, ["judo", "judo"]))).toBeGreaterThan(distOf("standing", sidesOf(5, ["boxing", "boxing"])));
    expect(distOf("clinch")).toBeLessThan(distOf("standing"));
  });
});

describe("寝技で上になる人（topAfter）", () => {
  it("攻防の再生（buildExchange）が決める上下と、どの技・結果・位置の組み合わせでも同じ", () => {
    for (const from of POSITIONS)
      for (const to of POSITIONS)
        for (const top of [0, 1] as const)
          for (const a of KINDS)
            for (const result of RESULTS) {
              const strikes: StageStrike[] = [
                { by: 1, kind: "jab", result: "blocked", damage: 0 },
                { by: 0, kind: a, result, damage: 5 },
              ];
              const ev: StageEvent = { id: 1, strikes, position: to, ko: null };
              expect(topAfter(ev, from, top), `${from}→${to} ${a} ${result} top=${top}`).toBe(buildExchange(ev, ctxOf(from, undefined, top)).top);
            }
  });

  it("タックル・投げで寝技になれば、その人が上", () => {
    const ev = { strikes: [{ by: 1 as const, kind: "takedown" as const, result: "hit" as const, damage: 6 }], position: "ground" as const };
    expect(topAfter(ev, "standing", 0)).toBe(1);
    // 寝技の中では上下は入れかわらない
    expect(topAfter(ev, "ground", 0)).toBe(0);
  });
});
