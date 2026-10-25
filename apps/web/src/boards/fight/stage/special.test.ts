import { describe, expect, it } from "vitest";
import { bodyOf, NEUTRAL_STATS } from "./body.ts";
import { basePoseOf, buildExchange, distOf, type ExchangeCtx, type Position, type Side } from "./moves.ts";
import { newPose, P } from "./pose.ts";
import { healOf, performOf, ROCKET_RETURN, SHOT_FLIGHT, shotOf, VANISH_GONE } from "./special.ts";
import type { ActionKind, StageEvent, StageStrike, StyleId } from "./types.ts";

function ctxOf(styles: [StyleId, StyleId], position: Position = "standing"): ExchangeCtx {
  const dist = distOf(position);
  const sides = styles.map((style, i) => {
    const d = bodyOf(NEUTRAL_STATS, style);
    const side: Side = { d, style, base: newPose(), mirror: i === 1 };
    const role = position === "ground" ? (i === 0 ? "top" : "bottom") : null;
    return { ...side, base: basePoseOf(side, position, role, dist) };
  }) as [Side, Side];
  return { sides, position, top: 0, dist };
}

const play = (styles: [StyleId, StyleId], strikes: StageStrike[], position: Position = "standing") =>
  buildExchange({ id: 1, strikes, position, ko: null } satisfies StageEvent, ctxOf(styles, position));
const one = (by: 0 | 1, kind: ActionKind, result: StageStrike["result"] = "hit", extra: Partial<StageStrike> = {}): StageStrike => ({ by, kind, result, damage: 8, ...extra });

describe("持ち物・飛ぶもの・効果の決め方", () => {
  it("飛ばすものは、マジシャンがトランプ、ロボットがロケットパンチ、ほかは光の玉", () => {
    expect(shotOf("magician")).toBe("cards");
    expect(shotOf("robot")).toBe("rocket");
    for (const s of ["boxing", "nurse", "chef", null] as const) expect(shotOf(s)).toBe("orb");
  });

  it("見せる技・回復の形は、決めていないバックボーンでは既定の形", () => {
    expect(performOf("idol")).toBe("idol");
    expect(performOf("rapper")).toBe("rapper");
    expect(performOf("gamer")).toBe("gamer");
    expect(performOf("magician")).toBe("magician");
    expect(performOf("karate")).toBe("pose");
    expect(healOf("nurse")).toBe("nurse");
    expect(healOf("robot")).toBe("robot");
    expect(healOf("chef")).toBe("chef");
    expect(healOf("sumo")).toBe("glow");
  });
});

describe("飛ばす（projectile）", () => {
  it("飛ぶものは手を離れてから決まった時間で届き、そのときに当たる", () => {
    for (const [style, kind] of [
      ["magician", "cards"],
      ["robot", "rocket"],
      ["boxing", "orb"],
    ] as const) {
      const ex = play([style, "judo"], [one(0, "projectile")]);
      const shot = ex.fx.find((f) => f.type === "shot")!;
      expect(shot.shot).toBe(kind);
      expect(shot.who).toBe(0);
      expect(shot.target).toBe(1);
      expect(shot.until - shot.at).toBeCloseTo(SHOT_FLIGHT[kind]);
      expect(ex.impacts).toHaveLength(1);
      expect(ex.impacts[0]!.at).toBeCloseTo(shot.until);
    }
  });

  it("ロケットパンチは、届いてから腕に戻るまで手を外しておく", () => {
    const ex = play(["robot", "judo"], [one(0, "projectile")]);
    const shot = ex.fx.find((f) => f.type === "shot")!;
    const detach = ex.fx.find((f) => f.type === "detach")!;
    expect(detach.at).toBeCloseTo(shot.at);
    expect(detach.until).toBeCloseTo(shot.until + ROCKET_RETURN);
    expect(detach.side).toBe(1);
    // トランプは、ステッキを持たない左手で投げる
    expect(play(["magician", "judo"], [one(0, "projectile")]).fx.find((f) => f.type === "shot")!.side).toBe(0);
  });

  it("防がれた・かわされた結果も、飛ぶものに渡す", () => {
    for (const result of ["blocked", "dodged", "whiff"] as const) {
      const ex = play(["boxing", "judo"], [one(0, "projectile", result)]);
      expect(ex.fx.find((f) => f.type === "shot")!.result).toBe(result);
    }
  });
});

describe("振る（swing）", () => {
  it("持ち物のある人は持ち物の先、ない人は手の軌跡を見せる", () => {
    const chef = play(["chef", "judo"], [one(0, "swing")]);
    expect(chef.clips[0]!.limb?.part).toBe("prop");
    const boxer = play(["boxing", "judo"], [one(0, "swing")]);
    expect(boxer.clips[0]!.limb?.part).toBe("hand");
    expect(chef.impacts[0]!.zone).toBe("head");
  });
});

describe("見せる（perform）", () => {
  it("アイドルはウインクとハート、ラッパーは音符、ゲーマーは光の枠、マジシャンは手のひらの光、ほかはきらめき", () => {
    const types = (s: StyleId) => play([s, "judo"], [one(0, "perform")]).fx.map((f) => f.type);
    expect(types("idol")).toEqual(expect.arrayContaining(["wink", "hearts"]));
    expect(types("rapper")).toContain("notes");
    expect(types("gamer")).toContain("frame");
    expect(types("magician")).toContain("palm");
    expect(types("karate")).toContain("sparkle");
  });

  it("相手は少しひるむ（触れていないので、のけぞりは打撃より小さい）", () => {
    const perform = play(["idol", "judo"], [one(0, "perform")]);
    const jab = play(["idol", "judo"], [one(0, "jab")]);
    const lean = (ex: ReturnType<typeof play>) => {
      const c = ex.clips.find((x) => x.who === 1)!;
      return Math.min(...c.track.keys.map((k) => k.pose[P.neck]! * k.w));
    };
    expect(perform.clips.some((c) => c.who === 1)).toBe(true);
    expect(lean(perform)).toBeGreaterThan(lean(jab));
  });
});

describe("回復（heal）", () => {
  it("相手は受けず、回復した人の頭の上に +n を出す", () => {
    const ex = play(["nurse", "judo"], [one(0, "heal", "hit", { heal: 12, damage: 0 })]);
    expect(ex.impacts).toHaveLength(0);
    expect(ex.clips.every((c) => c.who === 0)).toBe(true);
    expect(ex.marks).toEqual([expect.objectContaining({ who: 0, heal: 12 })]);
    expect(ex.marks[0]!.at).toBeGreaterThan(0);
    expect(ex.marks[0]!.at).toBeLessThan(ex.end);
  });

  it("看護師は包帯を巻き（攻防の終わりまで）、ロボットは再起動し、料理人は味見をする", () => {
    const types = (s: StyleId) => play([s, "judo"], [one(0, "heal", "hit", { heal: 5 })]).fx;
    const nurse = play(["nurse", "judo"], [one(0, "heal", "hit", { heal: 5 })]);
    const bandage = nurse.fx.find((f) => f.type === "bandage")!;
    expect(bandage.until).toBeCloseTo(nurse.end);
    expect(types("robot").map((f) => f.type)).toContain("reboot");
    expect(types("chef").map((f) => f.type)).toEqual(expect.arrayContaining(["spoon", "steam"]));
    for (const s of ["nurse", "robot", "chef", "boxing"] as const) expect(types(s).map((f) => f.type)).toContain("heal");
  });

  it("強化・弱体の印を、決められた人の上に出す", () => {
    const ex = play(
      ["idol", "judo"],
      [
        one(0, "perform", "hit", {
          effects: [
            { who: 1, stat: "power", dir: -1 },
            { who: 0, stat: "speed", dir: 1 },
          ],
        }),
      ],
    );
    expect(ex.marks).toEqual([expect.objectContaining({ who: 1, stat: "power", dir: -1 }), expect.objectContaining({ who: 0, stat: "speed", dir: 1 })]);
    expect(ex.marks[0]!.at).toBeGreaterThanOrEqual(ex.impacts[0]!.at);
  });
});

describe("消えて現れる（vanish）", () => {
  it("煙とともに消え、少し下がった所に煙とともに現れ、最後は元の構えに戻る", () => {
    const ex = play(["magician", "judo"], [one(0, "vanish")]);
    const [smoke1, smoke2] = ex.fx.filter((f) => f.type === "smoke");
    const hide = ex.fx.find((f) => f.type === "hide")!;
    expect(smoke1!.at).toBeLessThanOrEqual(hide.at);
    expect(smoke2!.at).toBeLessThanOrEqual(hide.until);
    expect(smoke2!.at).toBeGreaterThan(hide.at);
    expect(ex.impacts).toHaveLength(0);
    const c = ex.clips[0]!;
    // 消えているあいだに後ろへ動き、最後は構えに戻る
    const mid = c.track.keys.filter((k) => k.t > hide.at - c.start && k.t <= hide.until - c.start + 1e-9 && k.w === 1).at(-1)!;
    expect(mid.pose[P.hip + 2]!).toBeLessThan(c.track.keys[0]!.pose[P.hip + 2]! - 0.2);
    expect(c.track.keys[c.track.keys.length - 1]!.w).toBe(0);
  });

  it("となりの相手の技がかわされたときは、その技が当たる瞬間に消えてかわす（2 回見せない）", () => {
    const ex = play(["boxing", "magician"], [one(0, "straight", "dodged"), one(1, "vanish")]);
    const hides = ex.fx.filter((f) => f.type === "hide");
    expect(hides).toHaveLength(1);
    expect(hides[0]!.who).toBe(1);
    // 相手の拳が届くころには、もう消えている
    const attack = ex.clips.find((c) => c.who === 0)!;
    const vanish = ex.clips.find((c) => c.who === 1)!;
    expect(vanish.start + VANISH_GONE).toBeLessThan(attack.start + 0.3);
    expect(hides[0]!.until).toBeGreaterThan(attack.start + 0.3);
    expect(ex.clips.filter((c) => c.who === 1)).toHaveLength(1);
  });
});

describe("バックボーンらしい動き方", () => {
  it("ロボットの技は一定の速さで動き（ゆるめない）、太極拳の技はゆっくり", () => {
    const robot = play(["robot", "judo"], [one(0, "jab")]);
    expect(robot.clips[0]!.track.keys.slice(1).every((k) => k.ease === "linear")).toBe(true);
    const tai = play(["taichi", "judo"], [one(0, "straight")]);
    const kara = play(["karate", "judo"], [one(0, "straight")]);
    expect(tai.impacts[0]!.at).toBeGreaterThan(kara.impacts[0]!.at + 0.04);
  });

  it("寝技の中でも、新しい技は壊れずに効果を出す", () => {
    for (const kind of ["projectile", "perform", "heal", "vanish"] as const) {
      const ex = play(["magician", "nurse"], [one(0, kind, "hit", { heal: 4 })], "ground");
      expect(ex.fx.length).toBeGreaterThan(0);
      expect(ex.position).toBe("ground");
    }
  });
});

describe("忍者・トゥクトゥク運転手・スタントマン・サラリーマン・タピオカ店員とロボットのレーザー", () => {
  /** その人の技の中で、腰がいちばん高いところ */
  const hipMax = (ex: ReturnType<typeof play>, who: 0 | 1) =>
    Math.max(...ex.clips.filter((c) => c.who === who).flatMap((c) => c.track.keys.filter((k) => k.w > 0.5).map((k) => k.pose[P.hip + 1]!)));

  it("飛ばすもの・見せる技・回復の形が、その人らしいものになる", () => {
    expect(shotOf("ninja")).toBe("shuriken");
    expect(shotOf("salaryman")).toBe("meishi");
    expect(shotOf("bubbletea")).toBe("pearls");
    expect(performOf("robot")).toBe("laser");
    expect(performOf("tuktuk")).toBe("horn");
    expect(performOf("salaryman")).toBe("tie");
    expect(performOf("bubbletea")).toBe("shaker");
    expect(healOf("bubbletea")).toBe("drink");
    for (const s of ["shuriken", "meishi", "pearls", "ice"] as const) expect(SHOT_FLIGHT[s]).toBeGreaterThan(0);
  });

  it("名刺は持ち物を持たない左手で、手裏剣とタピオカは右手で飛ばす", () => {
    const shot = (s: StyleId) => play([s, "judo"], [one(0, "projectile")]).fx.find((f) => f.type === "shot")!;
    expect(shot("salaryman")).toMatchObject({ shot: "meishi", side: 0 });
    expect(shot("ninja")).toMatchObject({ shot: "shuriken", side: 1 });
    expect(shot("bubbletea")).toMatchObject({ shot: "pearls", side: 1 });
  });

  it("タピオカ店員の飛ばす技は、強化・弱体が付いたら氷のかけら（氷多め）にする", () => {
    const fx = [{ who: 1 as const, stat: "speed" as const, dir: -1 as const }];
    expect(play(["bubbletea", "judo"], [one(0, "projectile", "hit", { effects: fx })]).fx.find((f) => f.type === "shot")!.shot).toBe("ice");
    // ほかの人の飛ばす技は、強化・弱体が付いても変えない
    expect(play(["ninja", "judo"], [one(0, "projectile", "hit", { effects: fx })]).fx.find((f) => f.type === "shot")!.shot).toBe("shuriken");
  });

  it("ロボットのレーザーは、光の線が届いた瞬間に当たる", () => {
    const ex = play(["robot", "judo"], [one(0, "perform", "hit", { damage: 18 })]);
    const laser = ex.fx.find((f) => f.type === "laser")!;
    expect(ex.impacts[0]!.at).toBeGreaterThan(laser.at);
    expect(ex.impacts[0]!.at).toBeLessThan(laser.until);
    expect(ex.clips[0]!.track.keys.slice(1).every((k) => k.ease === "linear")).toBe(true);
  });

  it("忍者の分身：相手の打撃をかわすと残像を 1 回だけ残し、後ろへ跳ぶ（分身の dodge は重ねて見せない）", () => {
    const ex = play(["boxing", "ninja"], [one(0, "straight", "dodged"), one(1, "dodge")]);
    const ghosts = ex.fx.filter((f) => f.type === "ghost");
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.who).toBe(1);
    const ninja = ex.clips.filter((c) => c.who === 1);
    expect(ninja).toHaveLength(1);
    const away = ninja[0]!.track.keys.find((k) => k.w === 1)!;
    expect(away.pose[P.hip + 2]!).toBeLessThan(ninja[0]!.track.keys[0]!.pose[P.hip + 2]! - 0.15);
    // 1 人で出したかわし（見切り）でも残像を出す。ほかの人は出さない
    expect(play(["ninja", "boxing"], [one(0, "dodge")]).fx.some((f) => f.type === "ghost")).toBe(true);
    expect(play(["boxing", "karate"], [one(0, "straight", "dodged"), one(1, "dodge")]).fx.some((f) => f.type === "ghost")).toBe(false);
  });

  it("忍者の煙玉：かわされた技のすぐ後ろの vanish は、かわす動きとして見せる", () => {
    const ex = play(["boxing", "ninja"], [one(0, "straight", "dodged"), one(1, "vanish")]);
    expect(ex.fx.filter((f) => f.type === "hide" && f.who === 1)).toHaveLength(1);
    expect(ex.fx.some((f) => f.type === "smoke" && f.who === 1)).toBe(true);
  });

  it("サラリーマンはお辞儀をするようにかわす（上体を前へ深く倒す）", () => {
    const r = play(["boxing", "salaryman"], [one(0, "straight", "dodged")]).clips.find((c) => c.who === 1)!;
    const lean = (p: Float64Array) => p[P.hipRot]! + p[P.spine]!;
    expect(lean(r.track.keys.find((k) => k.w === 1)!.pose)).toBeGreaterThan(lean(r.track.keys[0]!.pose) + 0.6);
    const own = play(["salaryman", "boxing"], [one(0, "dodge")]).clips[0]!;
    expect(lean(own.track.keys.find((k) => k.w === 1)!.pose)).toBeGreaterThan(lean(own.track.keys[0]!.pose) + 0.6);
  });

  it("タピオカ店員は、上への技をトレイで受け、振る技ではストローに持ちかえてカップを左手へ移す", () => {
    expect(play(["boxing", "bubbletea"], [one(0, "straight", "blocked")]).fx.find((f) => f.type === "tray")).toMatchObject({ who: 1, side: 0 });
    expect(play(["bubbletea", "boxing"], [one(0, "block")]).fx.some((f) => f.type === "tray")).toBe(true);
    // 下段の蹴りはすねで受ける（トレイは出さない）
    expect(play(["boxing", "bubbletea"], [one(0, "kick_low", "blocked")]).fx.some((f) => f.type === "tray")).toBe(false);
    const swing = play(["bubbletea", "boxing"], [one(0, "swing")]);
    expect(swing.fx.find((f) => f.type === "form")?.form).toBe(1);
    expect(swing.fx.find((f) => f.type === "held")?.side).toBe(0);
    expect(play(["bubbletea", "boxing"], [one(0, "perform")]).fx.find((f) => f.type === "form")?.form).toBe(2);
  });

  it("トゥクトゥク運転手の突進は大きく踏み込み、土ぼこりを立てる。クラクションは音の波", () => {
    const reach = (s: StyleId) => {
      const c = play([s, "judo"], [one(0, "push")]).clips[0]!;
      return Math.max(...c.track.keys.map((k) => k.pose[P.hip + 2]!)) - c.track.keys[0]!.pose[P.hip + 2]!;
    };
    expect(reach("tuktuk")).toBeGreaterThan(reach("boxing") + 0.1);
    expect(play(["tuktuk", "judo"], [one(0, "push")]).fx.some((f) => f.type === "dust")).toBe(true);
    expect(play(["tuktuk", "judo"], [one(0, "takedown", "blocked")]).fx.some((f) => f.type === "dust")).toBe(true);
    expect(play(["tuktuk", "judo"], [one(0, "perform", "hit", { damage: 0 })]).fx.some((f) => f.type === "horn")).toBe(true);
  });

  it("スタントマンの蹴りは跳び上がって蹴り、KO で倒れるときは受け身を取って床に転がる", () => {
    for (const kind of ["kick_high", "spin_kick"] as const)
      expect(hipMax(play(["stuntman", "judo"], [one(0, kind)]), 0), kind).toBeGreaterThan(hipMax(play(["karate", "judo"], [one(0, kind)]), 0) + 0.08);
    const ex = buildExchange({ id: 1, strikes: [one(1, "straight", "hit", { damage: 30 })], position: "standing", ko: 0 }, ctxOf(["stuntman", "boxing"]));
    const fall = ex.clips.filter((c) => c.who === 0).at(-1)!;
    expect(fall.track.keys.length).toBeGreaterThan(5);
    expect(fall.track.keys[fall.track.keys.length - 1]!.pose[P.hip + 1]!).toBeLessThan(0.2);
  });
});
