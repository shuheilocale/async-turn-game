import { describe, expect, it } from "vitest";
import { IllegalMoveError, other, type Rng, type Seat } from "../types.ts";
import {
  activeEffects,
  addEffect,
  availableMoves,
  boostedStats,
  botBuild,
  chainCount,
  CROSSOVER_STYLES,
  EXCHANGES,
  fight,
  firstPicker,
  MARTIAL_STYLES,
  MAX_HP,
  NO_LUCK,
  POSITIONS,
  resolve,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
  STYLE_IDS,
  STYLES,
  techniqueNow,
  techniqueOf,
  usableMoves,
  usesLeft,
  type Effect,
  type Exchange,
  type Fighter,
  type FighterStats,
  type FightMove,
  type FightState,
  type FightView,
  type Position,
  type StyleId,
} from "./fight.ts";

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

const EVEN: FighterStats = { power: 5, guard: 5, speed: 5, stamina: 5 };
const stats = (power: number, guard: number, speed: number, stamina: number): FighterStats => ({ power, guard, speed, stamina });
const build = (style: StyleId, s: FighterStats = EVEN): FightMove => ({ type: "build", style, stats: s });
const act = (id: string): FightMove => ({ type: "act", act: id });

/** 運の列がいつも 0.5（運の影響がない）のはじまり */
const neutral = () => fight.initialState(() => 0.5);

/** 2 人ともキャラを作った状態 */
function built(a: Fighter, b: Fighter, s: FightState = neutral()): FightState {
  s = fight.applyMove(s, build(a.style, a.stats), 0);
  return fight.applyMove(s, build(b.style, b.stats), 1);
}

const f = (style: StyleId, s: FighterStats = EVEN): Fighter => ({ style, stats: s });

/** 2 人の技を手番どおりに出す（[先手の技, 後手の技]） */
function exchange(s: FightState, act0: string, act1: string): FightState {
  const first = firstPicker(s.history.length);
  const acts = [act0, act1];
  s = fight.applyMove(s, act(acts[first]!), first);
  return fight.applyMove(s, act(acts[other(first)]!), other(first));
}

/** 位置や体力を変えた状態で、1 回だけ攻防する */
function once(a: Fighter, b: Fighter, act0: string, act1: string, patch: Partial<FightState> = {}): Exchange {
  return exchange({ ...built(a, b), ...patch }, act0, act1).history.at(-1)!;
}

const resultOf = (ex: Exchange, seat: Seat) => ex.strikes.find((x) => x.by === seat)!.result;
/** seat が受けたダメージ */
const taken = (ex: Exchange, seat: Seat) => ex.strikes.filter((x) => x.by !== seat).reduce((a, x) => a + x.damage, 0);

const view = (s: FightState, viewer: Seat | null, revealAll = false) => fight.viewState!(s, viewer, revealAll) as FightView;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

/** コンピュータ同士で最後まで戦う。キャラは決めておく（コンピュータの技の選び方だけで戦う） */
function botGame(a: Fighter, b: Fighter, rng: Rng): FightState {
  let s = built(a, b, fight.initialState(rng));
  for (let i = 0; i < EXCHANGES * 2 + 2; i++) {
    const st = fight.status(s);
    if (st.kind === "finished") return s;
    const move = fight.botMove!(fight.viewState!(s, st.turn, false), st.turn, rng);
    if (move === null) throw new Error("コンピュータが技を選べなかった");
    s = fight.applyMove(s, move, st.turn);
  }
  throw new Error("終わらなかった");
}

/** 何局か戦った結果の数え */
interface Tally {
  /** a 側の勝ち点（勝ち 1・引き分け 0.5）の割合 */
  rate: number;
  games: number;
  kos: number;
  draws: number;
  /** 攻防の数の合計 */
  exchanges: number;
}

/** a 側から見た勝率と、KO・引き分け・攻防の数。席の有利不利が出ないよう、半分は席を入れ替える */
function tally(make: (rng: Rng) => [Fighter, Fighter], games: number, seed: number): Tally {
  const rng = seeded(seed);
  let points = 0;
  const out = { games, kos: 0, draws: 0, exchanges: 0 };
  for (let g = 0; g < games; g++) {
    const [a, b] = make(rng);
    const swap = g % 2 === 1;
    const end = botGame(swap ? b : a, swap ? a : b, rng);
    const st = fight.status(end);
    if (st.kind !== "finished") throw new Error("終わっていない");
    const aSeat: Seat = swap ? 1 : 0;
    points += st.winner === null ? 0.5 : st.winner === aSeat ? 1 : 0;
    out.exchanges += end.history.length;
    if (end.history.at(-1)?.ko != null) out.kos++;
    else if (st.winner === null) out.draws++;
  }
  return { rate: points / games, ...out };
}
const winRate = (make: (rng: Rng) => [Fighter, Fighter], games: number, seed: number) => tally(make, games, seed).rate;

/** 1 回の攻防を、記録（強化・弱体や技の回数のもと）付きで決める。exchange は疲れの回数（ふつうは 0 にそろえる） */
function bout(a: Fighter, b: Fighter, act0: string, act1: string, opts: { hp?: [number, number]; position?: Position; history?: Exchange[]; luck?: readonly number[] } = {}): Exchange {
  return resolve(
    { fighters: [a, b], hp: opts.hp ?? [MAX_HP, MAX_HP], position: opts.position ?? "standing", exchange: 0, history: opts.history ?? [] },
    [act0, act1],
    opts.luck ?? NO_LUCK,
    0,
  );
}

/** 記録の 1 回分を手で作る（技の名前と、続いている強化・弱体だけ） */
const record = (acts: [string, string], extra: Partial<Exchange> = {}): Exchange => ({
  acts,
  from: "standing",
  position: "standing",
  strikes: [],
  hp: [MAX_HP, MAX_HP],
  ko: null,
  brk: false,
  ...extra,
});

describe("fight", () => {
  describe("バックボーンと技", () => {
    it("バックボーンは 20 種類（格闘技 12・異種格闘技 8）で、それぞれ技が 6〜7 個。技の名前（id）はバックボーンの中で重ならない", () => {
      expect(STYLE_IDS).toHaveLength(20);
      expect(MARTIAL_STYLES).toHaveLength(12);
      expect(CROSSOVER_STYLES).toHaveLength(8);
      expect([...STYLE_IDS]).toEqual([...MARTIAL_STYLES, ...CROSSOVER_STYLES]);
      expect(MARTIAL_STYLES).toContain("kickboxing");
      expect(MARTIAL_STYLES).toContain("taichi");
      expect(CROSSOVER_STYLES).toContain("robot");
      for (const style of STYLE_IDS) {
        const moves = STYLES[style].moves;
        expect(moves.length, style).toBeGreaterThanOrEqual(6);
        expect(moves.length, style).toBeLessThanOrEqual(7);
        expect(new Set(moves.map((m) => m.id)).size, style).toBe(moves.length);
      }
    });

    it("どのバックボーンも、どの位置でも守りと、打撃か組みを返す技がある。立ちでは組み技（または打撃）で守りを崩せる", () => {
      for (const style of STYLE_IDS) {
        for (const pos of POSITIONS) {
          const moves = usableMoves(style, pos);
          // 打撃を受ける守り（ブロック・かわす・カウンター。回数に限りのある「消える」と「ため」は数えない）
          const receive = moves.some((m) => m.cls === "guard" && (m.guard === "block" || m.guard === "dodge" || m.guard === "counter") && !m.read);
          expect(receive, `${style} ${pos} 守り`).toBe(true);
          // 組み技を止める技（打撃・返し）
          expect(moves.some((m) => m.cls === "strike" || m.guard === "catch"), `${style} ${pos} 組み止め`).toBe(true);
        }
        expect(usableMoves(style, "standing").some((m) => m.cls === "grab"), `${style} 立ちの組み技`).toBe(true);
      }
    });

    it("おすすめの振り分けは決まりを満たす", () => {
      for (const style of STYLE_IDS) {
        const b = STYLES[style].build;
        expect(STAT_KEYS.reduce((a, k) => a + b[k], 0), style).toBe(STAT_TOTAL);
        for (const k of STAT_KEYS) expect(b[k]).toBeGreaterThanOrEqual(STAT_MIN);
        for (const k of STAT_KEYS) expect(b[k]).toBeLessThanOrEqual(STAT_MAX);
      }
    });

    it("技は名前で引ける。ないものは null", () => {
      expect(techniqueOf("boxing", "jab")?.kind).toBe("jab");
      expect(techniqueOf("judo", "seoi")?.cls).toBe("grab");
      expect(techniqueOf("boxing", "seoi")).toBeNull();
      expect(techniqueOf("chef", "pan")?.kind).toBe("swing");
      expect(techniqueOf("robot", "rocket")?.kind).toBe("projectile");
      expect(techniqueOf("magician", "vanish")?.kind).toBe("vanish");
      expect(techniqueOf("nurse", "teate")?.kind).toBe("heal");
      expect(techniqueOf("idol", "pose")?.kind).toBe("perform");
    });

    it("回復・回数に限りのある技・強化と弱体は、上限と続く長さが決まっている（強すぎない）", () => {
      for (const style of STYLE_IDS) {
        for (const m of STYLES[style].moves) {
          if (m.heal !== undefined) {
            expect(m.uses, `${style} ${m.id} 回復は回数に限り`).toBeGreaterThanOrEqual(1);
            expect(m.uses!, `${style} ${m.id}`).toBeLessThanOrEqual(2);
            expect(m.heal * m.uses!, `${style} ${m.id} 回復の合計`).toBeLessThanOrEqual(30);
          }
          if (m.guard === "vanish") expect(m.uses, `${style} ${m.id}`).toBe(1);
          for (const fx of m.fx ?? []) {
            expect(Math.abs(fx.amount), `${style} ${m.id}`).toBeLessThanOrEqual(4);
            expect(fx.turns, `${style} ${m.id}`).toBeLessThanOrEqual(3);
          }
        }
      }
    });
  });

  describe("回復", () => {
    const nurse = f("nurse");
    const mma = f("mma");

    it("ため（応急手当）は、相手が守りでも打撃でも回復する（打撃は受けないので少しくらう）。組まれると回復しない", () => {
      const calm = bout(nurse, mma, "teate", "guard", { hp: [50, MAX_HP] });
      expect(resultOf(calm, 0)).toBe("hit");
      expect(calm.strikes.find((x) => x.by === 0)!.heal).toBe(15);
      expect(calm.hp[0]).toBe(65);

      const struck = bout(nurse, mma, "teate", "straight", { hp: [50, MAX_HP] });
      expect(resultOf(struck, 1)).toBe("hit");
      expect(struck.strikes.find((x) => x.by === 0)!.heal).toBe(15);
      expect(taken(struck, 0)).toBeGreaterThan(0);
      expect(struck.hp[0]).toBe(50 - taken(struck, 0) + 15);
      // ためは打撃を受けないので、ブロックよりも多くくらう
      expect(taken(struck, 0)).toBeGreaterThan(taken(bout(nurse, mma, "uketome", "straight"), 0));

      const grabbed = bout(nurse, mma, "teate", "tackle", { hp: [50, MAX_HP] });
      expect(resultOf(grabbed, 0)).toBe("whiff");
      expect(grabbed.strikes.find((x) => x.by === 0)!.heal).toBeUndefined();
      expect(grabbed.position).toBe("ground");
    });

    it("回復は体力の上限（100）までで、倒れたら回復しない", () => {
      const full = bout(nurse, mma, "teate", "guard");
      expect(full.hp[0]).toBe(MAX_HP);
      expect(full.strikes.find((x) => x.by === 0)!.heal).toBeUndefined();
      expect(bout(nurse, mma, "teate", "guard", { hp: [95, MAX_HP] }).hp[0]).toBe(MAX_HP);
      const down = bout(nurse, mma, "teate", "straight", { hp: [3, MAX_HP] });
      expect(down.ko).toBe(0);
      expect(down.hp[0]).toBe(0);
    });

    it("回復の技は回数に限りがある。使い切ると出せない（応急手当 2 回、再起動 1 回）", () => {
      let s: FightState = { ...built(nurse, f("robot")), hp: [40, 40] };
      expect(usesLeft(techniqueOf("nurse", "teate")!, s.history, 0)).toBe(2);
      s = exchange(s, "teate", "reboot");
      expect(s.hp).toEqual([55, 65]);
      expect(usesLeft(techniqueOf("robot", "reboot")!, s.history, 1)).toBe(0);
      expect(availableMoves("robot", "standing", s.history, 1).map((m) => m.id)).not.toContain("reboot");
      // 2 回目の攻防は看護師が先に選ぶ。ロボットの再起動はもう出せない
      expect(firstPicker(1)).toBe(0);
      expect(codeOf(() => fight.applyMove(fight.applyMove(s, act("uketome"), 0), act("reboot"), 1))).toBe("fight_used_up");
      s = exchange(s, "teate", "armor");
      expect(s.hp[0]).toBe(70);
      expect(usesLeft(techniqueOf("nurse", "teate")!, s.history, 0)).toBe(0);
      // 3 回目はロボットが先。応急手当は 2 回使い切った
      expect(codeOf(() => fight.applyMove(fight.applyMove(s, act("armor"), 1), act("teate"), 0))).toBe("fight_used_up");
      // 回数に限りのない技はいつまでも出せる
      expect(usesLeft(techniqueOf("nurse", "uketome")!, s.history, 0)).toBeNull();
    });
  });

  describe("強化・弱体", () => {
    const idol = f("idol");
    const mma = f("mma");

    it("見せ技（決めポーズ）が決まると、相手の攻撃が 3 攻防のあいだ下がる。次の攻防から効き、終わると消える", () => {
      let s = built(idol, mma);
      s = exchange(s, "pose", "guard");
      const first = s.history[0]!;
      expect(first.strikes.find((x) => x.by === 0)!.effects).toEqual([{ who: 1, stat: "power", amount: -3 }]);
      expect(view(s, 1).fx).toEqual([{ who: 1, stat: "power", amount: -3, left: 3 }]);
      expect(boostedStats(mma.stats, view(s, 0).fx, 1).power).toBe(2);
      expect(boostedStats(mma.stats, view(s, 0).fx, 0)).toEqual(idol.stats);
      for (const left of [2, 1]) {
        s = exchange(s, "smile", "guard");
        expect(activeEffects(s.history)).toEqual([{ who: 1, stat: "power", amount: -3, left }]);
      }
      s = exchange(s, "smile", "guard");
      expect(activeEffects(s.history)).toEqual([]);
    });

    it("弱体のあいだは、与えるダメージが減る", () => {
      const weak: Effect[] = [{ who: 1, stat: "power", amount: -3, left: 2 }];
      const plain = bout(idol, mma, "akushu", "straight");
      const down = bout(idol, mma, "akushu", "straight", { history: [record(["pose", "guard"], { fx: weak })] });
      expect(taken(down, 0)).toBeLessThan(taken(plain, 0));
    });

    it("見せ技は組まれると決まらない。打撃は受けながらでも決まる", () => {
      expect(bout(idol, mma, "pose", "tackle").fx).toEqual([]);
      expect(bout(idol, mma, "pose", "straight").fx).toEqual([{ who: 1, stat: "power", amount: -3, left: 3 }]);
    });

    it("同じ人・同じパラメータ・同じ向きは重ならず、大きい方・長い方にそろう。逆向きは別々に続いて足し合う", () => {
      const a: Effect[] = [{ who: 1, stat: "power", amount: -3, left: 1 }];
      expect(addEffect(a, { who: 1, stat: "power", amount: -2, left: 3 })).toEqual([{ who: 1, stat: "power", amount: -3, left: 3 }]);
      const both = addEffect(a, { who: 1, stat: "power", amount: 3, left: 3 });
      expect(both).toHaveLength(2);
      expect(boostedStats(EVEN, both, 1).power).toBe(5);
      expect(addEffect(a, { who: 0, stat: "power", amount: -3, left: 3 })).toHaveLength(2);
      // かけ直すと残りが戻る
      let s = exchange(exchange(built(idol, mma), "pose", "guard"), "pose", "guard");
      expect(activeEffects(s.history)).toEqual([{ who: 1, stat: "power", amount: -3, left: 3 }]);
      s = exchange(s, "smile", "guard");
      expect(activeEffects(s.history)).toEqual([{ who: 1, stat: "power", amount: -3, left: 2 }]);
    });

    it("パラメータは強化・弱体を足しても 1〜10 にとどまる", () => {
      const fx: Effect[] = [
        { who: 0, stat: "power", amount: 4, left: 2 },
        { who: 0, stat: "guard", amount: -9, left: 2 },
      ];
      expect(boostedStats(stats(8, 2, 5, 5), fx, 0)).toEqual(stats(10, 1, 5, 5));
    });

    it("すり替えは、相手の強化と自分の弱体を入れ替える（自分も少し速くなる）", () => {
      const fx: Effect[] = [
        { who: 1, stat: "power", amount: 3, left: 2 },
        { who: 0, stat: "guard", amount: -2, left: 3 },
        { who: 1, stat: "speed", amount: -3, left: 2 },
      ];
      const ex = bout(f("magician"), f("rapper"), "swap", "crossarm", { history: [record(["hat", "mic"], { fx })] });
      expect(resultOf(ex, 0)).toBe("hit");
      const after = ex.fx!;
      // 残りは 1 つ減ってから入れ替わる
      expect(after).toContainEqual({ who: 0, stat: "power", amount: 3, left: 1 });
      expect(after).toContainEqual({ who: 1, stat: "guard", amount: -2, left: 2 });
      expect(after).toContainEqual({ who: 1, stat: "speed", amount: -3, left: 1 });
      expect(after).toContainEqual({ who: 0, stat: "speed", amount: 2, left: 2 });
      expect(after.filter((e) => e.who === 1 && e.amount > 0)).toEqual([]);
      expect(ex.strikes.find((x) => x.by === 0)!.effects).toContainEqual({ who: 0, stat: "power", amount: 3 });
    });

    it("組み合い・寝技で 2 人とも守り（ためも含む）なら、ためは決まり、離れて立ちに戻る", () => {
      const ex = bout(f("nurse"), mma, "teate", "guard", { hp: [50, MAX_HP], position: "ground" });
      expect(ex.brk).toBe(true);
      expect(ex.position).toBe("standing");
      expect(ex.hp[0]).toBe(65);
    });
  });

  describe("バックボーンごとの特別な技", () => {
    const mma = f("mma");

    it("消える：打撃も組み技もかわして立ちに戻る。1 回だけ", () => {
      const magician = f("magician", stats(5, 5, 2, 8));
      const fast = f("mma", stats(5, 2, 8, 5));
      const strike = bout(magician, fast, "vanish", "highkick");
      expect(resultOf(strike, 1)).toBe("dodged");
      expect(taken(strike, 0)).toBe(0);
      // かわされた技のすぐあとに消えた人の技を並べる（舞台が 1 回の「消えてかわした」動きとして見せる）。返しのダメージはない
      expect(strike.strikes.map((x) => [x.by, x.result, x.kind])).toEqual([
        [1, "dodged", "kick_high"],
        [0, "hit", "vanish"],
      ]);
      expect(taken(strike, 1)).toBe(0);
      const grab = bout(magician, mma, "vanish", "choke", { position: "ground" });
      expect(resultOf(grab, 1)).toBe("dodged");
      expect(taken(grab, 0)).toBe(0);
      expect(grab.position).toBe("standing");
      // 守りどうしでは空振り
      expect(resultOf(bout(magician, mma, "vanish", "guard"), 0)).toBe("whiff");
      expect(techniqueOf("magician", "vanish")!.uses).toBe(1);
    });

    it("読み：相手の直前の技の種類に強い形になる（打撃 → カウンター、組み → 打撃、守り → 組み。はじめはブロック）", () => {
      const fighters = [f("gamer"), mma] as const;
      const form = (oppAct: string | null) =>
        techniqueNow(fighters, oppAct ? [record(["combo", oppAct], { strikes: [] })] : [], 0, "yomi")!;
      expect(form(null)).toMatchObject({ cls: "guard", guard: "block" });
      expect(form("straight")).toMatchObject({ cls: "guard", guard: "counter" });
      expect(form("tackle")).toMatchObject({ cls: "strike" });
      expect(form("guard")).toMatchObject({ cls: "grab" });
      // 組みに来る相手には、読みが打撃になって先に当たる
      const ex = bout(f("gamer"), mma, "yomi", "tackle", { history: [record(["combo", "tackle"])] });
      expect(resultOf(ex, 0)).toBe("hit");
      expect(resultOf(ex, 1)).toBe("countered");
      expect(ex.strikes.find((x) => x.by === 0)).toMatchObject({ act: "yomi", cls: "strike" });
    });

    it("続けるほど強い：ビートに乗るは続けて出すほど、ローキックはパンチを当てた次が重い", () => {
      const rapper = f("rapper");
      const beat = techniqueOf("rapper", "beat")!;
      const two = [record(["beat", "guard"]), record(["beat", "guard"])];
      expect(chainCount(beat, two, 0)).toBe(2);
      expect(chainCount(beat, [record(["beat", "guard"]), record(["dis", "guard"])], 0)).toBe(0);
      expect(taken(bout(rapper, mma, "beat", "tackle", { history: two }), 1)).toBeGreaterThan(taken(bout(rapper, mma, "beat", "tackle"), 1));

      const kick = f("kickboxing");
      const landed = [record(["onetwo", "tackle"], { strikes: [{ by: 0, act: "onetwo", kind: "straight", cls: "strike", result: "hit", damage: 15 }] })];
      expect(taken(bout(kick, mma, "low", "tackle", { history: landed }), 1)).toBeGreaterThan(taken(bout(kick, mma, "low", "tackle"), 1));
    });

    it("フリースタイルは運で威力が大きく変わる。アンコールは体力が少ないほど強い", () => {
      const rapper = f("rapper");
      const luck = (x: number) => [0.5, 0.5, 0.5, 0.5, x, 0.5];
      const low = taken(bout(rapper, mma, "freestyle", "tackle", { luck: luck(0) }), 1);
      const high = taken(bout(rapper, mma, "freestyle", "tackle", { luck: luck(1) }), 1);
      expect(high).toBeGreaterThan(low * 2.5);

      const idol = f("idol");
      expect(taken(bout(idol, mma, "encore", "tackle", { hp: [30, MAX_HP] }), 1)).toBeGreaterThan(
        taken(bout(idol, mma, "encore", "tackle", { hp: [MAX_HP, MAX_HP] }), 1) * 1.5,
      );
    });

    it("ロボットは打撃にかたいが組み技に弱い。水泳選手は組まれてもダメージが少ない", () => {
      // 打撃：組みに来たところに当てる（受ける側のパラメータは同じ）
      const struck = (style: StyleId, grabAct: string) => taken(bout(mma, f(style), "straight", grabAct), 1);
      expect(struck("robot", "clamp")).toBeLessThan(struck("karate", "ashibarai"));
      // 組み：ブロックしているところを組む
      const grabbed = (style: StyleId, blockAct: string) => taken(bout(mma, f(style), "tackle", blockAct), 1);
      expect(grabbed("robot", "armor")).toBeGreaterThan(grabbed("karate", "uke"));
      expect(grabbed("swimmer", "streamline")).toBeLessThan(grabbed("karate", "uke"));
    });
  });

  describe("古い対局との互換", () => {
    /** 強化・弱体と、記録の技の種類（cls）がなかったころの対局 */
    function oldGame(): FightState {
      let s = built(f("boxing"), f("judo"));
      s = exchange(s, "jab", "seoi");
      s = exchange(s, "block", "kumite");
      return {
        ...s,
        history: s.history.map(({ fx: _, ...ex }) => ({ ...ex, strikes: ex.strikes.map(({ cls: _c, ...x }) => x) })) as Exchange[],
      };
    }

    it("強化・弱体の項目がない対局も、なしとして続けられる", () => {
      const s = oldGame();
      expect(s.history.every((ex) => !("fx" in ex))).toBe(true);
      expect(view(s, 0).fx).toEqual([]);
      const next = exchange(s, "jab", "tsukihanashi");
      expect(next.history).toHaveLength(3);
      expect(next.history[2]!.fx).toEqual([]);
      const st = fight.status(next) as { kind: "playing"; turn: Seat };
      expect(fight.botMove!(view(next, st.turn), st.turn, seeded(1))).not.toBeNull();
    });

    it("コンピュータは古い記録からも相手の傾向を読める", () => {
      let s = oldGame();
      for (let i = 0; i < 6; i++) {
        const st = fight.status(s);
        if (st.kind === "finished") break;
        s = fight.applyMove(s, fight.botMove!(view(s, st.turn), st.turn, seeded(i))!, st.turn);
      }
      expect(s.history.length).toBeGreaterThan(2);
    });
  });

  describe("キャラ作り", () => {
    it("はじめは体力 100 ずつ、立ちから。先手からキャラを作る", () => {
      const s = fight.initialState(Math.random);
      expect(s.hp).toEqual([MAX_HP, MAX_HP]);
      expect(s.position).toBe("standing");
      expect(s.fighters).toEqual([null, null]);
      expect(s.luck).toHaveLength(EXCHANGES);
      expect(fight.status(s)).toEqual({ kind: "playing", turn: 0 });
      const after = fight.applyMove(s, build("boxing"), 0);
      expect(after.fighters[0]).toEqual({ style: "boxing", stats: EVEN });
      expect(fight.status(after)).toEqual({ kind: "playing", turn: 1 });
    });

    it("運の列は rng で作る（applyMove では乱数を使わない）", () => {
      expect(fight.initialState(seeded(1)).luck).toEqual(fight.initialState(seeded(1)).luck);
      expect(fight.initialState(seeded(1)).luck).not.toEqual(fight.initialState(seeded(2)).luck);
    });

    it("パラメータは合計 20、それぞれ 1〜8 の整数", () => {
      const s = neutral();
      expect(codeOf(() => fight.applyMove(s, build("karate", stats(8, 8, 3, 1)), 0))).toBeNull();
      expect(codeOf(() => fight.applyMove(s, build("karate", stats(5, 5, 5, 4)), 0))).toBe("fight_bad_stats");
      expect(codeOf(() => fight.applyMove(s, build("karate", stats(5, 5, 5, 6)), 0))).toBe("fight_bad_stats");
      expect(codeOf(() => fight.applyMove(s, build("karate", stats(9, 5, 5, 1)), 0))).toBe("fight_bad_stats");
      expect(codeOf(() => fight.applyMove(s, build("karate", stats(0, 8, 8, 4)), 0))).toBe("fight_bad_stats");
      expect(codeOf(() => fight.applyMove(s, build("karate", stats(5.5, 4.5, 5, 5)), 0))).toBe("fight_bad_stats");
    });

    it("バックボーンは 20 種類のどれか", () => {
      const s = neutral();
      expect(codeOf(() => fight.applyMove(s, build("kungfu" as StyleId), 0))).toBe("fight_bad_style");
      for (const style of STYLE_IDS) expect(codeOf(() => fight.applyMove(s, build(style), 0)), style).toBeNull();
    });

    it("キャラを作るまでは技を出せない。作り直しもできない", () => {
      const s = neutral();
      expect(codeOf(() => fight.applyMove(s, act("jab"), 0))).toBe("fight_build_first");
      const both = built(f("boxing"), f("judo"));
      const first = firstPicker(0);
      expect(codeOf(() => fight.applyMove(both, build("mma"), first))).toBe("fight_already_built");
    });

    it("手番でない人は作れない", () => {
      expect(codeOf(() => fight.applyMove(neutral(), build("boxing"), 1))).toBe("not_your_turn");
    });
  });

  describe("伏せる・見せ合う", () => {
    it("先に決めた人のキャラは、相手（と観戦者）には決めたことだけ見える。2 人とも決めたら見せ合う", () => {
      const s = fight.applyMove(neutral(), build("muaythai", stats(7, 3, 5, 5)), 0);
      expect(view(s, 0).fighters).toEqual([{ style: "muaythai", stats: stats(7, 3, 5, 5) }, null]);
      expect(view(s, 1).fighters).toEqual([null, null]);
      expect(view(s, null).fighters).toEqual([null, null]);
      expect(view(s, 1).built).toEqual([true, false]);
      expect(JSON.stringify(view(s, 1))).not.toContain("muaythai");
      // 終局後（revealAll）は全部見せる
      expect(view(s, 1, true).fighters[0]).toEqual({ style: "muaythai", stats: stats(7, 3, 5, 5) });

      const both = fight.applyMove(s, build("bjj"), 1);
      for (const viewer of [0, 1, null] as const) {
        expect(view(both, viewer).fighters).toEqual([
          { style: "muaythai", stats: stats(7, 3, 5, 5) },
          { style: "bjj", stats: EVEN },
        ]);
      }
    });

    it("先に選んだ人の技は伏せて預かる。相手には「選んだか」だけ見える", () => {
      const s = built(f("boxing"), f("mma"));
      const first = firstPicker(0);
      const second = other(first);
      const picked = fight.applyMove(s, act("jab"), first);
      expect(view(picked, first).picks[first]).toBe("jab");
      expect(view(picked, second).picks[first]).toBe(true);
      expect(view(picked, second).picks[second]).toBeNull();
      expect(view(picked, null).picks[first]).toBe(true);
      expect(view(picked, second, true).picks[first]).toBe("jab");
      expect(JSON.stringify(view(picked, second))).not.toContain("jab");
      // 運の列はだれにも見せない
      expect(view(picked, first)).not.toHaveProperty("luck");
    });

    it("2 人とも選んだら、技も結果も 2 人に見える", () => {
      const s = exchange(built(f("boxing"), f("mma")), "jab", "tackle");
      const ex = view(s, 1).history[0]!;
      expect(ex.acts).toEqual(["jab", "tackle"]);
      expect(view(s, 0).picks).toEqual([null, false]);
    });

    it("手の記録では、相手の手は伏せる（キャラも技も）", () => {
      const b = build("sumo");
      expect(fight.viewMove!(b, 0, 1)).toEqual({ type: "build" });
      expect(fight.viewMove!(b, 0, null)).toEqual({ type: "build" });
      expect(fight.viewMove!(b, 0, 0)).toEqual(b);
      expect(fight.viewMove!(act("jab"), 1, 0)).toEqual({ type: "act" });
      expect(fight.viewMove!(act("jab"), 1, 1)).toEqual(act("jab"));
    });
  });

  describe("手番", () => {
    it("キャラは先手 → 後手。攻防で先に選ぶ人は交互（キャラを作り終えた後手から）", () => {
      expect([0, 1, 2, 3].map(firstPicker)).toEqual([1, 0, 1, 0]);
      let s = built(f("boxing"), f("karate"));
      expect(fight.status(s)).toEqual({ kind: "playing", turn: 1 });
      s = fight.applyMove(s, act("seiken"), 1);
      expect(fight.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(codeOf(() => fight.applyMove(s, act("uke"), 1))).toBe("not_your_turn");
      s = fight.applyMove(s, act("jab"), 0);
      expect(s.history).toHaveLength(1);
      expect(s.picks).toEqual([null, null]);
      // 2 回目の攻防は、1 回目で後に選んだ人（先手）から
      expect(fight.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("自分のバックボーンにない技・今の位置で使えない技は出せない", () => {
      const s = built(f("boxing"), f("taekwondo"));
      expect(codeOf(() => fight.applyMove(s, act("seoi"), 1))).toBe("fight_no_such_move");
      const ground = { ...s, position: "ground" as Position };
      expect(codeOf(() => fight.applyMove(ground, act("naeryo"), 1))).toBe("fight_not_here");
      expect(codeOf(() => fight.applyMove(ground, act("apchagi"), 1))).toBeNull();
    });

    it("使える技は位置で変わる", () => {
      const ids = (style: StyleId, pos: Position) => usableMoves(style, pos).map((m) => m.id);
      expect(ids("bjj", "standing")).not.toContain("sankaku");
      expect(ids("bjj", "ground")).toContain("sankaku");
      expect(ids("taekwondo", "standing")).toContain("dwihuryo");
      expect(ids("taekwondo", "ground")).not.toContain("dwihuryo");
      expect(ids("judo", "clinch")).toContain("osoto");
      expect(ids("judo", "standing")).not.toContain("osoto");
    });
  });

  describe("3 すくみ", () => {
    const mma = f("mma");

    it("打撃は組みに強い：組みに来たところに当たり、組み技は止められる", () => {
      const ex = once(mma, mma, "jab", "tackle");
      expect(resultOf(ex, 0)).toBe("hit");
      expect(resultOf(ex, 1)).toBe("countered");
      expect(taken(ex, 1)).toBeGreaterThan(0);
      expect(taken(ex, 0)).toBe(0);
      expect(ex.position).toBe("standing");
    });

    it("組みは守りに強い：守っている相手を組み伏せる", () => {
      const ex = once(mma, mma, "tackle", "guard");
      expect(resultOf(ex, 0)).toBe("hit");
      expect(resultOf(ex, 1)).toBe("whiff");
      expect(taken(ex, 1)).toBeGreaterThan(0);
      expect(taken(ex, 0)).toBe(0);
      expect(ex.position).toBe("ground");
    });

    it("守りは打撃に強い：ブロックで受けて小さく返す（受けるダメージはまともに当たるより少ない）", () => {
      const blocked = once(mma, mma, "straight", "guard");
      expect(resultOf(blocked, 0)).toBe("blocked");
      expect(resultOf(blocked, 1)).toBe("hit");
      const clean = once(mma, mma, "straight", "tackle");
      expect(taken(blocked, 1)).toBeLessThan(taken(clean, 1));
      expect(taken(blocked, 0)).toBeGreaterThan(taken(blocked, 1));
    });

    it("カウンターは打撃を大きく返すが、組み技にはブロックよりも弱い", () => {
      const karate = f("karate");
      const countered = once(karate, mma, "gonosen", "straight");
      expect(resultOf(countered, 1)).toBe("countered");
      expect(resultOf(countered, 0)).toBe("hit");
      expect(taken(countered, 0)).toBe(0);
      const blocked = once(karate, mma, "uke", "straight");
      expect(taken(countered, 1)).toBeGreaterThan(taken(blocked, 1));
      // 大技ほど返されると痛い
      const big = once(karate, mma, "gonosen", "highkick");
      expect(taken(big, 1)).toBeGreaterThan(taken(countered, 1));
      // 組み技には、カウンターで待っていた方が大きくくらう
      expect(taken(once(karate, mma, "gonosen", "tackle"), 0)).toBeGreaterThan(taken(once(karate, mma, "uke", "tackle"), 0));
    });

    it("かわす：すばやさが相手以上なら無傷でかわし、遅ければ少しくらう", () => {
      const fast = f("boxing", stats(4, 4, 8, 4));
      const slow = f("boxing", stats(6, 6, 2, 6));
      const dodged = once(fast, f("mma"), "duck", "straight");
      expect(resultOf(dodged, 1)).toBe("dodged");
      expect(taken(dodged, 0)).toBe(0);
      const late = once(slow, f("mma", stats(5, 5, 8, 2)), "duck", "straight");
      expect(resultOf(late, 1)).toBe("hit");
      expect(resultOf(late, 0)).toBe("whiff");
      expect(taken(late, 0)).toBeGreaterThan(0);
      // かわしそこねても、組みに来たところにまともに当たるより少ない
      expect(taken(late, 0)).toBeLessThan(taken(once(slow, f("mma", stats(5, 5, 8, 2)), "clinch", "straight"), 0));
    });

    it("返し技（スプロールなど）は組み技を返すが、打撃はまともにくらう", () => {
      const wrestler = f("wrestling");
      const caught = once(wrestler, mma, "sprawl", "tackle");
      expect(resultOf(caught, 1)).toBe("countered");
      expect(resultOf(caught, 0)).toBe("hit");
      expect(caught.position).toBe("standing");
      const hit = once(wrestler, mma, "sprawl", "jab");
      expect(resultOf(hit, 1)).toBe("hit");
      expect(resultOf(hit, 0)).toBe("whiff");
      // 柔道の返し技は、投げ返して寝技になる
      expect(once(f("judo"), mma, "kaeshi", "tackle").position).toBe("ground");
    });

    it("打撃どうしは打ち合い：速い方が先に当て、遅い方の打撃は弱まる", () => {
      const fast = f("mma", stats(5, 5, 8, 2));
      const ex = once(fast, mma, "straight", "straight");
      expect(ex.strikes.map((x) => x.by)).toEqual([0, 1]);
      expect(ex.strikes.map((x) => x.result)).toEqual(["hit", "hit"]);
      expect(taken(ex, 1)).toBeGreaterThan(taken(ex, 0));
      // 同じすばやさでも、ジャブはストレートより先に当たる
      const quick = once(mma, mma, "straight", "jab");
      expect(quick.strikes[0]!.by).toBe(1);
    });

    it("組みどうしは組み合い：どちらか一方だけが決まる", () => {
      const ex = once(f("wrestling"), f("boxing"), "tackle", "clinch");
      expect(ex.strikes.map((x) => x.result).sort()).toEqual(["countered", "hit"]);
      // 力・スタミナ・その位置の得意さで勝つ（レスリングは立ちでもボクシングより組みが強い）
      expect(resultOf(ex, 0)).toBe("hit");
      expect(ex.position).toBe("ground");
    });

    it("守りどうしは何も起きない。組み合い・寝技なら離れて立ちに戻る（ブレイク）", () => {
      const stand = once(mma, mma, "guard", "guard");
      expect(stand.strikes.every((x) => x.result === "whiff" && x.damage === 0)).toBe(true);
      expect(stand.position).toBe("standing");
      expect(stand.brk).toBe(false);
      const ground = once(mma, mma, "guard", "guard", { position: "ground" });
      expect(ground.position).toBe("standing");
      expect(ground.brk).toBe(true);
    });
  });

  describe("位置関係", () => {
    it("組み技で位置が変わる：首相撲で組み合い、タックルや投げで寝技、寄り切りで立ちに戻る", () => {
      expect(once(f("muaythai"), f("mma"), "plum", "guard").position).toBe("clinch");
      expect(once(f("judo"), f("mma"), "seoi", "guard").position).toBe("ground");
      expect(once(f("sumo"), f("mma"), "yorikiri", "guard", { position: "clinch" }).position).toBe("standing");
    });

    it("押し離す打撃・かわしで立ちに戻る。寝技の決め技では寝技のまま", () => {
      expect(once(f("muaythai"), f("mma"), "teep", "tackle", { position: "clinch" }).position).toBe("standing");
      expect(once(f("capoeira", stats(4, 4, 8, 4)), f("mma"), "ginga", "pound", { position: "ground" }).position).toBe("standing");
      expect(once(f("bjj"), f("mma"), "sankaku", "guard", { position: "ground" }).position).toBe("ground");
      expect(once(f("bjj"), f("mma"), "sankaku", "guard", { position: "ground" }).from).toBe("ground");
    });

    it("位置で得意・不得意が出る：打撃系は立ちで強く寝技で弱い。柔術は寝技で強い", () => {
      const seiken = (pos: Position) => taken(once(f("karate"), f("capoeira"), "seiken", "rasteira", { position: pos }), 1);
      expect(seiken("standing")).toBeGreaterThan(seiken("ground"));
      const upkick = (pos: Position) => taken(once(f("bjj"), f("capoeira"), "upkick", "rasteira", { position: pos }), 1);
      expect(upkick("ground")).toBeGreaterThan(upkick("standing"));
      for (const style of ["boxing", "taekwondo", "karate"] as const) {
        expect(STYLES[style].aff.standing).toBeGreaterThan(STYLES[style].aff.ground);
      }
      for (const style of ["bjj", "wrestling"] as const) {
        expect(STYLES[style].aff.ground).toBeGreaterThan(STYLES[style].aff.standing);
      }
    });
  });

  describe("パラメータの効き方", () => {
    it("攻撃が高いほど与えるダメージが多い", () => {
      const hit = (power: number) => taken(once(f("mma", stats(power, 5, 5, 10 - power)), f("mma"), "straight", "tackle"), 1);
      expect(hit(8)).toBeGreaterThan(hit(5));
      expect(hit(5)).toBeGreaterThan(hit(2));
    });

    it("防御が高いほど受けるダメージが少ない。組み技には打撃ほど効かない", () => {
      const hard = f("mma", stats(5, 8, 5, 2));
      const soft = f("mma", stats(5, 2, 5, 8));
      const strikeHard = taken(once(hard, f("mma"), "tackle", "straight"), 0);
      const strikeSoft = taken(once(soft, f("mma"), "tackle", "straight"), 0);
      expect(strikeHard).toBeLessThan(strikeSoft);
      const grabHard = taken(once(hard, f("mma"), "guard", "tackle"), 0);
      const grabSoft = taken(once(soft, f("mma"), "guard", "tackle"), 0);
      expect(grabHard).toBeLessThan(grabSoft);
      expect(strikeHard / strikeSoft).toBeLessThan(grabHard / grabSoft);
    });

    it("すばやさが高い方が打ち合いで先に当てる", () => {
      const ex = once(f("boxing", stats(5, 3, 8, 4)), f("boxing", stats(6, 5, 3, 6)), "hook", "hook");
      expect(ex.strikes[0]!.by).toBe(0);
      const ex2 = once(f("boxing", stats(6, 5, 3, 6)), f("boxing", stats(5, 3, 8, 4)), "hook", "hook");
      expect(ex2.strikes[0]!.by).toBe(1);
    });

    it("スタミナが少ないと、後半ほどダメージが落ちる。多ければあまり落ちない", () => {
      const late = (stamina: number, round: number) => {
        const me = f("mma", stats(5, 5, 10 - stamina, stamina));
        const s = { ...built(me, f("mma")), history: Array(round).fill(null) as Exchange[] };
        return taken(exchange(s, "straight", "tackle").history.at(-1)!, 1);
      };
      expect(late(2, 7)).toBeLessThan(late(2, 0) * 0.8);
      expect(late(8, 7)).toBeGreaterThan(late(8, 0) * 0.9);
      expect(late(8, 7)).toBeGreaterThan(late(2, 7));
    });
  });

  describe("ダメージと KO", () => {
    it("当たった分だけ体力が減る", () => {
      const s = exchange(built(f("mma"), f("mma")), "jab", "tackle");
      const ex = s.history[0]!;
      expect(s.hp).toEqual([MAX_HP, MAX_HP - ex.strikes.find((x) => x.by === 0)!.damage]);
      expect(ex.hp).toEqual(s.hp);
      expect(ex.ko).toBeNull();
    });

    it("体力が 0 になったら KO。先に当てた打撃で倒れたら、相手の打撃は出ない", () => {
      const s = { ...built(f("mma", stats(5, 5, 8, 2)), f("mma")), hp: [MAX_HP, 5] as [number, number] };
      const end = exchange(s, "straight", "highkick");
      const ex = end.history[0]!;
      expect(end.hp).toEqual([MAX_HP, 0]);
      expect(ex.ko).toBe(1);
      expect(ex.strikes[1]).toMatchObject({ by: 1, result: "whiff", damage: 0 });
      expect(fight.status(end)).toEqual({ kind: "finished", winner: 0 });
      expect(codeOf(() => fight.applyMove(end, act("jab"), firstPicker(1)))).toBe("game_over");
    });
  });

  describe("判定", () => {
    const toEnd = (hp: [number, number]): FightState => {
      const s = built(f("mma"), f("mma"));
      // 最後の攻防の手前まで進めた形にして、2 人とも守る（体力は変わらない）
      const before = { ...s, hp, history: Array(EXCHANGES - 1).fill({ position: "standing" }) as Exchange[] };
      return exchange(before, "guard", "guard");
    };

    it(`${EXCHANGES} 回の攻防で KO がなければ、体力の多い方の判定勝ち`, () => {
      const end = toEnd([40, 55]);
      expect(end.history).toHaveLength(EXCHANGES);
      expect(fight.status(end)).toEqual({ kind: "finished", winner: 1 });
      expect(fight.status(toEnd([70, 20]))).toEqual({ kind: "finished", winner: 0 });
    });

    it("体力が同じなら引き分け", () => {
      expect(fight.status(toEnd([33, 33]))).toEqual({ kind: "finished", winner: null });
    });
  });

  describe("parseMove", () => {
    it("キャラと技の形を読む", () => {
      expect(fight.parseMove({ type: "build", style: "judo", stats: EVEN })).toEqual(build("judo"));
      expect(fight.parseMove({ type: "act", act: "seoi" })).toEqual(act("seoi"));
      expect(fight.parseMove({ type: "build", style: "robot", stats: EVEN })).toEqual(build("robot"));
      expect(fight.parseMove({ type: "act", act: "reboot" })).toEqual(act("reboot"));
    });

    it("形が違えば null", () => {
      expect(fight.parseMove(null)).toBeNull();
      expect(fight.parseMove({ type: "act" })).toBeNull();
      expect(fight.parseMove({ type: "act", act: 3 })).toBeNull();
      expect(fight.parseMove({ type: "build", style: "judo" })).toBeNull();
      expect(fight.parseMove({ type: "build", style: "judo", stats: { power: 5, guard: 5, speed: 5 } })).toBeNull();
      expect(fight.parseMove({ type: "build", style: 1, stats: EVEN })).toBeNull();
      expect(fight.parseMove({ type: "punch", act: "jab" })).toBeNull();
    });

    it("余計なものは持ち込まない", () => {
      expect(fight.parseMove({ type: "act", act: "jab", damage: 99 })).toEqual(act("jab"));
      expect(fight.parseMove({ type: "build", style: "judo", stats: { ...EVEN, hp: 999 } })).toEqual(build("judo"));
    });
  });

  describe("コンピュータ", () => {
    it("キャラはバックボーンらしく振り分ける（決まりを満たす）", () => {
      for (const style of STYLE_IDS) {
        for (let i = 0; i < 20; i++) {
          const b = botBuild(style, seeded(i));
          expect(STAT_KEYS.reduce((a, k) => a + b[k], 0)).toBe(STAT_TOTAL);
          for (const k of STAT_KEYS) expect(b[k]).toBeGreaterThanOrEqual(STAT_MIN);
          for (const k of STAT_KEYS) expect(b[k]).toBeLessThanOrEqual(STAT_MAX);
        }
      }
      // ボクシングは軽く速く、相撲は重く強い
      expect(botBuild("boxing", seeded(1)).speed).toBeGreaterThan(botBuild("sumo", seeded(1)).speed);
      expect(botBuild("sumo", seeded(1)).power).toBeGreaterThan(botBuild("bjj", seeded(1)).power);
    });

    it("キャラ作り：自分の番なら作る。相手のキャラは見ないで決める", () => {
      const s = fight.applyMove(neutral(), build("boxing"), 0);
      const move = fight.botMove!(view(s, 1), 1, seeded(3)) as FightMove;
      expect(move.type).toBe("build");
      expect(codeOf(() => fight.applyMove(s, move, 1))).toBeNull();
      expect(fight.botMove!(view(s, 0), 0, seeded(3))).toBeNull();
    });

    it("技：今の位置で使える自分の技を、自分の番にだけ選ぶ", () => {
      for (const pos of POSITIONS) {
        const s = { ...built(f("boxing"), f("bjj")), position: pos };
        for (let i = 0; i < 30; i++) {
          const move = fight.botMove!(view(s, 1), 1, seeded(i)) as Extract<FightMove, { type: "act" }>;
          expect(usableMoves("bjj", pos).map((m) => m.id)).toContain(move.act);
        }
        expect(fight.botMove!(view(s, 0), 0, seeded(1))).toBeNull();
      }
    });

    it("相手が先に選んだ技はのぞかない（伏せた技が何でも同じように選ぶ）", () => {
      const s = built(f("mma"), f("karate"));
      const first = firstPicker(0);
      const second = other(first);
      const a = fight.applyMove(s, act("seiken"), first);
      const b = fight.applyMove(s, act("ashibarai"), first);
      expect(view(a, second)).toEqual(view(b, second));
      expect(fight.botMove!(view(a, second), second, seeded(5))).toEqual(fight.botMove!(view(b, second), second, seeded(5)));
    });

    it("相手の傾向を読む：組みに来てばかりの相手には打撃を、守ってばかりの相手には組み技を多く出す", () => {
      const pickRate = (oppAct: string, cls: "strike" | "grab") => {
        // 相手（先手のコンピュータではない方）がいつも同じ技を出してきた、という記録を作る
        const s0 = built(f("mma"), f("mma"));
        const history: Exchange[] = Array.from({ length: 5 }, () => ({
          acts: ["jab", oppAct],
          from: "standing",
          position: "standing",
          strikes: [],
          hp: [MAX_HP, MAX_HP],
          ko: null,
          brk: false,
        }));
        const s = { ...s0, history };
        const st = fight.status(s);
        if (st.kind !== "playing" || st.turn !== 0) throw new Error("先手の番にしたい");
        let n = 0;
        for (let i = 0; i < 200; i++) {
          const move = fight.botMove!(view(s, 0), 0, seeded(i)) as Extract<FightMove, { type: "act" }>;
          if (techniqueOf("mma", move.act)!.cls === cls) n++;
        }
        return n / 200;
      };
      expect(pickRate("tackle", "strike")).toBeGreaterThan(pickRate("guard", "strike"));
      expect(pickRate("guard", "grab")).toBeGreaterThan(pickRate("tackle", "grab"));
    });

    it("位置を読む：柔術は立ちでは寝技に引き込み、寝技では決め技を多く出す", () => {
      const rate = (pos: Position, ids: string[]) => {
        const s = { ...built(f("boxing"), f("bjj")), position: pos };
        let n = 0;
        for (let i = 0; i < 200; i++) {
          const move = fight.botMove!(view(s, 1), 1, seeded(i)) as Extract<FightMove, { type: "act" }>;
          if (ids.includes(move.act)) n++;
        }
        return n / 200;
      };
      expect(rate("ground", ["sankaku", "juji"])).toBeGreaterThan(0.3);
      expect(rate("standing", ["hikikomi"])).toBeGreaterThan(0.2);
    });

    /** seat のコンピュータが、ids のどれかを選ぶ割合 */
    const pickRate = (s: FightState, seat: Seat, ids: string[], n = 200) => {
      let hits = 0;
      for (let i = 0; i < n; i++) {
        const move = fight.botMove!(view(s, seat), seat, seeded(i)) as Extract<FightMove, { type: "act" }>;
        if (ids.includes(move.act)) hits++;
      }
      return hits / n;
    };
    /** 後手（1）がまだ選んでいない、はじめの攻防 */
    const at = (a: Fighter, b: Fighter, patch: Partial<FightState> = {}) => ({ ...built(a, b), ...patch });

    it("回復は体力が減ったときに使う（満タンではまず使わない）", () => {
      // 後半（5 回目の攻防）。前の 4 回は、相手の傾向にも技の回数にも数えない記録にしておく
      const earlier = Array.from({ length: 4 }, () => record(["-", "-"], { from: "clinch" }));
      /** 相手ごとの割合をならす */
      const heal = (style: StyleId, id: string, hp: number) =>
        STYLE_IDS.reduce((a, opp) => a + pickRate(at(f(opp), f(style), { hp: [MAX_HP, hp], history: earlier }), 1, [id], 40), 0) /
        STYLE_IDS.length;
      for (const [style, id] of [
        ["nurse", "teate"],
        ["robot", "reboot"],
        ["chef", "ajimi"],
      ] as const) {
        const full = heal(style, id, MAX_HP);
        const hurt = heal(style, id, 30);
        expect(full, style).toBeLessThan(0.02);
        expect(hurt, style).toBeGreaterThan(0.04);
        expect(hurt, style).toBeGreaterThan(full * 4);
      }
    });

    it("使い切った技は選ばない", () => {
      const used = [record(["guard", "reboot"])];
      const s = at(f("mma"), f("robot"), { hp: [MAX_HP, 30], history: used });
      const st = fight.status(s) as { turn: Seat };
      expect(st.turn).toBe(0);
      const picked = fight.applyMove(s, act("guard"), 0);
      expect(pickRate(picked, 1, ["reboot"])).toBe(0);
    });

    it("異種格闘技の技もそれらしく使う（見せ技・道具・読み・消える）", () => {
      // 見せ技は 1 局を通して何度か出す
      const share = (style: StyleId, ids: string[]) => {
        let n = 0;
        let all = 0;
        STYLE_IDS.forEach((opp, i) => {
          const end = botGame(f(style, botBuild(style, seeded(i))), f(opp, botBuild(opp, seeded(i))), seeded(100 + i));
          for (const ex of end.history) {
            all++;
            if (ids.includes(ex.acts[0])) n++;
          }
        });
        return n / all;
      };
      expect(share("idol", ["wink", "pose"])).toBeGreaterThan(0.05);
      expect(share("rapper", ["dis", "mic"])).toBeGreaterThan(0.05);
      expect(pickRate(at(f("mma"), f("chef")), 1, ["pan", "tsuyobi"])).toBeGreaterThan(0.2);
      expect(pickRate(at(f("boxing"), f("gamer")), 1, ["yomi"])).toBeGreaterThan(0.2);
      // 寝技で決め技を狙われているマジシャンは消えて逃げる
      expect(pickRate(at(f("bjj"), f("magician"), { position: "ground" }), 1, ["vanish"])).toBeGreaterThan(0.2);
    });

    it("見えていない情報は使わない（相手の伏せた技・運の列）", () => {
      const s = built(f("idol"), f("chef"));
      const first = firstPicker(0);
      const second = other(first);
      const a = fight.applyMove({ ...s, luck: s.luck.map((row) => row.map(() => 0.1)) }, act("sengiri"), first);
      const b = fight.applyMove({ ...s, luck: s.luck.map((row) => row.map(() => 0.9)) }, act("ajimi"), first);
      expect(fight.botMove!(view(a, second), second, seeded(5))).toEqual(fight.botMove!(view(b, second), second, seeded(5)));
    });

    it("コンピュータ同士で最後まで戦える（KO も判定も起きる）", () => {
      let kos = 0;
      for (let game = 0; game < 60; game++) {
        const rng = seeded(1000 + game);
        let s = fight.initialState(rng);
        for (let ply = 0; ply < 40; ply++) {
          const st = fight.status(s);
          if (st.kind === "finished") break;
          const move = fight.botMove!(fight.viewState!(s, st.turn, false), st.turn, rng);
          expect(move).not.toBeNull();
          s = fight.applyMove(s, move!, st.turn);
        }
        expect(fight.status(s).kind).toBe("finished");
        expect(s.history.length).toBeLessThanOrEqual(EXCHANGES);
        if (s.history.at(-1)?.ko != null) kos++;
      }
      expect(kos).toBeGreaterThan(10);
      expect(kos).toBeLessThan(55);
    });
  });

  describe("バランス", () => {
    /** 1 組あたりの局数（20 × 20 の 190 組。テストの時間が長くなりすぎないように） */
    const GAMES = 120;
    /** 35〜65% から外れた組だけ、局数を足して確かめ直す（局数が少ないと運のぶれだけで外れることがあるため） */
    const RECHECK = 600;
    /** たくさん対局するので、ほかのテストと並んで動いても間に合うように長めに待つ */
    const SLOW = 120_000;

    it("どのバックボーンどうしでも、勝率は 35〜65%。回復や強化・弱体があっても決着はつく（コンピュータ同士、振り分けはそれらしく）", () => {
      const out: string[] = [];
      const all = { games: 0, kos: 0, draws: 0, exchanges: 0 };
      const outside = (rate: number) => rate < 0.35 || rate > 0.65;
      STYLE_IDS.forEach((a, i) => {
        STYLE_IDS.slice(i + 1).forEach((b, j) => {
          const make = (rng: Rng): [Fighter, Fighter] => [f(a, botBuild(a, rng)), f(b, botBuild(b, rng))];
          const t = tally(make, GAMES, 7 + i * 31 + j);
          for (const k of ["games", "kos", "draws", "exchanges"] as const) all[k] += t[k];
          if (!outside(t.rate)) return;
          const more = tally(make, RECHECK, 100_007 + i * 31 + j);
          const rate = (t.rate * t.games + more.rate * more.games) / (t.games + more.games);
          if (outside(rate)) out.push(`${a} vs ${b}: ${Math.round(rate * 100)}%`);
        });
      });
      expect(out).toEqual([]);
      // 判定ばかり・引き分けばかりにならない
      expect(all.kos / all.games).toBeGreaterThan(0.3);
      expect(all.draws / all.games).toBeLessThan(0.03);
      expect(all.exchanges / all.games).toBeLessThan(EXCHANGES);
    }, SLOW);

    it("極端な振り分けにも勝ち目と弱点がある", () => {
      const extremes: FighterStats[] = [stats(8, 1, 3, 8), stats(8, 1, 8, 3), stats(1, 8, 3, 8), stats(3, 8, 8, 1), stats(1, 3, 8, 8), stats(8, 8, 1, 3)];
      for (const x of extremes) {
        // どのバックボーンで使うかごとに、ふつうに振り分けた相手（バックボーンはでたらめ）との勝率
        const rates = STYLE_IDS.map((style, i) =>
          winRate((rng) => {
            const opp = STYLE_IDS[Math.floor(rng() * STYLE_IDS.length)]!;
            return [f(style, x), f(opp, botBuild(opp, rng))];
          }, 40, 99 + i),
        );
        const label = JSON.stringify(x);
        // 合うバックボーンなら五分以上に戦え（勝ち目）、どれでも勝ち越せるわけではない（弱点）。勝ちすぎ・負けすぎもない
        expect(Math.max(...rates), label).toBeGreaterThan(0.45);
        expect(Math.min(...rates), label).toBeLessThan(0.5);
        const avg = rates.reduce((a, r) => a + r, 0) / rates.length;
        expect(avg, label).toBeGreaterThan(0.3);
        expect(avg, label).toBeLessThan(0.7);
      }
    }, SLOW);
  });
});
