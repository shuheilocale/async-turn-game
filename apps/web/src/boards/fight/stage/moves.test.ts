import { describe, expect, it } from "vitest";
import { bodyOf, NEUTRAL_STATS } from "./body.ts";
import { basePoseOf, buildExchange, distOf, mergeStrikes, sampleTrack, zoneOf, type ExchangeCtx, type Position, type Side } from "./moves.ts";
import { kendoCutOf } from "./signature.ts";
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
    ["ninja", "tuktuk"],
    ["stuntman", "salaryman"],
    ["bubbletea", "robot"],
    ["kendo", "luchador"],
    ["firefighter", "dj"],
    ["investor", "dino"],
    ["luchador", "kendo"],
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

describe("剣道家・ルチャドール・消防士・DJ・投資家・恐竜の着ぐるみの決め技", () => {
  const one = (by: 0 | 1, kind: ActionKind, result: StageStrike["result"] = "hit", extra: Partial<StageStrike> = {}): StageStrike => ({ by, kind, result, damage: 8, ...extra });
  const play = (styles: [StyleId, StyleId], strikes: StageStrike[], position: Position = "standing", from: Position = "standing") =>
    buildExchange({ id: 1, strikes, position, ko: null }, ctxOf(from, styles));
  /** その人の技のキーで、重みの大きいもののうち、ある値がいちばん大きい（小さい）もの */
  const keysOf = (ex: ReturnType<typeof play>, who: 0 | 1) => ex.clips.filter((c) => c.who === who).flatMap((c) => c.track.keys.filter((k) => k.w > 0.5));
  const most = (ex: ReturnType<typeof play>, who: 0 | 1, at: number) => Math.max(...keysOf(ex, who).map((k) => k.pose[at]!));
  const least = (ex: ReturnType<typeof play>, who: 0 | 1, at: number) => Math.min(...keysOf(ex, who).map((k) => k.pose[at]!));

  it("剣道家の振る技は、相手の攻撃を下げる技を小手、守り・スタミナを下げる技を胴、ほかは面として見せる", () => {
    expect(kendoCutOf({ by: 0, effects: [{ who: 1, stat: "power", dir: -1 }] })).toBe("kote");
    expect(kendoCutOf({ by: 0, effects: [{ who: 1, stat: "guard", dir: -1 }] })).toBe("do");
    expect(kendoCutOf({ by: 1, effects: [{ who: 0, stat: "stamina", dir: -1 }] })).toBe("do");
    expect(kendoCutOf({ by: 0 })).toBe("men");
    expect(kendoCutOf(undefined)).toBe("men");
    // 技の ID があれば、外れて効果が付かなくてもその技で描く
    expect(kendoCutOf({ by: 0, act: "kote" })).toBe("kote");
    expect(kendoCutOf({ by: 0, act: "do" })).toBe("do");
    // 面は頭、小手・胴は胴に当たる
    expect(zoneOf("swing", "kendo")).toBe("head");
    expect(zoneOf("swing", "kendo", { by: 0, effects: [{ who: 1, stat: "guard", dir: -1 }] })).toBe("body");
    const men = play(["kendo", "boxing"], [one(0, "swing")]);
    expect(men.impacts[0]!.zone).toBe("head");
    expect(men.clips[0]!.limb?.part).toBe("prop");
    // 面は竹刀を頭の上へ振りかぶる（手が頭より高く上がる）
    expect(Math.max(...men.clips[0]!.track.keys.map((k) => k.pose[P.hand + 4]!))).toBeGreaterThan(0.45);
    // 突きの軌跡は竹刀の先
    expect(play(["kendo", "boxing"], [one(0, "straight")]).clips[0]!.limb?.part).toBe("prop");
  });

  it("竹刀を構える人がいると、剣先が相手に届かない間合いまで離れる", () => {
    const sides = (styles: [StyleId, StyleId]) =>
      styles.map((style) => {
        const d = bodyOf(NEUTRAL_STATS, style);
        const side: Side = { d, style, base: newPose() };
        return { ...side, base: basePoseOf(side, "standing", null, 1) };
      }) as [Side, Side];
    expect(distOf("standing", sides(["kendo", "boxing"]))).toBeGreaterThan(distOf("standing", sides(["boxing", "boxing"])) + 0.3);
  });

  it("ルチャドールのチョップは胸に当たり、ドロップキックは高く跳んで両足で蹴り、背中から落ちる", () => {
    const chop = play(["luchador", "boxing"], [one(0, "hook")]);
    expect(chop.impacts[0]!.zone).toBe("body");
    expect(chop.clips[0]!.limb).toMatchObject({ part: "hand", side: 1 });
    const kick = play(["luchador", "boxing"], [one(0, "kick_high")]);
    const karate = play(["karate", "boxing"], [one(0, "kick_high")]);
    expect(most(kick, 0, P.hip + 1)).toBeGreaterThan(most(karate, 0, P.hip + 1) + 0.15);
    expect(least(kick, 0, P.hip + 1)).toBeLessThan(0.25);
  });

  it("トペ・スイシーダとウラカン・ラナが決まると、ルチャドールが上になって寝技に移る", () => {
    for (const kind of ["takedown", "throw"] as const) {
      const ex = play(["luchador", "boxing"], [one(0, kind)], "ground");
      expect(ex.position).toBe("ground");
      expect(ex.top).toBe(0);
    }
    // トペは頭から水平に飛び込む（腰を前へ倒しきる）
    expect(most(play(["luchador", "boxing"], [one(0, "takedown", "dodged")]), 0, P.hipRot)).toBeGreaterThan(1.2);
  });

  it("消防士のファイアーマンズキャリー：かつがれた人は相手の肩の高さまで浮き、下ろされてあお向けになる", () => {
    const ex = play(["firefighter", "boxing"], [one(0, "throw")], "ground");
    expect(ex.position).toBe("ground");
    expect(most(ex, 1, P.hip + 1)).toBeGreaterThan(1.3);
    const def = ex.clips.find((c) => c.who === 1)!;
    expect(def.track.keys[def.track.keys.length - 1]!.pose[P.hip + 1]!).toBeLessThan(0.2);
    // ほかの人の投げでは浮かない
    expect(most(play(["judo", "boxing"], [one(0, "throw")], "ground"), 1, P.hip + 1)).toBeLessThan(1.2);
  });

  it("消防士の体当たりは大きく踏み込んで土ぼこりを立てる", () => {
    const ex = play(["firefighter", "boxing"], [one(0, "push")]);
    expect(ex.fx.some((f) => f.type === "dust")).toBe(true);
    const c = ex.clips[0]!;
    expect(Math.max(...c.track.keys.map((k) => k.pose[P.hip + 2]!)) - c.track.keys[0]!.pose[P.hip + 2]!).toBeGreaterThan(0.4);
  });

  it("DJ はヘッドホンで、恐竜はおなかで受ける（ヘッドホンを耳に当てる・もふっとした綿）", () => {
    expect(play(["boxing", "dj"], [one(0, "straight", "blocked")]).fx.find((f) => f.type === "phones")).toMatchObject({ who: 1 });
    expect(play(["dj", "boxing"], [one(0, "block")]).fx.some((f) => f.type === "phones")).toBe(true);
    expect(play(["boxing", "dino"], [one(0, "straight", "blocked")]).fx.find((f) => f.type === "fluff")).toMatchObject({ who: 1 });
    // 下段の蹴りはすねで受ける
    expect(play(["boxing", "dj"], [one(0, "kick_low", "blocked")]).fx.some((f) => f.type === "phones")).toBe(false);
  });

  it("投資家はすっと身を引いてかわす（背すじを伸ばしたまま、大きく下がる）", () => {
    const cases: [ReturnType<typeof play>, 0 | 1][] = [
      [play(["boxing", "investor"], [one(0, "straight", "dodged")]), 1],
      [play(["investor", "boxing"], [one(0, "dodge")]), 0],
    ];
    for (const [ex, who] of cases) {
      const c = ex.clips.filter((x) => x.who === who).at(-1)!;
      const away = c.track.keys.find((k) => k.w === 1)!;
      expect(away.pose[P.hip + 2]!).toBeLessThan(c.track.keys[0]!.pose[P.hip + 2]! - 0.2);
      expect(away.pose[P.spine]!).toBeLessThanOrEqual(c.track.keys[0]!.pose[P.spine]! + 1e-9);
    }
  });

  it("恐竜のしっぽはくるっと回って胴を払い（軌跡はしっぽの先）、かぷっはフードの口でかむ", () => {
    const tail = play(["dino", "boxing"], [one(0, "swing")]);
    expect(tail.impacts[0]!.zone).toBe("body");
    expect(tail.clips[0]!.limb?.part).toBe("prop");
    expect(tail.fx.some((f) => f.type === "tail")).toBe(true);
    const y0 = tail.clips[0]!.track.keys[0]!.pose[P.hipRot + 1]!;
    expect(least(tail, 0, P.hipRot + 1)).toBeLessThan(y0 - Math.PI * 1.5);
    expect(play(["dino", "boxing"], [one(0, "clinch")], "clinch").fx.some((f) => f.type === "chomp")).toBe(true);
    const press = play(["dino", "boxing"], [one(0, "takedown")], "ground");
    expect(press.top).toBe(0);
    expect(press.fx.some((f) => f.type === "fluff")).toBe(true);
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
