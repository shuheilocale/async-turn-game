import { describe, expect, it } from "vitest";
import { botMove, getGame, Korokoro, type Seat } from "@atg/core";
import { C, snapshotOf, snapshotToFlex } from "./snapshot.ts";

/** コンピュータ同士で n 手進めた局面 */
function played(n: number): Korokoro.KorokoroState {
  const def = getGame("korokoro")!;
  let state = def.initialState(Math.random) as Korokoro.KorokoroState;
  for (let i = 0; i < n; i++) {
    const st = def.status(state);
    if (st.kind !== "playing") break;
    const move = botMove(def, state, st.turn as Seat, Math.random);
    if (move === null) break;
    state = def.applyMove(state, move, st.turn);
  }
  return state;
}

describe("ころころ：LINE のカードに載せる今の局面", () => {
  it("始まり・途中・終局の局面を描け、カードの大きさの上限に収まる", () => {
    for (const n of [0, 3, 200]) {
      const snap = snapshotOf("korokoro", played(n));
      expect(snap).not.toBeNull();
      expect(snap!.rows).toHaveLength(Korokoro.SIZE);
      for (const row of snap!.rows) expect(row.cells).toHaveLength(Korokoro.SIZE);
      expect(JSON.stringify(snapshotToFlex(snap!)).length).toBeLessThan(25_000);
    }
  });

  it("塗ったマスは色で、キューブのいるマスは印で描く", () => {
    const def = getGame("korokoro")!;
    // 0 → 2（青）→ 14（青）→ 13（オレンジ）
    let s = def.initialState(Math.random) as Korokoro.KorokoroState;
    [2, 14, 13].forEach((to, i) => (s = def.applyMove(s, { to }, (i % 2) as Seat)));
    const cells = snapshotOf("korokoro", s)!.rows.flatMap((r) => r.cells);
    expect(cells[2]!.fill).toBe(C.p0);
    expect(cells[14]!.fill).toBe(C.p0);
    expect(cells[13]!.fill).toBe(C.p1);
    expect(cells[0]!.fill).toBe(C.surface);
    // キューブの印はいるマスにだけ
    expect(cells.filter((c) => c.dot)).toHaveLength(1);
    expect(cells[13]!.dot).toBeDefined();
  });
});
