import { beforeEach, describe, expect, it } from "vitest";
import type { CreateGameResponse, GameView, JoinGameResponse } from "@atg/core";
import { createApp } from "./app.ts";
import { GameStore } from "./store.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(new GameStore(":memory:"));
});

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const get = (path: string, token?: string) =>
  app.request(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function setupGame(gameType = "othello") {
  const created = (await (await post("/games", { gameType, name: "あき", seat: 0 })).json()) as CreateGameResponse;
  const joined = (await (
    await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "はる" })
  ).json()) as JoinGameResponse;
  return { id: created.id, black: created.token, white: joined.token };
}

describe("api", () => {
  it("対局を作ると相手の参加待ちになり、招待コードは参加者にだけ見える", async () => {
    const res = await post("/games", { gameType: "othello", name: "あき", seat: 0 });
    expect(res.status).toBe(201);
    const created = (await res.json()) as CreateGameResponse;

    const mine = (await (await get(`/games/${created.id}`, created.token)).json()) as GameView;
    expect(mine.you).toBe(0);
    expect(mine.waitingForOpponent).toBe(true);
    expect(mine.inviteCode).toBe(created.inviteCode);

    const stranger = (await (await get(`/games/${created.id}`)).json()) as GameView;
    expect(stranger.you).toBeNull();
    expect(stranger.inviteCode).toBeNull();
  });

  it("招待コードは 1 回しか使えない", async () => {
    const created = (await (await post("/games", { gameType: "othello", name: "あき", seat: 0 })).json()) as CreateGameResponse;
    const first = await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "はる" });
    expect(first.status).toBe(201);
    expect(((await first.json()) as JoinGameResponse).seat).toBe(1);
    const second = await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "なつ" });
    expect(second.status).toBe(409);
  });

  it("手番の人が指すと版が進み、相手の手番になる", async () => {
    const { id, black } = await setupGame();
    const res = await post(`/games/${id}/moves`, { version: 0, move: { row: 2, col: 3 } }, black);
    expect(res.status).toBe(200);
    const view = (await res.json()) as GameView;
    expect(view.version).toBe(1);
    expect(view.status).toEqual({ kind: "playing", turn: 1 });

    const history = (await (await get(`/games/${id}/moves`)).json()) as unknown[];
    expect(history).toHaveLength(1);
  });

  it("手番でない・古い版・不正な手・部外者は拒否される", async () => {
    const { id, white } = await setupGame();
    expect((await post(`/games/${id}/moves`, { version: 0, move: { row: 2, col: 3 } }, white)).status).toBe(422);
    expect((await post(`/games/${id}/moves`, { version: 5, move: { row: 2, col: 3 } }, white)).status).toBe(409);
    expect((await post(`/games/${id}/moves`, { version: 0, move: { row: 99 } }, white)).status).toBe(400);
    expect((await post(`/games/${id}/moves`, { version: 0, move: { row: 2, col: 3 } }, "bogus")).status).toBe(401);
  });

  it("相手が参加する前は指せない", async () => {
    const created = (await (await post("/games", { gameType: "othello", name: "あき", seat: 0 })).json()) as CreateGameResponse;
    const res = await post(`/games/${created.id}/moves`, { version: 0, move: { row: 2, col: 3 } }, created.token);
    expect(res.status).toBe(409);
  });

  it("隠す情報は相手・観戦者・手の記録から見えず、終局後に公開される", async () => {
    const { id, black, white } = await setupGame("hitblow");
    await post(`/games/${id}/moves`, { version: 0, move: { kind: "secret", value: "123" } }, black);
    await post(`/games/${id}/moves`, { version: 1, move: { kind: "secret", value: "456" } }, white);

    const secretsOf = async (token?: string) =>
      ((await (await get(`/games/${id}`, token)).json()) as { state: { secrets: unknown } }).state.secrets;
    expect(await secretsOf(white)).toEqual([null, "456"]);
    expect(await secretsOf()).toEqual([null, null]);
    const moves = (await (await get(`/games/${id}/moves`, white)).json()) as { move: unknown }[];
    expect(moves.map((m) => m.move)).toEqual([
      { kind: "secret", value: null },
      { kind: "secret", value: "456" },
    ]);

    await post(`/games/${id}/moves`, { version: 2, move: { kind: "guess", value: "456" } }, black);
    await post(`/games/${id}/moves`, { version: 3, move: { kind: "guess", value: "789" } }, white);
    const finished = (await (await get(`/games/${id}`)).json()) as GameView;
    expect(finished.status).toEqual({ kind: "finished", winner: 0 });
    expect((finished.state as { secrets: unknown }).secrets).toEqual(["123", "456"]);
  });
});
