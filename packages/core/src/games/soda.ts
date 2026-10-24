import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";
import { isInput, type Input } from "./sensor.ts";

/**
 * ふりふりソーダ：1 本のソーダのボトルを 2 人が交互に振る。圧力が限界を超えて（ふたが飛んで）吹き出したら、振った人の負け。
 * 限界は LIMIT_MIN〜LIMIT_MAX のどこかで、2 人には見えない（終局後に見せる）。
 *
 * 1 回の手番は「振る」を押してから 3 秒間。画面が端末の加速度（センサーを使えなければ、画面をこする・連打する指の動き）から
 * 振った強さ（0〜100）を計算して送る。強さの分だけ圧力が上がる。かかった強さは画面が測ったものを信じる。
 *
 * 「毎回ほとんど振らない」のが一番安全にならないように、次の 2 つを入れている（コンピュータ同士で比べて決めた）。
 * - 振りが足りない（MIN_POWER 未満）ときは、最低量の MIN_POWER が足される
 * - 1 人 4 回ずつ、合わせて 8 回振って吹き出さなければ、圧力を多く入れた方の勝ち（同じなら引き分け）
 * 最低量だけだと、少なく振る方が吹き出させにくいので弱く振るのが一番になる。手数の上限と「多い方の勝ち」を足すと、
 * 弱く振り続けると最後に負け、強く振り続けると吹き出させやすいので、どこで攻めるかを読み合うことになる。
 *
 * やり直しを防ぐため、「振る」は「始めた」手としてサーバに記録してから測る。始めたまま結果が届かなかった手番
 * （画面を開き直した など）は「失敗扱い」の手で閉じ、いちばん強く振ったこと（MAX_POWER）にする。
 */

/** 2 人合わせて振る回数（1 人 4 回ずつ）。ここまで吹き出さなければ、入れた圧力の多さで決める */
export const SHAKES = 8;
/** 1 回に入る圧力の下限（振りが足りないときに足される量）と上限 */
export const MIN_POWER = 20;
export const MAX_POWER = 100;
/** 限界の範囲。圧力がこれを超えたら吹き出す */
export const LIMIT_MIN = 180;
export const LIMIT_MAX = 480;
/** 振る時間（ミリ秒）。画面用 */
export const SHAKE_MS = 3000;

export type SodaMove =
  /** 「振る」を押した。ここから SHAKE_MS の間を測る */
  | { kind: "start" }
  /** 測った強さ（0〜MAX_POWER の整数）と、どちらで遊んだか */
  | { kind: "shake"; power: number; input: Input }
  /** 振りはじめたまま結果が届かなかった手番を、失敗扱いで閉じる */
  | { kind: "fail" };

/** 1 回分の記録 */
export interface Shake {
  seat: Seat;
  /** 測った強さ。失敗扱いなら null */
  power: number | null;
  /** 圧力に足した量（足りなければ MIN_POWER、失敗扱いなら MAX_POWER） */
  added: number;
  /** どちらで遊んだか。失敗扱いなら null */
  input: Input | null;
}

export interface SodaState {
  /** この圧力を超えたら吹き出す。2 人には見せない */
  limit: number;
  /** 今の圧力（2 人の合計） */
  pressure: number;
  shakes: Shake[];
  turn: Seat;
  /** 「振る」を押して、まだ結果を送っていない人 */
  shaking: Seat | null;
  /** 吹き出させた人。まだなら null */
  burstBy: Seat | null;
}

/** 画面に渡す形。限界は終局まで null */
export type SodaView = Omit<SodaState, "limit"> & { limit: number | null };

/** 測った強さから、圧力に足す量（振りが足りなければ最低量） */
export const addedOf = (power: number) => Math.max(MIN_POWER, Math.min(MAX_POWER, power));

/** 振りが足りなかった（最低量が足された）か */
export const isShort = (s: Shake) => s.power !== null && s.power < MIN_POWER;

/** その人が入れた圧力の合計 */
export const pressureOf = (shakes: readonly Shake[], seat: Seat) =>
  shakes.reduce((sum, s) => (s.seat === seat ? sum + s.added : sum), 0);

const isPower = (p: number) => Number.isInteger(p) && p >= 0 && p <= MAX_POWER;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 標準正規分布の乱数（ボックス＝ミュラー法）。1 - rng() で 0 の対数を避ける */
const gaussian = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** コンピュータの振る強さ。ねらった強さに、人間らしいぶれ（標準偏差 6）を足す。人は 100 ちょうどまでは振れない */
const humanPower = (want: number, rng: Rng) => clamp(Math.round(clamp(want, 0, 95) + clamp(gaussian(rng), -3, 3) * 6), 0, MAX_POWER);

export const soda: GameDefinition<SodaState, SodaMove> = {
  id: "soda",

  initialState(rng) {
    const span = LIMIT_MAX - LIMIT_MIN + 1;
    return {
      limit: LIMIT_MIN + Math.min(span - 1, Math.floor(rng() * span)),
      pressure: 0,
      shakes: [],
      turn: 0,
      shaking: null,
      burstBy: null,
    };
  },

  status(state): GameStatus {
    if (state.burstBy !== null) return { kind: "finished", winner: other(state.burstBy) };
    if (state.shakes.length < SHAKES) return { kind: "playing", turn: state.turn };
    const [a, b] = [pressureOf(state.shakes, 0), pressureOf(state.shakes, 1)];
    return { kind: "finished", winner: a === b ? null : a > b ? 0 : 1 };
  },

  applyMove(state, move, seat) {
    if (state.burstBy !== null || state.shakes.length >= SHAKES) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");

    if (move.kind === "start") {
      if (state.shaking !== null) throw new IllegalMoveError("soda_shaking");
      return { ...state, shaking: seat };
    }

    if (state.shaking !== seat) throw new IllegalMoveError("soda_not_started");
    let shake: Shake;
    if (move.kind === "shake") {
      if (!isPower(move.power)) throw new IllegalMoveError("soda_power");
      if (!isInput(move.input)) throw new IllegalMoveError("bad_move");
      shake = { seat, power: move.power, added: addedOf(move.power), input: move.input };
    } else {
      shake = { seat, power: null, added: MAX_POWER, input: null };
    }
    const pressure = state.pressure + shake.added;
    return {
      ...state,
      pressure,
      shakes: [...state.shakes, shake],
      turn: other(seat),
      shaking: null,
      burstBy: pressure > state.limit ? seat : null,
    };
  },

  parseMove(raw) {
    const m = raw as { kind?: unknown; power?: unknown; input?: unknown } | null;
    if (typeof m !== "object" || m === null) return null;
    if (m.kind === "start") return { kind: "start" };
    if (m.kind === "fail") return { kind: "fail" };
    if (m.kind === "shake" && Number.isInteger(m.power) && isInput(m.input)) {
      return { kind: "shake", power: m.power as number, input: m.input };
    }
    return null;
  },

  viewState(state, _viewer, revealAll): SodaView {
    return { ...state, limit: revealAll ? state.limit : null };
  },

  viewMove(move) {
    // 振った強さはボトルの圧力として 2 人に見えているので加工しない
    return move;
  },

  botMove(view, seat, rng) {
    const v = view as SodaView;
    if (v.burstBy !== null || v.shakes.length >= SHAKES || v.turn !== seat) return null;
    if (v.shaking !== seat) return { kind: "start" };

    const mine = pressureOf(v.shakes, seat);
    const theirs = pressureOf(v.shakes, other(seat));
    // まだ吹き出さないと分かっている圧力（限界はいちばん低くても LIMIT_MIN）
    const free = LIMIT_MIN - v.pressure;
    let want: number;
    if (v.shakes.length === SHAKES - 1) {
      // 最後の手番：相手を少し上回るだけ振る（届かなければ思い切り振る）
      want = Math.max(MIN_POWER, theirs - mine + 12);
    } else if (free >= 60) {
      want = 55 + rng() * 25;
    } else if (free > MIN_POWER + 10) {
      want = free - 10;
    } else {
      // 吹き出すかもしれないところでは控えめに。負けていたら少し強め
      const behind = theirs - mine;
      want = MIN_POWER + 5 + rng() * 15 + (behind > 0 ? Math.min(25, behind / 2) : 0);
    }
    return { kind: "shake", power: humanPower(want, rng), input: "motion" };
  },
};
