import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * めくりあわせ（神経衰弱）：6 組 12 枚の札を裏向きに 4×3 に並べる。並びは 2 人とも知らない。
 * 手番では札を 1 枚ずつ、2 枚めくる（1 手 = 1 枚。1 枚目を見てから 2 枚目を選べる。
 * めくった時点で記録するので、やり直しはできない）。
 * - 2 枚が同じ絵なら、その 2 枚をもらって、続けてもう一度めくる
 * - ちがう絵なら裏に戻して相手の番
 * 全部なくなったら、多くもらった方の勝ち（同じ数なら引き分け）。
 *
 * めくった札の絵は 2 人とも見ているので、めくった記録（flips）は 2 人に見せる。
 * 画面はこれを使って相手の番を再生し、コンピュータは「覚えている札」をここから選ぶ。
 * 伏せるのは、記録にない札（まだ一度もめくられていない札）の絵だけ。
 *
 * 札の番号は左上から 0〜11（row * COLS + col）
 */

export const PAIRS = 6;
export const CARDS = PAIRS * 2;
export const COLS = 4;
export const ROWS = 3;

/** 絵の種類（番号の順）。画面はこの名前で絵と読み上げの文を選ぶ */
export const FACES = ["circle", "triangle", "star", "heart", "moon", "drop"] as const;
export type FaceName = (typeof FACES)[number];

export interface MemoryMove {
  card: number;
}

/** めくった 1 枚。2 つずつ組になり、同じ人の 1 枚目と 2 枚目が並ぶ */
export interface Flip {
  seat: Seat;
  card: number;
  face: number;
}

export interface MemoryState {
  /** 札ごとの絵の番号（0〜5）。2 人には見せない */
  faces: number[];
  /** 札ごとの持ち主。null = まだ場にある */
  owners: (Seat | null)[];
  turn: Seat;
  /** これまでにめくった札（めくった順）。数が奇数なら、最後の 1 枚が今めくっている 1 枚目 */
  flips: Flip[];
}

/** 画面に渡す形。見てはいけない絵は null（取られた札・今めくっている札・終局後は見える） */
export interface MemoryView extends Omit<MemoryState, "faces"> {
  faces: (number | null)[];
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 今の手番でめくっている 1 枚目。めくっていなければ null */
export function openCard(flips: Flip[]): number | null {
  return flips.length % 2 === 1 ? flips.at(-1)!.card : null;
}

/** seat がもらった組の数 */
export const pairsOf = (owners: (Seat | null)[], seat: Seat) => owners.filter((o) => o === seat).length / 2;

/** 記録の最初の count 枚までで、誰がどの札を取っていたか（画面で途中から再生するときに使う） */
export function ownersAt(flips: Flip[], count: number): (Seat | null)[] {
  const owners: (Seat | null)[] = Array(CARDS).fill(null);
  for (let i = 0; i + 1 < count; i += 2) {
    const [a, b] = [flips[i]!, flips[i + 1]!];
    if (a.face === b.face) owners[a.card] = owners[b.card] = a.seat;
  }
  return owners;
}

/** seat の最後の番が、記録の何枚目から始まったか。まだ一度もめくっていなければ null */
export function lastTurnStart(flips: Flip[], seat: Seat): number | null {
  let end = flips.length;
  while (end > 0 && flips[end - 1]!.seat !== seat) end--;
  if (end === 0) return null;
  let start = end - 1;
  while (start > 0 && flips[start - 1]!.seat === seat) start--;
  return start;
}

/**
 * コンピュータが、age 枚前にめくられた札の絵を覚えている見込み。直前の札は 9 割覚えていて、
 * 古くなるほど忘れやすい（8 枚以上前でも 2 割は覚えている）。同じ札を何度も見ればそのぶん思い出しやすい。
 * 全部覚えていれば平均 18 枚ほどめくって終わるところ、これで 24 枚ほど（でたらめなら 70 枚ほど）
 */
const rememberChance = (age: number) => Math.max(0.2, 0.9 - age * 0.1);

const pick = <T>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

export const memory: GameDefinition<MemoryState, MemoryMove> = {
  id: "memory",

  initialState(rng) {
    return {
      faces: shuffle(
        Array.from({ length: CARDS }, (_, i) => Math.floor(i / 2)),
        rng,
      ),
      owners: Array(CARDS).fill(null),
      turn: 0,
      flips: [],
    };
  },

  status(state): GameStatus {
    if (state.owners.some((o) => o === null)) return { kind: "playing", turn: state.turn };
    const [a, b] = [pairsOf(state.owners, 0), pairsOf(state.owners, 1)];
    return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
  },

  applyMove(state, { card }, seat) {
    if (memory.status(state).kind === "finished") throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (state.owners[card] !== null) throw new IllegalMoveError("memory_taken");
    const first = openCard(state.flips);
    if (first === card) throw new IllegalMoveError("memory_open");

    const face = state.faces[card]!;
    const flips = [...state.flips, { seat, card, face }];
    // 1 枚目なら 2 枚目を待つ。2 枚目が同じ絵ならもらって続けてめくり、ちがえば相手の番
    if (first === null) return { ...state, flips };
    if (state.faces[first] !== face) return { ...state, flips, turn: other(seat) };
    const owners = [...state.owners];
    owners[first] = owners[card] = seat;
    return { ...state, owners, flips };
  },

  parseMove(raw) {
    const card = (raw as { card?: unknown } | null)?.card;
    return Number.isInteger(card) && (card as number) >= 0 && (card as number) < CARDS ? { card: card as number } : null;
  },

  viewState(state, _viewer, revealAll): MemoryView {
    // 絵が見える札は 2 人とも同じ（めくった札は 2 人とも見ている）。見る人で変えない
    const first = openCard(state.flips);
    return {
      ...state,
      faces: state.faces.map((face, card) => (revealAll || state.owners[card] !== null || card === first ? face : null)),
    };
  },

  viewMove(move) {
    // どの札をめくったかは 2 人に見えている。絵は手に含まない
    return move;
  },

  botMove(view, seat, rng) {
    const v = view as MemoryView;
    if (v.turn !== seat || v.owners.every((o) => o !== null)) return null;
    const first = openCard(v.flips);
    const left = v.owners.flatMap((o, card) => (o === null && card !== first ? [card] : []));

    // 覚えている札：場に残っている札のうち、記録から思い出せたもの（めくられた回数だけ思い出す機会がある）
    const recalled = new Map<number, number>();
    v.flips.forEach(({ card, face }, i) => {
      if (v.owners[card] !== null || card === first || recalled.has(card)) return;
      if (rng() < rememberChance(v.flips.length - 1 - i)) recalled.set(card, face);
    });
    const seen = new Set(v.flips.map((f) => f.card));
    const unseen = left.filter((card) => !seen.has(card));

    if (first !== null) {
      // 2 枚目：1 枚目と同じ絵を覚えていればそれ。なければ、まだ見ていない札（ちがう絵と分かっている札は避ける）
      const face = v.faces[first];
      const match = left.find((card) => recalled.get(card) === face);
      if (match !== undefined) return { card: match };
      const unknown = left.filter((card) => !recalled.has(card));
      return { card: pick(unseen.length > 0 ? unseen : unknown.length > 0 ? unknown : left, rng) };
    }

    // 1 枚目：同じ絵の 2 枚を覚えていればその片方。なければ、まだ見ていない札をめくって手がかりを増やす
    const byFace = new Map<number, number[]>();
    for (const [card, face] of recalled) byFace.set(face, [...(byFace.get(face) ?? []), card]);
    const pairs = [...byFace.values()].filter((cards) => cards.length >= 2);
    if (pairs.length > 0) return { card: pick(pairs, rng)[0]! };
    return { card: pick(unseen.length > 0 ? unseen : left, rng) };
  },
};
