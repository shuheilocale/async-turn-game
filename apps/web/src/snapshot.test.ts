import { describe, expect, it } from "vitest";
import { botMove, getGame, type Seat } from "@atg/core";
import { snapshotOf, snapshotToFlex } from "./snapshot.ts";

const DRAWN = ["tictactoe", "fading", "gobble", "nim", "tateyoko", "bridge", "korokoro", "connect4", "boxes", "othello", "artillery"];

/** コンピュータ同士で n 手進めた局面 */
function played(gameType: string, n: number) {
  const def = getGame(gameType)!;
  let state = def.initialState(Math.random);
  for (let i = 0; i < n; i++) {
    const st = def.status(state);
    if (st.kind !== "playing") break;
    const move = botMove(def, state, st.turn as Seat, Math.random);
    if (move === null) break;
    state = def.applyMove(state, move, st.turn);
  }
  return state;
}

describe("LINE のカードに載せる今の局面", () => {
  it.each(DRAWN)("%s：途中と終局の局面を描け、カードの大きさの上限（30KB）に収まる", (gameType) => {
    for (const n of [0, 5, 200]) {
      const snap = snapshotOf(gameType, played(gameType, n));
      expect(snap).not.toBeNull();
      const json = JSON.stringify(snapshotToFlex(snap!));
      expect(json.length).toBeLessThan(25_000);
    }
  });

  it("隠す情報があるゲームは描かない（送る人の秘密が載らないように）", () => {
    for (const gameType of ["hitblow", "auction", "bluff", "sotto"]) {
      expect(snapshotOf(gameType, getGame(gameType)!.initialState(Math.random))).toBeNull();
    }
  });
});
