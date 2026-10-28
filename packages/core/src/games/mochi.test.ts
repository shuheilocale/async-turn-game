import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  ACCESSORY_MIN,
  ACCESSORY_OF,
  accessoryOf,
  ACT_DEFS,
  ACTS,
  actsAt,
  ADULT,
  ALARM_MIN_HOURS,
  bodyColor,
  CARE_BASE,
  CARE_MATCH,
  BONUS_HOURS,
  CARES,
  CHILD,
  conditionAt,
  DEFAULT_ACT,
  feelingOf,
  FOLLOW_HOURS,
  isFollowUp,
  LIKE_JOY,
  likesOf,
  PLACE_ITEMS,
  PLACES,
  DAY,
  dayOf,
  DREAMS,
  EFFECTS,
  EGG_MOMENTS,
  EVENT_MIN_HOURS,
  FORM_AT,
  FORM_OF,
  FORMS,
  formOf,
  GROW_HOURS,
  GROW_MIN,
  happeningOf,
  HATCH,
  HOUR,
  ITEMS,
  JOY_CARES,
  LONELY_HOURS,
  mochi,
  MOMENTS,
  moodOf,
  nextAlarm,
  nowOf,
  RATES,
  SOFT,
  stageOf,
  stageProgress,
  START_NEEDS,
  WANT_AT,
  wantOf,
  type Act,
  type Care,
  type Condition,
  type Item,
  type MochiState,
  type Needs,
} from "./mochi.ts";

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

/** 2026 年 10 月 1 日 0 時（UTC）。時刻はここから数える */
const T0 = Date.UTC(2026, 9, 1);
const at = (hours: number) => T0 + hours * HOUR;

/** 最初の状態（卵をあずかる前） */
const fresh = (seed = 1): MochiState => mochi.initialState(seeded(seed));

/** 卵がかえったばかりの赤ちゃんを T0 にお世話した直後の状態。o で一部を変える */
const baby = (o: Partial<MochiState> = {}): MochiState => ({
  ...fresh(),
  bornAt: T0,
  at: T0,
  growth: HATCH,
  needs: { ...START_NEEDS },
  ...o,
});

const withNeeds = (needs: Needs, o: Partial<MochiState> = {}) => baby({ needs, ...o });

/** サーバと同じく stampMove で時刻を書き込んでから指す。席を省くと、目安の人（直前にお世話していない人） */
function careAt(s: MochiState, care: Care, time: number, seat?: Seat): MochiState {
  const st = mochi.status(s);
  const by = seat ?? (st.kind === "playing" ? st.turn : 0);
  return mochi.applyMove(s, mochi.stampMove!({ care }, time), by);
}

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

/** ほしいお世話があればそれを、なければ順番に選ぶ（ふつうの 2 人の遊び方） */
const follow = (s: MochiState, c: Condition) => wantOf(s, c) ?? CARES[(s.bySeat[0] + s.bySeat[1]) % CARES.length]!;

/**
 * 1 日のうちお世話する時刻（時）を決めて、2 人で交互にお世話を続ける。
 * おとなになるまでの日数と、お世話の回数、終わったときの状態を返す
 */
function playOut(hours: number[], pick: (s: MochiState, c: Condition) => Care = follow, seed = 1) {
  let s = fresh(seed);
  const stages: string[] = [];
  for (let day = 0; day < 40; day++) {
    for (const hr of hours) {
      const time = T0 + day * DAY + hr * HOUR;
      const c = conditionAt(s, time);
      s = careAt(s, pick(s, c), time);
      const stage = stageOf(s.growth);
      if (stages.at(-1) !== stage) stages.push(stage);
      if (mochi.status(s).kind === "finished") {
        return { days: (s.adultAt! - s.bornAt!) / DAY, moves: s.bySeat[0] + s.bySeat[1], state: s, stages };
      }
    }
  }
  throw new Error("40 日たってもおとなにならなかった");
}

/** お試しと同じく、1 手ごとに時計を step 時間進めて、おとなになるまでの手の数 */
function learnMoves(step: number, seed = 1) {
  let s = fresh(seed);
  for (let n = 0; n < 100; n++) {
    const time = T0 + n * step * HOUR;
    s = careAt(s, follow(s, conditionAt(s, time)), time);
    if (mochi.status(s).kind === "finished") return n + 1;
  }
  throw new Error("100 手でおとなにならなかった");
}

describe("時間で変わる具合（conditionAt）", () => {
  it("はじめてお世話する前は、時間がたっても何も変わらない", () => {
    const s = fresh();
    const c = conditionAt(s, at(500));
    expect(c.needs).toEqual(START_NEEDS);
    expect(c.growth).toBe(0);
    expect(c.asleep).toBe(false);
  });

  it("卵のあいだは具合が変わらず、育つ量だけが 1 時間に 1 ずつ増える", () => {
    const s = baby({ growth: 1 });
    const c = conditionAt(s, at(3));
    expect(c.needs).toEqual(START_NEEDS);
    expect(c.growth).toBeCloseTo(4);
    expect(c.stage).toBe("egg");
  });

  it("起きているあいだ、おなかときげんは減り、ねむけは増える（1 時間あたり RATES の量）", () => {
    const c = conditionAt(withNeeds({ tummy: 90, joy: 90, sleepy: 10 }), at(5));
    expect(c.asleep).toBe(false);
    expect(c.needs.tummy).toBeCloseTo(90 - 5 * RATES.tummy);
    expect(c.needs.joy).toBeCloseTo(90 - 5 * RATES.joy);
    expect(c.needs.sleepy).toBeCloseTo(10 + 5 * RATES.sleepyUp);
  });

  it("おなか・きげんは 0 より下がらず、ねむけは 0〜100 におさまる", () => {
    for (const hours of [1, 10, 30, 100, 24 * 30, 24 * 365]) {
      const { needs } = conditionAt(withNeeds({ tummy: 20, joy: 10, sleepy: 50 }), at(hours));
      for (const v of [needs.tummy, needs.joy, needs.sleepy]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    const later = conditionAt(withNeeds({ tummy: 20, joy: 10, sleepy: 0 }), at(15));
    expect(later.needs.tummy).toBe(0);
    expect(later.needs.joy).toBe(0);
  });

  it("ねむけが 100 になると自分で眠り、眠っているあいだにねむけが減って、0 になると起きる", () => {
    const s = withNeeds({ tummy: 100, joy: 100, sleepy: 90 });
    const fallAsleep = (100 - 90) / RATES.sleepyUp;
    const wakeUp = fallAsleep + 100 / RATES.sleepyDown;
    expect(conditionAt(s, at(fallAsleep - 0.1)).asleep).toBe(false);
    const sleeping = conditionAt(s, at(fallAsleep + 2));
    expect(sleeping.asleep).toBe(true);
    expect(sleeping.slept).toBe(true);
    expect(sleeping.needs.sleepy).toBeCloseTo(100 - 2 * RATES.sleepyDown);
    const awake = conditionAt(s, at(wakeUp + 1));
    expect(awake.asleep).toBe(false);
    expect(awake.needs.sleepy).toBeCloseTo(RATES.sleepyUp);
    // 眠らなかった間なら slept は false
    expect(conditionAt(s, at(fallAsleep - 0.1)).slept).toBe(false);
  });

  it("眠っているあいだは、おなかの減りがゆっくりで、きげんは減らない", () => {
    const c = conditionAt(withNeeds({ tummy: 80, joy: 70, sleepy: 90 }, { asleep: true }), at(4));
    expect(c.asleep).toBe(true);
    expect(c.needs.tummy).toBeCloseTo(80 - 4 * RATES.tummyAsleep);
    expect(c.needs.joy).toBeCloseTo(70 - 4 * RATES.joyAsleep);
    expect(RATES.tummyAsleep).toBeLessThan(RATES.tummy);
  });

  it("育つのは、最後のお世話から GROW_HOURS 時間まで。それより後は育たない（しぼみもしない）", () => {
    const s = baby();
    const end = conditionAt(s, at(GROW_HOURS)).growth;
    expect(end).toBeGreaterThan(HATCH);
    expect(conditionAt(s, at(GROW_HOURS + 50)).growth).toBeCloseTo(end);
    expect(conditionAt(s, at(24 * 365)).growth).toBeCloseTo(end);
  });

  it("具合がよいほど速く育つ。どんなに具合が悪くても GROW_MIN の速さでは育つ", () => {
    const good = conditionAt(withNeeds({ tummy: 100, joy: 100, sleepy: 0 }), at(2)).growth - HATCH;
    const bad = conditionAt(withNeeds({ tummy: 0, joy: 0, sleepy: 99 }), at(0.2)).growth - HATCH;
    expect(good).toBeGreaterThan(2 * 0.9);
    expect(good).toBeLessThanOrEqual(2);
    expect(bad).toBeGreaterThanOrEqual(0.2 * GROW_MIN - 1e-9);
    expect(bad / 0.2).toBeLessThan(good / 2);
  });

  it("時刻が最後のお世話より前なら、最後のお世話のときのまま", () => {
    const s = withNeeds({ tummy: 50, joy: 40, sleepy: 30 }, { growth: 20 });
    const c = conditionAt(s, at(-5));
    expect(c.needs).toEqual(s.needs);
    expect(c.growth).toBe(20);
    expect(nowOf(s, at(-5))).toBe(T0);
    expect(nowOf(s, at(3))).toBe(at(3));
    expect(nowOf(fresh(), at(3))).toBe(at(3));
  });
});

describe("お世話の効き方", () => {
  const mid = { tummy: 50, joy: 50, sleepy: 50 };

  it.each(CARES)("%s：具合が EFFECTS のぶん変わる（0〜100 におさまる）", (care) => {
    const s = careAt(withNeeds(mid), care, T0);
    const e = EFFECTS[care];
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    expect(s.needs.tummy).toBeCloseTo(clamp(50 + (e.tummy ?? 0)));
    expect(s.needs.joy).toBeCloseTo(clamp(50 + (e.joy ?? 0)));
    expect(s.needs.sleepy).toBeCloseTo(clamp(50 + (e.sleepy ?? 0)));
    expect(s.cares[care]).toBe(1);
    expect(s.last).toMatchObject({ care, seat: 0, at: T0 });
  });

  it("ごはんはおなか、ねかしつけるはねむけ、ほかはきげんにいちばん効く", () => {
    expect(EFFECTS.feed.tummy).toBeGreaterThan(30);
    expect(EFFECTS.sleep.sleepy).toBeLessThan(0);
    for (const care of JOY_CARES) expect(EFFECTS[care].joy).toBeGreaterThan(15);
  });

  it("ねかしつけると眠る。眠っているときになでても起きないが、ほかのお世話では起きる", () => {
    const sleeping = careAt(withNeeds({ tummy: 80, joy: 80, sleepy: 80 }), "sleep", T0);
    expect(sleeping.asleep).toBe(true);
    const patted = careAt(sleeping, "pet", at(1));
    expect(patted.asleep).toBe(true);
    for (const care of ["feed", "play", "talk", "walk"] as const) {
      expect(careAt(sleeping, care, at(1)).asleep).toBe(false);
    }
  });

  it("ほしがっているお世話をすると、ほかのお世話より育つ", () => {
    // おなかがすいている → ごはんがほしい
    const hungry = withNeeds({ tummy: 10, joy: 90, sleepy: 10 });
    const time = at(BONUS_HOURS);
    expect(wantOf(hungry, conditionAt(hungry, time))).toBe("feed");
    const fed = careAt(hungry, "feed", time);
    const played = careAt(hungry, "play", time);
    expect(fed.last?.matched).toBe(true);
    expect(played.last?.matched).toBe(false);
    expect(fed.growth - played.growth).toBeCloseTo(CARE_MATCH - CARE_BASE);
  });

  it("前のお世話からすぐに続けても、育つおまけは少ない（BONUS_HOURS かけて元に戻る）", () => {
    const s = withNeeds({ tummy: 90, joy: 90, sleepy: 10 });
    const bonus = (hours: number) => careAt(s, "talk", at(hours)).growth - conditionAt(s, at(hours)).growth;
    expect(bonus(0)).toBeCloseTo(0);
    expect(bonus(BONUS_HOURS / 2)).toBeCloseTo(CARE_BASE / 2);
    expect(bonus(BONUS_HOURS)).toBeCloseTo(CARE_BASE);
    expect(bonus(BONUS_HOURS * 3)).toBeCloseTo(CARE_BASE);
  });

  it("卵のあいだのお世話は具合を変えず、少しだけ育てる", () => {
    const s = careAt(fresh(), "feed", T0);
    expect(s.needs).toEqual(START_NEEDS);
    expect(s.growth).toBeCloseTo(CARE_BASE);
    expect(s.bornAt).toBe(T0);
  });
});

describe("ほしいお世話（wantOf）", () => {
  const want = (s: MochiState, hours = 0) => wantOf(s, conditionAt(s, at(hours)));

  it("卵のあいだは何もほしがらない。具合がよければ何もほしがらない", () => {
    expect(want(fresh())).toBeNull();
    expect(want(baby({ growth: 2 }))).toBeNull();
    expect(want(withNeeds({ tummy: 90, joy: 90, sleepy: 10 }))).toBeNull();
  });

  it("いちばん足りないものをほしがる：おなか → ごはん、ねむけ → ねかしつける", () => {
    expect(want(withNeeds({ tummy: 20, joy: 70, sleepy: 30 }))).toBe("feed");
    expect(want(withNeeds({ tummy: 80, joy: 70, sleepy: 85 }))).toBe("sleep");
  });

  it("きげんが足りないときは、あそぶ・なでる・おしゃべり・おでかけのどれか。同じお世話のあいだは変わらない", () => {
    const seen = new Set<Care | null>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = withNeeds({ tummy: 90, joy: 20, sleepy: 10 }, { seed });
      const w = want(s);
      expect(JOY_CARES).toContain(w);
      expect(want(s, 0.5)).toBe(w);
      seen.add(w);
    }
    expect(seen.size).toBe(JOY_CARES.length);
  });

  it("眠っているあいだは何もほしがらない（ねむけが残っていても）", () => {
    expect(want(withNeeds({ tummy: 60, joy: 60, sleepy: 90 }, { asleep: true }))).toBeNull();
    expect(want(withNeeds({ tummy: 10, joy: 60, sleepy: 90 }, { asleep: true }))).toBeNull();
  });
});

describe("順番なし（2 人ともいつでもお世話できる）と手", () => {
  it("status は順番なし（free）。turn は目安で、直前にお世話していない人", () => {
    let s = fresh();
    expect(mochi.status(s)).toEqual({ kind: "playing", turn: 0, free: true });
    s = careAt(s, "pet", at(0), 0);
    expect(mochi.status(s)).toEqual({ kind: "playing", turn: 1, free: true });
    s = careAt(s, "talk", at(1), 1);
    expect(mochi.status(s)).toEqual({ kind: "playing", turn: 0, free: true });
    s = careAt(s, "feed", at(2), 1);
    expect(mochi.status(s)).toEqual({ kind: "playing", turn: 0, free: true });
  });

  it("同じ人が何回続けてもお世話できる。相手もいつでもお世話できる", () => {
    let s = fresh();
    for (let i = 0; i < 5; i++) s = careAt(s, CARES[i % CARES.length]!, at(i * 4), 0);
    expect(s.bySeat).toEqual([5, 0]);
    s = careAt(s, "feed", at(21), 1);
    s = careAt(s, "pet", at(21.5), 1);
    expect(s.bySeat).toEqual([5, 2]);
    expect(s.last).toMatchObject({ care: "pet", seat: 1, at: at(21.5) });
  });

  it("前から遊んでいる途中の対局（手番が決まっている状態）も、どちらの席からでも続けられる", () => {
    // 前は、お世話した人の相手が turn に入っていた
    const old = careAt(withNeeds({ tummy: 60, joy: 60, sleepy: 20 }), "pet", at(1), 0);
    expect(old.turn).toBe(1);
    const saved: Partial<MochiState> = { ...old };
    delete saved.lastOf;
    const again = careAt(saved as MochiState, "talk", at(2), 0);
    expect(again.bySeat).toEqual([2, 0]);
    // やることを選ばない手は、お世話ごとの最初のやること
    expect(again.lastOf).toEqual([{ care: "talk", act: "today", at: at(2) }, null]);
    expect(careAt(saved as MochiState, "feed", at(2), 1).bySeat).toEqual([1, 1]);
  });

  it("1 人で続けてお世話しても、2 人で交互にしたのと同じだけしか育たない（すぐ続けるとおまけは少ない）", () => {
    const plan: [Care, number][] = [
      ["feed", 0],
      ["pet", 0.5],
      ["talk", 1],
      ["play", 4],
      ["feed", 4.2],
    ];
    let alone = baby();
    let both = baby();
    plan.forEach(([care, hours], i) => {
      alone = careAt(alone, care, at(hours), 0);
      both = careAt(both, care, at(hours), (i % 2) as Seat);
    });
    expect(alone.growth).toBeCloseTo(both.growth);
    expect(alone.needs).toEqual(both.needs);
    // すぐに続けたお世話のおまけは少ない
    const quick = careAt(careAt(baby(), "talk", at(3), 0), "pet", at(3), 0);
    expect(quick.growth - conditionAt(careAt(baby(), "talk", at(3), 0), at(3)).growth).toBeCloseTo(0);
  });

  it("席ごとに、さいごにしたお世話を覚えておく（直前に相手がしたお世話と、自分がしたお世話が分かる）", () => {
    let s = fresh();
    expect(s.lastOf).toEqual([null, null]);
    s = careAt(s, "feed", at(0), 0);
    s = careAt(s, "pet", at(1), 1);
    s = careAt(s, "talk", at(2), 1);
    expect(s.lastOf).toEqual([
      { care: "feed", at: at(0) },
      { care: "talk", at: at(2) },
    ]);
  });

  it("体の色は、2 人のお世話の回数の差で動く（1 人が多くお世話すると、その人の色に寄る）", () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) s = careAt(s, "pet", at(i * 4), 0);
    expect(bodyColor(s.bySeat)).toBe(SOFT[0]);
    s = careAt(s, "talk", at(13), 1);
    const leaning = bodyColor(s.bySeat);
    expect(leaning).not.toBe(SOFT[0]);
    expect(leaning).not.toBe(bodyColor([1, 1]));
    for (let i = 0; i < 2; i++) s = careAt(s, "feed", at(17 + i * 4), 1);
    expect(bodyColor(s.bySeat)).toBe(bodyColor([1, 1]));
    for (let i = 0; i < 4; i++) s = careAt(s, "play", at(26 + i * 4), 1);
    expect(s.bySeat).toEqual([3, 7]);
    expect(bodyColor(s.bySeat)).toBe(bodyColor([3, 7]));
    expect(bodyColor(s.bySeat)).not.toBe(bodyColor([1, 1]));
  });

  it("知らないお世話は受け付けない", () => {
    expect(codeOf(() => mochi.applyMove(fresh(), { care: "dance" as Care, at: T0 }, 0))).toBe("mochi_no_such_care");
  });

  it("parseMove：6 つのお世話だけを読み、送られてきた時刻は捨てる", () => {
    for (const care of CARES) expect(mochi.parseMove({ care })).toEqual({ care });
    expect(mochi.parseMove({ care: "feed", at: 123 })).toEqual({ care: "feed" });
    for (const raw of [null, undefined, 1, "feed", {}, { care: "dance" }, { care: 1 }, []]) {
      expect(mochi.parseMove(raw)).toBeNull();
    }
  });

  it("stampMove：受け取った時刻を書き込み、手に付いていた時刻は上書きする", () => {
    expect(mochi.stampMove!({ care: "feed" }, 1234)).toEqual({ care: "feed", at: 1234 });
    expect(mochi.stampMove!({ care: "feed", at: 99999999999999 }, 1234)).toEqual({ care: "feed", at: 1234 });
  });
});

describe("時刻", () => {
  it("はじめてのお世話の時刻が、卵をあずかった時刻になる", () => {
    const s = careAt(fresh(), "pet", at(7));
    expect(s.bornAt).toBe(at(7));
    expect(s.at).toBe(at(7));
    expect(careAt(s, "talk", at(9)).bornAt).toBe(at(7));
  });

  it("時刻が前の手より戻っていたら、前の手の時刻にそろえる（時間は進まない）", () => {
    const s = careAt(withNeeds({ tummy: 60, joy: 60, sleepy: 20 }, { growth: 20 }), "pet", at(10));
    const back = careAt(s, "talk", at(4));
    const same = careAt(s, "talk", at(10));
    expect(back.at).toBe(at(10));
    expect(back.needs).toEqual(same.needs);
    expect(back.growth).toBe(same.growth);
    expect(back.last?.at).toBe(at(10));
  });

  it("時刻のない手は、前の手の時刻に指したことにする", () => {
    const s = careAt(baby(), "pet", at(5));
    const none = mochi.applyMove(s, { care: "talk" }, 1);
    expect(none.at).toBe(at(5));
    expect(none.needs).toEqual(careAt(s, "talk", at(5)).needs);
  });

  it("日数は卵をあずかった日を 1 日目として数える", () => {
    const s = baby({ bornAt: T0 });
    expect(dayOf(s, at(0))).toBe(1);
    expect(dayOf(s, at(23.9))).toBe(1);
    expect(dayOf(s, at(24))).toBe(2);
    expect(dayOf(s, at(24 * 5 + 1))).toBe(6);
    expect(dayOf(fresh(), at(100))).toBe(1);
  });
});

describe("死なない・いなくならない・弱らない", () => {
  it("どれだけ放っておいても終わらず、戻ってきてお世話すればすぐ元気になる", () => {
    const s = baby({ needs: { tummy: 30, joy: 30, sleepy: 30 } });
    for (const hours of [24 * 3, 24 * 30, 24 * 365]) {
      const c = conditionAt(s, at(hours));
      expect(mochi.status(s).kind).toBe("playing");
      expect(c.growth).toBeGreaterThanOrEqual(s.growth);
      const fed = careAt(s, "feed", at(hours));
      expect(fed.needs.tummy).toBeCloseTo(Math.min(100, c.needs.tummy + EFFECTS.feed.tummy!));
      const played = careAt(fed, "play", at(hours + 0.1));
      expect(played.needs.joy).toBeGreaterThanOrEqual(EFFECTS.play.joy! - 1);
      expect(played.growth).toBeGreaterThanOrEqual(fed.growth);
    }
  });

  it("育った量はどのお世話でも減らない。失敗では終わらない", () => {
    const { state } = playOut([8, 20], (s) => CARES[(s.bySeat[0] * 7 + s.bySeat[1] * 3) % CARES.length]!);
    expect(mochi.status(state)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    let s = fresh(3);
    let last = 0;
    for (let i = 0; i < 40; i++) {
      s = careAt(s, CARES[i % CARES.length]!, at(i * 5));
      expect(s.growth).toBeGreaterThanOrEqual(last);
      last = s.growth;
      if (mochi.status(s).kind === "finished") break;
    }
  });
});

describe("育つ段階と、おとなまでの日数", () => {
  it("育った量で段階が決まる", () => {
    expect(stageOf(0)).toBe("egg");
    expect(stageOf(HATCH - 0.01)).toBe("egg");
    expect(stageOf(HATCH)).toBe("baby");
    expect(stageOf(CHILD - 0.01)).toBe("baby");
    expect(stageOf(CHILD)).toBe("child");
    expect(stageOf(ADULT - 0.01)).toBe("child");
    expect(stageOf(ADULT)).toBe("adult");
    expect(stageProgress(0)).toBe(0);
    expect(stageProgress((HATCH + CHILD) / 2)).toBeCloseTo(0.5);
    expect(stageProgress(ADULT + 10)).toBe(1);
  });

  it("おとなになるのはお世話をしたとき。時間だけでおとなの量に届いても、こどものまま待っている", () => {
    const s = baby({ growth: ADULT - 0.5, needs: { tummy: 100, joy: 100, sleepy: 0 } });
    const c = conditionAt(s, at(5));
    expect(c.growth).toBeGreaterThan(ADULT);
    expect(c.stage).toBe("child");
    expect(mochi.status(s).kind).toBe("playing");
    const done = careAt(s, "feed", at(5));
    expect(stageOf(done.growth)).toBe("adult");
    expect(mochi.status(done).kind).toBe("finished");
  });

  it("1 日に 2 人で 4 回お世話すると、5 日ほどでおとなになる。卵は 1 日目のうちにかえる", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { days, stages } = playOut([8, 12.5, 19, 22.5], follow, seed);
      expect(days).toBeGreaterThanOrEqual(4.5);
      expect(days).toBeLessThanOrEqual(7);
      expect(stages).toEqual(["egg", "baby", "child", "adult"]);
    }
    let s = fresh();
    for (const hr of [8, 12.5, 19, 22.5]) s = careAt(s, follow(s, conditionAt(s, at(hr))), at(hr));
    expect(stageOf(conditionAt(s, at(24)).growth)).not.toBe("egg");
  });

  it("1 日 3 回なら 5〜7 日、1 日 2 回なら 6〜9 日ほど、1 日 6 回でも 4 日より早くはならない", () => {
    expect(playOut([8, 13, 21]).days).toBeGreaterThanOrEqual(5);
    expect(playOut([8, 13, 21]).days).toBeLessThanOrEqual(7);
    expect(playOut([8, 21]).days).toBeGreaterThanOrEqual(5.5);
    expect(playOut([8, 21]).days).toBeLessThanOrEqual(9);
    expect(playOut([7, 10, 13, 16, 19, 22]).days).toBeGreaterThanOrEqual(4);
    // 2 人ともずっと開いていて、10 分ごとにお世話しても 4 日より早くはならない
    const busy = Array.from({ length: 16 * 6 }, (_, i) => 7 + i / 6);
    expect(playOut(busy).days).toBeGreaterThanOrEqual(4);
  });

  it("お試し（1 手ごとに 12 時間進む）なら、10〜16 手でおとなになる", () => {
    for (const seed of [1, 2, 3]) {
      const n = learnMoves(12, seed);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(16);
    }
  });
});

describe("おとなの姿", () => {
  const counts = (o: Partial<Record<Care, number>>) =>
    Object.fromEntries(CARES.map((c) => [c, o[c] ?? 0])) as Record<Care, number>;

  it("いちばん多かったお世話で姿が決まる（ごはん → まんまる など）", () => {
    for (const care of CARES) expect(formOf(counts({ [care]: 10, feed: care === "feed" ? 10 : 2 }))).toBe(FORM_OF[care]);
    expect(FORM_OF).toMatchObject({ feed: "round", play: "hop", talk: "ears" });
  });

  it("めやすの割合（FORM_AT）に届いたかで見る。どれも届かなければ、なかよしの姿", () => {
    const even = counts(Object.fromEntries(CARES.map((c) => [c, Math.round(FORM_AT[c] * 50)])));
    expect(formOf(even)).toBe("harmony");
    expect(formOf(counts({}))).toBe("harmony");
    // ごはんはもともと多いので、3 割ほどではまだまんまるにならない
    expect(formOf(counts({ feed: 29, play: 14, pet: 14, talk: 14, sleep: 16, walk: 13 }))).toBe("harmony");
    expect(formOf(counts({ feed: 40, play: 12, pet: 12, talk: 12, sleep: 12, walk: 12 }))).toBe("round");
    expect(formOf(counts({ feed: 28, play: 12, pet: 12, talk: 24, sleep: 12, walk: 12 }))).toBe("ears");
  });

  it("姿は 7 種類で、遊び方しだいでどれにもなれる", () => {
    expect(FORMS).toHaveLength(7);
    const seen = new Set<string>();
    for (const care of CARES) {
      // ほしいものがなければ、いつも同じお世話をする 2 人
      const { state } = playOut([8, 12.5, 19, 22.5], (s, c) => {
        const w = wantOf(s, c);
        return (s.bySeat[0] + s.bySeat[1]) % 3 === 0 && w ? w : care;
      });
      expect(state.form).toBe(FORM_OF[care]);
      seen.add(state.form!);
    }
    // ほしいものに合わせ、ないときは順番に選ぶ 2 人はなかよしになりやすい
    const harmony = [1, 2, 3, 4, 5, 6].filter((seed) => playOut([8, 12.5, 19, 22.5], follow, seed).state.form === "harmony");
    expect(harmony.length).toBeGreaterThanOrEqual(3);
    seen.add("harmony");
    expect(seen.size).toBe(FORMS.length);
  });
});

describe("体の色", () => {
  const dist = (a: string, b: string) => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [rgb(a), rgb(b)];
    return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
  };

  it("先手だけなら青、後手だけならオレンジのやわらかい色。同じ回数なら真ん中", () => {
    expect(bodyColor([5, 0])).toBe(SOFT[0]);
    expect(bodyColor([0, 5])).toBe(SOFT[1]);
    expect(bodyColor([0, 0])).toBe(bodyColor([4, 4]));
    expect(bodyColor([3, 3])).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("お世話の量の割合に合わせて、だんだんもう 1 人の色に近づく", () => {
    let prev = -1;
    for (let k = 0; k <= 10; k++) {
      const d = dist(bodyColor([10 - k, k]), SOFT[0]);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });
});

describe("留守のあいだのできごと（happeningOf）", () => {
  it("はじめてのお世話の前と、前のお世話から EVENT_MIN_HOURS たっていないときは何も起きない", () => {
    expect(happeningOf(fresh(), at(10))).toBeNull();
    expect(happeningOf(baby(), at(EVENT_MIN_HOURS - 0.1))).toBeNull();
    expect(happeningOf(baby(), at(EVENT_MIN_HOURS))).not.toBeNull();
  });

  it("同じ状態・同じ時刻なら、いつ計算しても同じできごと", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = baby({ seed });
      expect(happeningOf(s, at(6))).toEqual(happeningOf(s, at(6)));
    }
  });

  it("卵のあいだは卵のできごと。かえったら「かえった」、こどもになったら「大きくなった」", () => {
    const egg = baby({ growth: 1 });
    expect(happeningOf(egg, at(2))).toMatchObject({ kind: "egg" });
    expect(EGG_MOMENTS).toContain((happeningOf(egg, at(2)) as { topic: string }).topic);
    expect(happeningOf(egg, at(HATCH))).toEqual({ kind: "hatched" });
    expect(happeningOf(baby({ growth: CHILD - 1 }), at(4))).toEqual({ kind: "grew" });
  });

  it("おでかけのあとは、かならず何かを拾ってくる", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = careAt(baby({ seed }), "walk", at(1));
      expect(happeningOf(s, at(4))).toMatchObject({ kind: "found", walk: true });
    }
  });

  it("拾いもの・夢・ひとこまのどれも起きる。夢は眠ったときだけ", () => {
    const kinds = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed++) {
      const awake = baby({ seed, needs: { tummy: 90, joy: 90, sleepy: 0 } });
      const h = happeningOf(awake, at(6))!;
      expect(h.kind).not.toBe("dream");
      kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + 1);
      if (h.kind === "moment") expect(MOMENTS).toContain(h.topic);
      const sleepy = baby({ seed, asleep: true, needs: { tummy: 90, joy: 90, sleepy: 80 } });
      const d = happeningOf(sleepy, at(5))!;
      if (d.kind === "dream") expect(DREAMS).toContain(d.topic);
      kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
    }
    expect(kinds.get("found")).toBeGreaterThan(40);
    expect(kinds.get("dream")).toBeGreaterThan(40);
    expect(kinds.get("moment")).toBeGreaterThan(40);
  });

  it("拾ってくるのは、まだ持っていないものから", () => {
    const missing = ITEMS[5]!;
    const treasures = ITEMS.filter((i) => i !== missing).map((item) => ({ item, at: T0 }));
    for (let seed = 1; seed <= 10; seed++) {
      const s = careAt(baby({ seed, treasures }), "walk", at(0));
      // 行き先（こうえん）で見つかるものは全部持っているので、ほかのまだ持っていないものから
      expect(happeningOf(s, at(3))).toEqual({ kind: "found", item: missing, walk: true, place: "park" });
    }
    // 全部そろったら、どれでも
    const all = careAt(baby({ treasures: ITEMS.map((item) => ({ item, at: T0 })) }), "walk", at(1));
    expect(ITEMS).toContain((happeningOf(all, at(3)) as { item: string }).item);
  });

  it("お世話したときに、そのあいだのできごとが日記に残り、拾ったものはたからものになる", () => {
    const s = careAt(baby({ seed: 7 }), "walk", at(1), 0);
    const h = happeningOf(s, at(5));
    expect(h?.kind).toBe("found");
    const next = careAt(s, "feed", at(5), 1);
    expect(next.diary.at(-1)).toEqual({ at: at(5), seat: 1, happening: h });
    expect(next.treasures.at(-1)).toEqual({ item: (h as { item: string }).item, at: at(5) });
    // できごとがなければ日記は増えない
    const quick = careAt(next, "pet", at(5.2), 0);
    expect(quick.diary).toHaveLength(next.diary.length);
  });
});

describe("知らせる時刻（nextAlarm）", () => {
  /** 前と 1 秒前を比べて、ちょうどその時刻に変わったか */
  const justAt = (s: MochiState, time: number, ok: (c: Condition) => boolean) => {
    expect(ok(conditionAt(s, time))).toBe(true);
    expect(ok(conditionAt(s, time - 1000))).toBe(false);
  };
  const hungryAt = 100 - WANT_AT;

  it("はじめてのお世話の前と、おとなになったあとは知らせない", () => {
    expect(nextAlarm(fresh())).toBeNull();
    const { state } = playOut([8, 20]);
    expect(nextAlarm(state)).toBeNull();
  });

  it("卵のときは、かえる時刻", () => {
    const s = careAt(fresh(), "feed", T0);
    const alarm = nextAlarm(s)!;
    expect(alarm.kind).toBe("hatched");
    expect(alarm.at).toBeCloseTo(T0 + (HATCH - CARE_BASE) * HOUR, -3);
    justAt(s, alarm.at, (c) => c.growth >= HATCH);
  });

  it("おなかがすいて、ごはんをほしがるくらいになる時刻（起きているとき）", () => {
    const s = withNeeds({ tummy: 80, joy: 100, sleepy: 0 });
    const alarm = nextAlarm(s)!;
    expect(alarm.kind).toBe("hungry");
    expect(alarm.at).toBeCloseTo(at((80 - hungryAt) / RATES.tummy), -3);
    justAt(s, alarm.at, (c) => c.needs.tummy <= hungryAt);
    expect(conditionAt(s, alarm.at).asleep).toBe(false);
  });

  it("眠っているあいだにおなかがすいたら、目がさめた時刻に「おなかがすいた」", () => {
    const s = withNeeds({ tummy: 70, joy: 100, sleepy: 100 }, { asleep: true });
    const alarm = nextAlarm(s)!;
    expect(alarm.kind).toBe("hungry");
    expect(alarm.at).toBeCloseTo(at(100 / RATES.sleepyDown), -3);
    justAt(s, alarm.at, (c) => !c.asleep);
  });

  it("眠っていたら、目がさめる時刻。起きていても、ねむくて眠ってしまうなら、そのあと目がさめる時刻", () => {
    const s = withNeeds({ tummy: 100, joy: 100, sleepy: 50 }, { asleep: true });
    expect(nextAlarm(s)!.kind).toBe("wake");
    expect(nextAlarm(s)!.at).toBeCloseTo(at(50 / RATES.sleepyDown), -3);
    justAt(s, nextAlarm(s)!.at, (c) => c.slept && !c.asleep);
    const sleepy = withNeeds({ tummy: 100, joy: 100, sleepy: 92 });
    expect(nextAlarm(sleepy)!.kind).toBe("wake");
    expect(nextAlarm(sleepy)!.at).toBeCloseTo(at(8 / RATES.sleepyUp + 100 / RATES.sleepyDown), -3);
  });

  it("おとなになれるくらい育つ時刻（お世話するとおとなになる）", () => {
    const s = baby({ growth: ADULT - 3, needs: { tummy: 100, joy: 100, sleepy: 0 } });
    const alarm = nextAlarm(s)!;
    expect(alarm.kind).toBe("grown");
    justAt(s, alarm.at, (c) => c.growth >= ADULT);
  });

  it("ほかに何もなければ、さいごのお世話から LONELY_HOURS 時間たった時刻（しばらくだれも来ていない）", () => {
    const s = withNeeds({ tummy: 100, joy: 100, sleepy: 0 });
    expect(nextAlarm(s)).toEqual({ at: at(LONELY_HOURS), kind: "lonely" });
    // お世話したときにもうおなかがすいていたら（お世話した人が見ている）、おなかの知らせは出さない
    expect(nextAlarm(withNeeds({ tummy: 30, joy: 100, sleepy: 0 }))).toEqual({ at: at(LONELY_HOURS), kind: "lonely" });
    // お世話のすぐあと（ALARM_MIN_HOURS より前）に起きることも知らせない
    const soon = withNeeds({ tummy: hungryAt + RATES.tummy * ALARM_MIN_HOURS * 0.5, joy: 100, sleepy: 0 });
    expect(nextAlarm(soon)).toEqual({ at: at(LONELY_HOURS), kind: "lonely" });
  });

  it("同じ状態なら同じ答え（JSON にしても同じ）。お世話のたびに、さいごのお世話より後の時刻になる", () => {
    let s = fresh(4);
    for (let i = 0; i < 30 && mochi.status(s).kind === "playing"; i++) {
      const time = at(i * 5.5);
      s = careAt(s, follow(s, conditionAt(s, time)), time, (i % 3 === 0 ? 1 : 0) as Seat);
      const alarm = nextAlarm(s);
      if (mochi.status(s).kind === "finished") {
        expect(alarm).toBeNull();
        break;
      }
      expect(alarm).not.toBeNull();
      expect(alarm).toEqual(nextAlarm(JSON.parse(JSON.stringify(s))));
      expect(alarm!.at).toBeGreaterThanOrEqual(s.at! + ALARM_MIN_HOURS * HOUR);
      expect(alarm!.at).toBeLessThanOrEqual(s.at! + LONELY_HOURS * HOUR);
      expect(Number.isInteger(alarm!.at)).toBe(true);
    }
  });

  it("ゲームの定義からも呼べる（サーバが時刻になったら知らせるのに使う）", () => {
    const s = withNeeds({ tummy: 80, joy: 100, sleepy: 0 });
    expect(mochi.nextAlarm!(s)).toEqual(nextAlarm(s));
  });
});

describe("ようす（moodOf）", () => {
  const mood = (needs: Needs, asleep = false) => moodOf({ ...conditionAt(withNeeds(needs, { asleep }), T0) });
  it("眠っている・ねむい・おなかがすいた・しょんぼり・ごきげん・ふつう", () => {
    expect(mood({ tummy: 80, joy: 80, sleepy: 50 }, true)).toBe("asleep");
    expect(mood({ tummy: 80, joy: 80, sleepy: 85 })).toBe("sleepy");
    expect(mood({ tummy: 10, joy: 80, sleepy: 20 })).toBe("hungry");
    expect(mood({ tummy: 80, joy: 15, sleepy: 20 })).toBe("sad");
    expect(mood({ tummy: 80, joy: 80, sleepy: 20 })).toBe("happy");
    expect(mood({ tummy: 50, joy: 45, sleepy: 50 })).toBe("calm");
    expect(moodOf(conditionAt(baby({ growth: 1 }), T0))).toBe("egg");
  });
});

describe("終わり", () => {
  it("おとなになったら 2 人でクリア。姿・おとなになった時刻が決まり、もう指せない", () => {
    const { state, days } = playOut([8, 12.5, 19, 22.5]);
    expect(mochi.status(state)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    expect(FORMS).toContain(state.form);
    expect(state.adultAt).toBe(state.at);
    expect(dayOf(state, state.adultAt!)).toBe(Math.floor(days) + 1);
    expect(codeOf(() => careAt(state, "feed", state.adultAt! + HOUR))).toBe("game_over");
  });

  it("2 人のお世話の回数を席ごとに数える", () => {
    const { state, moves } = playOut([8, 12.5, 19, 22.5]);
    expect(state.bySeat[0] + state.bySeat[1]).toBe(moves);
    expect(Math.abs(state.bySeat[0] - state.bySeat[1])).toBeLessThanOrEqual(1);
    expect(Object.values(state.cares).reduce((a, b) => a + b, 0)).toBe(moves);
  });

  it("状態は JSON にしても同じ（サーバに保存できる）", () => {
    const { state } = playOut([8, 20]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("やること（お世話の中の選択肢）", () => {
  /** やることを選んで指す */
  const doAt = (s: MochiState, care: Care, act: Act | undefined, time: number, seat: Seat = 0) =>
    mochi.applyMove(s, mochi.stampMove!(act ? { care, act } : { care }, time), seat);
  const child = (o: Partial<MochiState> = {}) => baby({ growth: CHILD, ...o });
  /** 好みのない種（好き・苦手を気にせず効き方を比べる） */
  const plainSeed = (acts: Act[]) => {
    for (let seed = 1; seed < 1000; seed++) if (acts.every((a) => feelingOf(seed, a) === null)) return seed;
    throw new Error("見つからない");
  };

  it("どのやることも、どれか 1 つのお世話に入っていて、お世話ごとに最初のやること（DEFAULT_ACT）がある", () => {
    for (const care of CARES) {
      const mine = ACTS.filter((a) => ACT_DEFS[a].care === care);
      expect(mine.length).toBeGreaterThanOrEqual(4);
      expect(mine).toContain(DEFAULT_ACT[care]);
      expect(ACT_DEFS[DEFAULT_ACT[care]].unlock).toBe("base");
    }
  });

  it("あかちゃんは、はじめからのやることだけ。こどもになると増える。卵のあいだと、おとなのあとは選ばない", () => {
    const b = baby();
    const babyActs = actsAt(b, conditionAt(b, at(0)));
    expect(babyActs.every((a) => ACT_DEFS[a].unlock === "base")).toBe(true);
    const c = child();
    const childActs = actsAt(c, conditionAt(c, at(0)));
    expect(childActs).toEqual(expect.arrayContaining(["draw", "dance", "book", "riddle", "sea", "festival", "tickle"]));
    expect(childActs.length).toBeGreaterThan(babyActs.length);
    const egg = baby({ growth: 1 });
    expect(actsAt(egg, conditionAt(egg, at(0)))).toEqual([]);
  });

  it("こどもになる前のやることを選ぶと受け付けない。知らないやること・ほかのお世話のやることも受け付けない", () => {
    expect(codeOf(() => doAt(baby(), "walk", "sea", at(1)))).toBe("mochi_act_locked");
    expect(codeOf(() => doAt(baby(), "feed", "ball", at(1)))).toBe("mochi_no_such_act");
    expect(codeOf(() => mochi.applyMove(baby(), { care: "feed", act: "cake" as Act, at: at(1) }, 0))).toBe("mochi_no_such_act");
    expect(doAt(child(), "walk", "sea", at(1)).last?.act).toBe("sea");
  });

  it("卵のあいだは、やることを送られても使わない（お世話ごとの卵への反応だけ）", () => {
    const s = doAt(baby({ growth: 1 }), "walk", "sea", at(1));
    expect(s.last?.act).toBeUndefined();
    expect(s.acts).toBeUndefined();
  });

  it("たからものを持っていると、それを使うやることが増える（マンゴーを食べる・ビー玉であそぶ など）", () => {
    const b = baby();
    expect(actsAt(b, conditionAt(b, at(0)), "feed")).not.toContain("mango");
    const rich = baby({ treasures: [{ item: "mango", at: T0 }, { item: "marble", at: T0 }, { item: "furin", at: T0 }] });
    const c = conditionAt(rich, at(0));
    expect(actsAt(rich, c, "feed")).toContain("mango");
    expect(actsAt(rich, c, "play")).toContain("marble");
    expect(actsAt(rich, c, "sleep")).toContain("furin");
    expect(doAt(rich, "feed", "mango", at(1)).last?.act).toBe("mango");
    expect(codeOf(() => doAt(b, "feed", "mango", at(1)))).toBe("mochi_act_locked");
  });

  it("つづき：おでかけのあとは足をふく・おみやげ話、ごはんのあとははみがき。FOLLOW_HOURS 時間たつか、ほかのお世話をすると消える", () => {
    const out = doAt(baby(), "walk", "park", at(1), 0);
    const soon = actsAt(out, conditionAt(out, at(2)));
    expect(soon).toEqual(expect.arrayContaining(["wipe", "souvenir", "bath"]));
    expect(soon).not.toContain("brush");
    // 相手がつづきをしてもよい
    expect(doAt(out, "pet", "wipe", at(2), 1).last).toMatchObject({ act: "wipe", seat: 1 });
    expect(actsAt(out, conditionAt(out, at(1 + FOLLOW_HOURS + 0.1)))).not.toContain("wipe");
    expect(codeOf(() => doAt(out, "pet", "wipe", at(1 + FOLLOW_HOURS + 0.1)))).toBe("mochi_act_locked");
    const fed = doAt(out, "feed", "onigiri", at(2));
    const after = actsAt(fed, conditionAt(fed, at(3)));
    expect(after).toContain("brush");
    expect(after).not.toContain("wipe");
    for (const a of ["wipe", "souvenir", "brush", "bath", "dreamtalk"] as Act[]) expect(isFollowUp(a)).toBe(true);
    expect(isFollowUp("ball")).toBe(false);
  });

  it("つづき：前のお世話のあと眠って起きたら、夢の話をきける（眠っているあいだは選べない）", () => {
    const tucked = doAt(baby({ needs: { tummy: 90, joy: 90, sleepy: 50 } }), "sleep", "lullaby", at(0));
    const asleep = conditionAt(tucked, at(1));
    expect(asleep.asleep).toBe(true);
    expect(actsAt(tucked, asleep)).not.toContain("dreamtalk");
    const woke = conditionAt(tucked, at(6));
    expect(woke.asleep).toBe(false);
    expect(actsAt(tucked, woke)).toContain("dreamtalk");
  });

  it("やることごとに効き方がちがう（スープはねむくなる、ダンスはおなかがすく、くすぐると起きる など）", () => {
    const seed = plainSeed(["onigiri", "soup", "ball", "dance", "head", "tickle"]);
    const base = child({ seed, needs: { tummy: 40, joy: 40, sleepy: 40 } });
    const soup = doAt(base, "feed", "soup", at(0)).needs;
    const onigiri = doAt(base, "feed", "onigiri", at(0)).needs;
    expect(soup.sleepy).toBeGreaterThan(onigiri.sleepy);
    expect(onigiri.tummy).toBeGreaterThan(soup.tummy);
    expect(doAt(base, "play", "dance", at(0)).needs.tummy).toBeLessThan(doAt(base, "play", "ball", at(0)).needs.tummy);
    const sleeping = doAt(base, "sleep", undefined, at(0));
    expect(doAt(sleeping, "pet", "head", at(0.5)).asleep).toBe(true);
    expect(doAt(sleeping, "pet", "tickle", at(0.5)).asleep).toBe(false);
  });

  it("やることごとの回数を数える。やることのない手は、お世話ごとの最初のやること", () => {
    let s = doAt(child(), "walk", "sea", at(1));
    s = doAt(s, "walk", undefined, at(5));
    expect(s.acts).toEqual({ sea: 1, park: 1 });
    expect(s.last?.act).toBe("park");
  });

  it("おでかけの行き先で、見つけてくるものが変わる（まだ持っていないものから）", () => {
    for (const place of PLACES) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = doAt(child({ seed }), "walk", place, at(0));
        const h = happeningOf(s, at(2));
        expect(h).toMatchObject({ kind: "found", walk: true, place });
        expect(PLACE_ITEMS[place]).toContain((h as { item: Item }).item);
      }
    }
    // 16 のたからものは、4 つの行き先のどこかで見つかる
    expect(new Set(PLACES.flatMap((p) => PLACE_ITEMS[p]))).toEqual(new Set(ITEMS));
  });

  it("好み：好きなやることが 3 つ（ちがうお世話から）、苦手なやることが 1 つ。種で決まり、はじめから・こどもからのやることから選ぶ", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { likes, dislike } = likesOf(seed);
      expect(likes).toHaveLength(3);
      expect(new Set(likes.map((a) => ACT_DEFS[a].care)).size).toBe(3);
      expect(likes.map((a) => ACT_DEFS[a].care)).not.toContain(ACT_DEFS[dislike].care);
      for (const a of [...likes, dislike]) expect(["base", "child"]).toContain(ACT_DEFS[a].unlock);
      expect(likesOf(seed)).toEqual({ likes, dislike });
    }
  });

  it("好きなやることはきげんがよけいによくなり、苦手なやることは半分。したら好みが分かる（known）", () => {
    const seed = 3;
    const { likes, dislike } = likesOf(seed);
    const like = likes[0]!;
    const plain = ACTS.find((a) => ACT_DEFS[a].care === ACT_DEFS[like].care && a !== like && ["base", "child"].includes(ACT_DEFS[a].unlock as string) && feelingOf(seed, a) === null)!;
    const base = child({ seed, needs: { tummy: 50, joy: 20, sleepy: 30 } });
    const liked = doAt(base, ACT_DEFS[like].care, like, at(0));
    expect(liked.needs.joy).toBe(20 + (ACT_DEFS[like].effect as { joy?: number }).joy! + LIKE_JOY);
    expect(liked.known).toEqual([like]);
    expect(doAt(base, ACT_DEFS[plain].care, plain, at(0)).known).toBeUndefined();
    const disliked = doAt(liked, ACT_DEFS[dislike].care, dislike, at(1));
    expect(disliked.known).toEqual([like, dislike]);
    // 2 回目からは増えない
    expect(doAt(disliked, ACT_DEFS[like].care, like, at(2)).known).toEqual([like, dislike]);
  });

  it("おとなの小物：いちばん多くしたやること（小物のあるもの）で決まる。ACCESSORY_MIN 回に届かなければなし", () => {
    expect(accessoryOf({})).toBeNull();
    expect(accessoryOf({ sea: ACCESSORY_MIN - 1 })).toBeNull();
    expect(accessoryOf({ sea: ACCESSORY_MIN, ball: 20 })).toBe("strawHat");
    expect(accessoryOf({ sea: 3, book: 5 })).toBe("glasses");
    for (const a of Object.values(ACCESSORY_OF)) expect(typeof a).toBe("string");
  });

  it("おとなになったとき、小物を身に着ける", () => {
    let s = child({ growth: ADULT - 0.1, acts: { festival: 4 } });
    s = doAt(s, "walk", "festival", at(5));
    expect(mochi.status(s).kind).toBe("finished");
    expect(s.accessory).toBe("uchiwa");
  });

  it("parseMove：やることはそのお世話のものだけ読む。stampMove はやることを残す", () => {
    expect(mochi.parseMove({ care: "walk", act: "sea" })).toEqual({ care: "walk", act: "sea" });
    expect(mochi.parseMove({ care: "feed", act: "sea" })).toBeNull();
    expect(mochi.parseMove({ care: "feed", act: "toString" })).toBeNull();
    expect(mochi.stampMove!({ care: "walk", act: "sea" }, 5)).toEqual({ care: "walk", act: "sea", at: 5 });
  });

  it("前からの対局（やることのない状態）も、そのまま続けられる", () => {
    const old = JSON.parse(JSON.stringify(baby())) as MochiState;
    delete old.acts;
    delete old.known;
    const s = doAt(old, "play", "hide", at(1));
    expect(s.acts).toEqual({ hide: 1 });
  });

  it("やることを選んで遊んでも、おとなまでの日数はふだんと同じくらい（1 日 3 回なら 5〜7 日）", () => {
    // ほしいお世話の中で、いちばん効くやることを選ぶ遊び方
    const greedy = (s: MochiState, c: Condition): Care => wantOf(s, c) ?? CARES[(s.bySeat[0] + s.bySeat[1]) % CARES.length]!;
    let s = fresh(5);
    for (let day = 0; day < 30 && mochi.status(s).kind !== "finished"; day++) {
      for (const hr of [8, 14, 21]) {
        if (mochi.status(s).kind === "finished") break;
        const time = T0 + day * DAY + hr * HOUR;
        const c = conditionAt(s, time);
        const care = greedy(s, c);
        const options = actsAt(s, c, care);
        const act = options.find((a) => feelingOf(s.seed, a) === "like") ?? options.at(-1);
        s = doAt(s, care, act, time, ((s.bySeat[0] + s.bySeat[1]) % 2) as Seat);
      }
    }
    const days = (s.adultAt! - s.bornAt!) / DAY;
    expect(days).toBeGreaterThan(4.5);
    expect(days).toBeLessThan(7.5);
  });
});
