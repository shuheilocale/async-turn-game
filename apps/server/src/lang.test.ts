import { beforeEach, describe, expect, it } from "vitest";
import type { CreateGameResponse, GameView, JoinGameResponse } from "@atg/core";
import { createApp } from "./app.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(new GameStore(sqliteDb(":memory:")));
});

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const view = async (id: string) => (await (await app.request(`/api/games/${id}`)).json()) as GameView;

describe("プレイヤーの言語（LINE のカードを相手の言語で作るため）", () => {
  it("作成・参加で送った言語を覚え、指すときに送った言語で書き換える", async () => {
    const created = (await (
      await post("/games", { gameType: "tictactoe", name: "あき", seat: 0, lang: "ja" })
    ).json()) as CreateGameResponse;
    const joined = (await (
      await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "Som", lang: "th" })
    ).json()) as JoinGameResponse;
    expect((await view(created.id)).players).toEqual([
      { seat: 0, name: "あき", lang: "ja" },
      { seat: 1, name: "Som", lang: "th" },
    ]);

    await post(`/games/${created.id}/moves`, { version: 0, move: { index: 4 }, lang: "en" }, created.token);
    expect((await view(created.id)).players[0]!.lang).toBe("en");
    expect((await view(created.id)).players[1]!.lang).toBe("th");
    expect(joined.seat).toBe(1);
  });

  it("知らない言語や送らなかった場合は null", async () => {
    const created = (await (
      await post("/games", { gameType: "tictactoe", name: "あき", seat: 0, lang: "<script>" })
    ).json()) as CreateGameResponse;
    expect((await view(created.id)).players[0]!.lang).toBeNull();
  });

  it("次の対局にも言語を引き継ぐ", async () => {
    const created = (await (
      await post("/games", { gameType: "tictactoe", name: "あき", seat: 0, lang: "ja" })
    ).json()) as CreateGameResponse;
    const joined = (await (
      await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "Som", lang: "th" })
    ).json()) as JoinGameResponse;
    const tokens = [created.token, joined.token];
    for (const [i, index] of [0, 3, 1, 4, 2].entries()) {
      await post(`/games/${created.id}/moves`, { version: i, move: { index } }, tokens[i % 2]);
    }
    const next = (await (await post(`/games/${created.id}/next`, {}, created.token)).json()) as { id: string };
    expect((await view(next.id)).players).toEqual([
      { seat: 0, name: "Som", lang: "th" },
      { seat: 1, name: "あき", lang: "ja" },
    ]);
  });
});
