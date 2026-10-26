import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateGameResponse, JoinGameResponse } from "@atg/core";
import { createApp } from "./app.ts";
import { processAlarms } from "./push.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";
import { REPLY_URL, verifySignature } from "./webhook.ts";

// テストでは "line:<userId>" という文字列を LINE の ID トークンの代わりに使う
const verifyLine = async (idToken: string) => (idToken.startsWith("line:") ? { userId: idToken.slice(5) } : null);
const SECRET = "channel-secret";
const NOON = Date.UTC(2026, 9, 1, 3);

interface Call {
  url: string;
  method: string;
  body: any;
}

/** LINE の代わり。送られた中身を覚える。プロフィールの問い合わせには profiles の名前を返す（なければ 404） */
function fakeLine(profiles: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null });
    const member = url.match(/\/member\/([^/]+)$/);
    if (member) {
      const name = profiles[member[1]!];
      return name ? Response.json({ displayName: name, userId: member[1] }) : new Response("{}", { status: 404 });
    }
    return new Response("{}");
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch, replies: () => calls.filter((c) => c.url === REPLY_URL) };
}

let store: GameStore;
let line: ReturnType<typeof fakeLine>;
let app: ReturnType<typeof createApp>;
let clock: ReturnType<typeof vi.spyOn>;

const setup = (secret: string | undefined, profiles: Record<string, string> = {}) => {
  line = fakeLine(profiles);
  app = createApp(store, { verifyLine, messaging: { secret, token: "tk", fetch: line.fetch } });
};

beforeEach(() => {
  store = new GameStore(sqliteDb(":memory:"));
  clock = vi.spyOn(Date, "now").mockReturnValue(NOON);
  setup(SECRET);
});
afterEach(() => clock.mockRestore());

const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("base64");

/** Webhook に、正しい署名を付けたイベントを送る */
const deliver = (events: object[], signature?: string) => {
  const body = JSON.stringify({ destination: "Ubot", events });
  return app.request("/api/line/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Line-Signature": signature ?? sign(body) },
    body,
  });
};

const group = (userId?: string) => ({ type: "group", groupId: "C-g1", ...(userId ? { userId } : {}) });
const join = () => ({ type: "join", replyToken: "rt-join", source: group(), timestamp: NOON });
const said = (userId: string, source: object = group(userId), replyToken = `rt-${userId}`) => ({
  type: "message",
  replyToken,
  source,
  message: { type: "text", id: "m1", text: "hi", quoteToken: `q-${userId}` },
  timestamp: NOON,
});

describe("LINE の Webhook", () => {
  it("署名（X-Line-Signature）をチャネルシークレットの HMAC-SHA256 で確かめる。合わなければ 401", async () => {
    const body = JSON.stringify({ events: [] });
    expect(await verifySignature(SECRET, body, sign(body))).toBe(true);
    expect(await verifySignature(SECRET, body, sign(body, "other"))).toBe(false);
    expect(await verifySignature(SECRET, body + " ", sign(body))).toBe(false);
    expect(await verifySignature(SECRET, body, undefined)).toBe(false);
    expect(await verifySignature(SECRET, body, "%%not-base64%%")).toBe(false);

    expect((await deliver([join()], sign("{}"))).status).toBe(401);
    expect(await store.lineGroup("C-g1")).toBeNull();
    expect(line.calls).toHaveLength(0);
    const res = await app.request("/api/line/webhook", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("LINE の「検証」（イベントなし）には 200 を返す", async () => {
    expect((await deliver([])).status).toBe(200);
  });

  it("チャネルシークレットがなければ 503 を返し、ログに 1 行書く", async () => {
    setup(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect((await deliver([join()])).status).toBe(503);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]![0]).toContain("LINE_MESSAGING_SECRET");
    } finally {
      log.mockRestore();
    }
    expect(await store.lineGroup("C-g1")).toBeNull();
  });

  it("グループに招待されたら（join）記録し、返信で 3 言語のあいさつをする", async () => {
    expect((await deliver([join()])).status).toBe(200);
    expect(await store.lineGroup("C-g1")).toEqual({ groupId: "C-g1", members: [] });
    const [reply] = line.replies();
    expect(line.replies()).toHaveLength(1);
    expect(reply!.body.replyToken).toBe("rt-join");
    const text: string = reply!.body.messages[0].text;
    expect(text).toContain("よろしくお願いします。このグループで遊ぶ人は、何かひとこと送ってください。対局の知らせをここに届けます");
    expect(text).toMatch(/[฀-๿]/); // タイ語
    expect(text).toContain("send");
  });

  it("グループで話した人をメンバーとして記録し、初めての人にだけ名前（対局で使っている名前）入りで返信する", async () => {
    // あきは対局に参加している（LINE の名前より対局の名前を使う）
    await (await app.request("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "tictactoe", name: "あき", seat: 0, idToken: "line:U-aki" }),
    })).json();
    setup(SECRET, { "U-aki": "Aki LINE", "U-som": "Som" });
    await deliver([join()]);
    await deliver([said("U-aki")]);
    const replies = line.replies();
    expect(replies).toHaveLength(2);
    expect(replies[1]!.body.replyToken).toBe("rt-U-aki");
    const message = replies[1]!.body.messages[0];
    expect(message.text).toContain("あきさんの対局の知らせを、このグループに届けます");
    expect(message.text).toContain("Game reminders for あき will be sent to this group");
    expect(message.quoteToken).toBe("q-U-aki");
    expect(message.text).not.toContain("Aki LINE");

    // 対局に出ていない人は LINE の名前
    await deliver([said("U-som")]);
    expect(line.replies()[2]!.body.messages[0].text).toContain("Somさんの対局の知らせを、このグループに届けます");
    // グループのメンバーのプロフィールを問い合わせる
    expect(line.calls.some((c) => c.url === "https://api.line.me/v2/bot/group/C-g1/member/U-som")).toBe(true);

    // 2 回目からは返信しない（話した時刻だけ新しくする）
    clock.mockReturnValue(NOON + 60_000);
    await deliver([said("U-aki")]);
    expect(line.replies()).toHaveLength(3);
    expect(await store.lineGroup("C-g1")).toEqual({
      groupId: "C-g1",
      members: [
        { lineUserId: "U-aki", seenAt: new Date(NOON + 60_000).toISOString() },
        { lineUserId: "U-som", seenAt: new Date(NOON).toISOString() },
      ],
    });
  });

  it("名前が分からなければ名前なしで返信する。join を受け取っていないグループでも、話せばグループごと記録する", async () => {
    await deliver([said("U-nok")]);
    const text: string = line.replies()[0]!.body.messages[0].text;
    expect(text).toContain("対局の知らせを、このグループに届けます");
    expect(text).not.toContain("さん");
    expect((await store.lineGroup("C-g1"))?.members.map((m) => m.lineUserId)).toEqual(["U-nok"]);
  });

  it("Webhook を公開する前に招待されて join を取りこぼしたグループでも、2 人が話せば記録され、知らせがそこへ届く", async () => {
    const post = (path: string, body: object) =>
      app.request(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = (await (await post("/games", { gameType: "mochi", name: "あき", seat: 0, idToken: "line:U-aki" })).json()) as CreateGameResponse;
    await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "Som", idToken: "line:U-som" });

    // join は届かず、いきなりグループの中のメッセージが届く
    await deliver([said("U-aki"), said("U-som")]);
    expect(await store.lineGroup("C-g1")).toEqual({
      groupId: "C-g1",
      members: [
        { lineUserId: "U-aki", seenAt: new Date(NOON).toISOString() },
        { lineUserId: "U-som", seenAt: new Date(NOON).toISOString() },
      ],
    });
    expect(line.replies()).toHaveLength(2);
    expect(await store.noticeGroupOf(created.id)).toBe("C-g1");

    const game = (await store.get(created.id))!;
    await store.setAlarms(created.id, game.version, [0, 1].map((seat) => ({ seat: seat as 0 | 1, at: NOON, kind: "hungry" })));
    const sent: string[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).to);
      return new Response("{}");
    }) as unknown as typeof globalThis.fetch;
    await processAlarms(store, { token: "tk", liffId: "x", fetch, now: NOON, log: () => {} });
    expect(sent).toEqual(["C-g1"]);
  });

  it("1 対 1 のトークでのメッセージ・userId のないメッセージには何もしない（返事もしない）", async () => {
    await deliver([said("U-aki", { type: "user", userId: "U-aki" })]);
    await deliver([said("U-aki", { type: "group", groupId: "C-g2" })]);
    expect(line.calls).toHaveLength(0);
    expect(await store.lineGroup("C-g2")).toBeNull();
  });

  it("memberJoined は記録しない。memberLeft はメンバーを消し、leave はグループごと消す", async () => {
    await deliver([join(), said("U-aki"), said("U-som")]);
    await deliver([{ type: "memberJoined", replyToken: "rt", source: group(), joined: { members: [{ type: "user", userId: "U-nok" }] } }]);
    expect((await store.lineGroup("C-g1"))?.members.map((m) => m.lineUserId)).toEqual(["U-aki", "U-som"]);

    await deliver([{ type: "memberLeft", source: group(), left: { members: [{ type: "user", userId: "U-som" }] } }]);
    expect((await store.lineGroup("C-g1"))?.members.map((m) => m.lineUserId)).toEqual(["U-aki"]);

    await deliver([{ type: "leave", source: group() }]);
    expect(await store.lineGroup("C-g1")).toBeNull();
    // 招待し直したら、話した人をまた初めての人として記録する
    await deliver([join(), said("U-aki")]);
    expect(line.replies()).toHaveLength(5);
  });

  it("複数人トーク（room）も同じように扱う", async () => {
    await deliver([said("U-aki", { type: "room", roomId: "R-r1", userId: "U-aki" })]);
    expect((await store.lineGroup("R-r1"))?.members.map((m) => m.lineUserId)).toEqual(["U-aki"]);
  });
});

describe("画面に渡す設定（/api/config）", () => {
  async function lineGame() {
    const post = (path: string, body: object) =>
      app.request(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = (await (await post("/games", { gameType: "mochi", name: "あき", seat: 0, idToken: "line:U-aki" })).json()) as CreateGameResponse;
    const joined = (await (
      await post(`/games/${created.id}/join`, { inviteCode: created.inviteCode, name: "Som", idToken: "line:U-som" })
    ).json()) as JoinGameResponse;
    return { id: created.id, tokens: [created.token, joined.token] as const };
  }
  const config = async (query = "", token?: string) =>
    (await app.request(`/api/config${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).json();

  it("対局の ID と合言葉を渡すと、その 2 人がそろったグループがあるかを返す（ほかの人には返さない）", async () => {
    const { id, tokens } = await lineGame();
    expect(await config()).toEqual({ lineOaId: null });
    expect(await config(`?game=${id}`, tokens[0])).toEqual({ lineOaId: null, noticeGroup: false });
    await deliver([said("U-aki")]);
    expect(await config(`?game=${id}`, tokens[0])).toEqual({ lineOaId: null, noticeGroup: false });
    await deliver([said("U-som")]);
    expect(await config(`?game=${id}`, tokens[0])).toEqual({ lineOaId: null, noticeGroup: true });
    expect(await config(`?game=${id}`, tokens[1])).toEqual({ lineOaId: null, noticeGroup: true });
    // 合言葉がない・違えば返さない
    expect(await config(`?game=${id}`)).toEqual({ lineOaId: null });
    expect(await config(`?game=${id}`, "bogus")).toEqual({ lineOaId: null });
  });
});
