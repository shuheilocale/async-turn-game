import { other, type GameDefinition, type Rng, type Seat } from "./types.ts";

/** 1 手先まで読むときに、読む組み合わせの上限（重いゲームでは読まずに選ぶ） */
const LOOKAHEAD_LIMIT = 4000;

const pick = <T>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

/**
 * お試し（ひとりで遊ぶ）のコンピュータが指す手を選ぶ。手加減した弱めの相手で、
 * 勝てる手があれば打ち、相手にすぐ勝たれる手は避け、あとはでたらめに選ぶ。
 * 隠す情報があるゲームは、ゲームごとの botMove に自分から見た形だけを渡す（相手の秘密は見ない）。
 * どちらもなければ null（ひとりで両方の手を指す）
 */
export function botMove<S, M>(def: GameDefinition<S, M>, state: S, seat: Seat, rng: Rng): M | null {
  if (def.botMove) {
    const view = def.viewState ? def.viewState(state, seat, false) : state;
    return def.botMove(view, seat, rng);
  }
  if (!def.legalMoves) return null;
  const moves = def.legalMoves(state, seat);
  if (moves.length === 0) return null;

  const after = (s: S, m: M, by: Seat) => {
    try {
      return def.applyMove(s, m, by);
    } catch {
      return null;
    }
  };
  const winsFor = (s: S | null, who: Seat) => {
    const st = s && def.status(s);
    return st?.kind === "finished" && st.winner === who;
  };

  const winning = moves.find((m) => winsFor(after(state, m, seat), seat));
  if (winning) return winning;

  // 相手の番になる手のうち、相手にすぐ勝たれないものを選ぶ（続けて指すゲームでは読まない）
  const opp = other(seat);
  const safe = moves.filter((m) => {
    const next = after(state, m, seat);
    if (!next) return false;
    const st = def.status(next);
    // 指した瞬間に相手の勝ちが決まる手（相手の色をそろえてしまう など）は避ける
    if (st.kind === "finished") return st.winner !== opp;
    if (st.turn !== opp) return true;
    const replies = def.legalMoves!(next, opp);
    if (replies.length * moves.length > LOOKAHEAD_LIMIT) return true;
    return !replies.some((r) => winsFor(after(next, r, opp), opp));
  });
  return pick(safe.length > 0 ? safe : moves, rng);
}
