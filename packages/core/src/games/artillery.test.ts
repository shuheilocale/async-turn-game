import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  aim,
  artillery,
  BARREL,
  blast,
  BLAST_R,
  CANNON_R,
  CLIMB_COST,
  COLS,
  cosDeg,
  CRATER_R,
  damageAt,
  drivePath,
  driven,
  EDGE,
  firedFrom,
  fly,
  FUEL,
  MAX_CLIMB,
  MAX_DAMAGE,
  MAX_HP,
  MAX_STEPS,
  MIN_GAP,
  MIN_GROUND,
  muzzle,
  pivot,
  reach,
  routeOf,
  SHOTS,
  sinDeg,
  supportY,
  VIEW_H,
  WIND_MAX,
  WIND_SHIFT,
  windNow,
  type ArtilleryMove,
  type ArtilleryState,
  type Field,
  type Shot,
} from "./artillery.ts";

/** 種から同じ並びの乱数を作る（mulberry32） */
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

/** 平らな地形（高さ h）に、左右の大砲を置いた場 */
function flatField(h = 30, x0 = 20.5, x1 = 139.5): Field {
  return {
    terrain: Array.from({ length: COLS }, () => h),
    cannons: [
      { x: x0, y: h },
      { x: x1, y: h },
    ],
    hp: [MAX_HP, MAX_HP],
  };
}

/** 平らな地形で、風のない対局 */
function flatState(h = 30, winds = Array.from({ length: SHOTS * 2 }, () => 0)): ArtilleryState {
  const field = flatField(h);
  return { ...field, ground: field.terrain, winds, shots: [], turn: 0, before: null };
}

/** 場 field の地形を terrain にかえ、大砲をその上に乗せ直した対局 */
function stateOn(terrain: number[], x0 = 20.5, x1 = 139.5): ArtilleryState {
  const s = flatState();
  return {
    ...s,
    terrain,
    ground: terrain,
    cannons: [
      { x: x0, y: supportY(terrain, x0) },
      { x: x1, y: supportY(terrain, x1) },
    ],
  };
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof IllegalMoveError ? e.code : "other";
  }
}

/** 画面の外（右の端より先）へ飛ばす手。どこにも当たらない */
const away = (seat: Seat, drive = 0): ArtilleryMove =>
  seat === 0 ? { angle: 170, power: 100, drive } : { angle: 10, power: 100, drive };

describe("artillery", () => {
  describe("地形と大砲", () => {
    it("地形・大砲の位置・風は initialState の rng で決まる", () => {
      const a = artillery.initialState(seeded(7));
      expect(artillery.initialState(seeded(7))).toEqual(a);
      const b = artillery.initialState(seeded(8));
      expect(b.terrain).not.toEqual(a.terrain);
      expect(b.winds).not.toEqual(a.winds);
    });

    it("柱は 160 本で、高さは画面に収まる。最初の地形は ground にも覚えておく", () => {
      for (let seed = 0; seed < 50; seed++) {
        const s = artillery.initialState(seeded(seed));
        expect(s.terrain).toHaveLength(COLS);
        expect(s.ground).toEqual(s.terrain);
        for (const h of s.terrain) {
          expect(h).toBeGreaterThanOrEqual(MIN_GROUND);
          expect(h).toBeLessThan(VIEW_H - 25);
        }
      }
    });

    it("大砲は左右に 1 台ずつで、地面の上に立ち、2 台の間には山がある", () => {
      for (let seed = 0; seed < 50; seed++) {
        const s = artillery.initialState(seeded(seed));
        const [c0, c1] = s.cannons;
        expect(c0.x).toBeLessThan(COLS * 0.2);
        expect(c1.x).toBeGreaterThan(COLS * 0.8);
        for (const c of s.cannons) expect(c.y).toBe(supportY(s.terrain, c.x));
        const between = s.terrain.slice(Math.ceil(c0.x), Math.floor(c1.x));
        expect(Math.max(...between)).toBeGreaterThan(Math.max(c0.y, c1.y) + 12);
      }
    });

    it("大砲の足もとは平らにならしてある", () => {
      const s = artillery.initialState(seeded(3));
      for (const c of s.cannons) {
        const col = Math.floor(c.x);
        const pad = s.terrain.slice(col - 3, col + 4);
        expect(new Set(pad).size).toBe(1);
      }
    });

    it("最初は先手の番で、体力は 100 ずつ、まだ 1 発も撃っていない", () => {
      const s = artillery.initialState(seeded(1));
      expect(s.hp).toEqual([MAX_HP, MAX_HP]);
      expect(s.shots).toEqual([]);
      expect(s.before).toBeNull();
      expect(artillery.status(s)).toEqual({ kind: "playing", turn: 0 });
    });
  });

  describe("撃つ前に動く", () => {
    it("平らな所なら、燃料で柱 12 本まで動ける。13 本は燃料が足りない", () => {
      const s = flatState();
      expect(FUEL).toBe(12);
      const right = artillery.applyMove(s, away(0, 12), 0);
      expect(right.cannons[0]).toEqual({ x: 32.5, y: 30 });
      const left = artillery.applyMove(s, away(0, -12), 0);
      expect(left.cannons[0]).toEqual({ x: 8.5, y: 30 });
      expect(codeOf(() => artillery.applyMove(s, away(0, 13), 0))).toBe("artillery_fuel");
      expect(codeOf(() => artillery.applyMove(s, away(0, -13), 0))).toBe("artillery_fuel");
      expect(drivePath(s, 0, 12).fuel).toBe(12);
    });

    it("上り坂ほど燃料を多く使う（1 本ごとに 1 ＋ 上った高さ × 係数）。下りは平らと同じ", () => {
      // 大砲の右は 1 本ごとに 0.5 ずつ高くなる坂
      const terrain = Array.from({ length: COLS }, (_, c) => (c <= 23 ? 30 : 30 + 0.5 * (c - 23)));
      const s = stateOn(terrain);
      const per = 1 + 0.5 * CLIMB_COST;
      const most = Math.floor(FUEL / per);
      expect(most).toBeLessThan(FUEL);
      expect(drivePath(s, 0, 3).fuel).toBeCloseTo(3 * per, 9);
      const up = artillery.applyMove(s, away(0, most), 0);
      expect(up.cannons[0].x).toBe(20.5 + most);
      expect(up.cannons[0].y).toBe(supportY(terrain, 20.5 + most));
      expect(up.cannons[0].y).toBeGreaterThan(30);
      expect(codeOf(() => artillery.applyMove(s, away(0, most + 1), 0))).toBe("artillery_fuel");

      // 坂の上から下りるときは、1 本ごとに 1 だけ
      const top = stateOn(terrain, 40.5);
      expect(drivePath(top, 0, -12).fuel).toBe(12);
      expect(drivePath(top, 0, -12).error).toBeNull();
      expect(artillery.applyMove(top, away(0, -12), 0).cannons[0].y).toBeLessThan(top.cannons[0].y);
    });

    it("急な段（1 本で MAX_CLIMB より高い差）は登れない。ちょうど MAX_CLIMB なら登れる", () => {
      // 27 本目から先は 2.5 高い。大砲の足もとは中心から 3 本先まであるので、4 本目で段に乗る
      const steep = Array.from({ length: COLS }, (_, c) => (c >= 27 ? 30 + MAX_CLIMB + 0.5 : 30));
      const s = stateOn(steep);
      expect(artillery.applyMove(s, away(0, 3), 0).cannons[0].x).toBe(23.5);
      expect(codeOf(() => artillery.applyMove(s, away(0, 4), 0))).toBe("artillery_steep");
      expect(codeOf(() => artillery.applyMove(s, away(0, 8), 0))).toBe("artillery_steep");
      // 反対へは行ける
      expect(codeOf(() => artillery.applyMove(s, away(0, -5), 0))).toBeNull();

      const ok = Array.from({ length: COLS }, (_, c) => (c >= 27 ? 30 + MAX_CLIMB : 30));
      const t = stateOn(ok);
      expect(artillery.applyMove(t, away(0, 4), 0).cannons[0].y).toBe(30 + MAX_CLIMB);
    });

    it("下りは、どれだけ低い段でも行ける（落ちた先の高さに乗る）", () => {
      const cliff = Array.from({ length: COLS }, (_, c) => (c <= 25 ? 60 : 20));
      const s = stateOn(cliff);
      expect(s.cannons[0].y).toBe(60);
      const next = artillery.applyMove(s, away(0, 10), 0);
      expect(next.cannons[0]).toEqual({ x: 30.5, y: 20 });
    });

    it("左右の端から EDGE 本より外へは行けない", () => {
      const s = { ...flatState(), cannons: flatField(30, 10.5, 149.5).cannons };
      expect(artillery.applyMove(s, away(0, -(10 - EDGE)), 0).cannons[0].x).toBe(EDGE + 0.5);
      expect(codeOf(() => artillery.applyMove(s, away(0, -(10 - EDGE) - 1), 0))).toBe("artillery_edge");
      const s1 = { ...s, turn: 1 as Seat };
      expect(artillery.applyMove(s1, away(1, COLS - 1 - EDGE - 149), 1).cannons[1].x).toBe(COLS - 1 - EDGE + 0.5);
      expect(codeOf(() => artillery.applyMove(s1, away(1, COLS - EDGE - 149), 1))).toBe("artillery_edge");
    });

    it("相手の大砲には MIN_GAP 本より近づけない", () => {
      const s = { ...flatState(), cannons: flatField(30, 70.5, 90.5).cannons };
      expect(artillery.applyMove(s, away(0, 20 - MIN_GAP), 0).cannons[0].x).toBe(90.5 - MIN_GAP);
      expect(codeOf(() => artillery.applyMove(s, away(0, 21 - MIN_GAP), 0))).toBe("artillery_blocked");
    });

    it("2 台の間の山は、登れれば越えてよい（ふつうは急で越えられない）", () => {
      // なだらかな山なら、何回かに分けて登って越えられる
      const gentle = Array.from({ length: COLS }, (_, c) => 30 + Math.max(0, 20 - Math.abs(c - 80) * 0.6));
      let s = stateOn(gentle.map((h) => Math.round(h * 100) / 100), 60.5, 139.5);
      for (let i = 0; i < 8 && s.cannons[0].x < 85; i++) {
        const [, hi] = reach(s, 0);
        expect(hi).toBeGreaterThan(0);
        s = artillery.applyMove(s, away(0, hi), 0);
        s = artillery.applyMove(s, away(1), 1);
      }
      expect(s.cannons[0].x).toBeGreaterThan(85);
      // 実際の地形の山は、ほとんどの対局で急な所があって越えられない
      let blocked = 0;
      for (let seed = 0; seed < 40; seed++) {
        const g = artillery.initialState(seeded(seed));
        const [c0, c1] = g.cannons;
        const sy = (x: number) => supportY(g.terrain, x);
        let peak = c0.x;
        for (let x = c0.x; x < c1.x; x++) if (sy(x) > sy(peak)) peak = x;
        let steepest = 0;
        for (let x = c0.x; x < peak; x++) steepest = Math.max(steepest, sy(x + 1) - sy(x));
        if (steepest > MAX_CLIMB) blocked++;
      }
      expect(blocked).toBeGreaterThan(20);
    });

    it("燃料は毎回同じだけある（前の手番に使っても、次はまた 12 本動ける）", () => {
      let s = flatState();
      s = artillery.applyMove(s, away(0, 12), 0);
      s = artillery.applyMove(s, away(1, -12), 1);
      s = artillery.applyMove(s, away(0, 12), 0);
      expect(s.cannons[0].x).toBe(44.5);
      expect(s.cannons[1].x).toBe(127.5);
    });

    it("drive は相手の大砲を動かさない。弾は動いた先の砲口から出る", () => {
      const s = flatState();
      const move = { angle: 40, power: 66, drive: 8 };
      const next = artillery.applyMove(s, move, 0);
      expect(next.cannons[1]).toEqual(s.cannons[1]);
      const at = firedFrom(s, next.shots[0]!);
      expect(at.cannons[0]).toEqual({ x: 28.5, y: 30 });
      const f = fly(at, 0, move, 0);
      expect(next.shots[0]!.impact![0]).toBeCloseTo(f.impact![0], 1);
      // 動かずに撃ったときとは違う所に落ちる
      expect(Math.abs(fly(s, 0, move, 0).impact![0] - f.impact![0])).toBeGreaterThan(7);
    });

    it("drivePath は、動けるところまでの道のり（1 本ごとの位置）と、止まった理由を返す", () => {
      const steep = Array.from({ length: COLS }, (_, c) => (c >= 27 ? 40 : 30));
      const s = stateOn(steep);
      const p = drivePath(s, 0, 6);
      expect(p.error).toBe("artillery_steep");
      expect(p.path.map((c) => c.x)).toEqual([20.5, 21.5, 22.5, 23.5]);
      expect(p.fuel).toBe(3);
      // 動かした場は、行けたところまで動かしたもの（相手はそのまま）
      expect(driven(s, 0, 6).cannons).toEqual([{ x: 23.5, y: 30 }, s.cannons[1]]);
      const ok = drivePath(s, 0, -3);
      expect(ok.error).toBeNull();
      expect(ok.path).toEqual([20.5, 19.5, 18.5, 17.5].map((x) => ({ x, y: 30 })));
      expect(drivePath(s, 0, 0)).toEqual({ path: [s.cannons[0]], fuel: 0, error: null });
      // 動ける範囲（左が負）
      expect(reach(s, 0)).toEqual([-12, 3]);
    });

    it("drive のない手（前の作りの画面から届いた手）は、動かない手として受け付ける", () => {
      const s = flatState();
      const old = { angle: 40, power: 66 } as ArtilleryMove;
      const next = artillery.applyMove(s, old, 0);
      expect(next.cannons[0]).toEqual(s.cannons[0]);
      expect(next).toEqual(artillery.applyMove(s, { ...old, drive: 0 }, 0));
    });
  });

  describe("風", () => {
    it("全部の手番ぶん（2 人 × 10 発）を先に決めておく。整数で ±10 の間", () => {
      for (let seed = 0; seed < 20; seed++) {
        const { winds } = artillery.initialState(seeded(seed));
        expect(winds).toHaveLength(SHOTS * 2);
        for (const w of winds) {
          expect(Number.isInteger(w)).toBe(true);
          expect(Math.abs(w)).toBeLessThanOrEqual(WIND_MAX);
        }
      }
    });

    it("同じ人の次の手番（2 つあと）では、風が WIND_SHIFT 以上変わる", () => {
      for (let seed = 0; seed < 200; seed++) {
        const { winds } = artillery.initialState(seeded(seed));
        for (let i = 2; i < winds.length; i++) expect(Math.abs(winds[i]! - winds[i - 2]!)).toBeGreaterThanOrEqual(WIND_SHIFT);
      }
    });

    it("毎回ほぼ新しく選ぶ。弱い風ばかりにならず、向きもかたよらない", () => {
      const all = Array.from({ length: 300 }, (_, seed) => artillery.initialState(seeded(seed)).winds).flat();
      const strong = all.filter((w) => Math.abs(w) >= 5).length / all.length;
      const calm = all.filter((w) => Math.abs(w) <= 1).length / all.length;
      const right = all.filter((w) => w > 0).length / all.length;
      expect(strong).toBeGreaterThan(0.45);
      expect(calm).toBeLessThan(0.2);
      expect(right).toBeGreaterThan(0.4);
      expect(right).toBeLessThan(0.6);
      // どの値も出る
      expect(new Set(all).size).toBe(WIND_MAX * 2 + 1);
    });

    it("今の手番の風は、これまでに撃った数で決まる", () => {
      const s = artillery.initialState(seeded(4));
      expect(windNow(s)).toBe(s.winds[0]);
      const s1 = artillery.applyMove(s, away(0), 0);
      expect(windNow(s1)).toBe(s.winds[1]);
    });

    it("同じ角度・強さでも、風が WIND_SHIFT 違えば、当たる所が爆風の半分より大きくずれる", () => {
      // 相手の大砲に当たらないよう、相手は右の端に置く（無風なら 120 ほど先に落ちる弾）
      const field = flatField(30, 20.5, 155.5);
      const move = { angle: 45, power: 68, drive: 0 };
      const at = (wind: number) => fly(field, 0, move, wind).impact![0];
      expect(Math.abs(at(WIND_SHIFT) - at(0))).toBeGreaterThan(BLAST_R / 2);
      expect(Math.abs(at(-WIND_SHIFT) - at(0))).toBeGreaterThan(BLAST_R / 2);
    });

    it("強すぎない：どの向き・強さの風でも、角度と強さを合わせれば相手に直撃できる", () => {
      for (let seed = 0; seed < 6; seed++) {
        const s = artillery.initialState(seeded(seed));
        for (const wind of [-WIND_MAX, -5, 0, 5, WIND_MAX]) {
          const winds = Array.from({ length: SHOTS * 2 }, () => wind);
          for (const seat of [0, 1] as Seat[]) expect(aim({ ...s, winds }, seat).damage, `seed ${seed} wind ${wind}`).toBeGreaterThan(25);
        }
      }
    });
  });

  describe("毎回ねらい直さないと当たらない", () => {
    /**
     * 先手が最初の手番にいちばん当たりそうな手を選び、そのあと同じ手を撃ち続けたときの、2 発目からのダメージ。
     * 後手は opponent の手（外へ撃つ・動く量だけ選ぶ）
     */
    function repeat(s: ArtilleryState, opponent: (s: ArtilleryState) => number): number[] {
      const first = aim(s, 0).move;
      const damages: number[] = [];
      for (let i = 0; i < SHOTS && artillery.status(s).kind === "playing"; i++) {
        s = artillery.applyMove(s, first, 0);
        if (i > 0) damages.push(s.shots.at(-1)!.damage[1]);
        if (artillery.status(s).kind !== "playing") break;
        s = artillery.applyMove(s, away(1, opponent(s)), 1);
      }
      return damages;
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const games = (n: number) => Array.from({ length: n }, (_, seed) => artillery.initialState(seeded(seed)));
    /** いちばん遠くまで動く（右か左の、行ける方の端まで） */
    const dodge = (s: ArtilleryState) => {
      const [lo, hi] = reach(s, 1);
      return hi >= -lo ? hi : lo;
    };

    it("相手が動かなくても、風が毎回変わるので、同じ角度・強さで撃ち続けても当たり続けない", () => {
      const damages = games(40).flatMap((s) => repeat(s, () => 0));
      const hits = damages.filter((d) => d > 0).length;
      // 前の作り（風が ±4 ずつしか変わらない）では 3 割を超えて当たり、1 発で平均 8 ほど減らせた
      expect(hits / damages.length).toBeLessThan(0.25);
      expect(sum(damages) / damages.length).toBeLessThan(5.5);
    });

    it("風が変わらなくても、相手が動けば、同じ手では直撃しない", () => {
      const calm = Array.from({ length: SHOTS * 2 }, () => 0);
      // 2 発目のダメージ。動かなければ同じ所にまた直撃する
      const still = games(20).map((s) => repeat({ ...s, winds: calm }, () => 0)[0]!);
      const moved = games(20).map((s) => repeat({ ...s, winds: calm }, dodge)[0]!);
      for (const d of still) expect(d).toBeGreaterThan(30);
      for (const d of moved) expect(d).toBeLessThan(30);
      expect(sum(moved)).toBeLessThan(sum(still) * 0.6);
    });
  });

  describe("弾の飛び方", () => {
    it("三角関数は四則演算だけで計算し、Math.sin・Math.cos とほとんど同じ", () => {
      for (let d = 0; d <= 180; d++) {
        expect(Math.abs(sinDeg(d) - Math.sin((d * Math.PI) / 180))).toBeLessThan(1e-12);
        expect(Math.abs(cosDeg(d) - Math.cos((d * Math.PI) / 180))).toBeLessThan(1e-12);
      }
      expect(sinDeg(90)).toBe(1);
      expect(cosDeg(90)).toBe(0);
    });

    it("弾は砲口から出る。砲口は砲身の付け根から角度の向きに砲身の長さだけ先", () => {
      const field = flatField();
      const [px, py] = pivot(field.cannons[0]);
      const [mx, my] = muzzle(field.cannons[0], 30);
      expect(Math.hypot(mx - px, my - py)).toBeCloseTo(BARREL, 9);
      expect(my).toBeGreaterThan(py);
      const f = fly(field, 0, { angle: 30, power: 60 }, 0, true);
      expect(f.path[0]).toEqual([mx, my]);
    });

    it("同じ場・手・風なら、何度計算しても同じ結果になる", () => {
      const s = artillery.initialState(seeded(11));
      const move = { angle: 52, power: 71, drive: -4 };
      const a = fly(s, 0, move, 3, true);
      const b = fly(JSON.parse(JSON.stringify(s)), 0, move, 3, true);
      expect(b).toEqual(a);
      expect(artillery.applyMove(s, move, 0)).toEqual(artillery.applyMove(JSON.parse(JSON.stringify(s)), move, 0));
    });

    it("強いほど遠くへ、風下へ流され、角度で落ちる場所が変わる", () => {
      const field = flatField();
      const landX = (angle: number, power: number, wind = 0) => fly(field, 0, { angle, power }, wind).impact![0];
      expect(landX(45, 50)).toBeLessThan(landX(45, 60));
      expect(landX(45, 50, 5)).toBeGreaterThan(landX(45, 50));
      expect(landX(45, 50, -5)).toBeLessThan(landX(45, 50));
      expect(landX(70, 50)).not.toBeCloseTo(landX(45, 50), 0);
      // 左向き（90 度より大きい）に撃つと、大砲より左に落ちる
      expect(landX(120, 25)).toBeLessThan(field.cannons[0].x);
    });

    it("地形に当たったら、地面のすぐ近くで止まる", () => {
      const field = flatField();
      const f = fly(field, 0, { angle: 45, power: 55 }, 0, true);
      const [x, y] = f.impact!;
      expect(y).toBeLessThanOrEqual(30);
      expect(y).toBeGreaterThan(29.9);
      expect(f.path.at(-1)).toEqual([x, y]);
      expect(f.steps).toBe(f.path.length - 1);
    });

    it("山があれば、山に当たって向こうへは届かない", () => {
      const field = flatField();
      for (let c = 70; c < 90; c++) field.terrain[c] = 90;
      const f = fly(field, 0, { angle: 45, power: 80 }, 0);
      expect(f.impact![0]).toBeGreaterThanOrEqual(69);
      expect(f.impact![0]).toBeLessThan(71);
    });

    it("大砲に当たったら、その大砲の近くで止まる", () => {
      const field = flatField();
      const [tx, ty] = pivot(field.cannons[1]);
      const hitting = [...Array(101).keys()].map((power) => ({ angle: 45, power, drive: 0 })).find((m) => {
        const f = fly(field, 0, m, 0);
        return f.impact && Math.hypot(f.impact[0] - tx, f.impact[1] - ty) <= CANNON_R + 1e-9;
      });
      expect(hitting).toBeDefined();
    });

    it("左右の端から外へ出たら、どこにも当たらない（爆発しない）", () => {
      const field = flatField();
      const f = fly(field, 0, away(0), 0, true);
      expect(f.impact).toBeNull();
      const [x] = f.path.at(-1)!;
      expect(x < 0 || x >= COLS).toBe(true);
    });

    it("計算のきざみには上限がある", () => {
      // 地形がとても低くても、上限の数で必ず止まる
      const field = flatField(MIN_GROUND);
      const f = fly(field, 0, { angle: 90, power: 100 }, 0);
      expect(f.steps).toBeLessThanOrEqual(MAX_STEPS);
    });
  });

  describe("爆発", () => {
    it("爆発の円の中の地形がけずれ、円の外は変わらない", () => {
      const field = flatField();
      const { field: after } = blast(field, [80, 30]);
      for (let c = 0; c < COLS; c++) {
        const dx = c + 0.5 - 80;
        if (Math.abs(dx) >= CRATER_R) expect(after.terrain[c]).toBe(30);
        else expect(after.terrain[c]).toBeCloseTo(30 - Math.sqrt(CRATER_R ** 2 - dx * dx), 1);
      }
      // まん中ほど深い
      expect(after.terrain[80]).toBeLessThan(after.terrain[76]!);
      // 元の場は変えない
      expect(field.terrain[80]).toBe(30);
    });

    it("地面の中で爆発したら、上の土が落ちてきて、円の分だけ低くなる", () => {
      const field = flatField();
      const { field: after } = blast(field, [80, 15]);
      expect(after.terrain[80]).toBeCloseTo(30 - 2 * Math.sqrt(CRATER_R ** 2 - 0.25), 1);
    });

    it("空中で爆発しても地形はけずれない・岩盤より下はけずれない", () => {
      expect(blast(flatField(), [80, 60]).field.terrain).toEqual(flatField().terrain);
      const low = blast(flatField(MIN_GROUND + 1), [80, MIN_GROUND]).field.terrain;
      expect(Math.min(...low)).toBe(MIN_GROUND);
    });

    it("高さは 0.01 きざみにそろえる", () => {
      const { field: after } = blast(flatField(), [80.123, 29.456]);
      for (const h of after.terrain) expect(Math.round(h * 100) / 100).toBe(h);
    });

    it("近いほど大きなダメージ。爆風の届く距離より遠ければ 0", () => {
      const field = flatField();
      const [px, py] = pivot(field.cannons[1]);
      expect(damageAt(field.cannons[1], [px, py])).toBe(MAX_DAMAGE);
      const d4 = damageAt(field.cannons[1], [px - 4, py]);
      const d8 = damageAt(field.cannons[1], [px - 8, py]);
      expect(d4).toBeLessThan(MAX_DAMAGE);
      expect(d8).toBeLessThan(d4);
      expect(d8).toBe(Math.round(MAX_DAMAGE * (1 - 8 / BLAST_R)));
      expect(damageAt(field.cannons[1], [px - BLAST_R, py])).toBe(0);
      expect(damageAt(field.cannons[1], [px - 40, py])).toBe(0);
    });

    it("爆発は両方の大砲にダメージを与える（自分の近くに落とすと自分も減る）", () => {
      const field = flatField(30, 70.5, 85.5);
      const { field: after, damage } = blast(field, [78, 30]);
      expect(damage[0]).toBeGreaterThan(0);
      expect(damage[1]).toBeGreaterThan(0);
      expect(after.hp).toEqual([MAX_HP - damage[0], MAX_HP - damage[1]]);
    });

    it("体力は 0 より下にならない", () => {
      const field = flatField();
      field.hp = [100, 10];
      const { field: after } = blast(field, pivot(field.cannons[1]));
      expect(after.hp[1]).toBe(0);
    });

    it("大砲の下がけずれたら、大砲は下に落ちる。けずれなければそのまま", () => {
      const field = flatField();
      const c = field.cannons[1];
      const { field: after } = blast(field, [c.x, 30]);
      expect(after.cannons[1].y).toBeLessThan(c.y);
      expect(after.cannons[1].y).toBe(supportY(after.terrain, c.x));
      expect(after.cannons[1].x).toBe(c.x);
      expect(after.cannons[0]).toEqual(field.cannons[0]);
    });

    it("大砲は、足もとの柱（中心から左右 3 本まで）のいちばん高いところに乗る", () => {
      const terrain = Array.from({ length: COLS }, () => 30);
      terrain[17] = 35;
      expect(supportY(terrain, 20.5)).toBe(35);
      expect(supportY(terrain, 21.5)).toBe(30);
      expect(supportY(terrain, 18.5)).toBe(35);
    });
  });

  describe("手番と決着", () => {
    it("撃つと手番が移り、弾の記録と、動く前の場を残す。記録には動く前と撃った位置が入る", () => {
      const s = artillery.initialState(seeded(2));
      const move = { angle: 40, power: 66, drive: 3 };
      const next = artillery.applyMove(s, move, 0);
      expect(artillery.status(next)).toEqual({ kind: "playing", turn: 1 });
      expect(next.shots).toHaveLength(1);
      const shot = next.shots[0]!;
      expect(shot.seat).toBe(0);
      expect(shot.angle).toBe(40);
      expect(shot.power).toBe(66);
      expect(shot.from).toEqual(s.cannons[0]);
      expect(shot.to).toEqual(drivePath(s, 0, 3).path.at(-1));
      expect(shot.to!.x).toBe(s.cannons[0].x + 3);
      expect(next.before).toEqual({ terrain: s.terrain, cannons: s.cannons, hp: s.hp });
      expect(next.ground).toBe(s.ground);
      // 記録どおりに計算し直すと、同じ場になる
      const at = firedFrom(next.before!, shot);
      const f = fly(at, 0, move, s.winds[0]!);
      const expected = f.impact ? blast(at, f.impact) : { field: at, damage: [0, 0] };
      expect(next.terrain).toEqual(expected.field.terrain);
      expect(next.hp).toEqual(expected.field.hp);
      expect(next.cannons).toEqual(expected.field.cannons);
      expect(shot.damage).toEqual(expected.damage);
    });

    it("再生の道のり（routeOf）：動く前から撃った位置まで、1 本ごとの位置", () => {
      const s = flatState();
      const next = artillery.applyMove(s, away(0, -4), 0);
      const route = routeOf(next.before!, next.shots[0]!);
      expect(route.map((c) => c.x)).toEqual([20.5, 19.5, 18.5, 17.5, 16.5]);
      expect(firedFrom(next.before!, next.shots[0]!).cannons[0]).toEqual(route.at(-1));
    });

    it("前の作りの記録（動いた位置がない弾）は、動かずに撃った弾として扱う", () => {
      const s = flatState();
      const old: Shot = { seat: 0, angle: 45, power: 60, impact: [80, 30], damage: [0, 0] };
      expect(routeOf(s, old)).toEqual([s.cannons[0]]);
      expect(firedFrom(s, old)).toEqual({ terrain: s.terrain, cannons: s.cannons, hp: s.hp });
      // 前の作りの記録が残った対局も、そのまま続けられる
      const midway: ArtilleryState = { ...s, shots: [old], turn: 1, before: flatField() };
      const next = artillery.applyMove(midway, away(1, -5), 1);
      expect(next.shots).toHaveLength(2);
      expect(next.cannons[1].x).toBe(134.5);
    });

    it("風は撃った手番のものを使う（始まっている対局の風は、そのまま使う）", () => {
      const winds = Array.from({ length: SHOTS * 2 }, (_, i) => (i === 0 ? 10 : -10));
      const s = flatState(30, winds);
      const move = { angle: 45, power: 50, drive: 0 };
      const next = artillery.applyMove(s, move, 0);
      const x = next.shots[0]!.impact![0];
      expect(x).toBeCloseTo(fly(s, 0, move, 10).impact![0], 1);
      expect(x).toBeGreaterThan(fly(s, 0, move, 0).impact![0] + 1);
      expect(next.winds).toBe(winds);
    });

    it("手番でなければ撃てない・終わったあとは撃てない", () => {
      const s = flatState();
      expect(codeOf(() => artillery.applyMove(s, away(1), 1))).toBe("not_your_turn");
      const dead = { ...s, hp: [0, 100] as [number, number] };
      expect(codeOf(() => artillery.applyMove(dead, away(0), 0))).toBe("game_over");
    });

    it("相手の体力を 0 にした方の勝ち。両方 0 なら引き分け", () => {
      const s = flatState();
      expect(artillery.status({ ...s, hp: [40, 0] })).toEqual({ kind: "finished", winner: 0 });
      expect(artillery.status({ ...s, hp: [0, 3] })).toEqual({ kind: "finished", winner: 1 });
      expect(artillery.status({ ...s, hp: [0, 0] })).toEqual({ kind: "finished", winner: null });
    });

    it("毎回ねらい直して直撃を重ねると、体力が 0 になって決着する", () => {
      let s = flatState();
      for (let i = 0; i < SHOTS && artillery.status(s).kind === "playing"; i++) {
        s = artillery.applyMove(s, aim(s, 0).move, 0);
        if (artillery.status(s).kind === "playing") s = artillery.applyMove(s, away(1), 1);
      }
      expect(s.hp[1]).toBe(0);
      expect(artillery.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("1 人 10 発ずつ撃って決まらなければ、体力の多い方の勝ち。同じなら引き分け", () => {
      let s = flatState();
      for (let i = 0; i < SHOTS * 2; i++) {
        expect(artillery.status(s).kind).toBe("playing");
        s = artillery.applyMove(s, away((i % 2) as Seat), (i % 2) as Seat);
      }
      expect(s.shots).toHaveLength(SHOTS * 2);
      expect(artillery.status(s)).toEqual({ kind: "finished", winner: null });
      expect(codeOf(() => artillery.applyMove(s, away(0), 0))).toBe("game_over");
      expect(artillery.status({ ...s, hp: [60, 59] })).toEqual({ kind: "finished", winner: 0 });
      expect(artillery.status({ ...s, hp: [12, 80] })).toEqual({ kind: "finished", winner: 1 });
    });
  });

  describe("計算の速さ", () => {
    it("1 発の計算（動くのも含めて）は、Workers の 1 回の計算時間（10 ms）に余裕で収まる", () => {
      const rng = seeded(99);
      const states = Array.from({ length: 20 }, (_, i) => artillery.initialState(seeded(i)));
      // 先に何度か動かして、JIT のあたたまっていない時間を除く
      for (const s of states) artillery.applyMove(s, { angle: 45, power: 70, drive: 0 }, 0);
      const times: number[] = [];
      for (let i = 0; i < 400; i++) {
        const s = states[i % states.length]!;
        const [lo, hi] = reach(s, 0);
        const move = { angle: Math.floor(rng() * 181), power: Math.floor(rng() * 101), drive: lo + Math.floor(rng() * (hi - lo + 1)) };
        const t = performance.now();
        artillery.applyMove(s, move, 0);
        times.push(performance.now() - t);
      }
      // ほかのテストと並んで動くので、たまに起きる GC などの待ちは除いて、9 割の手で見る
      times.sort((a, b) => a - b);
      const p90 = times[Math.floor(times.length * 0.9)]!;
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(p90).toBeLessThan(1);
      expect(avg).toBeLessThan(1);
    });

    it("きざみの上限まで計算しても 2 ms かからない（地形のない所を延々と飛ぶことにして測る）", () => {
      // 地形を岩盤より低くして、何にも当たらずに上限まで飛ぶ場を作る（実際の対局では起きない）
      const field = { ...flatField(), terrain: Array.from({ length: COLS }, () => -1e9) };
      // ほぼ真上に撃つ（真上だと自分の大砲に落ちてくる）
      const move = { angle: 89, power: 100, drive: 0 };
      for (let i = 0; i < 5; i++) fly(field, 0, move, 0);
      const times: number[] = [];
      for (let i = 0; i < 21; i++) {
        const t = performance.now();
        expect(fly(field, 0, move, 0).steps).toBe(MAX_STEPS);
        times.push(performance.now() - t);
      }
      // まん中の値で見る（ほかのテストと並んで動くので、たまの待ちは除く）
      times.sort((a, b) => a - b);
      expect(times[10]).toBeLessThan(2);
    });

    it("いちばん長く飛ぶ手（真上に全力）でも、きざみは上限の半分ほど", () => {
      const s = artillery.initialState(seeded(5));
      const f = fly(s, 0, { angle: 90, power: 100 }, 0);
      expect(f.steps).toBeLessThan(MAX_STEPS * 0.6);
    });
  });

  describe("parseMove", () => {
    it("角度は 0〜180 の整数、強さは 0〜100 の整数、動く量は整数だけ受け付ける", () => {
      expect(artillery.parseMove({ angle: 45, power: 70, drive: 3 })).toEqual({ angle: 45, power: 70, drive: 3 });
      expect(artillery.parseMove({ angle: 0, power: 0, drive: -12 })).toEqual({ angle: 0, power: 0, drive: -12 });
      expect(artillery.parseMove({ angle: 180, power: 100, drive: 0 })).toEqual({ angle: 180, power: 100, drive: 0 });
      expect(artillery.parseMove({ angle: 181, power: 50, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: -1, power: 50, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 101, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: -1, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: 45.5, power: 50, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 50.2, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: "45", power: 50, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: Number.NaN, power: 50, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, drive: 0 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 50, drive: 1.5 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 50, drive: "3" })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 50, drive: COLS + 1 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 50, drive: -COLS - 1 })).toBeNull();
      expect(artillery.parseMove(null)).toBeNull();
      expect(artillery.parseMove("45,50")).toBeNull();
      // 余分な値は落とす
      expect(artillery.parseMove({ angle: 45, power: 50, drive: 2, hp: 0 })).toEqual({ angle: 45, power: 50, drive: 2 });
    });

    it("drive のない手（前の作りの画面）は、動かない手として読む", () => {
      expect(artillery.parseMove({ angle: 45, power: 70 })).toEqual({ angle: 45, power: 70, drive: 0 });
      expect(artillery.parseMove({ angle: 45, power: 70, drive: null })).toBeNull();
    });

    it("燃料が足りるか・登れるかは、parseMove ではなく applyMove で確かめる", () => {
      const move = artillery.parseMove({ angle: 45, power: 70, drive: 40 })!;
      expect(move).toEqual({ angle: 45, power: 70, drive: 40 });
      expect(codeOf(() => artillery.applyMove(flatState(), move, 0))).toBe("artillery_fuel");
    });
  });

  describe("コンピュータ", () => {
    it("風がなく平らなら、いちばん当たりそうな手は相手の大砲に直撃する", () => {
      const s = flatState();
      for (const seat of [0, 1] as Seat[]) {
        const best = aim(s, seat);
        expect(best.move.drive).toBe(0);
        const f = fly(s, seat, best.move, 0);
        const target = pivot(s.cannons[seat === 0 ? 1 : 0]);
        expect(Math.hypot(f.impact![0] - target[0], f.impact![1] - target[1])).toBeLessThanOrEqual(CANNON_R + 1e-9);
        expect(best.damage).toBeGreaterThan(30);
      }
    });

    it("風や山があっても、相手に届く手を探す", () => {
      for (let seed = 0; seed < 10; seed++) {
        const s = artillery.initialState(seeded(seed));
        expect(aim(s, 0).damage).toBeGreaterThan(0);
      }
    });

    it("選んだ手に人間らしいずれを足す（毎回同じ手にはならない）。範囲の中の整数で、そのまま通る手", () => {
      const s = artillery.initialState(seeded(6));
      const rng = seeded(1);
      const moves = Array.from({ length: 12 }, () => artillery.botMove!(s, 0, rng) as ArtilleryMove);
      expect(new Set(moves.map((m) => `${m.angle},${m.power}`)).size).toBeGreaterThan(3);
      for (const m of moves) {
        expect(artillery.parseMove(m)).toEqual(m);
        expect(codeOf(() => artillery.applyMove(s, m, 0))).toBeNull();
      }
    });

    it("ときどき動いてから撃つ（同じ位置にとどまり続けない）", () => {
      const rng = seeded(3);
      let moved = 0;
      let total = 0;
      for (let game = 0; game < 10; game++) {
        let s = artillery.initialState(seeded(300 + game));
        while (artillery.status(s).kind === "playing") {
          const seat = s.turn;
          const m = artillery.botMove!(s, seat, rng) as ArtilleryMove;
          total++;
          if (m.drive !== 0) moved++;
          s = artillery.applyMove(s, m, seat);
        }
      }
      expect(moved / total).toBeGreaterThan(0.3);
      expect(moved / total).toBeLessThan(0.9);
    });

    it("見えていない先の手番の風は使わない（先の風を変えても、選ぶ手は同じ）", () => {
      const s = artillery.initialState(seeded(9));
      const changed = { ...s, winds: s.winds.map((w, i) => (i === 0 ? w : -w || 7)) };
      expect(artillery.botMove!(changed, 0, seeded(5))).toEqual(artillery.botMove!(s, 0, seeded(5)));
    });

    it("強さのずれは、人間がゲージで離すくらい（ちょうどの強さから少しずれる）", () => {
      const s = artillery.initialState(seeded(12));
      const rng = seeded(8);
      const diffs = Array.from({ length: 30 }, () => {
        const m = artillery.botMove!(s, 0, rng) as ArtilleryMove;
        return Math.abs(m.power - aim({ ...s, ...driven(s, 0, m.drive) }, 0).move.power);
      });
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      expect(avg).toBeGreaterThan(2);
      expect(avg).toBeLessThan(15);
    });

    it("コンピュータ同士で最後まで遊べる。だいたい 1 人 4〜9 発で決まる", () => {
      const lengths: number[] = [];
      for (let game = 0; game < 30; game++) {
        const rng = seeded(900 + game);
        let s = artillery.initialState(rng);
        while (artillery.status(s).kind === "playing") {
          const seat = s.turn;
          s = artillery.applyMove(s, artillery.botMove!(s, seat, rng) as ArtilleryMove, seat);
        }
        expect(artillery.status(s).kind).toBe("finished");
        lengths.push(s.shots.length);
      }
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      expect(avg).toBeGreaterThan(8);
      expect(avg).toBeLessThan(18);
    });

    it("手番でない・終局後は null", () => {
      const s = flatState();
      expect(artillery.botMove!(s, 1, Math.random)).toBeNull();
      expect(artillery.botMove!({ ...s, hp: [0, 50] }, 0, Math.random)).toBeNull();
    });
  });
});
