import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * ツボさがし：タイ古式マッサージの「こり」を探す推理ゲーム。2 回戦。
 * 背中のマス（背骨の左右に 3 列ずつ、6 列 × 7 行。背骨の上は押さない）に、お客さんがこりを 3 か所こっそり置く。
 * 施術する人は 1 回に 1 か所を押し、こりなら「ほぐれた！」、外れなら、まだほぐれていないこりのうち
 * いちばん近いものまでの近さ（たて・よこに数えたマスの数）が返る：1 マス＝あつい、2 マス＝あたたかい、
 * 3 マス＝ぬるい、4 マス以上＝つめたい。
 * 回戦ごとに役を交代する（1 回戦目は先手がお客さん）。全部ほぐすまでに押した回数が少ない方の勝ち（同じなら引き分け）。
 * 押せるのは 18 回まで。2 回戦は 1 回戦でほぐしきった回数まで（それより多く押すと勝てない）。
 * ほぐしきれなかったときは、ほぐした数が多い方の勝ち。
 *
 * 手番：お客さんはこりを置いたら、あとは押されるのを待つだけで、することがない。そこで施術する人は
 * 回戦が終わるまで手番を持ったまま続けて押す（1 回押すごとにサーバに送り、やり直しはできない）。
 * 1 回戦を施術した人は、そのまま 2 回戦のお客さんとしてこりを置く。手番が相手に移るのは
 * 「先手が置いた → 後手が施術して置いた → 先手が施術して終局」の 3 回だけなので、知らせも 3 回で済む。
 */

/** 背中のマス。左上が 0、右下が 41（行優先）。列 0〜2 が背骨の左、3〜5 が右 */
export const COLS = 6;
export const ROWS = 7;
export const CELLS = COLS * ROWS;
/** 1 回戦に置くこりの数 */
export const KORI = 3;
/** 1 回戦に押せる回数の上限 */
export const MAX_PRESSES = 18;
export const ROUNDS = 2;

/** 近さの段階。0 = こり（ほぐれた）、1 = あつい、2 = あたたかい、3 = ぬるい、4 = つめたい */
export type Level = 0 | 1 | 2 | 3 | 4;
export const COLD: Level = 4;
/** 画面の文言・色の名前（段階の順） */
export const LEVEL_NAMES = ["hit", "hot", "warm", "mild", "cold"] as const;

export type TsuboMove =
  /** お客さんがこりを置く。cells は KORI 個の別々のマス */
  | { kind: "hide"; cells: number[] }
  /** 施術する人が 1 か所を押す */
  | { kind: "press"; cell: number };

/** 押した記録。level はそのときの近さ（こりを押したら 0） */
export interface Press {
  cell: number;
  level: Level;
}

export interface Round {
  /** お客さん（こりを置く人）。施術する人はその相手 */
  customer: Seat;
  /** こりの場所（小さい順）。置く前は null。viewState で、終わっていない回戦は施術する人と観戦者に伏せる */
  kori: number[] | null;
  presses: Press[];
}

export interface TsuboState {
  /** これまでの回戦と、今の回戦（最後） */
  rounds: Round[];
}

/** 画面に渡す形の回戦。こりを置いたが伏せてあるときは "hidden" */
export type RoundView = Omit<Round, "kori"> & { kori: number[] | "hidden" | null };
export interface TsuboView {
  rounds: RoundView[];
}

type AnyRound = Round | RoundView;

const row = (cell: number) => Math.floor(cell / COLS);
const col = (cell: number) => cell % COLS;
const isCell = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CELLS;

/** 2 つのマスの近さ（たて・よこに数えたマスの数。背骨をはさんだ左右のマスもとなり） */
export const distance = (a: number, b: number) => Math.abs(row(a) - row(b)) + Math.abs(col(a) - col(b));

/** 近さ（マスの数）を段階にする。4 マス以上はすべて「つめたい」 */
export const levelOf = (d: number): Level => Math.max(0, Math.min(COLD, d)) as Level;

/** cell を押したときの段階。found はもうほぐれたこりで、残りのこりのうちいちばん近いもので決まる */
export function reading(kori: readonly number[], found: readonly number[], cell: number): Level {
  const left = kori.filter((k) => !found.includes(k));
  return levelOf(Math.min(...left.map((k) => distance(cell, k))));
}

export const searcherOf = (r: AnyRound): Seat => other(r.customer);
/** ほぐしたこりの数 */
export const foundOf = (r: AnyRound) => r.presses.filter((p) => p.level === 0).length;

/** index 回戦目に押せる回数。2 回戦は、1 回戦でほぐしきっていればその回数まで */
export function capOf(rounds: readonly AnyRound[], index: number): number {
  const first = rounds[0];
  return index > 0 && first && foundOf(first) === KORI ? first.presses.length : MAX_PRESSES;
}

/** 回戦が終わったか（全部ほぐした・押せる回数を使いきった） */
export function isRoundOver(rounds: readonly AnyRound[], index: number): boolean {
  const r = rounds[index];
  return !!r && r.kori !== null && (foundOf(r) === KORI || r.presses.length >= capOf(rounds, index));
}

/** 今指す人。置く前はお客さん、置いたら施術する人。終局していれば null */
export function turnOf(rounds: readonly AnyRound[]): Seat | null {
  const index = rounds.length - 1;
  const r = rounds[index]!;
  if (r.kori === null) return r.customer;
  return isRoundOver(rounds, index) ? null : searcherOf(r);
}

/**
 * 2 つの回戦の結果をくらべる。a の方がよければ正、b の方がよければ負、同じなら 0。
 * ほぐした数が多い方、同じなら押した回数が少ない方がよい
 */
export const compareRounds = (a: AnyRound, b: AnyRound) =>
  foundOf(a) - foundOf(b) || b.presses.length - a.presses.length;

/** 終局したときの勝ち（引き分けなら null）。それぞれの回戦の施術する人をくらべる */
export function winnerOf(rounds: readonly AnyRound[]): Seat | null {
  const [a, b] = [rounds[0]!, rounds[1]!];
  const c = compareRounds(a, b);
  return c === 0 ? null : c > 0 ? searcherOf(a) : searcherOf(b);
}

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;
const ALL = Array.from({ length: CELLS }, (_, i) => i);

/**
 * コンピュータが押すマス。返ってきた近さで候補を絞るだけの、手加減した探し方：
 * 外れの近さが L なら、残りのこりはそこから L マス以上はなれている（どの記録でも成り立つ）。
 * 最後に押したのが「つめたい」でない外れなら、そこからちょうど L マスのマスに絞る。あとはでたらめに選ぶ
 */
function botPress(presses: readonly Press[], rng: Rng): number {
  const pressed = new Set(presses.map((p) => p.cell));
  const open = ALL.filter((c) => !pressed.has(c));
  const far = open.filter((c) => presses.every((p) => p.level === 0 || distance(c, p.cell) >= p.level));
  const last = presses.at(-1);
  const near = last && last.level > 0 && last.level < COLD ? far.filter((c) => distance(c, last.cell) === last.level) : [];
  return pick(near.length > 0 ? near : far.length > 0 ? far : open, rng);
}

/** こりを置く場所をでたらめに選ぶ（混ぜた先頭の KORI 個） */
function botHide(rng: Rng): number[] {
  const cells = [...ALL];
  for (let i = 0; i < KORI; i++) {
    const j = i + Math.min(cells.length - i - 1, Math.floor(rng() * (cells.length - i)));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells.slice(0, KORI);
}

export const tsubo: GameDefinition<TsuboState, TsuboMove> = {
  id: "tsubo",

  initialState() {
    return { rounds: [{ customer: 0, kori: null, presses: [] }] };
  },

  status(state): GameStatus {
    const turn = turnOf(state.rounds);
    return turn === null ? { kind: "finished", winner: winnerOf(state.rounds) } : { kind: "playing", turn };
  },

  applyMove(state, move, seat) {
    const turn = turnOf(state.rounds);
    if (turn === null) throw new IllegalMoveError("game_over");
    if (seat !== turn) throw new IllegalMoveError("not_your_turn");
    const index = state.rounds.length - 1;
    const r = state.rounds[index]!;
    const rounds = state.rounds.slice(0, index);

    if (r.kori === null) {
      if (move.kind !== "hide") throw new IllegalMoveError("bad_move");
      const cells = move.cells;
      if (cells.length !== KORI || !cells.every(isCell) || new Set(cells).size !== KORI) {
        throw new IllegalMoveError("tsubo_kori");
      }
      return { rounds: [...rounds, { ...r, kori: [...cells].sort((a, b) => a - b) }] };
    }

    if (move.kind !== "press" || !isCell(move.cell)) throw new IllegalMoveError("bad_move");
    if (r.presses.some((p) => p.cell === move.cell)) throw new IllegalMoveError("tsubo_pressed");
    const found = r.presses.filter((p) => p.level === 0).map((p) => p.cell);
    const next: Round = { ...r, presses: [...r.presses, { cell: move.cell, level: reading(r.kori, found, move.cell) }] };
    const after = [...rounds, next];
    // 回戦が終わったら、施術した人がそのまま次の回戦のお客さんになる
    if (isRoundOver(after, index) && after.length < ROUNDS) {
      after.push({ customer: searcherOf(next), kori: null, presses: [] });
    }
    return { rounds: after };
  },

  parseMove(raw) {
    const { kind, cells, cell } = (raw ?? {}) as Record<string, unknown>;
    if (kind === "press") return Number.isInteger(cell) ? { kind, cell: cell as number } : null;
    if (kind !== "hide" || !Array.isArray(cells) || cells.length > CELLS) return null;
    return cells.every((c) => Number.isInteger(c)) ? { kind, cells: [...cells] as number[] } : null;
  },

  viewState(state, viewer, revealAll): TsuboView {
    return {
      rounds: state.rounds.map((r, i) => ({
        ...r,
        kori:
          r.kori === null
            ? null
            : revealAll || viewer === r.customer || isRoundOver(state.rounds, i)
              ? [...r.kori]
              : "hidden",
      })),
    };
  },

  viewMove(move, mover, viewer) {
    // 押した場所は 2 人に見えている。置いた場所は本人にだけ
    return move.kind === "hide" && mover !== viewer ? { kind: "hide", cells: null } : move;
  },

  botMove(view, seat, rng) {
    const v = view as TsuboView;
    if (turnOf(v.rounds) !== seat) return null;
    const r = v.rounds.at(-1)!;
    return r.kori === null ? { kind: "hide", cells: botHide(rng) } : { kind: "press", cell: botPress(r.presses, rng) };
  },
};
