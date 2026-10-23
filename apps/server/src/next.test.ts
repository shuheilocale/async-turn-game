import { beforeEach, describe, expect, it } from "vitest";
import type { CreateGameResponse, GameView, JoinGameResponse } from "@atg/core";
import { createApp } from "./app.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

const verifyLine = async (idToken: string) => (idToken.startsWith("line:") ? { userId: idToken.slice(5) } : null);

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(new GameStore(sqliteDb(":memory:")), { verifyLine });
});

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const get = (path: string, token?: string) =>
  app.request(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

/** マルバツを先手（あき）の勝ちで終わらせる */
async function finishedGame(idToken?: string) {
  const created = (await (
    await post("/games", { gameType: "tictactoe", name: "あき", seat: 0, idToken })
  ).json()) as CreateGameResponse;
  const joined = (await (
    await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "はる" })
  ).json()) as JoinGameResponse;
  const tokens = [created.token, joined.token];
  for (const [i, index] of [0, 3, 1, 4, 2].entries()) {
    await post(`/games/${created.id}/moves`, { version: i, move: { index } }, tokens[i % 2]);
  }
  return { id: created.id, aki: created.token, haru: joined.token };
}

describe("次の対局（もう一局・ほかのゲーム）", () => {
  it("もう一局：同じ 2 人・同じゲームで、先手と後手が入れ替わり、同じ合言葉で指せる", async () => {
    const { id, aki, haru } = await finishedGame();
    const res = await post(`/games/${id}/next`, {}, haru);
    expect(res.status).toBe(201);
    const next = (await res.json()) as { id: string; seat: number };
    expect(next.seat).toBe(0); // 後手だったはるが先手に

    const view = (await (await get(`/games/${next.id}`, aki)).json()) as GameView;
    expect(view.gameType).toBe("tictactoe");
    expect(view.you).toBe(1);
    expect(view.waitingForOpponent).toBe(false);
    expect(view.players).toEqual([
      { seat: 0, name: "はる", lang: null },
      { seat: 1, name: "あき", lang: null },
    ]);
    expect(((await (await get(`/games/${next.id}`, haru)).json()) as GameView).you).toBe(0);

    // 終わった対局から次の対局が分かる
    expect(((await (await get(`/games/${id}`)).json()) as GameView).nextGameId).toBe(next.id);
  });

  it("ほかのゲーム：ゲームの種類を選んで次の対局を作れる", async () => {
    const { id, aki } = await finishedGame();
    const next = (await (await post(`/games/${id}/next`, { gameType: "nim" }, aki)).json()) as { id: string };
    expect(((await (await get(`/games/${next.id}`, aki)).json()) as GameView).gameType).toBe("nim");
  });

  it("2 人がそれぞれ押しても、次の対局は 1 つだけ", async () => {
    const { id, aki, haru } = await finishedGame();
    const [a, b] = await Promise.all([post(`/games/${id}/next`, {}, aki), post(`/games/${id}/next`, { gameType: "nim" }, haru)]);
    const [na, nb] = (await Promise.all([a.json(), b.json()])) as { id: string; seat: number }[];
    expect(na!.id).toBe(nb!.id);
    expect(na!.seat).not.toBe(nb!.seat);
  });

  it("終局前・部外者・知らないゲームは拒否される", async () => {
    const created = (await (await post("/games", { gameType: "tictactoe", name: "あき", seat: 0 })).json()) as CreateGameResponse;
    expect((await post(`/games/${created.id}/next`, {}, created.token)).status).toBe(409);
    const { id, aki } = await finishedGame();
    expect((await post(`/games/${id}/next`, {})).status).toBe(401);
    expect((await post(`/games/${id}/next`, { gameType: "chess" }, aki)).status).toBe(400);
  });

  it("LINE で結びついた席は、次の対局でも LINE アカウントで取り戻せる", async () => {
    const { id, aki } = await finishedGame("line:U-aki");
    const next = (await (await post(`/games/${id}/next`, {}, aki)).json()) as { id: string };
    const claimed = (await (await post(`/games/${next.id}/claim`, { idToken: "line:U-aki" })).json()) as JoinGameResponse;
    expect(claimed.seat).toBe(1);
  });
});
