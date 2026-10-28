import type { Context, Hono } from "hono";
import { getGame, type Seat } from "@atg/core";
import type { GameRecord, GameStore } from "./store.ts";

/**
 * 写真を使うゲーム（GameDefinition の photosOfMove・canSeePhoto を持つゲーム。いまは「きょうのおだい写真」）の写真の出し入れ。
 * - POST /api/games/:id/photos：写真を 1 枚アップロードする。本文は画像そのもの（Content-Type: image/jpeg か image/webp）。
 *   合言葉（Authorization）が要り、参加者だけ。種類は中身の先頭のバイトでも確かめ、大きさは MAX_PHOTO_BYTES まで。
 *   1 つの対局・1 人あたり MAX_PHOTOS_PER_SEAT 枚まで（手に使われなかった写真がたまりすぎないように）。{ id } を返す
 * - GET /api/photos/:photoId：写真を返す。見てよいかはゲームの canSeePhoto で決める。だれでも見てよい写真（2 人そろったもの）は
 *   長くキャッシュさせる（ID ごとに中身は変わらない）。出した本人にだけ見せる写真は、キャッシュさせない。見られなければ 404
 *
 * 写真は画面で縮めて JPEG にしてから送る（元のファイルの位置情報などは、描きなおすときに消える）。
 * 手に載せた写真がその対局・その席の人のものかは、手を受け取るとき（moves.ts の playMove）に確かめる
 */

/** 1 枚の大きさの上限（バイト）。画面ではだいたい 300KB 以下にして送る。base64 にしても D1 の 1 行（2MB）に入る */
export const MAX_PHOTO_BYTES = 512 * 1024;
/** 1 つの対局・1 人あたりの枚数の上限（1 冊 7 お題。出しなおしや失敗を見込んで多めに） */
export const MAX_PHOTOS_PER_SEAT = 30;
/** 写真の ID の形（store.addPhoto が作るもの） */
const PHOTO_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** 中身の先頭のバイトから画像の種類を決める。受け付けない種類なら null */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

function bearer(c: Context): string | undefined {
  const header = c.req.header("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/** 写真の口を app（basePath は /api）に足す */
export function photoRoutes(app: Hono<any, any, any>, store: GameStore) {
  app.post("/games/:id/photos", async (c) => {
    const id = c.req.param("id");
    const game = await store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    const seat = await store.seatOf(id, bearer(c));
    if (seat === null) return c.json({ error: "not_participant" }, 401);
    const def = getGame(game.gameType)!;
    if (!def.photosOfMove) return c.json({ error: "photo_not_supported" }, 400);
    if (def.status(game.state).kind === "finished") return c.json({ error: "game_over" }, 409);
    if (game.players.length < 2) return c.json({ error: "waiting_opponent" }, 409);

    // 大きすぎるものは読む前に断る（Content-Length がないときは、読んでから確かめる）
    if (Number(c.req.header("Content-Length") ?? 0) > MAX_PHOTO_BYTES) return c.json({ error: "photo_too_large" }, 413);
    const declared = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return c.json({ error: "photo_empty" }, 400);
    if (bytes.length > MAX_PHOTO_BYTES) return c.json({ error: "photo_too_large" }, 413);
    const mime = sniffImage(bytes);
    if (!mime || mime !== declared) return c.json({ error: "photo_type" }, 415);

    const photoId = await store.addPhoto(id, seat, mime, bytes, MAX_PHOTOS_PER_SEAT);
    if (!photoId) return c.json({ error: "photo_limit" }, 429);
    return c.json({ id: photoId }, 201);
  });

  app.get("/photos/:photoId", async (c) => {
    const photoId = c.req.param("photoId");
    const notFound = () => c.json({ error: "not_found" }, 404, { "Cache-Control": "no-store" });
    if (!PHOTO_ID.test(photoId)) return notFound();
    const photo = await store.photo(photoId);
    if (!photo) return notFound();
    const game = await store.get(photo.gameId);
    const can = game && seeing(game, photoId);
    if (!can) return notFound();

    let cache: string;
    if (can(null)) {
      // 2 人そろった写真：だれでも見てよい。ID ごとに中身は変わらないので、ずっとキャッシュしてよい（LINE のカードもこの URL を使う）
      cache = "public, max-age=31536000, immutable";
    } else {
      const viewer = await store.seatOf(photo.gameId, bearer(c));
      if (viewer === null || !can(viewer)) return notFound();
      // まだ相手が出していない写真：出した本人にだけ。どこにも残さない
      cache = "private, no-store";
    }
    return c.body(photo.bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.bytes.length),
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    });
  });
}

/** その対局の写真を、ある人（null はだれでも）が見てよいか。写真を使わないゲームなら null */
function seeing(game: GameRecord, photoId: string): ((viewer: Seat | null) => boolean) | null {
  const def = getGame(game.gameType);
  if (!def?.canSeePhoto) return null;
  return (viewer) => def.canSeePhoto!(game.state, photoId, viewer);
}
