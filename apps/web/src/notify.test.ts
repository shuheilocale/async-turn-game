import { describe, expect, it, vi } from "vitest";
import { getGame, type GameStatus, type GameView } from "@atg/core";
import { translator } from "./i18n/index.tsx";
import { freeNotice, progressCard, QUIET_MS } from "./notify.ts";

// カードのアイコンの URL を作るのに使う（テストは https でないので、アイコンは付かない）
vi.stubGlobal("location", { protocol: "http:", origin: "http://localhost" });

const view = (status: GameStatus, gameType = "mochi"): GameView => ({
  id: "g1",
  gameType,
  version: 3,
  state: getGame(gameType)!.initialState(() => 0.5),
  status,
  players: [
    { seat: 0, name: "あき", lang: "ja" },
    { seat: 1, name: "はる", lang: "ja" },
  ],
  you: 0,
  waitingForOpponent: false,
  inviteCode: null,
  nextGameId: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("LINE の知らせ", () => {
  const t = translator("ja");

  it("順番のあるゲームは「次は〇〇さんの番」を添え、順番のないゲームでは添えない", () => {
    const turn = progressCard(t, view({ kind: "playing", turn: 1 }, "tictactoe"), "あきさんが指しました");
    expect(turn.body).toBe("はるさんの番です");
    const free = progressCard(t, view({ kind: "playing", turn: 1, free: true }), "あきさんがごはんをあげました");
    expect(free.body).toBeUndefined();
    expect(free.alt).toBe("あきさんがごはんをあげました");
    expect(free.title).toBe("あきさんがごはんをあげました");
  });

  it("順番のないゲームで、同じ人が短い間に続けて指したときは、毎回は知らせない", () => {
    const h = 3_600_000;
    // はじめては知らせる
    let r = freeNotice(undefined, 1, 0);
    expect(r).toEqual({ send: true, saved: { at: 0, version: 1 } });
    // 続けて指した（版が 1 つだけ進んだ）。前に知らせてから QUIET_MS たっていなければ知らせない
    r = freeNotice(r.saved, 2, 1 * h);
    expect(r).toEqual({ send: false, saved: { at: 0, version: 2 } });
    r = freeNotice(r.saved, 3, 2 * h);
    expect(r.send).toBe(false);
    // 前に知らせてから QUIET_MS たったら、また知らせる
    r = freeNotice(r.saved, 4, QUIET_MS);
    expect(r).toEqual({ send: true, saved: { at: QUIET_MS, version: 4 } });
    // あいだに相手が指していたら（版が 2 つ以上進んだ）、すぐでも知らせる
    expect(freeNotice(r.saved, 6, QUIET_MS + h).send).toBe(true);
  });
});
