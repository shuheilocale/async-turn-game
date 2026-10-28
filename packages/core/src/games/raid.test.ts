import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import { STYLE_IDS, type StyleId } from "./fight.ts";
import {
  actsFor,
  BOSS_COUNT,
  BOSS_IDS,
  bossMaxHp,
  CHARGE_MUL,
  firstPicker,
  GUARD_MUL,
  heroOf,
  intentDamage,
  MAX_ROUNDS,
  nextIntent,
  raid,
  resolve,
  ROLE_OF,
  type Act,
  type Battle,
  type RaidMove,
  type RaidState,
  type RaidView,
} from "./raid.ts";

/** 同じ種から同じ並びを返す乱数（mulberry32） */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const view = (s: RaidState, viewer: Seat | null, revealAll = false) => raid.viewState!(s, viewer, revealAll) as RaidView;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

/** 2 人がキャラを選んだところ */
function started(a: StyleId = "karate", b: StyleId = "muaythai", seed = 1): RaidState {
  let s = raid.initialState(seeded(seed));
  s = raid.applyMove(s, { type: "pick", style: a }, 0);
  return raid.applyMove(s, { type: "pick", style: b }, 1);
}

/** 今のラウンドを、2 人の行動で進める（番の順に指す） */
function playRound(s: RaidState, acts: [Act, Act]): RaidState {
  for (let i = 0; i < 2; i++) {
    const st = raid.status(s);
    if (st.kind !== "playing") return s;
    s = raid.applyMove(s, { type: "act", act: acts[st.turn] }, st.turn);
  }
  return s;
}

/** 決まった場面の 1 ラウンド（予告と体力を自由に決める） */
function battle(over: Partial<Battle> = {}): Battle {
  const s = started("karate", "sumo");
  return {
    heroes: s.heroes,
    bosses: ["monday", "rain", "traffic"],
    stage: 0,
    bossHp: bossMaxHp("monday", 0),
    bossRounds: 1,
    intent: { kind: "hit", target: 0 },
    effects: [],
    ...over,
  };
}

describe("raid", () => {
  it("キャラは先手 → 後手の順に選び、先に選んだキャラは相手に見える", () => {
    let s = raid.initialState(seeded(1));
    expect(raid.status(s)).toEqual({ kind: "playing", turn: 0 });
    expect(codeOf(() => raid.applyMove(s, { type: "pick", style: "karate" }, 1))).toBe("not_your_turn");
    expect(codeOf(() => raid.applyMove(s, { type: "pick", style: "nobody" as never }, 0))).toBe("raid_bad_style");
    s = raid.applyMove(s, { type: "pick", style: "nurse" }, 0);
    expect(view(s, 1).heroes[0]?.style).toBe("nurse");
    expect(view(s, 1).phase).toBe("pick");
    expect(s.intent).toBeNull();
    s = raid.applyMove(s, { type: "pick", style: "sumo" }, 1);
    expect(view(s, 0).phase).toBe("battle");
    // ボスとの最初のラウンドは、やさしい予告から
    expect(["hit", "sweep"]).toContain(s.intent?.kind);
    expect(s.bosses).toHaveLength(BOSS_COUNT);
    expect(new Set(s.bosses).size).toBe(BOSS_COUNT);
    for (const b of s.bosses) expect(BOSS_IDS).toContain(b);
  });

  it("キャラごとの持ち味：バックボーン・ファイトの振り分けから、体力・攻撃・受けるダメージ・待ち時間が決まる", () => {
    const sumo = heroOf("sumo");
    const ninja = heroOf("ninja");
    // 相撲は攻撃と防御が高く、忍者はすばやい（必殺技の待ち時間が短い）
    expect(sumo.atk).toBeGreaterThan(ninja.atk);
    expect(sumo.taken).toBeLessThan(ninja.taken);
    expect(ninja.cooldown).toBeLessThan(heroOf("bjj").cooldown + 1);
    expect(heroOf("nurse").special).toBe("heal");
    // どの役のキャラもいる
    const roles = new Set(STYLE_IDS.map((s) => ROLE_OF[heroOf(s).special]));
    expect([...roles].sort()).toEqual(["attack", "healer", "support", "tank"]);
    for (const style of STYLE_IDS) {
      const h = heroOf(style);
      expect(h.maxHp, style).toBeGreaterThan(80);
      expect(h.maxHp, style).toBeLessThan(130);
      expect(h.cooldown, style).toBeGreaterThanOrEqual(1);
    }
  });

  it("先に選ぶ人はラウンドごとに交代し、後に選んだ人がそのまま次を先に選ぶ（キャラを後に選んだ後手から）", () => {
    let s = started();
    const order: Seat[] = [];
    for (let i = 0; i < 6; i++) {
      const st = raid.status(s);
      if (st.kind !== "playing") break;
      order.push(st.turn);
      s = raid.applyMove(s, { type: "act", act: "guard" }, st.turn);
    }
    expect(order).toEqual([1, 0, 0, 1, 1, 0]);
    expect(firstPicker(0)).toBe(1);
    expect(firstPicker(1)).toBe(0);
  });

  it("先に選んだ行動は、もう 1 人が選ぶまで伏せる。そろったら記録で見える", () => {
    let s = started();
    s = raid.applyMove(s, { type: "act", act: "charge" }, 1);
    expect(view(s, 1).picks).toEqual([false, "charge"]);
    expect(view(s, 0).picks).toEqual([null, true]);
    expect(view(s, null).picks).toEqual([false, true]);
    expect(raid.viewMove!({ type: "act", act: "charge" }, 1, 0)).toEqual({ type: "act" });
    expect(raid.viewMove!({ type: "act", act: "charge" }, 1, 1)).toEqual({ type: "act", act: "charge" });
    // 種は画面に渡さない
    expect("seed" in view(s, 0)).toBe(false);
    s = raid.applyMove(s, { type: "act", act: "attack" }, 0);
    expect(s.history[0]!.acts).toEqual(["attack", "charge"]);
    expect(view(s, 0).picks).toEqual([null, false]);
  });

  it("守ると受けるダメージが減り、かばうと相棒の分も引き受ける", () => {
    const b = battle({ intent: { kind: "smash", target: 0 } });
    const open = resolve(b, ["attack", "attack"], 1).log;
    const guarded = resolve(b, ["guard", "attack"], 1).log;
    const covered = resolve(b, ["attack", "cover"], 1).log;
    expect(open.taken[0]).toBeGreaterThan(0);
    expect(guarded.taken[0]).toBe(Math.round(open.taken[0] * GUARD_MUL));
    expect(covered.taken[0]).toBe(0);
    expect(covered.taken[1]).toBeGreaterThan(0);
    // 防がずに受ける目安は、画面に出す数と同じ
    const shown = intentDamage({ ...b, heroes: b.heroes }, 0);
    expect(open.taken[0]).toBe(Math.min(b.heroes[0]!.hp, shown));
    expect(intentDamage({ ...b, heroes: b.heroes }, 1)).toBe(0);
  });

  it("ためると次の攻撃が強くなる。ボスが守りを固めるとダメージが通りにくい", () => {
    const b = battle({ intent: { kind: "guard" } });
    const plain = resolve(battle(), ["attack", "guard"], 1).log.dealt[0];
    const charged = resolve(b, ["charge", "guard"], 1);
    expect(charged.next.heroes[0]!.charged).toBe(true);
    const after = resolve({ ...charged.next, intent: { kind: "hit", target: 1 } }, ["attack", "guard"], 2).log;
    expect(after.dealt[0]).toBe(Math.round(plain * CHARGE_MUL));
    expect(resolve(b, ["attack", "guard"], 1).log.dealt[0]).toBeLessThan(plain);
  });

  it("必殺技は使うと待ち時間ができ、そのあいだは選べない", () => {
    let s = started("karate", "sumo");
    s = playRound(s, ["special", "guard"]);
    expect(s.heroes[0]!.cooldown).toBe(heroOf("karate").cooldown);
    expect(actsFor(s.heroes, 0)).not.toContain("special");
    const st = raid.status(s);
    if (st.kind === "playing" && st.turn === 0) {
      expect(codeOf(() => raid.applyMove(s, { type: "act", act: "special" }, 0))).toBe("raid_not_ready");
    }
    for (let i = 0; i < heroOf("karate").cooldown; i++) s = playRound(s, ["guard", "guard"]);
    if (raid.status(s).kind === "playing") expect(actsFor(s.heroes, 0)).toContain("special");
  });

  it("回復の必殺技は、倒れている相棒を起こせる", () => {
    const base = battle();
    const heroes = [{ ...base.heroes[0]!, hp: 0 }, { ...started("karate", "nurse").heroes[1]! }] as Battle["heroes"];
    const b: Battle = { ...base, heroes, intent: { kind: "hit", target: 1 } };
    expect(actsFor(heroes, 0)).toEqual(["cheer"]);
    const { log } = resolve(b, ["cheer", "special"], 1);
    expect(log.healed[0]).toBeGreaterThan(0);
    expect(log.hp[0]).toBeGreaterThan(0);
  });

  it("ボスの行動を止める必殺技は、ためを止め、次の大技も来ない", () => {
    let s = started("gamer", "sumo");
    s = { ...s, bossRounds: 2, intent: { kind: "charge" } };
    // 後手から選ぶラウンド 0
    s = raid.applyMove(s, { type: "act", act: "guard" }, 1);
    s = raid.applyMove(s, { type: "act", act: "special" }, 0);
    expect(s.history[0]!.interrupted).toBe(true);
    expect(s.intent?.kind).not.toBe("nova");
    // 止めなければ、ためた次は必ず nova
    let t = started("karate", "sumo");
    t = { ...t, bossRounds: 2, intent: { kind: "charge" } };
    t = playRound(t, ["guard", "guard"]);
    expect(t.intent?.kind).toBe("nova");
  });

  it("ひと休みは、2 人のダメージの合計が足りないと回復する", () => {
    const hp = bossMaxHp("monday", 0) - 10;
    const rest = battle({ bossHp: hp, intent: { kind: "rest" } });
    expect(resolve(rest, ["guard", "guard"], 1).log.bossHeal).toBeGreaterThan(0);
    const stopped = resolve(rest, ["special", "attack"], 1).log;
    expect(stopped.restStopped).toBe(true);
    expect(stopped.bossHeal).toBe(0);
  });

  it("ボスを倒すと、そのラウンドのボスの行動は来ず、次のボスへ。倒れていた人は起き上がる", () => {
    const base = battle();
    const heroes = [{ ...base.heroes[0]!, hp: 0 }, base.heroes[1]] as Battle["heroes"];
    const b: Battle = { ...base, heroes, bossHp: 3, intent: { kind: "smash", target: 1 } };
    const { log, next } = resolve(b, ["cheer", "attack"], 4);
    expect(log.defeated).toBe(true);
    expect(log.taken).toEqual([0, 0]);
    expect(log.revived).toEqual([true, false]);
    expect(next.stage).toBe(1);
    expect(next.bossHp).toBe(bossMaxHp("rain", 1));
    expect(next.heroes[0]!.hp).toBeGreaterThan(0);
  });

  it("2 人とも倒れたら失敗。3 体とも倒したらクリア", () => {
    let s = started();
    s = { ...s, heroes: [{ ...s.heroes[0]!, hp: 0 }, { ...s.heroes[1]!, hp: 0 }] };
    expect(raid.status(s)).toEqual({ kind: "finished", winner: null, coop: "failed" });
    let w = started();
    w = { ...w, stage: BOSS_COUNT };
    expect(raid.status(w)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    expect(codeOf(() => raid.applyMove(w, { type: "act", act: "attack" }, 1))).toBe("game_over");
  });

  it(`${MAX_ROUNDS} ラウンドで倒しきれなければ失敗`, () => {
    let s = started("sumo", "taichi");
    for (let i = 0; i < MAX_ROUNDS + 5 && raid.status(s).kind === "playing"; i++) {
      // 守ってばかりでは倒せない（ひと休みで回復もされる）
      s = playRound(s, [0, 1].map((seat) => (actsFor(s.heroes, seat as Seat).includes("guard") ? "guard" : "cheer")) as [Act, Act]);
    }
    expect(raid.status(s)).toMatchObject({ kind: "finished", coop: "failed" });
    expect(s.history.length).toBeLessThanOrEqual(MAX_ROUNDS);
  });

  it("予告は同じ対局なら同じ。ねらいは立っている人だけ", () => {
    const s = started();
    const a = nextIntent(s, 5, { kind: "hit", target: 0 }, [10, 0]);
    const b = nextIntent(s, 5, { kind: "hit", target: 0 }, [10, 0]);
    expect(a).toEqual(b);
    const down = { ...s, bossRounds: 3, heroes: [{ ...s.heroes[0]!, hp: 0 }, s.heroes[1]] as RaidState["heroes"] };
    for (let r = 0; r < 40; r++) {
      const i = nextIntent(down, r, { kind: "guard" }, null);
      if (i.kind === "hit" || i.kind === "smash") expect(i.target).toBe(1);
    }
  });

  it("手の形をたしかめる", () => {
    expect(raid.parseMove({ type: "pick", style: "karate" })).toEqual({ type: "pick", style: "karate" });
    expect(raid.parseMove({ type: "act", act: "cover" })).toEqual({ type: "act", act: "cover" });
    expect(raid.parseMove({ type: "act", act: "dance" })).toBeNull();
    expect(raid.parseMove(null)).toBeNull();
    let s = started();
    expect(codeOf(() => raid.applyMove(s, { type: "pick", style: "karate" }, 1))).toBe("raid_already_picked");
    // 倒れていない人は「おうえん」できない
    expect(codeOf(() => raid.applyMove(s, { type: "act", act: "cheer" }, 1))).toBe("raid_cannot_act");
    s = raid.initialState(seeded(2));
    expect(codeOf(() => raid.applyMove(s, { type: "act", act: "attack" }, 0))).toBe("raid_pick_first");
  });

  it("コンピュータ同士で、どのキャラでも最後まで遊べる", () => {
    const rng = seeded(7);
    for (let g = 0; g < 30; g++) {
      let s = raid.initialState(rng);
      for (let ply = 0; ply < 200; ply++) {
        const st = raid.status(s);
        if (st.kind === "finished") break;
        const move = raid.botMove!(view(s, st.turn), st.turn, rng) as RaidMove | null;
        expect(move).not.toBeNull();
        s = raid.applyMove(s, move!, st.turn);
      }
      expect(raid.status(s).kind).toBe("finished");
      // コンピュータは相棒と違う役のキャラを選ぶ
      const [a, b] = s.heroes;
      expect(ROLE_OF[heroOf(a!.style).special]).not.toBe(ROLE_OF[heroOf(b!.style).special]);
    }
  });
});
