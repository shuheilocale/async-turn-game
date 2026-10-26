import type { GameStore } from "./store.ts";

/**
 * LINE の公式アカウント（Messaging API）の Webhook。2 人と公式アカウントのグループを記録して、時刻になったときの知らせを
 * そのグループへ届けられるようにする（送り先の決め方は push.ts）。
 * - join：グループに招待された → グループを記録して、返信であいさつ
 * - leave：グループから抜けた → グループの記録を消す
 * - message（グループの中で、だれが話したか分かるもの）→ その人をメンバーとして記録。初めての人にだけ返信する
 * - memberLeft → メンバーの記録を消す。memberJoined は記録しない（話したときに記録する）
 * - 1 対 1 のトークでのメッセージには何もしない（返事もしない）
 * 返信は reply API で送る（push と違って無料枠を使わない）
 */

export const REPLY_URL = "https://api.line.me/v2/bot/message/reply";

const MAX_NAME = 20;

/** join のあいさつ。グループには日本語とタイ語の人がいるので、3 言語を短く並べる */
export const GREETING = [
  "よろしくお願いします。このグループで遊ぶ人は、何かひとこと送ってください。対局の知らせをここに届けます",
  "ยินดีที่ได้รู้จัก ใครที่เล่นเกมในกลุ่มนี้ ช่วยส่งข้อความสั้นๆ มาหนึ่งข้อความ แล้วจะส่งการแจ้งเตือนเกมมาที่กลุ่มนี้",
  "Hello! If you play games in this group, please send any short message. Game reminders will be sent here.",
].join("\n\n");

/** 初めて話した人への返信。名前が分からなければ名前なし（返信は話したメッセージを引用するので、だれのことか分かる） */
export function memberText(name: string | null): string {
  return (
    name
      ? [
          `${name}さんの対局の知らせを、このグループに届けます`,
          `จะส่งการแจ้งเตือนเกมของคุณ ${name} มาที่กลุ่มนี้`,
          `Game reminders for ${name} will be sent to this group`,
        ]
      : [
          "対局の知らせを、このグループに届けます",
          "จะส่งการแจ้งเตือนเกมของคุณมาที่กลุ่มนี้",
          "Your game reminders will be sent to this group",
        ]
  ).join("\n");
}

/** base64 の文字列をバイト列にする。base64 でなければ null */
function fromBase64(text: string) {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * X-Line-Signature（本文をチャネルシークレットで HMAC-SHA256 した値の base64）を確かめる。
 * Node.js と Workers の両方で動くよう Web Crypto を使い、比べるのは crypto.subtle.verify に任せる（かかる時間で中身が漏れない）
 */
export async function verifySignature(secret: string, body: string, signature: string | undefined): Promise<boolean> {
  const expected = signature ? fromBase64(signature) : null;
  if (!expected) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, expected, encoder.encode(body));
}

export interface WebhookOptions {
  /** Messaging API のチャネルアクセストークン。なければ記録だけして返信しない */
  token?: string;
  /** テストでは偽物に差し替える */
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** Webhook のイベントのうち、使うところだけ */
interface LineEvent {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { quoteToken?: string };
  left?: { members?: { userId?: string }[] };
}

/**
 * Webhook で受け取ったイベントを順に処理する。1 つのイベントで失敗しても、ほかは続ける。
 * 複数人トーク（room）もグループと同じに扱う（push の送り先にそのまま使える）
 */
export async function handleEvents(store: GameStore, events: unknown[], options: WebhookOptions): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const doFetch = options.fetch ?? fetch;
  const at = new Date(Date.now()).toISOString();
  const authorization = { Authorization: `Bearer ${options.token}` };

  const reply = async (replyToken: string | undefined, text: string, quoteToken?: string) => {
    if (!replyToken) return;
    if (!options.token) {
      log("LINE_MESSAGING_TOKEN がないので、グループへの返信は送りません");
      return;
    }
    const res = await doFetch(REPLY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text, ...(quoteToken ? { quoteToken } : {}) }] }),
    });
    if (!res.ok) log(`LINE のグループに返信できませんでした: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  };

  /** 名前：対局で使っている名前、なければ LINE の名前（グループのメンバーのプロフィール）。分からなければ null */
  const nameOf = async (chatId: string, kind: "group" | "room", userId: string): Promise<string | null> => {
    const name = await store.nameOfLineUser(userId);
    if (name) return name;
    if (!options.token) return null;
    try {
      const res = await doFetch(`https://api.line.me/v2/bot/${kind}/${chatId}/member/${userId}`, { headers: authorization });
      if (!res.ok) return null;
      const profile = (await res.json()) as { displayName?: unknown };
      return typeof profile.displayName === "string" && profile.displayName.trim()
        ? profile.displayName.trim().slice(0, MAX_NAME)
        : null;
    } catch {
      return null;
    }
  };

  for (const raw of events) {
    const event = (raw ?? {}) as LineEvent;
    const source = event.source;
    const kind = source?.type === "group" ? "group" : source?.type === "room" ? "room" : null;
    const chatId = kind === "group" ? source?.groupId : kind === "room" ? source?.roomId : undefined;
    // 1 対 1 のトーク（source.type が user）など、グループの外のイベントには何もしない
    if (!kind || !chatId) continue;
    try {
      switch (event.type) {
        case "join":
          await store.addLineGroup(chatId, at);
          await reply(event.replyToken, GREETING);
          break;
        case "leave":
          await store.removeLineGroup(chatId);
          break;
        case "message": {
          const userId = source?.userId;
          if (!userId) break;
          if (await store.seeGroupMember(chatId, userId, at)) {
            await reply(event.replyToken, memberText(await nameOf(chatId, kind, userId)), event.message?.quoteToken);
          }
          break;
        }
        case "memberLeft":
          for (const member of event.left?.members ?? []) {
            if (member.userId) await store.removeGroupMember(chatId, member.userId);
          }
          break;
      }
    } catch (e) {
      log(`LINE の Webhook のイベント（${event.type}）を処理できませんでした: ${String(e instanceof Error ? e.message : e)}`);
    }
  }
}
