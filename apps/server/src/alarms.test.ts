import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mochi, type CreateGameResponse, type JoinGameResponse } from "@atg/core";
import { cleanTimeZone, planAlarms, quietUntil, STALLED_MS, timeZoneOf } from "./alarms.ts";
import { createApp } from "./app.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

let store: GameStore;
let app: ReturnType<typeof createApp>;
let clock: ReturnType<typeof vi.spyOn>;
const T0 = Date.UTC(2026, 9, 1, 3); // 日本の 12 時・タイの 10 時

beforeEach(() => {
  store = new GameStore(sqliteDb(":memory:"));
  app = createApp(store, { lineOaId: "@abc1234" });
  clock = vi.spyOn(Date, "now").mockReturnValue(T0);
});
afterEach(() => clock.mockRestore());

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

async function setupGame(gameType: string, extra: { create?: object; join?: object } = {}) {
  const created = (await (
    await post("/games", { gameType, name: "あき", seat: 0, ...extra.create })
  ).json()) as CreateGameResponse;
  const joined = (await (
    await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "Som", ...extra.join })
  ).json()) as JoinGameResponse;
  return { id: created.id, tokens: [created.token, joined.token] };
}

describe("知らせの予定の決め方", () => {
  it("相手が参加する前は予定を入れない", async () => {
    const created = (await (await post("/games", { gameType: "tictactoe", name: "あき", seat: 0 })).json()) as CreateGameResponse;
    expect(await store.alarms(created.id)).toEqual([]);
  });

  it("順番のあるゲームは、参加したときに手番の人へ 24 時間後の stalled を 1 つ入れ、指すと相手に移る", async () => {
    const { id, tokens } = await setupGame("tictactoe");
    expect(await store.alarms(id)).toEqual([{ seat: 0, at: T0 + STALLED_MS, kind: "stalled" }]);

    clock.mockReturnValue(T0 + 3_600_000);
    await post(`/games/${id}/moves`, { version: 0, move: { index: 4 } }, tokens[0]);
    expect(await store.alarms(id)).toEqual([{ seat: 1, at: T0 + 3_600_000 + STALLED_MS, kind: "stalled" }]);
  });

  it("終局したら予定を消す", async () => {
    const { id, tokens } = await setupGame("tictactoe");
    for (const [i, index] of [0, 3, 1, 4, 2].entries()) {
      await post(`/games/${id}/moves`, { version: i, move: { index } }, tokens[i % 2]);
    }
    expect(await store.alarms(id)).toEqual([]);
  });

  it("nextAlarm を持つゲーム（もち）は、お世話のたびにその時刻・種類で 2 人ともに入れる", async () => {
    const { id, tokens } = await setupGame("mochi");
    // はじめてのお世話の前は、もちは知らせることがない
    expect(await store.alarms(id)).toEqual([]);
    await post(`/games/${id}/moves`, { version: 0, move: { care: "feed" } }, tokens[0]);
    const alarm = Mochi.nextAlarm((await store.get(id))!.state as Mochi.MochiState)!;
    expect(alarm.at).toBeGreaterThan(T0);
    expect(await store.alarms(id)).toEqual([
      { seat: 0, at: alarm.at, kind: alarm.kind },
      { seat: 1, at: alarm.at, kind: alarm.kind },
    ]);
  });

  it("順番のない、nextAlarm も持たないゲームには stalled を入れない（2 人ともいつでも指せるので「手番の人」がいない）", () => {
    const free = { ...Mochi.mochi, nextAlarm: undefined };
    expect(planAlarms(free, free.initialState(() => 0), T0)).toEqual([]);
    const turns = { ...free, status: () => ({ kind: "playing", turn: 1 }) as const };
    expect(planAlarms(turns, {}, T0)).toEqual([{ seat: 1, at: T0 + STALLED_MS, kind: "stalled" }]);
  });

  it("次の対局を作ると、その対局の手番の人へ入れる", async () => {
    const { id, tokens } = await setupGame("tictactoe");
    for (const [i, index] of [0, 3, 1, 4, 2].entries()) {
      await post(`/games/${id}/moves`, { version: i, move: { index } }, tokens[i % 2]);
    }
    const next = (await (await post(`/games/${id}/next`, {}, tokens[0])).json()) as { id: string };
    expect(await store.alarms(next.id)).toEqual([{ seat: 0, at: T0 + STALLED_MS, kind: "stalled" }]);
  });

  it("あとから決め直された予定を、古い版で上書きしない", async () => {
    const { id, tokens } = await setupGame("tictactoe");
    await post(`/games/${id}/moves`, { version: 0, move: { index: 4 } }, tokens[0]);
    await store.setAlarms(id, 0, [{ seat: 0, at: 1, kind: "stalled" }]);
    expect(await store.alarms(id)).toEqual([{ seat: 1, at: T0 + STALLED_MS, kind: "stalled" }]);
  });
});

describe("プレイヤーのタイムゾーン", () => {
  it("作成・参加で送ったタイムゾーンを覚え、指すときに送ったもので書き換える。知らない名前は覚えない", async () => {
    const { id, tokens } = await setupGame("tictactoe", {
      create: { timeZone: "Asia/Tokyo" },
      join: { timeZone: "Not/AZone" },
    });
    expect((await store.get(id))!.players.map((p) => p.timeZone)).toEqual(["Asia/Tokyo", null]);
    await post(`/games/${id}/moves`, { version: 0, move: { index: 4 }, timeZone: "Asia/Seoul" }, tokens[0]);
    expect((await store.get(id))!.players.map((p) => p.timeZone)).toEqual(["Asia/Seoul", null]);
  });

  it("次の対局にもタイムゾーンを引き継ぐ", async () => {
    const { id, tokens } = await setupGame("tictactoe", {
      create: { timeZone: "Asia/Tokyo" },
      join: { timeZone: "Asia/Bangkok" },
    });
    for (const [i, index] of [0, 3, 1, 4, 2].entries()) {
      await post(`/games/${id}/moves`, { version: i, move: { index } }, tokens[i % 2]);
    }
    const next = (await (await post(`/games/${id}/next`, {}, tokens[0])).json()) as { id: string };
    expect((await store.get(next.id))!.players.map((p) => p.timeZone)).toEqual(["Asia/Bangkok", "Asia/Tokyo"]);
  });

  it("タイムゾーンが分からなければ言語から推す", () => {
    expect(timeZoneOf("Europe/Paris", "ja")).toBe("Europe/Paris");
    expect(timeZoneOf(null, "ja")).toBe("Asia/Tokyo");
    expect(timeZoneOf(null, "th")).toBe("Asia/Bangkok");
    expect(timeZoneOf(null, "en")).toBe("UTC");
    expect(cleanTimeZone("Asia/Bangkok")).toBe("Asia/Bangkok");
    expect(cleanTimeZone("x".repeat(100))).toBeNull();
    expect(cleanTimeZone(42)).toBeNull();
  });

  it("受け取る人の 22 時〜8 時は、その人の朝 8 時までの時刻を返す", () => {
    // 日本の 21:59 は昼、22:00 は夜
    expect(quietUntil(Date.UTC(2026, 9, 1, 12, 59), "Asia/Tokyo")).toBeNull();
    expect(quietUntil(Date.UTC(2026, 9, 1, 13), "Asia/Tokyo")).toBe(Date.UTC(2026, 9, 1, 23));
    // 日本の 3 時 → その日の 8 時。タイではまだ 1 時なので、タイの 8 時（日本の 10 時）
    expect(quietUntil(Date.UTC(2026, 9, 1, 18), "Asia/Tokyo")).toBe(Date.UTC(2026, 9, 1, 23));
    expect(quietUntil(Date.UTC(2026, 9, 1, 18), "Asia/Bangkok")).toBe(Date.UTC(2026, 9, 2, 1));
    expect(quietUntil(Date.UTC(2026, 9, 1, 23), "Asia/Tokyo")).toBeNull();
  });
});

describe("画面に渡す設定", () => {
  it("公式アカウントの ID を返す（なければ null）", async () => {
    expect(await (await app.request("/api/config")).json()).toEqual({ lineOaId: "@abc1234" });
    const bare = createApp(store);
    expect(await (await bare.request("/api/config")).json()).toEqual({ lineOaId: null });
  });
});
