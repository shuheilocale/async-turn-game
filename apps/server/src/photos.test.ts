import { beforeEach, describe, expect, it } from "vitest";
import type { CreateGameResponse, GameView, JoinGameResponse } from "@atg/core";
import { createApp } from "./app.ts";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_SEAT, sniffImage } from "./photos.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

let store: GameStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new GameStore(sqliteDb(":memory:"));
  app = createApp(store);
});

const auth = (token?: string): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify(body),
  });

const get = (path: string, token?: string) => app.request(`/api${path}`, { headers: auth(token) });

/** JPEG の先頭の印（FF D8 FF）で始まる、中身はでたらめなバイト列 */
function jpeg(size = 64, fill = 7): Uint8Array {
  const b = new Uint8Array(size).fill(fill);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
}

const upload = (id: string, bytes: Uint8Array, token?: string, type = "image/jpeg") =>
  app.request(`/api/games/${id}/photos`, { method: "POST", headers: { "Content-Type": type, ...auth(token) }, body: bytes as Uint8Array<ArrayBuffer> });

async function setupGame(gameType = "photo") {
  const created = (await (await post("/games", { gameType, name: "あき", seat: 0 })).json()) as CreateGameResponse;
  const joined = (await (
    await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "はる" })
  ).json()) as JoinGameResponse;
  return { id: created.id, p0: created.token, p1: joined.token };
}

async function uploaded(id: string, token: string, bytes = jpeg()): Promise<string> {
  const res = await upload(id, bytes, token);
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe("写真", () => {
  it("参加者がアップロードした写真は、相手が出すまで出した本人にだけ見え、2 人そろうとだれでも見られる", async () => {
    const { id, p0, p1 } = await setupGame();
    const bytes = jpeg(300, 42);
    const mine = await uploaded(id, p0, bytes);
    expect(mine.length).toBeGreaterThanOrEqual(24);

    // 手に使う前は、本人にも見えない（ゲームの state に入っていない）
    expect((await get(`/photos/${mine}`, p0)).status).toBe(404);

    const played = await post(`/games/${id}/moves`, { version: 0, move: { kind: "photo", photo: mine, note: "空" } }, p0);
    expect(played.status).toBe(200);

    const own = await get(`/photos/${mine}`, p0);
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/jpeg");
    expect(own.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(bytes);
    expect((await get(`/photos/${mine}`, p1)).status).toBe(404);
    expect((await get(`/photos/${mine}`)).status).toBe(404);

    // 相手の画面には、出したことだけが届く
    const theirView = (await (await get(`/games/${id}`, p1)).json()) as GameView;
    expect(JSON.stringify(theirView.state)).not.toContain(mine);
    const theirMoves = await (await get(`/games/${id}/moves`, p1)).json();
    expect(JSON.stringify(theirMoves)).not.toContain(mine);

    const theirs = await uploaded(id, p1);
    expect((await post(`/games/${id}/moves`, { version: 1, move: { kind: "photo", photo: theirs, note: "" } }, p1)).status).toBe(200);

    const open = await get(`/photos/${mine}`);
    expect(open.status).toBe(200);
    expect(open.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(open.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await open.arrayBuffer())).toEqual(bytes);
    expect((await get(`/photos/${theirs}`)).status).toBe(200);
  });

  it("手に載せられるのは、その対局・その席の人がアップロードした写真だけ", async () => {
    const { id, p0, p1 } = await setupGame();
    const hers = await uploaded(id, p1);
    const res = await post(`/games/${id}/moves`, { version: 0, move: { kind: "photo", photo: hers, note: "" } }, p0);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "photo_not_found" });

    // ほかの対局の写真も使えない
    const other = await setupGame();
    const elsewhere = await uploaded(other.id, other.p0);
    expect((await post(`/games/${id}/moves`, { version: 0, move: { kind: "photo", photo: elsewhere, note: "" } }, p0)).status).toBe(422);
    // ない ID も
    expect(
      (await post(`/games/${id}/moves`, { version: 0, move: { kind: "photo", photo: "x".repeat(24), note: "" } }, p0)).status,
    ).toBe(422);
    expect((await store.get(id))?.version).toBe(0);
  });

  it("アップロードは参加者だけ。写真を使わないゲーム・相手の参加前・終わった対局では断る", async () => {
    const { id } = await setupGame();
    expect((await upload(id, jpeg())).status).toBe(401);
    expect((await upload(id, jpeg(), "bogus")).status).toBe(401);
    expect((await upload("nope", jpeg(), "bogus")).status).toBe(404);

    const othello = await setupGame("othello");
    const res = await upload(othello.id, jpeg(), othello.p0);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "photo_not_supported" });

    const created = (await (await post("/games", { gameType: "photo", name: "あき", seat: 0 })).json()) as CreateGameResponse;
    expect((await upload(created.id, jpeg(), created.token)).status).toBe(409);
  });

  it("種類と大きさを確かめる", async () => {
    const { id, p0 } = await setupGame();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect((await upload(id, png, p0, "image/png")).status).toBe(415);
    // 中身と Content-Type が合わない
    expect((await upload(id, jpeg(), p0, "image/webp")).status).toBe(415);
    expect((await upload(id, new Uint8Array(40), p0)).status).toBe(415);
    expect((await upload(id, new Uint8Array(0), p0)).status).toBe(400);
    const big = await upload(id, jpeg(MAX_PHOTO_BYTES + 1), p0);
    expect(big.status).toBe(413);
    expect(await res(big)).toEqual({ error: "photo_too_large" });
    expect((await upload(id, jpeg(MAX_PHOTO_BYTES), p0)).status).toBe(201);

    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect((await upload(id, webp, p0, "image/webp")).status).toBe(201);
    expect(sniffImage(webp)).toBe("image/webp");
  });

  it(`1 つの対局・1 人あたり ${MAX_PHOTOS_PER_SEAT} 枚まで`, async () => {
    const { id, p0, p1 } = await setupGame();
    for (let i = 0; i < MAX_PHOTOS_PER_SEAT; i++) await uploaded(id, p0);
    const over = await upload(id, jpeg(), p0);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "photo_limit" });
    // 相手の分は別に数える
    await uploaded(id, p1);
    expect(await store.countPhotos(id, 0)).toBe(MAX_PHOTOS_PER_SEAT);
  });

  it("おかしな ID・写真を使わないゲームの ID は 404", async () => {
    expect((await get("/photos/short")).status).toBe(404);
    expect((await get(`/photos/${"a".repeat(24)}`)).status).toBe(404);
  });
});

describe("GameStore の写真", () => {
  it("バイト列をそのまま出し入れでき、どの席の写真か分かる", async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const id = (await store.addPhoto("g1", 1, "image/jpeg", bytes, 3))!;
    expect(id).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const back = await store.photo(id);
    expect(back).toMatchObject({ gameId: "g1", seat: 1, mime: "image/jpeg" });
    expect(back!.bytes).toEqual(bytes);
    expect(await store.photoSeat("g1", id)).toBe(1);
    expect(await store.photoSeat("g2", id)).toBeNull();
    expect(await store.photo("missing")).toBeNull();
  });

  it("同時に送られても上限を超えない", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => store.addPhoto("g1", 0, "image/jpeg", new Uint8Array([1, 2, 3]), 4)),
    );
    expect(results.filter(Boolean)).toHaveLength(4);
    expect(await store.countPhotos("g1", 0)).toBe(4);
  });
});

const res = (r: Response) => r.json();
