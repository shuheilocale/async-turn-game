import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * 3D カーリング（簡略版）：2 エンド。1 エンドに 1 人 4 投ずつ、交互に石を投げる。
 * エンドの最後の 1 投（ハンマー）は、1 エンド目は後手が持つ。次のエンドからは、点を取った人の相手が持つ
 * （どちらも点を取らなければそのまま）。エンドの 8 投が終わったら、ハウス（的の円）の中心にいちばん近い石を
 * 持つ人が、相手のいちばん近い石より中心に近い自分の石の数だけ点を取る。2 エンドの合計が多い方の勝ち。
 * 同点なら延長を 1 エンドだけして、それでも同点なら引き分け。
 *
 * 物理演算（石がすべって曲がり、ぶつかる）は画面側でする。手には投げ方（向き・速さ・回転）と、
 * 止まったあとシートに残った全部の石の位置を入れて送る。ここでは形と範囲を確かめて保存するだけ
 * （身内で遊ぶものなので、計算結果は送った人を信じる）。
 *
 * 座標はメートル単位で、上から見た平面。投げる場所（石を放す所）を原点に、x は右、y はハウスの方向。
 */

/** 石の半径（本物は直径 29 cm くらい） */
export const STONE_R = 0.145;
/** シートの幅 */
export const SHEET_W = 4.5;
/** ハウスの中心（ティー）までの距離 */
export const TEE_Y = 22;
/** ホッグライン。投げた石はこれを完全に越えないと取り除く */
export const HOG_Y = TEE_Y - 6.4;
/** バックライン（ハウスの奥の端）。これを完全に越えた石は取り除く */
export const BACK_Y = TEE_Y + 1.83;
/** シートの奥の端（壁） */
export const SHEET_END = BACK_Y + 1.8;
/** ハウスの円の半径（外から順に。いちばん内側はボタン） */
export const RINGS = [1.83, 1.22, 0.61, 0.15] as const;
export const HOUSE_R = RINGS[0];

/** 1 エンドの投数（1 人 4 投） */
export const THROWS = 8;
export const ENDS = 2;
/** 同点のときの延長のエンド数 */
export const EXTRA_ENDS = 1;

/** 向き（まっすぐ奥から何ラジアンずらせるか）。シートの横の端に届くくらいまで */
export const AIM_MAX = 0.2;
/** 投げる速さ（m/s）の範囲 */
export const SPEED_MIN = 1;
export const SPEED_MAX = 12;

/** 回転。1 = 右回り（時計回り。右へ曲がる）、-1 = 左回り（反時計回り。左へ曲がる） */
export type Spin = 1 | -1;

/** シートの上の石。id はそのエンドで何投目の石か（0〜7） */
export interface CurlingStone {
  id: number;
  seat: Seat;
  x: number;
  y: number;
  /** 石の向き（ラジアン、上から見て反時計回り、-π〜π）。取っ手の向きを描くのに使うだけ */
  angle: number;
}

/** 手に入れる石の位置 [id, x, y, 向き] */
export type Placed = [id: number, x: number, y: number, angle: number];

export interface CurlingMove {
  /** 向き（ラジアン）。0 がまっすぐ奥、正なら右 */
  aim: number;
  /** 投げる速さ（m/s） */
  speed: number;
  spin: Spin;
  /** 止まったあと、シートに残った石の位置（取り除いた石は入れない） */
  stones: Placed[];
}

/** 終わったエンド */
export interface EndResult {
  /** そのエンドのハンマーを持っていた人 */
  hammer: Seat;
  /** 点を取った人。どちらも取らなければ null */
  scorer: Seat | null;
  points: number;
  /** エンドが終わったときの石の並び */
  stones: CurlingStone[];
}

/** 直前の 1 投。相手の画面で「投げて止まるまで」を再生するのに使う */
export interface LastThrow {
  seat: Seat;
  /** 何エンド目（0 から）の投球か。エンドの最後の 1 投なら、ends にもう結果が入っている */
  end: number;
  /** 投げた石の id */
  id: number;
  aim: number;
  speed: number;
  spin: Spin;
  /** 投げる前の石 */
  before: CurlingStone[];
  /** 止まったあとの石 */
  after: CurlingStone[];
}

export interface CurlingState {
  /** 今のエンドのハンマーを持つ人（最後に投げる） */
  hammer: Seat;
  /** 今のエンドで投げ終えた数 */
  thrown: number;
  /** 今のエンドのシートの上の石 */
  stones: CurlingStone[];
  /** 終わったエンド */
  ends: EndResult[];
  last: LastThrow | null;
}

/** 0.1 mm（角度は 0.0001 ラジアン）単位にそろえる。-0 は 0 にする */
const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;

/** 石がシートの中（取り除かれない場所）にあるか。横の線に触れたら外、奥の線とホッグラインは完全に越えたかで決める */
export function inPlay(x: number, y: number): boolean {
  return Math.abs(x) + STONE_R < SHEET_W / 2 && y - STONE_R > HOG_Y && y - STONE_R <= BACK_Y;
}

/** ハウスの中心からの距離 */
export const distanceToTee = (s: { x: number; y: number }) => Math.hypot(s.x, s.y - TEE_Y);

/** ハウスの円に少しでもかかっているか */
export const inHouse = (s: { x: number; y: number }) => distanceToTee(s) <= HOUSE_R + STONE_R;

/**
 * 点になる石（中心に近い順）。中心にいちばん近い石を持つ人の、相手のいちばん近い石より中心に近い石。
 * ハウスにかかっていない石は数えない。いちばん近い石が 2 人とも同じ近さなら、どれも点にならない
 */
export function countingStones<T extends CurlingStone>(stones: readonly T[]): T[] {
  const counted = stones
    .filter(inHouse)
    .map((s) => ({ s, d: distanceToTee(s) }))
    .sort((a, b) => a.d - b.d);
  const first = counted[0];
  if (!first) return [];
  const rival = counted.find((c) => c.s.seat !== first.s.seat)?.d ?? Infinity;
  if (rival === first.d) return [];
  return counted.filter((c) => c.s.seat === first.s.seat && c.d < rival).map((c) => c.s);
}

/** エンドの得点。点になる石を持つ人と、その数 */
export function scoreEnd(stones: readonly CurlingStone[]): { scorer: Seat | null; points: number } {
  const counting = countingStones(stones);
  return counting.length > 0 ? { scorer: counting[0]!.seat, points: counting.length } : { scorer: null, points: 0 };
}

/** その時点の合計点 [先手, 後手] */
export function totals(s: Pick<CurlingState, "ends">): [number, number] {
  const sum: [number, number] = [0, 0];
  for (const e of s.ends) if (e.scorer !== null) sum[e.scorer] += e.points;
  return sum;
}

/** 試合が終わったか。2 エンドで差がつけば終わり。同点なら延長まで */
function finished(s: CurlingState): GameStatus | null {
  const [a, b] = totals(s);
  if (s.ends.length >= ENDS && a !== b) return { kind: "finished", winner: a > b ? 0 : 1 };
  if (s.ends.length >= ENDS + EXTRA_ENDS) return { kind: "finished", winner: null };
  return null;
}

/** 次に投げる人。ハンマーの人の相手から交互に投げる。終わっていれば null */
export function turnOf(s: CurlingState): Seat | null {
  if (finished(s)) return null;
  return s.thrown % 2 === 0 ? other(s.hammer) : s.hammer;
}

/** そのエンドの id 番目の石を投げる人 */
export const throwerOf = (hammer: Seat, id: number): Seat => (id % 2 === 0 ? other(hammer) : hammer);

/** その人がこのエンドにあと何投残しているか */
export function throwsLeft(s: CurlingState, seat: Seat): number {
  if (finished(s)) return 0;
  let n = 0;
  for (let id = s.thrown; id < THROWS; id++) if (throwerOf(s.hammer, id) === seat) n++;
  return n;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePlaced(raw: unknown): Placed | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(finite)) return null;
  const [id, x, y, angle] = raw as Placed;
  if (!Number.isInteger(id) || id < 0 || id >= THROWS) return null;
  if (Math.abs(x) > SHEET_W || y < 0 || y > SHEET_END + 5 || Math.abs(angle) > Math.PI + 1e-6) return null;
  return [id, x, y, angle];
}

export const curling: GameDefinition<CurlingState, CurlingMove> = {
  id: "curling",

  initialState() {
    return { hammer: 1, thrown: 0, stones: [], ends: [], last: null };
  },

  status(state): GameStatus {
    return finished(state) ?? { kind: "playing", turn: turnOf(state)! };
  },

  applyMove(state, move, seat) {
    if (finished(state)) throw new IllegalMoveError("game_over");
    if (seat !== turnOf(state)) throw new IllegalMoveError("not_your_turn");

    // 残っている石は、投げる前にあった石か、いま投げた石だけ。同じ石は 1 回まで
    const id = state.thrown;
    const known = new Map(state.stones.map((s) => [s.id, s.seat]));
    known.set(id, seat);
    const seen = new Set<number>();
    const stones: CurlingStone[] = [];
    for (const [sid, x, y, angle] of move.stones) {
      const owner = known.get(sid);
      if (owner === undefined || seen.has(sid)) throw new IllegalMoveError("curling_stone");
      if (!inPlay(x, y)) throw new IllegalMoveError("curling_out");
      seen.add(sid);
      stones.push({ id: sid, seat: owner, x: round4(x), y: round4(y), angle: round4(angle) });
    }

    const end = state.ends.length;
    const last: LastThrow = {
      seat,
      end,
      id,
      aim: round4(move.aim),
      speed: round4(move.speed),
      spin: move.spin,
      before: state.stones,
      after: stones,
    };
    if (id + 1 < THROWS) return { ...state, thrown: id + 1, stones, last };

    // エンドの最後の 1 投：得点を記録して石を片付ける。点を取った人の相手が次のハンマー
    const { scorer, points } = scoreEnd(stones);
    return {
      hammer: scorer === null ? state.hammer : other(scorer),
      thrown: 0,
      stones: [],
      ends: [...state.ends, { hammer: state.hammer, scorer, points, stones }],
      last,
    };
  },

  parseMove(raw) {
    const m = raw as Partial<Record<keyof CurlingMove, unknown>> | null;
    if (!m || !finite(m.aim) || !finite(m.speed) || (m.spin !== 1 && m.spin !== -1)) return null;
    if (Math.abs(m.aim) > AIM_MAX || m.speed < SPEED_MIN || m.speed > SPEED_MAX) return null;
    if (!Array.isArray(m.stones) || m.stones.length > THROWS) return null;
    const stones: Placed[] = [];
    for (const p of m.stones) {
      const placed = parsePlaced(p);
      if (!placed) return null;
      stones.push(placed);
    }
    return { aim: m.aim, speed: m.speed, spin: m.spin, stones };
  },
};
