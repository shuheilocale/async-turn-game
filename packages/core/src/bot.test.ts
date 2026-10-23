import { describe, expect, it } from "vitest";
import { botMove } from "./bot.ts";
import { tictactoe } from "./games/tictactoe.ts";
import type { GameDefinition, Seat } from "./types.ts";

const ttt = {
  ...tictactoe,
  legalMoves: (s: ReturnType<typeof tictactoe.initialState>) =>
    s.board.flatMap((c, index) => (c === null ? [{ index }] : [])),
} as GameDefinition<any, any>;

function play(moves: number[]) {
  let s = ttt.initialState(Math.random);
  moves.forEach((index, i) => (s = ttt.applyMove(s, { index }, (i % 2) as Seat)));
  return s;
}

describe("お試しのコンピュータ", () => {
  it("勝てる手があれば打つ", () => {
    // ○: 0,1 ×: 3,4 で ○ の番 → 2 で勝ち
    expect(botMove(ttt, play([0, 3, 1, 4]), 0, Math.random)).toEqual({ index: 2 });
  });

  it("相手にすぐ勝たれる手は避ける（相手のリーチを止める）", () => {
    // ○: 0,1 ×: 4 で × の番 → 2 を止める
    expect(botMove(ttt, play([0, 4, 1]), 1, Math.random)).toEqual({ index: 2 });
  });

  it("指した瞬間に相手の勝ちが決まる手は選ばない（誰が塗っても色の持ち主が勝つゲームなど）", () => {
    // "give" を指すと、その場で指した人の相手の勝ちが決まる。"ok" は何も起きない
    type S = { winner: Seat | null; turn: Seat };
    const giveAway = {
      id: "give-away",
      initialState: (): S => ({ winner: null, turn: 0 }),
      status: (s: S) => (s.winner !== null ? { kind: "finished", winner: s.winner } : { kind: "playing", turn: s.turn }),
      applyMove: (s: S, m: string, seat: Seat): S => ({
        winner: m === "give" ? ((1 - seat) as Seat) : null,
        turn: (1 - s.turn) as Seat,
      }),
      parseMove: (raw: unknown) => raw,
      legalMoves: () => ["give", "ok"],
    } as unknown as GameDefinition<any, any>;
    for (let i = 0; i < 20; i++) {
      expect(botMove(giveAway, giveAway.initialState(Math.random), 0, Math.random)).toBe("ok");
    }
  });

  it("legalMoves も botMove もないゲームでは null（ひとりで両方を動かす）", () => {
    const { legalMoves: _, ...noBot } = ttt;
    expect(botMove(noBot as GameDefinition<any, any>, play([]), 0, Math.random)).toBeNull();
  });

  it("隠す情報があるゲームは botMove に自分から見た形（viewState）を渡す", () => {
    const seen: unknown[] = [];
    const hidden = {
      ...ttt,
      viewState: (s: unknown, viewer: Seat | null) => ({ viewer, s }),
      botMove: (view: unknown) => (seen.push(view), { index: 8 }),
    } as GameDefinition<any, any>;
    expect(botMove(hidden, play([]), 1, Math.random)).toEqual({ index: 8 });
    expect((seen[0] as { viewer: Seat }).viewer).toBe(1);
  });
});
