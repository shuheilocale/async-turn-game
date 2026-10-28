import { flexMessage, getGame, Mochi, type NameLang } from "@atg/core";
import { isMenuWord, MENU_QUICK_REPLY, menuMessage, type MenuGame } from "./menu.ts";
import { careReply, chatMoveOf, langsOf } from "./mochiChat.ts";
import { playMove } from "./moves.ts";
import type { GameStore } from "./store.ts";

/**
 * LINE の公式アカウント（Messaging API）の Webhook。2 人と公式アカウントのグループを記録して、時刻になったときの知らせを
 * そのグループへ届けられるようにする（送り先の決め方は push.ts）。
 * - join：グループに招待された → グループを記録して、返信であいさつ
 * - leave：グループから抜けた → グループの記録を消す
 * - message（グループの中で、だれが話したか分かるもの）→ その人をメンバーとして記録。初めての人にだけ返信する
 * - memberLeft → メンバーの記録を消す。memberJoined は記録しない（話したときに記録する）
 * - 「あそぶ」などのことば（menu.ts）を送ると、グループでも 1 対 1 のトークでも、ゲームのメニューを返信する
 * - 1 対 1 のトークでのそれ以外のメッセージには何もしない（返事もしない）
 * - postback：カードのボタン（もちのお世話など。mochiChat.ts）を押した → 押した人の手として指して、返信でようすを返す
 * 返信は reply API で送る（push と違って無料枠を使わない）
 */

export const REPLY_URL = "https://api.line.me/v2/bot/message/reply";

const MAX_NAME = 20;

/** join のあいさつ。グループには日本語とタイ語の人がいるので、3 言語を短く並べる */
export const GREETING = [
  "よろしくお願いします。このグループで遊ぶ人は、何かひとこと送ってください。対局の知らせをここに届けます。「あそぶ」と送ると、ゲームのメニューを出します",
  "ยินดีที่ได้รู้จัก ใครที่เล่นเกมในกลุ่มนี้ ช่วยส่งข้อความสั้นๆ มาหนึ่งข้อความ แล้วจะส่งการแจ้งเตือนเกมมาที่กลุ่มนี้ ส่งคำว่า \"เล่น\" เพื่อเปิดเมนูเกม",
  "Hello! If you play games in this group, please send any short message. Game reminders will be sent here. Send \"play\" to open the game menu.",
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

/** トークのボタンで指せなかったときの返信。押した人の言語がわからないので 3 言語を並べる */
export const POSTBACK_TEXTS = {
  not_participant: [
    "このボタンは、この対局で遊んでいる 2 人だけが使えます",
    "ปุ่มนี้ใช้ได้เฉพาะ 2 คนที่เล่นเกมนี้อยู่",
    "Only the two players in this game can use this button",
  ],
  game_over: ["この対局はもう終わっています", "เกมนี้จบไปแล้ว", "This game has already finished"],
  failed: [
    "うまく受け付けられませんでした。「開く」から試してください",
    "ทำรายการไม่สำเร็จ ลองกด \"เปิด\" แล้วทำในแอปนะ",
    "That didn't go through. Please try from \"Open\"",
  ],
} as const;

/** 同じ人が同じお世話のボタンをこの時間のうちにもう一度押したら、押し間違い（2 度押し）として何もしない */
export const DOUBLE_TAP_MS = 30_000;

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
  /** メニューのカードで開くミニアプリ（LIFF ID）。なければメニューを返さない */
  liffId?: string;
  /** 本番の URL（カードのアイコンに使う） */
  origin?: string;
  /** テストでは偽物に差し替える */
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** Webhook のイベントのうち、使うところだけ */
interface LineEvent {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string; quoteToken?: string };
  postback?: { data?: string };
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

  const send = async (replyToken: string | undefined, message: object) => {
    if (!replyToken) return;
    if (!options.token) {
      log("LINE_MESSAGING_TOKEN がないので、グループへの返信は送りません");
      return;
    }
    const res = await doFetch(REPLY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ replyToken, messages: [message] }),
    });
    if (!res.ok) log(`LINE のグループに返信できませんでした: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  };
  /** 文の返信。メニューを出すボタン（quick reply）を付ける */
  const reply = (replyToken: string | undefined, text: string, quoteToken?: string) =>
    send(replyToken, { type: "text", text, ...(quoteToken ? { quoteToken } : {}), quickReply: MENU_QUICK_REPLY });

  /** ゲームのメニューを返信する。遊んでいる途中の対局だけを並べる */
  const replyMenu = async (replyToken: string | undefined, chat: { groupId: string } | { lineUserId: string }) => {
    if (!options.liffId) return;
    const rows = await store.menuGames(chat);
    const games: MenuGame[] = [];
    const langs = new Set<string>();
    for (const row of rows) {
      const status = getGame(row.gameType)?.status(row.state);
      if (status?.kind !== "playing") continue;
      games.push({ id: row.id, gameType: row.gameType, status, names: row.names });
      for (const l of row.langs) langs.add(l);
    }
    const ls = [...langs].map((l) => (l === "en" || l === "th" ? l : "ja"));
    await send(replyToken, menuMessage(games, ls.length ? ls : ["ja", "th"], options.liffId, options.origin));
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

  /**
   * カードのボタン（postback）で指す。押した人を LINE のユーザー ID から対局の席に結びつけて、その人の手として指す。
   * 同じ時に画面から指されて版がずれたら、もう一度だけ最新の局面で試す
   */
  const playFromChat = async (event: LineEvent, inGroup: boolean) => {
    const chat = chatMoveOf(event.postback?.data);
    const userId = event.source?.userId;
    if (!chat || !userId) return;
    const fail = (key: keyof typeof POSTBACK_TEXTS) => reply(event.replyToken, POSTBACK_TEXTS[key].join("\n"));
    for (let tries = 0; tries < 2; tries++) {
      const game = await store.get(chat.gameId);
      if (!game) return fail("failed");
      const seat = await store.seatOfLineUser(game.id, userId);
      if (seat === null) return fail("not_participant");
      const def = getGame(game.gameType)!;
      const status = def.status(game.state);
      if (status.kind === "finished") return fail("game_over");
      // 版を持たないボタンなので、順番のないゲーム（いつ指してもよい）にかぎる
      if (status.kind !== "playing" || !status.free) return fail("failed");
      const move = chat.move as { care?: unknown };
      if (game.gameType === "mochi") {
        const last = Mochi.lastCareOf(game.state as Mochi.MochiState, seat);
        if (last && last.care === move.care && Date.now() - last.at < DOUBLE_TAP_MS) return;
      }
      const played = await playMove(store, game, seat, chat.move, game.version);
      if (!played.ok) {
        if (played.error === "version_conflict") continue;
        return fail(played.error === "game_over" ? "game_over" : "failed");
      }
      // グループなら 2 人の言語、1 対 1 なら押した人の言語
      const me = game.players.find((p) => p.seat === seat);
      const langs: NameLang[] = inGroup ? langsOf(game, seat) : [me?.lang === "en" || me?.lang === "th" ? me.lang : "ja"];
      if (game.gameType === "mochi" && options.liffId) {
        const care = (played.move as Mochi.MochiMove).care;
        return send(event.replyToken, flexMessage(careReply(game, played.game, seat, care, langs, options.liffId, options.origin)));
      }
      return;
    }
    return fail("failed");
  };

  for (const raw of events) {
    const event = (raw ?? {}) as LineEvent;
    const source = event.source;
    const kind = source?.type === "group" ? "group" : source?.type === "room" ? "room" : null;
    const chatId = kind === "group" ? source?.groupId : kind === "room" ? source?.roomId : undefined;
    const menuAsked = event.type === "message" && event.message?.type === "text" && isMenuWord(event.message.text ?? "");
    if (event.type === "postback") {
      try {
        if (kind && chatId && source?.userId) await store.seeGroupMember(chatId, source.userId, at);
        await playFromChat(event, !!kind);
      } catch (e) {
        log(`LINE のボタンを処理できませんでした: ${String(e instanceof Error ? e.message : e)}`);
      }
      continue;
    }
    // 1 対 1 のトーク（source.type が user）では、メニューのことばにだけ返事をする
    if (!kind || !chatId) {
      if (menuAsked && source?.type === "user" && source.userId) {
        await replyMenu(event.replyToken, { lineUserId: source.userId }).catch((e) =>
          log(`LINE のメニューを返せませんでした: ${String(e instanceof Error ? e.message : e)}`),
        );
      }
      continue;
    }
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
          const first = await store.seeGroupMember(chatId, userId, at);
          // メニューのことばなら、初めての人でもメニューを返す（返信は 1 回しかできないので、記録だけして案内は省く）
          if (menuAsked) await replyMenu(event.replyToken, { groupId: chatId });
          else if (first) await reply(event.replyToken, memberText(await nameOf(chatId, kind, userId)), event.message?.quoteToken);
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
