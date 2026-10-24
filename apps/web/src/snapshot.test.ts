import { describe, expect, it } from "vitest";
import { botMove, Curling, getGame, type Seat } from "@atg/core";
import { snapshotOf, snapshotToFlex } from "./snapshot.ts";

const DRAWN = ["tictactoe", "fading", "gobble", "nim", "tateyoko", "bridge", "korokoro", "connect4", "boxes", "othello"];

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

  it("curling：石がない・8 個ある・エンドが終わったところを描け、上限に収まる", () => {
    const def = getGame("curling")!;
    // 前の石は動かさず、投げた石をハウスのまわりに止めていく（物理演算は画面側なので、ここでは置くだけ）
    let state = def.initialState(Math.random) as Curling.CurlingState;
    const sizes: number[] = [];
    const check = () => {
      const snap = snapshotOf("curling", state);
      expect(snap).not.toBeNull();
      // どの行も幅がそろっている（112px の 1.5 倍）
      for (const row of snap!.rows) expect(row.cells.reduce((sum, c) => sum + c.w, 0)).toBe(168);
      sizes.push(JSON.stringify(snapshotToFlex(snap!)).length);
      return snap!;
    };
    check();
    for (let i = 0; i < 2 * Curling.THROWS; i++) {
      const st = def.status(state);
      if (st.kind !== "playing") break;
      const id = state.thrown;
      // 同じ行に 2 つ並ぶ石・ハウスの外の石もまぜる
      const x = [-1.2, 0.3, 0.6, -0.1, 1.9, -1.95, 0.9, 0][id]!;
      const y = Curling.TEE_Y + [0, 0.1, 0.05, 1.2, -1, 1.5, -2, -0.3][id]!;
      const keep = state.stones.map((s): Curling.Placed => [s.id, s.x, s.y, s.angle]);
      state = def.applyMove(state, { aim: 0, speed: 6.6, spin: 1, stones: [...keep, [id, x, y, 0]] }, st.turn);
      const snap = check();
      // 石の丸の数は、図の中にある石の数（終わったエンドの区切りでは、そのエンドの並び）
      const shown = state.thrown > 0 ? state.stones : state.ends.at(-1)!.stones;
      const inView = shown.filter((s) => s.y > Curling.TEE_Y - 2.45 && s.y < Curling.TEE_Y + 2.05);
      expect(snap.rows.flatMap((r) => r.cells).filter((c) => c.dot).length).toBe(inView.length);
    }
    expect(Math.max(...sizes)).toBeLessThan(25_000);
  });

  it("隠す情報があるゲームは描かない（送る人の秘密が載らないように）", () => {
    for (const gameType of ["hitblow", "auction", "bluff", "sotto"]) {
      expect(snapshotOf(gameType, getGame(gameType)!.initialState(Math.random))).toBeNull();
    }
  });
});
