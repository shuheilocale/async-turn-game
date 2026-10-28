import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * ビリヤード（8 ボール。簡略版）：上から見た台で、手球（白）を打って的球をポケットに入れる。
 * 1〜7 がソリッド、9〜15 がストライプ、8 が黒。先手がブレイクする。
 *
 * - ブレイクで入った球ではグループを決めない（テーブルはオープン）。オープンのあいだは、正しく入れた最初の球の
 *   グループ（ソリッド／ストライプ）が、入れた人のものになる。相手はもう一方
 * - 自分の球（オープンのあいだは 8 以外のどれでも）を正しく入れたら、続けて打つ。入らなければ交代
 * - ファウル：手球を落とす（スクラッチ）・どの球にも当てない・最初に当てたのが自分の球でない
 *   （オープンのあいだに 8 に先に当てる、自分の球が残っているのに 8 に先に当てる、も含む）。
 *   ファウルなら相手の番で、相手は手球を台の好きな所に置ける（フリーボール）。クッションに当たらなかったことはファウルにしない
 * - 8 番：自分の球を全部入れたあとに正しく入れれば勝ち。それより前に入れる、または 8 を入れた 1 打がファウルなら負け。
 *   ポケットの指定（コール）はしない
 * - ブレイクで 8 が入ったら、球を並べ直して同じ人がもう一度ブレイクする
 * - ブレイクのときは、手球を手前の線（ヘッドストリング）より手前の好きな所に置ける
 *
 * 物理演算（球が転がり、ぶつかり、ポケットに落ちる）は画面側でする。手には打ち方（向き・強さ・上下の回転）と、
 * 止まったあとの結果（入った球の順番・手球が最初に当てた球・止まった全部の球の位置）を入れて送る。
 * ここでは結果が筋の通ったものか（球の ID・位置・入った球がまだ台にあったか など）を確かめて、ルールを進める
 * （身内で遊ぶものなので、計算結果は送った人を信じる）。
 *
 * 座標はメートル単位で、上から見た平面。台の中心が原点、x は長い辺の向き（ブレイクする側が負、ラックを置く側が正）、
 * y は短い辺の向き。台の大きさはクッションの内側（球が当たる所）で測る。
 */

/** 台の長さ・幅（クッションの内側）。本物の 7 フィートの台より少し小さく、球を少し大きめにして見やすくしている */
export const TABLE_L = 1.8;
export const TABLE_W = 0.9;
export const HALF_L = TABLE_L / 2;
export const HALF_W = TABLE_W / 2;
/** 球の半径 */
export const BALL_R = 0.029;
/** ヘッドストリング（ブレイクで手球を置ける線）。これより手前（x が小さい側）に置く */
export const HEAD_X = -TABLE_L / 4;
/** ラックの先頭の球を置く所（フットスポット） */
export const FOOT_X = TABLE_L / 4;
/** ラックの球どうしのすきま（物理演算で重ならないように、ほんの少しあける） */
export const RACK_GAP = 0.0003;

/** 打つ速さ（m/s）の範囲 */
export const SPEED_MIN = 0.05;
export const SPEED_MAX = 8;

export const CUE = 0;
export const EIGHT = 8;
/** 的球の番号 */
export const OBJECT_BALLS = Array.from({ length: 15 }, (_, i) => i + 1);

export type Group = "solid" | "stripe";

/** その球のグループ。手球と 8 は null */
export const groupOf = (id: number): Group | null => (id >= 1 && id <= 7 ? "solid" : id >= 9 && id <= 15 ? "stripe" : null);

/** 台の上の球 */
export interface Ball {
  id: number;
  x: number;
  y: number;
}

/** 手に入れる球の位置 [id, x, y] */
export type Placed = [id: number, x: number, y: number];

export interface BilliardsMove {
  /** 手球を置いた位置。フリーボールとブレイクのときだけ置ける（手球が落ちていたら必ず置く） */
  cue?: [x: number, y: number];
  /** 打つ向き（ラジアン。x の正の向きが 0、反時計回りが正） */
  angle: number;
  /** 打つ速さ（m/s） */
  speed: number;
  /** 上下の回転。1 なら押し球（上を打つ）、-1 なら引き球（下を打つ） */
  spin: number;
  /** 入った球（入った順）。手球（0）が入ったらスクラッチ */
  pocketed: number[];
  /** 手球が最初に当てた的球。どれにも当たらなければ null */
  firstHit: number | null;
  /** 止まったあと、台に残った全部の球の位置 */
  balls: Placed[];
}

/** ファウルのわけ。scratch = 手球が落ちた、noHit = どの球にも当たらなかった、wrongBall = 最初に相手の球に当てた、eightFirst = 先に 8 に当てた */
export type Foul = "scratch" | "noHit" | "wrongBall" | "eightFirst";

/**
 * 1 打の結果。continue = 続けて打つ、miss = 入らず交代、foul = ファウルで交代、
 * win = 8 を入れて勝ち、lose = 8 を先に入れた・8 を入れた 1 打がファウルで負け、rerack = ブレイクで 8 が入って並べ直し
 */
export type Outcome = "continue" | "miss" | "foul" | "win" | "lose" | "rerack";

/** 打った 1 打。相手の画面で「打って止まるまで」を再生するのに使う */
export interface Shot {
  /** 何打目か（通し、1 から） */
  n: number;
  seat: Seat;
  /** ブレイクの 1 打か */
  break: boolean;
  angle: number;
  speed: number;
  spin: number;
  /** 打つ前の球（手球を置いたなら、置いた位置） */
  before: Ball[];
  /** 止まったあとの球 */
  after: Ball[];
  pocketed: number[];
  firstHit: number | null;
  foul: Foul | null;
  outcome: Outcome;
  /** この 1 打で、打った人のグループが決まったならそのグループ */
  assigned?: Group;
}

export interface BilliardsState {
  /** 対局の種。ラックの並びを決める */
  seed: number;
  /** 何回目のラックか（0 から。ブレイクで 8 が入ると増える） */
  rack: number;
  /** 台の上の球。手球が落ちている（フリーボールで置く前）ときは手球がない */
  balls: Ball[];
  turn: Seat;
  /** 次の 1 打がブレイク */
  breaking: boolean;
  /** 次に打つ人は、手球を台の好きな所に置ける（フリーボール） */
  inHand: boolean;
  /** ソリッドを持つ人。null ならテーブルはオープン（グループが決まっていない） */
  solids: Seat | null;
  winner: Seat | null;
  /** 打った数 */
  shots: number;
  /** いちばん新しい「続けて打った」ひと続きの打（同じ人の打だけ。打つ人が替わったら新しく始める） */
  run: Shot[];
}

/** 0.1 mm 単位にそろえる（角度などは 0.0001 単位）。-0 は 0 にする */
const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;

/** 種から決まる乱数（mulberry32）。整数の計算だけなので、どの端末でも同じ並びになる */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ラックの 15 か所の位置（先頭から 1 列目、2 列目…の順）。先頭はフットスポット、列はラックの奥（x の正の向き）へ */
export function rackSpots(): [number, number][] {
  const d = 2 * BALL_R + RACK_GAP;
  const dx = (d * Math.sqrt(3)) / 2;
  const spots: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) spots.push([FOOT_X + row * dx, (j - row / 2) * d]);
  }
  return spots;
}

/** ラックのまん中（3 列目の中央）と、奥の列の両端 */
const CENTER_SPOT = 4;
const BACK_CORNERS = [10, 14] as const;

/** 手球をはじめに置く所（ヘッドスポット） */
export const HEAD_SPOT: [number, number] = [HEAD_X, 0];

/**
 * 球の並び。8 はまん中、奥の両端にソリッドとストライプを 1 つずつ、ほかはばらばらに。種とラックの回数から決まる
 * 返すのは spots の順の球の番号
 */
export function rackOrder(seed: number, rack: number): number[] {
  const rand = seeded((seed ^ Math.imul(rack + 1, 0x9e3779b1)) >>> 0);
  const pick = <T,>(list: T[]): T => list.splice(Math.floor(rand() * list.length), 1)[0]!;
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const order: number[] = new Array(15).fill(0);
  order[CENTER_SPOT] = EIGHT;
  const corner = [pick(solids), pick(stripes)];
  if (rand() < 0.5) corner.reverse();
  order[BACK_CORNERS[0]] = corner[0]!;
  order[BACK_CORNERS[1]] = corner[1]!;
  const rest = [...solids, ...stripes];
  for (let i = 0; i < 15; i++) if (order[i] === 0) order[i] = pick(rest);
  return order;
}

/** 並べたばかりの台（手球はヘッドスポット） */
export function rackBalls(seed: number, rack: number): Ball[] {
  const spots = rackSpots();
  const order = rackOrder(seed, rack);
  const balls: Ball[] = [{ id: CUE, x: HEAD_SPOT[0], y: HEAD_SPOT[1] }];
  order.forEach((id, i) => balls.push({ id, x: round4(spots[i]![0]), y: round4(spots[i]![1]) }));
  return balls.sort((a, b) => a.id - b.id);
}

/** 止まった球の位置として受け付ける範囲（ポケットの口に引っかかって止まることもあるので、少しだけ外も許す） */
export const onTable = (x: number, y: number) => Math.abs(x) <= HALF_L + BALL_R && Math.abs(y) <= HALF_W + BALL_R;

/** 手球を置ける場所か。クッションの内側で、ほかの球に重ならない。ブレイクならヘッドストリングより手前 */
export function canPlaceCue(x: number, y: number, others: readonly { id: number; x: number; y: number }[], breaking: boolean): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(x) > HALF_L - BALL_R + 1e-9 || Math.abs(y) > HALF_W - BALL_R + 1e-9) return false;
  if (breaking && x > HEAD_X + 1e-9) return false;
  // 触れていると、打った向きと関係なく当たったことになりかねないので、1 mm あける
  return others.every((b) => b.id === CUE || Math.hypot(b.x - x, b.y - y) >= 2 * BALL_R + 0.001 - 1e-9);
}

/** その人のグループ。テーブルがオープンなら null */
export function groupOfSeat(s: Pick<BilliardsState, "solids">, seat: Seat): Group | null {
  if (s.solids === null) return null;
  return s.solids === seat ? "solid" : "stripe";
}

/** その人が入れるべき球のうち、台に残っているもの（オープンなら 8 以外の全部の的球） */
export function targetsOf(s: Pick<BilliardsState, "solids" | "balls">, seat: Seat): number[] {
  const group = groupOfSeat(s, seat);
  return s.balls
    .map((b) => b.id)
    .filter((id) => id !== CUE && id !== EIGHT && (group === null || groupOf(id) === group))
    .sort((a, b) => a - b);
}

/** 自分の球を入れ終えて、あとは 8 を入れるだけか（グループが決まっているときだけ） */
export const onEight = (s: Pick<BilliardsState, "solids" | "balls">, seat: Seat) =>
  s.solids !== null && targetsOf(s, seat).length === 0;

/** その人が最初に当ててよい球 */
export function legalFirst(s: Pick<BilliardsState, "solids" | "balls">, seat: Seat): Set<number> {
  const targets = targetsOf(s, seat);
  // オープンで 8 以外が 1 つも残っていない（まずないが）なら 8
  return new Set(targets.length > 0 ? targets : [EIGHT]);
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 15;

function bad(): never {
  throw new IllegalMoveError("billiards_result");
}

export const billiards: GameDefinition<BilliardsState, BilliardsMove> = {
  id: "billiards",

  initialState(rng: Rng) {
    const seed = Math.floor(rng() * 2 ** 31);
    return {
      seed,
      rack: 0,
      balls: rackBalls(seed, 0),
      turn: 0,
      breaking: true,
      inHand: false,
      solids: null,
      winner: null,
      shots: 0,
      run: [],
    };
  },

  status(state): GameStatus {
    if (state.winner !== null) return { kind: "finished", winner: state.winner };
    return { kind: "playing", turn: state.turn };
  },

  applyMove(state, move, seat) {
    if (state.winner !== null) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");

    // 打つ前の球。手球を置いたなら、置いた位置
    const cueOn = state.balls.some((b) => b.id === CUE);
    let before = state.balls;
    if (move.cue) {
      if (!state.inHand && !state.breaking) throw new IllegalMoveError("billiards_place");
      const [x, y] = move.cue;
      if (!canPlaceCue(x, y, state.balls, state.breaking)) throw new IllegalMoveError("billiards_place");
      before = [{ id: CUE, x: round4(x), y: round4(y) }, ...state.balls.filter((b) => b.id !== CUE)].sort((a, b) => a.id - b.id);
    } else if (!cueOn) throw new IllegalMoveError("billiards_place");
    const start = new Map(before.map((b) => [b.id, b]));

    // 結果が筋の通ったものか：入った球と残った球を合わせると、打つ前の球にちょうどなる
    const seen = new Set<number>();
    for (const id of move.pocketed) {
      if (!start.has(id) || seen.has(id)) bad();
      seen.add(id);
    }
    const after: Ball[] = [];
    for (const [id, x, y] of move.balls) {
      if (!start.has(id) || seen.has(id)) bad();
      if (!onTable(x, y)) throw new IllegalMoveError("billiards_out");
      seen.add(id);
      after.push({ id, x: round4(x), y: round4(y) });
    }
    if (seen.size !== start.size) bad();
    after.sort((a, b) => a.id - b.id);
    // 止まった球どうしは重ならない（物理演算のめり込みの分だけ、少しは許す）
    for (let i = 0; i < after.length; i++) {
      for (let j = i + 1; j < after.length; j++) {
        if (Math.hypot(after[i]!.x - after[j]!.x, after[i]!.y - after[j]!.y) < 2 * BALL_R - 0.003) bad();
      }
    }
    if (move.firstHit !== null && (move.firstHit === CUE || !start.has(move.firstHit))) bad();
    // どの球にも当たらなければ、的球は動かないし入らない
    if (move.firstHit === null) {
      if (move.pocketed.some((id) => id !== CUE)) bad();
      for (const b of after) {
        const s = start.get(b.id)!;
        if (b.id !== CUE && Math.hypot(b.x - s.x, b.y - s.y) > 0.001) bad();
      }
    }

    const scratch = move.pocketed.includes(CUE);
    const made = move.pocketed.filter((id) => id !== CUE);
    const eightIn = made.includes(EIGHT);
    const n = state.shots + 1;
    const shotBase = {
      n,
      seat,
      break: state.breaking,
      angle: round4(move.angle),
      speed: round4(move.speed),
      spin: round4(move.spin),
      before,
      after,
      pocketed: [...move.pocketed],
      firstHit: move.firstHit,
    };
    // 打つ人が替わったら、ひと続きの打を新しく始める
    const runWith = (shot: Shot) => (state.run[0]?.seat === seat ? [...state.run, shot] : [shot]);

    if (state.breaking) {
      const foul: Foul | null = scratch ? "scratch" : move.firstHit === null ? "noHit" : null;
      if (eightIn) {
        // ブレイクで 8 が入った：並べ直して、同じ人がもう一度ブレイク
        const shot: Shot = { ...shotBase, foul, outcome: "rerack" };
        return {
          ...state,
          rack: state.rack + 1,
          balls: rackBalls(state.seed, state.rack + 1),
          breaking: true,
          inHand: false,
          shots: n,
          run: runWith(shot),
        };
      }
      const outcome: Outcome = foul ? "foul" : made.length > 0 ? "continue" : "miss";
      const shot: Shot = { ...shotBase, foul, outcome };
      return {
        ...state,
        balls: after,
        turn: outcome === "continue" ? seat : other(seat),
        breaking: false,
        inHand: foul !== null,
        shots: n,
        run: runWith(shot),
      };
    }

    const legal = legalFirst(state, seat);
    const wasOnEight = onEight(state, seat);
    let foul: Foul | null = null;
    if (scratch) foul = "scratch";
    else if (move.firstHit === null) foul = "noHit";
    else if (!legal.has(move.firstHit)) foul = move.firstHit === EIGHT ? "eightFirst" : "wrongBall";

    if (eightIn) {
      // 8 が入った：自分の球を入れ終えていて、ファウルでなければ勝ち。ほかは負け
      const win = foul === null && wasOnEight;
      const shot: Shot = { ...shotBase, foul, outcome: win ? "win" : "lose" };
      return { ...state, balls: after, winner: win ? seat : other(seat), inHand: false, shots: n, run: runWith(shot) };
    }
    if (foul) {
      const shot: Shot = { ...shotBase, foul, outcome: "foul" };
      return { ...state, balls: after, turn: other(seat), inHand: true, shots: n, run: runWith(shot) };
    }

    // オープンなら、正しく入れた最初の球のグループが、打った人のものになる
    let solids = state.solids;
    let assigned: Group | undefined;
    if (solids === null && made.length > 0) {
      assigned = groupOf(made[0]!)!;
      solids = assigned === "solid" ? seat : other(seat);
    }
    const mine = groupOfSeat({ solids }, seat);
    const madeOwn = mine !== null && made.some((id) => groupOf(id) === mine);
    const outcome: Outcome = madeOwn ? "continue" : "miss";
    const shot: Shot = { ...shotBase, foul: null, outcome, ...(assigned ? { assigned } : {}) };
    return {
      ...state,
      balls: after,
      turn: madeOwn ? seat : other(seat),
      inHand: false,
      solids,
      shots: n,
      run: runWith(shot),
    };
  },

  parseMove(raw) {
    const m = raw as Partial<Record<keyof BilliardsMove, unknown>> | null;
    if (!m || !finite(m.angle) || !finite(m.speed) || !finite(m.spin)) return null;
    if (Math.abs(m.angle) > Math.PI + 1e-6 || m.speed < SPEED_MIN || m.speed > SPEED_MAX || Math.abs(m.spin) > 1) return null;
    let cue: [number, number] | undefined;
    if (m.cue !== undefined) {
      const c = m.cue as unknown[];
      if (!Array.isArray(c) || c.length !== 2 || !finite(c[0]) || !finite(c[1])) return null;
      cue = [c[0], c[1]];
    }
    if (!Array.isArray(m.pocketed) || m.pocketed.length > 16 || !m.pocketed.every(isId)) return null;
    if (m.firstHit !== null && !isId(m.firstHit)) return null;
    if (!Array.isArray(m.balls) || m.balls.length > 16) return null;
    const balls: Placed[] = [];
    for (const p of m.balls as unknown[]) {
      if (!Array.isArray(p) || p.length !== 3 || !isId(p[0]) || !finite(p[1]) || !finite(p[2])) return null;
      if (Math.abs(p[1]) > 10 || Math.abs(p[2]) > 10) return null;
      balls.push([p[0], p[1], p[2]]);
    }
    return {
      ...(cue ? { cue } : {}),
      angle: m.angle,
      speed: m.speed,
      spin: m.spin,
      pocketed: [...(m.pocketed as number[])],
      firstHit: m.firstHit as number | null,
      balls,
    };
  },
};
