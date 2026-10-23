import { beforeEach, describe, expect, it } from "vitest";
import type { CreateGameResponse, GameView, JoinGameResponse } from "@atg/core";
import { createApp } from "./app.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

// テストでは "line:<userId>" という文字列を LINE の ID トークンの代わりに使う
const verifyLine = async (idToken: string) =>
  idToken.startsWith("line:") ? { userId: idToken.slice(5) } : null;

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

async function lineGame() {
  const created = (await (
    await post("/games", { gameType: "tictactoe", name: "あき", seat: 0, idToken: "line:U-aki" })
  ).json()) as CreateGameResponse;
  const joined = (await (
    await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "はる", idToken: "line:U-haru" })
  ).json()) as JoinGameResponse;
  return { id: created.id, aki: created.token, haru: joined.token };
}

describe("LINE で本人確認", () => {
  it("別の端末でも、同じ LINE アカウントなら自分の席の合言葉をもらえる", async () => {
    const { id, aki } = await lineGame();
    const res = await post(`/games/${id}/claim`, { idToken: "line:U-aki" });
    expect(res.status).toBe(200);
    const claimed = (await res.json()) as JoinGameResponse;
    expect(claimed.seat).toBe(0);
    expect(claimed.token).not.toBe(aki);

    // 新しい合言葉でも、もとの端末の合言葉でも指せる
    expect(((await (await get(`/games/${id}`, claimed.token)).json()) as GameView).you).toBe(0);
    expect(((await (await get(`/games/${id}`, aki)).json()) as GameView).you).toBe(0);
  });

  it("参加していない LINE アカウントは合言葉をもらえない", async () => {
    const { id } = await lineGame();
    expect((await post(`/games/${id}/claim`, { idToken: "line:U-natsu" })).status).toBe(404);
  });

  it("確認できない ID トークンは拒否される", async () => {
    const { id } = await lineGame();
    expect((await post(`/games/${id}/claim`, { idToken: "bogus" })).status).toBe(401);
    expect((await post("/games", { gameType: "tictactoe", name: "あき", idToken: "bogus" })).status).toBe(401);
  });

  it("自分が作った対局に、同じ LINE アカウントで参加はできない", async () => {
    const created = (await (
      await post("/games", { gameType: "tictactoe", name: "あき", idToken: "line:U-aki" })
    ).json()) as CreateGameResponse;
    const res = await post(`/games/${created.id}/join`, {
      inviteCode: created.inviteCode,
      name: "あき",
      idToken: "line:U-aki",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "own_game" });
  });

  it("LINE アカウントで参加中の対局の一覧が取れる", async () => {
    const { id } = await lineGame();
    await post("/games", { gameType: "othello", name: "はる", idToken: "line:U-haru" });
    await post("/games", { gameType: "othello", name: "ふゆ" });

    const res = await post("/me/games", { idToken: "line:U-haru" });
    const list = (await res.json()) as { id: string; seat: number }[];
    expect(list).toHaveLength(2);
    expect(list.find((g) => g.id === id)?.seat).toBe(1);
  });

  it("LINE の確認がない（LINE の外の）作成・参加は今までどおり", async () => {
    const created = (await (await post("/games", { gameType: "tictactoe", name: "あき", seat: 0 })).json()) as CreateGameResponse;
    const res = await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "はる" });
    expect(res.status).toBe(201);
  });
});
