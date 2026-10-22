import { beforeEach, describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

let store: GameStore;

beforeEach(() => {
  store = new GameStore(sqliteDb(":memory:"));
});

describe("GameStore", () => {
  it("同じ版に同時に 2 手が届いたら、片方だけが記録される", async () => {
    const { id } = await store.create("othello", { n: 0 }, { seat: 0, name: "あき" });
    const results = await Promise.all([
      store.recordMove(id, 0, 0, { a: 1 }, { n: 1 }),
      store.recordMove(id, 0, 0, { a: 2 }, { n: 2 }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const game = await store.get(id);
    expect(game?.version).toBe(1);
    expect(await store.moves(id)).toHaveLength(1);
  });

  it("同じ招待コードで同時に参加しても、1 人だけが参加できる", async () => {
    const { id, inviteCode } = await store.create("othello", {}, { seat: 0, name: "あき" });
    const results = await Promise.all([store.join(id, inviteCode, "はる"), store.join(id, inviteCode, "なつ")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.get(id))?.players).toHaveLength(2);
  });

  it("トークンで席が分かり、違うトークンでは分からない", async () => {
    const { id, token } = await store.create("othello", {}, { seat: 1, name: "あき" });
    expect(await store.seatOf(id, token)).toBe(1);
    expect(await store.seatOf(id, "bogus")).toBeNull();
    expect(await store.seatOf(id, undefined)).toBeNull();
  });
});
