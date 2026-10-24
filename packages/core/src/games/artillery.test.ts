import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  aim,
  artillery,
  BARREL,
  blast,
  BLAST_R,
  CANNON_R,
  COLS,
  cosDeg,
  CRATER_R,
  damageAt,
  fly,
  MAX_DAMAGE,
  MAX_HP,
  MAX_STEPS,
  MIN_GROUND,
  muzzle,
  pivot,
  SHOTS,
  sinDeg,
  supportY,
  VIEW_H,
  WIND_MAX,
  windNow,
  type ArtilleryMove,
  type ArtilleryState,
  type Field,
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

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof IllegalMoveError ? e.code : "other";
  }
}

/** 画面の外（右の端より先）へ飛ばす手。どこにも当たらない */
const away = (seat: Seat): ArtilleryMove => (seat === 0 ? { angle: 170, power: 100 } : { angle: 10, power: 100 });

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

  describe("風", () => {
    it("全部の手番ぶん（2 人 × 10 発）を先に決めておく。整数で ±10 の間、手番ごとに変わる", () => {
      for (let seed = 0; seed < 20; seed++) {
        const { winds } = artillery.initialState(seeded(seed));
        expect(winds).toHaveLength(SHOTS * 2);
        for (const w of winds) {
          expect(Number.isInteger(w)).toBe(true);
          expect(Math.abs(w)).toBeLessThanOrEqual(WIND_MAX);
        }
        expect(new Set(winds).size).toBeGreaterThan(3);
      }
    });

    it("今の手番の風は、これまでに撃った数で決まる", () => {
      const s = artillery.initialState(seeded(4));
      expect(windNow(s)).toBe(s.winds[0]);
      const s1 = artillery.applyMove(s, away(0), 0);
      expect(windNow(s1)).toBe(s.winds[1]);
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
      const a = fly(s, 0, { angle: 52, power: 71 }, 3, true);
      const b = fly(JSON.parse(JSON.stringify(s)), 0, { angle: 52, power: 71 }, 3, true);
      expect(b).toEqual(a);
      expect(artillery.applyMove(s, { angle: 52, power: 71 }, 0)).toEqual(artillery.applyMove(s, { angle: 52, power: 71 }, 0));
    });

    it("強いほど遠くへ、風下へ流され、角度で落ちる場所が変わる", () => {
      const field = flatField();
      const landX = (move: ArtilleryMove, wind = 0) => fly(field, 0, move, wind).impact![0];
      expect(landX({ angle: 45, power: 50 })).toBeLessThan(landX({ angle: 45, power: 60 }));
      expect(landX({ angle: 45, power: 50 }, 5)).toBeGreaterThan(landX({ angle: 45, power: 50 }));
      expect(landX({ angle: 45, power: 50 }, -5)).toBeLessThan(landX({ angle: 45, power: 50 }));
      expect(landX({ angle: 70, power: 50 })).not.toBeCloseTo(landX({ angle: 45, power: 50 }), 0);
      // 左向き（90 度より大きい）に撃つと、大砲より左に落ちる
      expect(landX({ angle: 120, power: 25 })).toBeLessThan(field.cannons[0].x);
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
      // まっすぐ横に撃つ（重力で少し落ちるので、ほとんど地面すれすれに飛ぶ速さで）
      const hitting = [...Array(101).keys()].map((power) => ({ angle: 45, power })).find((m) => {
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
    it("撃つと手番が移り、弾の記録と撃つ前の場を残す", () => {
      const s = artillery.initialState(seeded(2));
      const next = artillery.applyMove(s, { angle: 40, power: 66 }, 0);
      expect(artillery.status(next)).toEqual({ kind: "playing", turn: 1 });
      expect(next.shots).toHaveLength(1);
      const shot = next.shots[0]!;
      expect(shot.seat).toBe(0);
      expect(shot.angle).toBe(40);
      expect(shot.power).toBe(66);
      expect(next.before).toEqual({ terrain: s.terrain, cannons: s.cannons, hp: s.hp });
      expect(next.ground).toBe(s.ground);
      // 記録どおりに計算し直すと、同じ場になる
      const f = fly(s, 0, { angle: 40, power: 66 }, s.winds[0]!);
      const expected = f.impact ? blast(s, f.impact) : { field: s, damage: [0, 0] };
      expect(next.terrain).toEqual(expected.field.terrain);
      expect(next.hp).toEqual(expected.field.hp);
      expect(shot.damage).toEqual(expected.damage);
    });

    it("風は撃った手番のものを使う", () => {
      const winds = Array.from({ length: SHOTS * 2 }, (_, i) => (i === 0 ? 10 : -10));
      const s = flatState(30, winds);
      const next = artillery.applyMove(s, { angle: 45, power: 50 }, 0);
      const x = next.shots[0]!.impact![0];
      expect(x).toBeCloseTo(fly(s, 0, { angle: 45, power: 50 }, 10).impact![0], 1);
      expect(x).toBeGreaterThan(fly(s, 0, { angle: 45, power: 50 }, 0).impact![0] + 1);
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

    it("直撃を重ねると体力が 0 になって決着する", () => {
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
    it("1 発の計算は、Workers の 1 回の計算時間（10 ms）に余裕で収まる", () => {
      const rng = seeded(99);
      const states = Array.from({ length: 20 }, (_, i) => artillery.initialState(seeded(i)));
      // 先に何度か動かして、JIT のあたたまっていない時間を除く
      for (const s of states) artillery.applyMove(s, { angle: 45, power: 70 }, 0);
      const times: number[] = [];
      for (let i = 0; i < 400; i++) {
        const s = states[i % states.length]!;
        const move = { angle: Math.floor(rng() * 181), power: Math.floor(rng() * 101) };
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
      const move = { angle: 89, power: 100 };
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
    it("角度は 0〜180 の整数、強さは 0〜100 の整数だけ受け付ける", () => {
      expect(artillery.parseMove({ angle: 45, power: 70 })).toEqual({ angle: 45, power: 70 });
      expect(artillery.parseMove({ angle: 0, power: 0 })).toEqual({ angle: 0, power: 0 });
      expect(artillery.parseMove({ angle: 180, power: 100 })).toEqual({ angle: 180, power: 100 });
      expect(artillery.parseMove({ angle: 181, power: 50 })).toBeNull();
      expect(artillery.parseMove({ angle: -1, power: 50 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 101 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: -1 })).toBeNull();
      expect(artillery.parseMove({ angle: 45.5, power: 50 })).toBeNull();
      expect(artillery.parseMove({ angle: 45, power: 50.2 })).toBeNull();
      expect(artillery.parseMove({ angle: "45", power: 50 })).toBeNull();
      expect(artillery.parseMove({ angle: Number.NaN, power: 50 })).toBeNull();
      expect(artillery.parseMove({ angle: 45 })).toBeNull();
      expect(artillery.parseMove(null)).toBeNull();
      expect(artillery.parseMove("45,50")).toBeNull();
      // 余分な値は落とす
      expect(artillery.parseMove({ angle: 45, power: 50, hp: 0 })).toEqual({ angle: 45, power: 50 });
    });
  });

  describe("コンピュータ", () => {
    it("風がなく平らなら、いちばん当たりそうな手は相手の大砲に直撃する", () => {
      const s = flatState();
      for (const seat of [0, 1] as Seat[]) {
        const best = aim(s, seat);
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

    it("選んだ手に人間らしいずれを足す（毎回同じ手にはならない）。範囲の中の整数", () => {
      const s = artillery.initialState(seeded(6));
      const rng = seeded(1);
      const moves = Array.from({ length: 12 }, () => artillery.botMove!(s, 0, rng) as ArtilleryMove);
      expect(new Set(moves.map((m) => `${m.angle},${m.power}`)).size).toBeGreaterThan(3);
      for (const m of moves) expect(artillery.parseMove(m)).toEqual(m);
    });

    it("手番でない・終局後は null", () => {
      const s = flatState();
      expect(artillery.botMove!(s, 1, Math.random)).toBeNull();
      expect(artillery.botMove!({ ...s, hp: [0, 50] }, 0, Math.random)).toBeNull();
    });
  });
});
