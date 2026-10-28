import { useEffect, useState } from "react";
import { ApiRequestError } from "../../api.ts";

/**
 * 写真の出し入れ（サーバの /api/games/:id/photos と /api/photos/:id）と、この端末の中に持っている写真。
 * - 2 人そろった写真は、だれでも見られる URL（/api/photos/<ID>）をそのまま img に使う
 * - まだ相手が出していない自分の写真は、合言葉を付けて取ってきて、端末の中の URL（blob:）にする（img には合言葉を付けられない）
 * - 自分で出したばかりの写真と、お試しの写真は、縮めたものを端末の中に持っておいて使う（お試しの写真はどこにも送らない）
 */

/** サーバの対局（お試しではない） */
export interface PhotoGame {
  id: string;
  token?: string;
}

/** 写真の ID → この端末の中の URL（blob:） */
const local = new Map<string, string>();

export function remember(photoId: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  local.set(photoId, url);
  return url;
}

/** お試しの写真の ID（サーバの ID と同じ形にしておく） */
export function localPhotoId(): string {
  const raw = crypto.getRandomValues(new Uint8Array(12));
  return `local-${[...raw].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** 写真をサーバに送って、写真の ID を受け取る */
export async function uploadPhoto(game: PhotoGame, blob: Blob): Promise<string> {
  if (!game.token) throw new ApiRequestError(401, "not_participant");
  const res = await fetch(`/api/games/${encodeURIComponent(game.id)}/photos`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg", Authorization: `Bearer ${game.token}` },
    body: blob,
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new ApiRequestError(res.status, body.error ?? "unknown");
  remember(body.id, blob);
  return body.id;
}

export const publicUrl = (photoId: string) => `/api/photos/${encodeURIComponent(photoId)}`;

/**
 * 写真を img に出す URL。open はだれでも見てよい写真か（2 人そろったもの）。
 * そうでなければ自分の写真なので、合言葉を付けて取ってくる（取ってくるまでは null）。取れなければ "failed"
 */
export function usePhotoUrl(photoId: string | null, open: boolean, game: PhotoGame | undefined): string | null | "failed" {
  const known = photoId ? local.get(photoId) : undefined;
  const [fetched, setFetched] = useState<{ id: string; url: string | "failed" } | null>(null);
  const needFetch = !!photoId && !known && !open && !!game?.token;

  useEffect(() => {
    if (!needFetch || !photoId || !game?.token) return;
    let alive = true;
    fetch(publicUrl(photoId), { headers: { Authorization: `Bearer ${game.token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const url = remember(photoId, await res.blob());
        if (alive) setFetched({ id: photoId, url });
      })
      .catch(() => alive && setFetched({ id: photoId, url: "failed" }));
    return () => {
      alive = false;
    };
  }, [needFetch, photoId, game?.token]);

  if (!photoId) return null;
  if (known) return known;
  if (open && game) return publicUrl(photoId);
  if (fetched?.id === photoId) return fetched.url;
  // お試しで、端末の中にない写真（ページを開きなおした など）
  return game ? null : "failed";
}
