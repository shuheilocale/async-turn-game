/** LINE の ID トークン（LIFF の liff.getIDToken()）を確かめた結果 */
export interface LineUser {
  userId: string;
}

/** 確かめられなければ null。テストでは偽物に差し替える */
export type VerifyLine = (idToken: string) => Promise<LineUser | null>;

/** JWT の中身（署名は確かめない）から、発行先のチャネル ID を読む */
function audienceOf(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const aud = JSON.parse(atob(payload)).aud;
    return typeof aud === "string" ? aud : null;
  } catch {
    return null;
  }
}

/**
 * LINE のサーバに問い合わせて ID トークンを確かめる。
 * channelIds は受け付けるチャネル（LINE ミニアプリの開発用・審査用・本番用）
 */
export function lineVerifier(channelIds: string[]): VerifyLine {
  return async (idToken) => {
    const aud = audienceOf(idToken);
    if (!aud || !channelIds.includes(aud)) return null;
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: aud }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sub?: unknown };
    return typeof body.sub === "string" ? { userId: body.sub } : null;
  };
}

export const parseChannelIds = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
