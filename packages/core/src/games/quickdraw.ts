import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * はやうち：合図が出てから画面をタップするまでの速さ（反応時間）をきそう。3 回戦。
 * 各回戦で 2 人が 1 回ずつ挑戦する。先に挑戦する人は回戦ごとに交代する（1 回戦目は先手）。
 *
 * 挑戦は「準備」を押してから。画面が待ちの色になり、1.5〜5 秒のどこかで合図が出る。
 * 合図までの待ち時間は initialState の rng で挑戦ごとに決めておき、挑戦する本人にだけ、
 * 「始めた」手が受け付けられたあとに見せる（前もって分かると、合図を見ずに押せてしまうので）。
 * 合図より前に押したら「おてつき」で、その回戦は負け（2 人ともおてつきなら引き分け）。
 * 反応時間が短い方がその回戦の勝ち（同じなら引き分け）。先に挑戦した人の結果は、相手が挑戦し終わるまで相手に伏せる。
 * 多く勝った方の勝ち。同じなら反応時間の合計（おてつきは FOUL_MS）が短い方、それも同じなら引き分け。
 * 2 回戦で 2 勝したら、3 回戦はせずにそこで決着する。
 *
 * やり直しを防ぐため、「準備」は「始めた」手としてサーバに記録してから待ちはじめる。
 * 始めたままタップが届かなかった挑戦（画面を開き直した など）は、おてつきの手で閉じる。
 * 反応時間は画面が測ったものを信じる（範囲だけ確かめる）。
 */

export const ROUNDS = 3;
/** 合図が出るまでの待ち時間の範囲（ミリ秒） */
export const MIN_DELAY = 1500;
export const MAX_DELAY = 5000;
/** 送れる反応時間の上限（ミリ秒）。合図からこれだけたっても押さなければ、画面がこの値で送る */
export const MAX_MS = 3000;
/** おてつきを反応時間の合計に入れるときの値（ミリ秒）。いちばん遅い記録と同じ */
export const FOUL_MS = MAX_MS;
/** コンピュータがおてつきをする割合 */
export const BOT_FOUL_RATE = 0.05;

export type QuickdrawMove =
  /** 挑戦を始める（「準備」）。受け付けられたら、本人にだけ合図までの待ち時間が見える */
  | { kind: "ready" }
  /** 合図のあとに押した。ms は合図から押すまでの反応時間（画面で測ったミリ秒） */
  | { kind: "tap"; ms: number }
  /** おてつき。合図より前に押したときと、始めたままタップが届かなかった挑戦を閉じるときに送る */
  | { kind: "foul" };

/** 1 人の挑戦の結果。ms は反応時間（ミリ秒）。おてつきなら null */
export interface Try {
  ms: number | null;
}

export interface Round {
  /** 先に挑戦する人 */
  first: Seat;
  /** 席ごとの結果。まだ挑戦していなければ null */
  tries: [Try | null, Try | null];
  /** 準備して、まだ押していない人 */
  running: Seat | null;
}

export interface QuickdrawState {
  /** 回戦ごと・席ごとの、合図が出るまでの待ち時間（ミリ秒）。はじめに全部決めておく */
  delays: [number, number][];
  /** これまでの回戦と、今の回戦（最後）。決着したら最後の回戦も終わっている */
  rounds: Round[];
  turn: Seat;
}

/** 画面に渡す形の結果。相手に伏せている間は "hidden" */
export type TryView = Try | "hidden" | null;
export type RoundView = Omit<Round, "tries"> & { tries: [TryView, TryView] };
export interface QuickdrawView {
  rounds: RoundView[];
  turn: Seat;
  /** 見ている人が準備して待っている挑戦の、合図までの待ち時間（ミリ秒）。それ以外は null */
  delay: number | null;
  /** 終局後だけ：全部の待ち時間 */
  delays?: [number, number][];
}

/** 送れる反応時間か（0〜3 秒の整数ミリ秒） */
export const isValidMs = (ms: number) => Number.isInteger(ms) && ms >= 0 && ms <= MAX_MS;

/** 画面で測った反応時間を、送れる値（整数ミリ秒、0〜3 秒）にする */
export const toMs = (ms: number) => Math.min(MAX_MS, Math.max(0, Math.round(ms)));

/** 合計に入れる反応時間。おてつきなら FOUL_MS */
export const scoreOf = (t: Try) => t.ms ?? FOUL_MS;

/** 2 人とも挑戦し終わった（結果が出た）回戦か。伏せてある回戦は終わっていない */
const isDone = (r: Round | RoundView) => r.tries[0] !== null && r.tries[1] !== null;

/** 回戦の結果。おてつきは負け（2 人ともなら引き分け）。終わっていない回戦（伏せてある回戦）なら null */
export function roundResult(r: Round | RoundView): { ms: [number | null, number | null]; winner: Seat | null } | null {
  const [a, b] = r.tries;
  if (a === null || b === null || a === "hidden" || b === "hidden") return null;
  const ms: [number | null, number | null] = [a.ms, b.ms];
  let winner: Seat | null;
  if (a.ms === null || b.ms === null) winner = a.ms === b.ms ? null : a.ms === null ? 1 : 0;
  else winner = a.ms === b.ms ? null : a.ms < b.ms ? 0 : 1;
  return { ms, winner };
}

/** 終わった回戦の勝ち数と、反応時間の合計（ミリ秒。おてつきは FOUL_MS） */
export function tally(rounds: readonly (Round | RoundView)[]) {
  const wins: [number, number] = [0, 0];
  const total: [number, number] = [0, 0];
  for (const r of rounds) {
    const res = roundResult(r);
    if (!res) continue;
    if (res.winner !== null) wins[res.winner]++;
    total[0] += res.ms[0] ?? FOUL_MS;
    total[1] += res.ms[1] ?? FOUL_MS;
  }
  return { wins, total };
}

/** 回戦が終わったあと、残りの回戦で勝ち数が逆転も並びもしなければ決着 */
function decided(rounds: readonly Round[]) {
  const { wins } = tally(rounds);
  return rounds.length >= ROUNDS || Math.abs(wins[0] - wins[1]) > ROUNDS - rounds.length;
}

const newRound = (first: Seat): Round => ({ first, tries: [null, null], running: null });

/** 合図までの待ち時間（1.5〜5 秒の整数ミリ秒） */
const drawDelay = (rng: Rng) => Math.min(MAX_DELAY, MIN_DELAY + Math.floor(rng() * (MAX_DELAY - MIN_DELAY + 1)));

/** コンピュータの反応時間。230〜380 ms で、真ん中（300 ms くらい）に集まる（一様乱数 3 つの平均） */
const botReaction = (rng: Rng) => Math.round(230 + 150 * ((rng() + rng() + rng()) / 3));

export const quickdraw: GameDefinition<QuickdrawState, QuickdrawMove> = {
  id: "quickdraw",

  initialState(rng) {
    const delays = Array.from({ length: ROUNDS }, (): [number, number] => {
      const d0 = drawDelay(rng);
      return [d0, drawDelay(rng)];
    });
    return { delays, rounds: [newRound(0)], turn: 0 };
  },

  status(state): GameStatus {
    const last = state.rounds.at(-1)!;
    if (!isDone(last)) return { kind: "playing", turn: state.turn };
    const { wins, total } = tally(state.rounds);
    // 勝ち数が多い方。同じなら反応時間の合計が短い方。それも同じなら引き分け
    const winner: Seat | null =
      wins[0] !== wins[1] ? (wins[0] > wins[1] ? 0 : 1) : total[0] !== total[1] ? (total[0] < total[1] ? 0 : 1) : null;
    return { kind: "finished", winner };
  },

  applyMove(state, move, seat) {
    const r = state.rounds.at(-1)!;
    if (isDone(r)) throw new IllegalMoveError("game_over");
    if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
    const rounds = state.rounds.slice(0, -1);

    if (move.kind === "ready") {
      if (r.running !== null) throw new IllegalMoveError("quickdraw_running");
      return { ...state, rounds: [...rounds, { ...r, running: seat }] };
    }

    if (r.running !== seat) throw new IllegalMoveError("quickdraw_not_started");
    if (move.kind === "tap" && !isValidMs(move.ms)) throw new IllegalMoveError("quickdraw_ms");
    const tries: Round["tries"] = [...r.tries];
    tries[seat] = { ms: move.kind === "tap" ? move.ms : null };
    const done: Round = { ...r, tries, running: null };
    // 相手がまだなら相手の番。2 人とも終わったら、決着していなければ次の回戦（先に挑戦する人が交代して、そのまま手番）
    if (tries[other(seat)] === null) return { ...state, rounds: [...rounds, done], turn: other(seat) };
    const finished = [...rounds, done];
    if (decided(finished)) return { ...state, rounds: finished, turn: seat };
    const first = other(r.first);
    return { ...state, rounds: [...finished, newRound(first)], turn: first };
  },

  parseMove(raw) {
    const m = raw as { kind?: unknown; ms?: unknown } | null;
    if (typeof m !== "object" || m === null) return null;
    if (m.kind === "ready") return { kind: "ready" };
    if (m.kind === "tap") return Number.isInteger(m.ms) ? { kind: "tap", ms: m.ms as number } : null;
    if (m.kind === "foul") return { kind: "foul" };
    return null;
  },

  viewState(state, viewer, revealAll): QuickdrawView {
    if (revealAll) return { ...state, delay: null };
    const idx = state.rounds.length - 1;
    const cur = state.rounds[idx]!;
    return {
      // 終わっていない回戦では、自分以外の結果を伏せる（おてつきだったかどうかも）
      rounds: state.rounds.map((r) =>
        isDone(r)
          ? r
          : { ...r, tries: [0, 1].map((s) => (s === viewer || r.tries[s] === null ? r.tries[s] : "hidden")) as RoundView["tries"] },
      ),
      turn: state.turn,
      // 待ち時間は、準備が受け付けられた本人にだけ、その挑戦の分を渡す
      delay: viewer !== null && cur.running === viewer ? state.delays[idx]![viewer] : null,
    };
  },

  viewMove(move, mover, viewer) {
    // 反応時間は回戦の結果（rounds）で公開されるので、手の記録では相手の分を伏せる（おてつきとの区別も）
    return move.kind === "ready" || mover === viewer ? move : { kind: "tap", ms: null };
  },

  botMove(view, seat, rng) {
    const v = view as QuickdrawView;
    const r = v.rounds.at(-1);
    if (!r || isDone(r) || v.turn !== seat || r.tries[seat] !== null) return null;
    if (r.running !== seat) return { kind: "ready" };
    if (rng() < BOT_FOUL_RATE) return { kind: "foul" };
    return { kind: "tap", ms: botReaction(rng) };
  },
};
