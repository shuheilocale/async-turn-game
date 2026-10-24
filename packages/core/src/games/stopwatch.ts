import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * ぴったりストップ：目標の秒数ぴったりにストップウォッチを止めるのをきそう。3 回戦。
 * 各回戦では「出題する人」が目標（5.0〜15.0 秒、0.1 秒きざみ）を決め、まず自分が挑戦する。
 * 出題する人は回戦ごとに交代する（1 回戦目は先手）。
 *
 * 挑戦は「スタート」を押してから「ストップ」を押すまで。数字は 1.5 秒ほどで見えなくなるので、
 * 頭の中で数える。目標との差（ずれ）が小さい方がその回戦の勝ち（同じなら引き分け）。
 * 出題した人の結果は、相手が挑戦し終わるまで相手に伏せる。
 * 多く勝った方の勝ち。同じなら 3 回戦のずれの合計が小さい方、それも同じなら引き分け。
 * 2 回戦で 2 勝したら、3 回戦はせずにそこで決着する。
 *
 * やり直しを防ぐため、スタートは「始めた」手としてサーバに記録してから時間を測る。
 * 始めたままストップが届かなかった挑戦（画面を開き直した など）は「失敗扱い」の手で閉じ、
 * どのストップよりも悪いずれ（FAIL_ERROR）として数える。かかった時間は画面が測ったものを信じる。
 */

export const ROUNDS = 3;
/** 目標の秒数の範囲と刻み（ミリ秒） */
export const MIN_TARGET = 5000;
export const MAX_TARGET = 15000;
export const TARGET_STEP = 100;
/** 送れるかかった時間の上限（ミリ秒）。画面はここで自動で止める */
export const MAX_MS = 60_000;
/** 失敗扱いのずれ（ミリ秒）。60 秒で止めたときのずれ（最大 55 秒）よりも悪い */
export const FAIL_ERROR = MAX_MS;
/** スタートしてから数字が見えている時間（ミリ秒）。画面用 */
export const VISIBLE_MS = 1500;
/** これ以下のずれは「ぴったり」と見せる（ミリ秒）。画面用 */
export const PERFECT_MS = 50;

export type StopwatchMove =
  /** 挑戦を始める。出題する人の最初のスタートでだけ、目標（ミリ秒）を一緒に送る */
  | { kind: "start"; target?: number }
  /** 止める。ms はスタートからかかった時間（画面で測ったミリ秒） */
  | { kind: "stop"; ms: number }
  /** 始めたままストップが届かなかった挑戦を、失敗扱いで閉じる */
  | { kind: "fail" };

/** 1 人の挑戦の結果。ms はかかった時間（ミリ秒）。失敗扱いなら null */
export interface Try {
  ms: number | null;
}

export interface Round {
  setter: Seat;
  /** 目標（ミリ秒）。出題する人がスタートするまで null */
  target: number | null;
  /** 席ごとの結果。まだ挑戦していなければ null */
  tries: [Try | null, Try | null];
  /** スタートして、まだ止めていない人 */
  running: Seat | null;
}

export interface StopwatchState {
  /** これまでの回戦と、今の回戦（最後）。決着したら最後の回戦も終わっている */
  rounds: Round[];
  turn: Seat;
}

/** 画面に渡す形の結果。相手に伏せている間は "hidden" */
export type TryView = Try | "hidden" | null;
export type RoundView = Omit<Round, "tries"> & { tries: [TryView, TryView] };
export interface StopwatchView {
  rounds: RoundView[];
  turn: Seat;
}

/** 目標にできる秒数か（ミリ秒で、範囲内の 100 の倍数） */
export const isValidTarget = (ms: number) =>
  Number.isInteger(ms) && ms >= MIN_TARGET && ms <= MAX_TARGET && ms % TARGET_STEP === 0;

/** 目標とのずれ（ミリ秒、大きさだけ）。失敗扱いなら FAIL_ERROR */
export const errorOf = (target: number, t: Try) => (t.ms === null ? FAIL_ERROR : Math.abs(t.ms - target));

/** 2 人とも挑戦し終わった（結果が出た）回戦か。伏せてある回戦は終わっていない */
const isDone = (r: Round | RoundView) => r.tries[0] !== null && r.tries[1] !== null;

/** 回戦の結果。終わっていない回戦（伏せてある回戦）なら null */
export function roundResult(r: Round | RoundView): { errors: [number, number]; winner: Seat | null } | null {
  const [a, b] = r.tries;
  if (r.target === null || a === null || b === null || a === "hidden" || b === "hidden") return null;
  const errors: [number, number] = [errorOf(r.target, a), errorOf(r.target, b)];
  return { errors, winner: errors[0] === errors[1] ? null : errors[0] < errors[1] ? 0 : 1 };
}

/** 終わった回戦の勝ち数と、ずれの合計（ミリ秒） */
export function tally(rounds: readonly (Round | RoundView)[]) {
  const wins: [number, number] = [0, 0];
  const errors: [number, number] = [0, 0];
  for (const r of rounds) {
    const res = roundResult(r);
    if (!res) continue;
    if (res.winner !== null) wins[res.winner]++;
    errors[0] += res.errors[0];
    errors[1] += res.errors[1];
  }
  return { wins, errors };
}

/** 回戦が終わったあと、残りの回戦で勝ち数が逆転も並びもしなければ決着 */
function decided(rounds: readonly Round[]) {
  const { wins } = tally(rounds);
  return rounds.length >= ROUNDS || Math.abs(wins[0] - wins[1]) > ROUNDS - rounds.length;
}

const newRound = (setter: Seat): Round => ({ setter, target: null, tries: [null, null], running: null });

/** 標準正規分布の乱数（ボックス＝ミュラー法）。1 - rng() で 0 の対数を避ける */
const gaussian = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** コンピュータが出す目標。4 割くらいはきりのいい秒数（7.0 秒 など）、残りは半端な秒数 */
function botTarget(rng: Rng): number {
  const steps = (MAX_TARGET - MIN_TARGET) / TARGET_STEP;
  const ms = MIN_TARGET + Math.min(steps, Math.floor(rng() * (steps + 1))) * TARGET_STEP;
  return rng() < 0.4 ? Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(ms / 1000) * 1000)) : ms;
}

/** かかった時間を 1/100 秒（10 ミリ秒）に丸める。画面に出す数字（13.52 秒）と勝ち負けが食い違わないよう、画面もこれで送る */
export const toCentis = (ms: number) => Math.min(MAX_MS, Math.max(0, Math.round(ms / 10) * 10));

/** コンピュータが止める時間。目標に人間らしいずれ（標準偏差 0.3〜0.5 秒、長い秒数ほど大きい）を足す */
function botTime(target: number, rng: Rng): number {
  const sd = 300 + (200 * (target - MIN_TARGET)) / (MAX_TARGET - MIN_TARGET);
  const z = Math.max(-3, Math.min(3, gaussian(rng)));
  return toCentis(target + z * sd);
}

export const stopwatch: GameDefinition<StopwatchState, StopwatchMove> = {
  id: "stopwatch",

  initialState() {
    return { rounds: [newRound(0)], turn: 0 };
  },

  status(state): GameStatus {
    const last = state.rounds.at(-1)!;
    if (!isDone(last)) return { kind: "playing", turn: state.turn };
    const { wins, errors } = tally(state.rounds);
    // 勝ち数が多い方。同じならずれの合計が小さい方。それも同じなら引き分け
    const winner: Seat | null =
      wins[0] !== wins[1] ? (wins[0] > wins[1] ? 0 : 1) : errors[0] !== errors[1] ? (errors[0] < errors[1] ? 0 : 1) : null;
    return { kind: "finished", winner };
  },

  applyMove(state, move, seat) {
    const r = state.rounds.at(-1)!;
    if (isDone(r)) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const rounds = state.rounds.slice(0, -1);

    if (move.kind === "start") {
      if (r.running !== null) throw new IllegalMoveError("stopwatch_running");
      let target = r.target;
      if (target === null) {
        // 出題する人の最初のスタート。目標をここで決める
        if (move.target === undefined || !isValidTarget(move.target)) throw new IllegalMoveError("stopwatch_target");
        target = move.target;
      } else if (move.target !== undefined) {
        throw new IllegalMoveError("stopwatch_target_set");
      }
      return { rounds: [...rounds, { ...r, target, running: seat }], turn: seat };
    }

    if (r.running !== seat) throw new IllegalMoveError("stopwatch_not_started");
    if (move.kind === "stop" && (!Number.isInteger(move.ms) || move.ms < 0 || move.ms > MAX_MS))
      throw new IllegalMoveError("stopwatch_ms");
    const tries: Round["tries"] = [...r.tries];
    tries[seat] = { ms: move.kind === "stop" ? move.ms : null };
    const done: Round = { ...r, tries, running: null };
    // 相手がまだなら相手の番。2 人とも終わったら、決着していなければ次の回戦（出題する人が交代して、そのまま手番）
    if (tries[other(seat)] === null) return { rounds: [...rounds, done], turn: other(seat) };
    const finished = [...rounds, done];
    if (decided(finished)) return { rounds: finished, turn: seat };
    const setter = other(r.setter);
    return { rounds: [...finished, newRound(setter)], turn: setter };
  },

  parseMove(raw) {
    const m = raw as { kind?: unknown; target?: unknown; ms?: unknown } | null;
    if (typeof m !== "object" || m === null) return null;
    if (m.kind === "start") {
      if (m.target === undefined) return { kind: "start" };
      return Number.isInteger(m.target) ? { kind: "start", target: m.target as number } : null;
    }
    if (m.kind === "stop") return Number.isInteger(m.ms) ? { kind: "stop", ms: m.ms as number } : null;
    if (m.kind === "fail") return { kind: "fail" };
    return null;
  },

  viewState(state, viewer, revealAll): StopwatchView {
    if (revealAll) return state;
    return {
      ...state,
      // 終わっていない回戦では、自分以外の結果を伏せる（失敗扱いだったかどうかも）
      rounds: state.rounds.map((r) =>
        isDone(r)
          ? r
          : { ...r, tries: [0, 1].map((s) => (s === viewer || r.tries[s] === null ? r.tries[s] : "hidden")) as RoundView["tries"] },
      ),
    };
  },

  viewMove(move, mover, viewer) {
    // 目標はスタートで見えている。止めた時間は回戦の結果（rounds）で公開されるので、手の記録では相手の分を伏せる
    return move.kind === "start" || mover === viewer ? move : { kind: "stop", ms: null };
  },

  botMove(view, seat, rng) {
    const v = view as StopwatchView;
    const r = v.rounds.at(-1);
    if (!r || isDone(r) || v.turn !== seat || r.tries[seat] !== null) return null;
    if (r.running === seat) return { kind: "stop", ms: botTime(r.target!, rng) };
    return r.target === null ? { kind: "start", target: botTarget(rng) } : { kind: "start" };
  },
};
