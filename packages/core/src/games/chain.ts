import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Seat } from "../types.ts";

/**
 * まねっこチェーン：色と形のちがう 4 つのパッドで、2 人で 1 本の「並び」を伸ばしていく（先手から）。
 * 自分の番では、これまでの並びを最初から順にタップでまねして、最後に好きなパッドを 1 つ足す。
 * 途中でまちがえたら負け。並びが 20 個に届いたら引き分け。
 *
 * 並びは 2 人とも知っている（隠す情報はない）。画面は番の始めに並びを 1 回だけ光らせて見せる。
 * 1 手は「まねした並び＋足した 1 つ」をまとめて送る。まちがえたときは、まちがえたタップまでを送る
 */

/** パッドの数。番号は 0〜3（画面では 0 青の丸・1 オレンジの三角・2 緑の四角・3 紫の星） */
export const PADS = 4;
/** 並びがこの長さに届いたら引き分け */
export const MAX_LENGTH = 20;

export interface ChainMove {
  /** 押したパッドの番号を順に。まねした並びと足した 1 つ。まちがえたときは、まちがえたタップまで */
  taps: number[];
}

export interface Miss {
  seat: Seat;
  /** 何個目（0 から）でまちがえたか。正しいパッドは seq[index] */
  index: number;
  /** まちがえて押したパッド */
  pad: number;
}

export interface ChainState {
  /** これまでの並び。i 個目（0 から）を足したのは adderOf(i) */
  seq: number[];
  turn: Seat;
  /** まちがえた人と場所。まだなら null */
  miss: Miss | null;
}

/** 並びの i 個目（0 から）を足した人。先手から交互に足していく */
export const adderOf = (index: number): Seat => (index % 2) as Seat;

const isPad = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < PADS;

/**
 * 並びを見せるときの速さ（ミリ秒）。1 つを光らせる時間・次までの間・最後の 1 つ（相手が足したもの）を
 * 光らせる時間。長い並びほど少し速くして、いちばん長くても 10 秒かからずに見終わるようにする
 */
export function showTiming(length: number): { flashMs: number; gapMs: number; lastMs: number } {
  const flashMs = Math.max(300, 620 - 16 * length);
  const gapMs = Math.max(110, 230 - 6 * length);
  return { flashMs, gapMs, lastMs: flashMs + 350 };
}

/**
 * お試しのコンピュータが、長さ n の並びを正しくまねできる確率。2 個までは忘れず、
 * そこから長くなるほど下がっていく（10 個で 6 割ほど、14 個からは 15%）
 */
export const recallChance = (n: number) => (n <= 2 ? 1 : Math.max(0.15, 1 - ((n - 2) / 13) ** 2));

export const chain: GameDefinition<ChainState, ChainMove> = {
  id: "chain",

  initialState() {
    return { seq: [], turn: 0, miss: null };
  },

  status(state): GameStatus {
    if (state.miss !== null) return { kind: "finished", winner: other(state.miss.seat) };
    if (state.seq.length >= MAX_LENGTH) return { kind: "finished", winner: null };
    return { kind: "playing", turn: state.turn };
  },

  applyMove(state, { taps }, seat) {
    if (state.miss !== null || state.seq.length >= MAX_LENGTH) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    if (!Array.isArray(taps) || !taps.every(isPad)) throw new IllegalMoveError("chain_taps");

    const { seq } = state;
    const wrong = taps.findIndex((pad, i) => i < seq.length && pad !== seq[i]);
    if (wrong >= 0) {
      // まちがえたタップで止めた手だけ受け付ける（その先を押していても意味がないので、送り方の誤り）
      if (taps.length !== wrong + 1) throw new IllegalMoveError("chain_taps");
      return { ...state, miss: { seat, index: wrong, pad: taps[wrong]! } };
    }
    // ここまで全部合っている：最後までまねして、ちょうど 1 つ足した手だけ
    if (taps.length <= seq.length) throw new IllegalMoveError("chain_add");
    if (taps.length > seq.length + 1) throw new IllegalMoveError("chain_taps");
    return { seq: [...taps], turn: other(seat), miss: null };
  },

  parseMove(raw) {
    const taps = (raw as { taps?: unknown } | null)?.taps;
    if (!Array.isArray(taps) || taps.length > MAX_LENGTH || !taps.every(isPad)) return null;
    return { taps: [...taps] };
  },

  botMove(view, seat, rng) {
    const s = view as ChainState;
    if (chain.status(s).kind !== "playing" || s.turn !== seat) return null;
    const n = s.seq.length;
    if (n > 0 && rng() >= recallChance(n)) {
      // 忘れたところでまちがえる。人と同じく、後ろの方ほどまちがえやすい
      const index = Math.min(n - 1, Math.floor(n * Math.sqrt(rng())));
      const pad = (s.seq[index]! + 1 + Math.min(PADS - 2, Math.floor(rng() * (PADS - 1)))) % PADS;
      return { taps: [...s.seq.slice(0, index), pad] };
    }
    // 覚えていれば正しくまねして、足すパッドはでたらめに選ぶ
    return { taps: [...s.seq, Math.min(PADS - 1, Math.floor(rng() * PADS))] };
  },
};
