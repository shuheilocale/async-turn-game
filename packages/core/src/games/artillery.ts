import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * たまうちバトル：横長の地形の左右に 1 台ずつ置いた大砲で、交互に 1 発ずつ撃ち合う。
 * 手は角度と強さ。弾は重力と風（手番ごとに変わる）で飛び、地形か大砲に当たると爆発して、
 * 円の中の地形をけずり、近くの大砲には距離に応じたダメージを与える。足もとがけずれた大砲は下に落ちる。
 * 先に相手の体力を 0 にした方の勝ち。1 人 10 発ずつ撃って決まらなければ、体力の多い方の勝ち。
 *
 * 弾の飛び方・爆発はここ（サーバの applyMove）で計算する。画面も同じ関数で弾の軌跡を出して動かす。
 * 固定の時間きざみで、乱数は使わない。三角関数も四則演算だけで計算するので、
 * サーバ（V8）と iPhone（JavaScriptCore）で同じ手からまったく同じ軌跡になる。
 *
 * 座標は柱 1 本の幅を 1 とする単位で、x は左の端が 0、y は上向きで画面の下の端が 0。
 */

/** 地形の柱の数（横幅） */
export const COLS = 160;
/** 画面に見せる高さ。盤の縦横比は 160 : 128 = 5 : 4 */
export const VIEW_H = 128;
/** 1 人が撃てる弾の数 */
export const SHOTS = 10;
export const MAX_HP = 100;

/** 計算の時間きざみ（秒）。1 きざみで進むのは最大でも柱 1 本分より短い */
export const STEP = 1 / 120;
/** 1 発で計算するきざみの上限（12 秒分）。真上に全力で撃っても 6 秒ほどで落ちる */
export const MAX_STEPS = 1440;
/** 重力の加速度（単位 / 秒²） */
export const GRAVITY = 30;
/** 強さ 100 のときの弾の速さ（単位 / 秒）。45 度・無風なら 200 ほど先まで届く */
export const MAX_SPEED = 78;
/** 風の強さの上限（±）。正なら右向き */
export const WIND_MAX = 10;
/** 風 1 あたりの横向きの加速度（単位 / 秒²）。風 10 で重力の 6 分の 1 */
export const WIND_ACC = 0.5;

/** 爆発でけずれる円の半径 */
export const CRATER_R = 7;
/** 爆風が届く距離。大砲の付け根からの距離がこれ以上ならダメージは 0 */
export const BLAST_R = 16;
/** 爆発のまん中（距離 0）でのダメージ。距離に比例して減る */
export const MAX_DAMAGE = 50;
/** 大砲の当たり判定の半径（砲身の付け根から） */
export const CANNON_R = 5;
/** 砲身の付け根の、足もとからの高さ */
export const PIVOT_H = 3.6;
/** 砲身の長さ。弾は砲口から出る */
export const BARREL = 8;
/** 岩盤の高さ。これより下はけずれない */
export const MIN_GROUND = 4;
/** 大砲を支える柱の範囲（中心の柱から左右にこの本数。大砲の幅は柱 12 本ほど） */
export const SUPPORT = 3;

/** 大砲の位置。x は中心（柱のまん中）、y は足もとの高さ */
export interface Cannon {
  x: number;
  y: number;
}

export interface ArtilleryMove {
  /** 撃つ向き（度、整数）。0 が右、90 が真上、180 が左 */
  angle: number;
  /** 強さ（0〜100 の整数） */
  power: number;
}

/** 撃つたびに変わるもの */
export interface Field {
  /** 柱ごとの地形の高さ（0.01 きざみ） */
  terrain: number[];
  cannons: [Cannon, Cannon];
  hp: [number, number];
}

/** 撃った弾の記録。その手番の風は winds[何発目か] */
export interface Shot {
  seat: Seat;
  angle: number;
  power: number;
  /** 爆発した場所（0.01 きざみ）。左右の端から外へ出たら null */
  impact: [number, number] | null;
  /** それぞれの大砲が受けたダメージ */
  damage: [number, number];
}

export interface ArtilleryState extends Field {
  /** 最初の地形（変わらない）。画面がけずれた所を描き分けるのに使う */
  ground: number[];
  /** 手番ごとの風（2 人 × 10 発ぶん）。最初に全部決めておく */
  winds: number[];
  shots: Shot[];
  turn: Seat;
  /** 直前の 1 発を撃つ前の場。相手の画面で「飛んでいって爆発するまで」を再生するのに使う */
  before: Field | null;
}

export interface Flight {
  /** 弾の位置（STEP 秒ごと）。最初は砲口、最後は爆発した場所（外へ出たならその位置）。record のときだけ */
  path: [number, number][];
  /** 爆発した場所。左右の端から外へ出たら null */
  impact: [number, number] | null;
  /** 計算したきざみの数 */
  steps: number;
}

/** 0.01 きざみにそろえる。-0 は 0 にする */
const round2 = (v: number) => Math.round(v * 100) / 100 || 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** |x| ≤ π/2 の sin。テイラー展開を x^23 の項まで足す（四則演算だけなので、どの端末でも同じ値になる） */
function sinSmall(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 11; n++) {
    term = (-term * x2) / (2 * n * (2 * n + 1));
    sum += term;
  }
  return sum;
}

/** 度の sin。Math.sin は端末によって最後の桁がずれることがあるので使わない */
export function sinDeg(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  let sign = 1;
  if (a >= 180) {
    a -= 180;
    sign = -1;
  }
  if (a > 90) a = 180 - a;
  if (a === 90) return sign;
  if (a === 0) return 0;
  return sign * sinSmall((a * Math.PI) / 180);
}

export const cosDeg = (deg: number) => sinDeg(90 - deg);

/** 大砲が乗る高さ。足もとの柱（中心から左右 SUPPORT 本まで）のいちばん高いところ */
export function supportY(terrain: number[], x: number): number {
  const col = Math.floor(x);
  let top = MIN_GROUND;
  for (let c = Math.max(0, col - SUPPORT); c <= Math.min(COLS - 1, col + SUPPORT); c++) top = Math.max(top, terrain[c]!);
  return top;
}

/** 砲身の付け根。当たり判定とダメージの距離はここから測る */
export const pivot = (c: Cannon): [number, number] => [c.x, c.y + PIVOT_H];

/** 砲口の位置 */
export function muzzle(c: Cannon, angle: number): [number, number] {
  const [px, py] = pivot(c);
  return [px + BARREL * cosDeg(angle), py + BARREL * sinDeg(angle)];
}

/** 今の手番の風 */
export const windNow = (s: ArtilleryState): number => s.winds[s.shots.length] ?? 0;

/** (x, y) が地形の中か、どちらかの大砲に当たっているか */
function hits(field: Field, x: number, y: number): boolean {
  const col = Math.floor(x);
  if (col < 0 || col >= COLS) return false;
  if (y <= field.terrain[col]!) return true;
  for (const c of field.cannons) {
    const dx = x - c.x;
    const dy = y - (c.y + PIVOT_H);
    if (dx * dx + dy * dy <= CANNON_R * CANNON_R) return true;
  }
  return false;
}

/**
 * seat の大砲から move で撃った弾の飛び方。重力と風を、固定の時間きざみで足していく。
 * 当たったきざみでは、前の位置との間を 2 分探索で詰めて、当たった場所を決める
 */
export function fly(field: Field, seat: Seat, move: ArtilleryMove, wind: number, record = false): Flight {
  const cannon = field.cannons[seat];
  let [x, y] = muzzle(cannon, move.angle);
  const speed = (move.power / 100) * MAX_SPEED;
  let vx = speed * cosDeg(move.angle);
  let vy = speed * sinDeg(move.angle);
  const ax = wind * WIND_ACC;
  const path: [number, number][] = record ? [[x, y]] : [];
  // 砲口が地面にめりこんでいたら、その場で爆発する
  if (hits(field, x, y)) return { path, impact: [x, y], steps: 0 };

  for (let step = 1; step <= MAX_STEPS; step++) {
    const px = x;
    const py = y;
    vx += ax * STEP;
    vy -= GRAVITY * STEP;
    x += vx * STEP;
    y += vy * STEP;
    if (x < 0 || x >= COLS) {
      if (record) path.push([x, y]);
      return { path, impact: null, steps: step };
    }
    if (hits(field, x, y)) {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (hits(field, px + (x - px) * mid, py + (y - py) * mid)) hi = mid;
        else lo = mid;
      }
      const impact: [number, number] = [px + (x - px) * hi, py + (y - py) * hi];
      if (record) path.push(impact);
      return { path, impact, steps: step };
    }
    if (record) path.push([x, y]);
  }
  return { path, impact: null, steps: MAX_STEPS };
}

/** 大砲が point の爆発から受けるダメージ。砲身の付け根からの距離に比例して減り、BLAST_R より遠ければ 0 */
export function damageAt(c: Cannon, [x, y]: readonly [number, number]): number {
  const [px, py] = pivot(c);
  const d = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
  return d >= BLAST_R ? 0 : Math.round(MAX_DAMAGE * (1 - d / BLAST_R));
}

/**
 * point で爆発したあとの場。円の中の地形をけずり（円の上にある土は落ちてきて、円の分だけ低くなる）、
 * 両方の大砲にダメージを与え、足もとがけずれた大砲を下に落とす
 */
export function blast(field: Field, point: readonly [number, number]): { field: Field; damage: [number, number] } {
  const [ix, iy] = point;
  const terrain = field.terrain.slice();
  const from = Math.max(0, Math.floor(ix - CRATER_R));
  const to = Math.min(COLS - 1, Math.ceil(ix + CRATER_R));
  for (let c = from; c <= to; c++) {
    const dx = c + 0.5 - ix;
    const r2 = CRATER_R * CRATER_R - dx * dx;
    if (r2 <= 0) continue;
    const s = Math.sqrt(r2);
    const h = terrain[c]!;
    // 円の下の端より上にある土のうち、円の中の分（最大で直径）がなくなる
    const removed = Math.min(Math.max(h - (iy - s), 0), 2 * s);
    if (removed > 0) terrain[c] = Math.max(MIN_GROUND, round2(h - removed));
  }
  const damage: [number, number] = [damageAt(field.cannons[0], point), damageAt(field.cannons[1], point)];
  return {
    field: {
      terrain,
      cannons: [
        { x: field.cannons[0].x, y: supportY(terrain, field.cannons[0].x) },
        { x: field.cannons[1].x, y: supportY(terrain, field.cannons[1].x) },
      ],
      hp: [Math.max(0, field.hp[0] - damage[0]), Math.max(0, field.hp[1] - damage[1])],
    },
    damage,
  };
}

/**
 * 最初の地形。なだらかな丘と谷（波を 3 つ重ねる）に、2 台の間の山（まん中あたりのふくらみ）を足す。
 * 大砲の足もとは平らにならす。高さは 10〜98
 */
function makeField(rng: Rng): Pick<Field, "terrain" | "cannons"> {
  const base = 22 + rng() * 12;
  const peakX = COLS / 2 + (rng() - 0.5) * 24;
  const peakW = 13 + rng() * 9;
  let peakH = 24 + rng() * 24;
  const waves = [
    { amp: 3 + rng() * 5, len: 55 + rng() * 40, phase: rng() * 2 * Math.PI },
    { amp: 1.5 + rng() * 2.5, len: 22 + rng() * 14, phase: rng() * 2 * Math.PI },
    { amp: 0.4 + rng() * 0.8, len: 8 + rng() * 5, phase: rng() * 2 * Math.PI },
  ];
  const cols: [number, number] = [14 + Math.floor(rng() * 12), COLS - 1 - (14 + Math.floor(rng() * 12))];

  const hill = (x: number) => Math.exp(-(((x - peakX) / peakW) ** 2));
  const rolling = (x: number) => base + waves.reduce((sum, w) => sum + w.amp * Math.sin((2 * Math.PI * x) / w.len + w.phase), 0);
  const height = (c: number) => rolling(c + 0.5) + peakH * hill(c + 0.5);

  // 山が大砲より 16 以上高くなるようにする（波の谷に山が重なって低くなったとき）
  const padTop = Math.max(height(cols[0]), height(cols[1]));
  let peak = 0;
  for (let c = cols[0] + 10; c < cols[1] - 9; c++) peak = Math.max(peak, height(c));
  if (peak < padTop + 16) peakH += padTop + 16 - peak;

  const raw = Array.from({ length: COLS }, (_, c) => height(c));
  // 大砲の足もと：中心から 5 本は同じ高さ、その先の 4 本でもとの地形へなめらかにつなぐ
  for (const col of cols) {
    const h = raw[col]!;
    for (let d = -9; d <= 9; d++) {
      const t = Math.abs(d) <= 5 ? 0 : (Math.abs(d) - 5) / 4;
      const w = t * t * (3 - 2 * t);
      raw[col + d] = h + (raw[col + d]! - h) * w;
    }
  }
  const terrain = raw.map((h) => round2(clamp(h, 10, 98)));
  return {
    terrain,
    cannons: [
      { x: cols[0] + 0.5, y: supportY(terrain, cols[0] + 0.5) },
      { x: cols[1] + 0.5, y: supportY(terrain, cols[1] + 0.5) },
    ],
  };
}

/** 手番ごとの風。少しずつ変わるよう、前の手番の風から ±4 の間で動かす */
function makeWinds(rng: Rng): number[] {
  const winds: number[] = [];
  let w = Math.round((rng() * 2 - 1) * 6) || 0;
  for (let i = 0; i < SHOTS * 2; i++) {
    winds.push(w);
    w = clamp(w + (Math.round((rng() * 2 - 1) * 4) || 0), -WIND_MAX, WIND_MAX);
  }
  return winds;
}

/**
 * seat がいちばん当たりそうな手（ずれなし）。角度と強さを粗く試してから、よかった手のまわりを細かく試す。
 * 相手へのダメージが大きく、自分へのダメージが小さい手を選ぶ。damage はその手で相手に与えるダメージ
 */
export function aim(state: ArtilleryState, seat: Seat): { move: ArtilleryMove; damage: number } {
  const wind = windNow(state);
  const target = state.cannons[other(seat)];
  const self = state.cannons[seat];
  const [tx, ty] = pivot(target);
  // e は自分の向いている側から測った仰角
  const angleOf = (e: number) => (seat === 0 ? e : 180 - e);
  let best = { move: { angle: angleOf(45), power: 70 }, score: -Infinity, damage: 0 };
  const consider = (e: number, power: number) => {
    if (e < 0 || e > 180 || power < 0 || power > 100) return;
    const move = { angle: angleOf(e), power };
    const { impact } = fly(state, seat, move, wind);
    if (!impact) return;
    const hit = damageAt(target, impact);
    const hurt = damageAt(self, impact);
    const score = hit * 4 - hurt * 5 - Math.hypot(impact[0] - tx, impact[1] - ty) * 0.05;
    if (score > best.score) best = { move, score, damage: hit };
  };
  for (let e = 10; e <= 85; e += 5) for (let p = 20; p <= 100; p += 4) consider(e, p);
  const e0 = seat === 0 ? best.move.angle : 180 - best.move.angle;
  const p0 = best.move.power;
  for (let de = -4; de <= 4; de++) for (let dp = -3; dp <= 3; dp++) consider(e0 + de, p0 + dp);
  return { move: best.move, damage: best.damage };
}

export const artillery: GameDefinition<ArtilleryState, ArtilleryMove> = {
  id: "artillery",

  initialState(rng) {
    const { terrain, cannons } = makeField(rng);
    return {
      terrain,
      ground: terrain,
      cannons,
      hp: [MAX_HP, MAX_HP],
      winds: makeWinds(rng),
      shots: [],
      turn: 0,
      before: null,
    };
  },

  status(state): GameStatus {
    const [a, b] = state.hp;
    if (a <= 0 || b <= 0) return { kind: "finished", winner: a <= 0 && b <= 0 ? null : a <= 0 ? 1 : 0 };
    if (state.shots.length >= SHOTS * 2) return { kind: "finished", winner: a > b ? 0 : b > a ? 1 : null };
    return { kind: "playing", turn: state.turn };
  },

  applyMove(state, move, seat) {
    if (artillery.status(state).kind === "finished") throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const field: Field = { terrain: state.terrain, cannons: state.cannons, hp: state.hp };
    const { impact } = fly(field, seat, move, windNow(state));
    const result = impact ? blast(field, impact) : { field, damage: [0, 0] as [number, number] };
    const shot: Shot = {
      seat,
      angle: move.angle,
      power: move.power,
      impact: impact && [round2(impact[0]), round2(impact[1])],
      damage: result.damage,
    };
    return {
      ...state,
      ...result.field,
      shots: [...state.shots, shot],
      turn: other(seat),
      before: field,
    };
  },

  parseMove(raw) {
    const m = raw as Partial<Record<keyof ArtilleryMove, unknown>> | null;
    if (!m || typeof m !== "object") return null;
    const { angle, power } = m;
    if (!Number.isInteger(angle) || !Number.isInteger(power)) return null;
    const a = angle as number;
    const p = power as number;
    if (a < 0 || a > 180 || p < 0 || p > 100) return null;
    return { angle: a, power: p };
  },

  botMove(view, seat, rng) {
    const s = view as ArtilleryState;
    const st = artillery.status(s);
    if (st.kind !== "playing" || st.turn !== seat) return null;
    const { move } = aim(s, seat);
    // 人間らしく少しずらす。撃つたびに慣れて、ずれが小さくなる
    const fired = s.shots.filter((shot) => shot.seat === seat).length;
    const k = Math.max(0.3, 1 - 0.15 * fired);
    const jitter = (spread: number) => Math.round((rng() + rng() - 1) * spread * k) || 0;
    return {
      angle: clamp(move.angle + jitter(6), 0, 180),
      power: clamp(move.power + jitter(22), 0, 100),
    };
  },
};
