import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateGameResponse, JoinGameResponse, Seat } from "@atg/core";
import { createApp } from "./app.ts";
import { LIMIT_PER_GAME, LIMIT_PER_PERSON, noticeText, processAlarms, PUSH_URL, type PushOptions } from "./push.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

// テストでは "line:<userId>" という文字列を LINE の ID トークンの代わりに使う
const verifyLine = async (idToken: string) => (idToken.startsWith("line:") ? { userId: idToken.slice(5) } : null);

let store: GameStore;
let app: ReturnType<typeof createApp>;
let clock: ReturnType<typeof vi.spyOn>;
/** 日本の 12 時・タイの 10 時 */
const NOON = Date.UTC(2026, 9, 1, 3);
const HOUR = 3_600_000;

beforeEach(() => {
  store = new GameStore(sqliteDb(":memory:"));
  app = createApp(store, { verifyLine });
  clock = vi.spyOn(Date, "now").mockReturnValue(NOON);
});
afterEach(() => clock.mockRestore());

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

/** あき（日本・ja）と Som（タイ・th）の対局。line を false にした人は LINE の外から参加する */
async function setupGame(gameType = "tictactoe", line: [boolean, boolean] = [true, true]) {
  const created = (await (
    await post("/games", {
      gameType,
      name: "あき",
      seat: 0,
      lang: "ja",
      timeZone: "Asia/Tokyo",
      idToken: line[0] ? "line:U-aki" : undefined,
    })
  ).json()) as CreateGameResponse;
  const joined = (await (
    await post(`/games/${created.id}/join`, {
      inviteCode: created.inviteCode,
      name: "Som",
      lang: "th",
      timeZone: "Asia/Bangkok",
      idToken: line[1] ? "line:U-som" : undefined,
    })
  ).json()) as JoinGameResponse;
  return { id: created.id, tokens: [created.token, joined.token] };
}

/** 予定をじかに入れる（もちの知らせなどを好きな時刻にするため） */
async function setAlarm(id: string, seats: Seat[], at: number, kind = "hungry") {
  const game = (await store.get(id))!;
  await store.setAlarms(id, game.version, seats.map((seat) => ({ seat, at, kind })));
}

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: { to: string; messages: { type: string; altText: string; contents: any }[] };
}

/** LINE の代わり。送られた中身を覚え、statusOf で相手ごとの返事を決める */
function fakeLine(statusOf: (to: string) => number | "throw" = () => 200) {
  const sent: Sent[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url, headers: init.headers as Record<string, string>, body });
    const status = statusOf(body.to);
    if (status === "throw") throw new Error("network down");
    return new Response(status === 200 ? "{}" : '{"message":"Not found"}', { status });
  }) as unknown as typeof globalThis.fetch;
  return { sent, fetch };
}

const options = (fetch: typeof globalThis.fetch, now: number, extra: Partial<PushOptions> = {}): PushOptions => ({
  token: "tk",
  liffId: "2012180396-test",
  origin: "https://example.com",
  fetch,
  now,
  log: () => {},
  ...extra,
});

describe("時刻になったら LINE で知らせる", () => {
  it("時刻を過ぎた予定を、受け取る人の言語のカードで push し、予定を消す（時刻の前は送らない）", async () => {
    const { id } = await setupGame();
    const line = fakeLine();
    const due = NOON + 24 * HOUR;
    await processAlarms(store, options(line.fetch, due - 60_000));
    expect(line.sent).toHaveLength(0);

    const results = await processAlarms(store, options(line.fetch, due));
    expect(results.map((r) => r.result)).toEqual(["sent"]);
    expect(line.sent).toHaveLength(1);
    const [push] = line.sent;
    expect(push!.url).toBe(PUSH_URL);
    expect(push!.headers.Authorization).toBe("Bearer tk");
    expect(push!.body.to).toBe("U-aki");
    const message = push!.body.messages[0]!;
    expect(message.altText).toBe("あきさん、『マルバツ』であなたの番です");
    // 画面から送るカードと同じ形：左にアイコン、右に文、下に「開く」ボタン
    expect(message.contents.size).toBe("kilo");
    const [icon, texts] = message.contents.body.contents;
    expect(icon.contents[0].url).toBe("https://example.com/icons/tictactoe.png");
    expect(texts.contents.map((t: { text: string }) => t.text)).toEqual(["マルバツ", "あきさん、『マルバツ』であなたの番です"]);
    expect(message.contents.footer.contents[0].action).toEqual({
      type: "uri",
      label: "開く",
      uri: `https://miniapp.line.me/2012180396-test/g/${id}`,
    });

    expect(await store.alarms(id)).toEqual([]);
    expect((await store.notices(id)).map((n) => [n.lineUserId, n.kind, n.status])).toEqual([["U-aki", "stalled", "sent"]]);
    // もう一度処理しても送らない
    await processAlarms(store, options(line.fetch, due + HOUR));
    expect(line.sent).toHaveLength(1);
  });

  it("文面は受け取る人の言語で、ゲームの知らせの種類ごとに作る", () => {
    expect(noticeText("ja", "mochi", "hungry", "あき")).toBe("もちがおなかをすかせています");
    expect(noticeText("ja", "mochi", "wake", "あき")).toBe("もちが目をさましました");
    expect(noticeText("ja", "mochi", "hatched", "あき")).toBe("卵がかえりました！");
    expect(noticeText("ja", "mochi", "grown", "あき")).toBe("もちがおとなになれそうです");
    expect(noticeText("ja", "mochi", "lonely", "あき")).toBe("もちがさみしそうです");
    expect(noticeText("en", "othello", "stalled", "Som")).toBe("Som, it's your turn in Othello");
    expect(noticeText("th", "mochi", "hungry", "Som")).toBe("โมจิหิวแล้ว");
    // 表にない種類でも、ゲーム名で知らせる
    expect(noticeText("ja", "othello", "unknown", "あき")).toBe("『オセロ』からのお知らせです");
  });

  it("夜（受け取る人の 22 時〜8 時）は、その人の朝 8 時まで遅らせる（2 人で時刻が違えば人ごと）", async () => {
    const { id } = await setupGame("mochi");
    // 日本の 23:30・タイの 21:30
    const night = Date.UTC(2026, 9, 1, 14, 30);
    await setAlarm(id, [0, 1], night);
    const line = fakeLine();
    const results = await processAlarms(store, options(line.fetch, night));
    expect(results.map((r) => [r.seat, r.result])).toEqual([
      [0, "deferred"],
      [1, "sent"],
    ]);
    expect(line.sent.map((s) => [s.body.to, s.body.messages[0]!.altText])).toEqual([["U-som", "โมจิหิวแล้ว"]]);
    const morning = Date.UTC(2026, 9, 1, 23); // 日本の 8 時
    expect(await store.alarms(id)).toEqual([{ seat: 0, at: morning, kind: "hungry" }]);

    await processAlarms(store, options(line.fetch, morning - 60_000));
    expect(line.sent).toHaveLength(1);
    await processAlarms(store, options(line.fetch, morning));
    expect(line.sent.map((s) => s.body.to)).toEqual(["U-som", "U-aki"]);
    expect(line.sent[1]!.body.messages[0]!.altText).toBe("もちがおなかをすかせています");
  });

  it(`同じ対局で 1 人に 1 日 ${LIMIT_PER_GAME} 通、全部の対局で 1 日 ${LIMIT_PER_PERSON} 通まで。超えた分は送らない`, async () => {
    const line = fakeLine();
    const games = [await setupGame("mochi"), await setupGame("mochi"), await setupGame("mochi")];
    let now = NOON;
    const sendTo = async (id: string) => {
      now += 10 * 60_000;
      await setAlarm(id, [0], now);
      return (await processAlarms(store, options(line.fetch, now)))[0]!.result;
    };
    const first = games[0]!.id;
    expect([await sendTo(first), await sendTo(first), await sendTo(first), await sendTo(first)]).toEqual([
      "sent",
      "sent",
      "sent",
      "limited",
    ]);
    // 予定は送らなくても消す
    expect(await store.alarms(first)).toEqual([]);
    expect([await sendTo(games[1]!.id), await sendTo(games[1]!.id), await sendTo(games[2]!.id), await sendTo(games[2]!.id)]).toEqual([
      "sent",
      "sent",
      "sent",
      "limited",
    ]);
    expect(line.sent).toHaveLength(LIMIT_PER_PERSON);
    // 1 日たてば、また送れる
    now = NOON + 25 * HOUR;
    expect(await sendTo(first)).toBe("sent");
  });

  it("2 つの処理が同時に動いても、同じ予定は 1 回しか送らない", async () => {
    const { id } = await setupGame("mochi");
    await setAlarm(id, [0, 1], NOON);
    const line = fakeLine();
    await Promise.all([processAlarms(store, options(line.fetch, NOON)), processAlarms(store, options(line.fetch, NOON))]);
    expect(line.sent.map((s) => s.body.to).sort()).toEqual(["U-aki", "U-som"]);
  });

  it("トークンがなければ何も送らず、ログに 1 行だけ書く（予定は残す。時刻を過ぎた予定がなければ書かない）", async () => {
    const { id } = await setupGame("mochi");
    const line = fakeLine();
    const log = vi.fn();
    await processAlarms(store, options(line.fetch, NOON, { token: undefined, log }));
    expect(log).not.toHaveBeenCalled();
    await setAlarm(id, [0, 1], NOON);
    expect(await processAlarms(store, options(line.fetch, NOON, { token: undefined, log }))).toEqual([]);
    expect(line.sent).toHaveLength(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain("LINE_MESSAGING_TOKEN");
    expect(await store.alarms(id)).toHaveLength(2);
  });

  it("友だちでない（403 など）・通信に失敗しても、ほかの送信と予定の処理は止めない", async () => {
    const a = await setupGame("mochi");
    const b = await setupGame("mochi");
    await setAlarm(a.id, [0, 1], NOON);
    await setAlarm(b.id, [0, 1], NOON + 1);
    const line = fakeLine((to) => (to === "U-aki" ? 403 : 200));
    let calls = 0;
    const flaky = (async (url: string, init: RequestInit) => {
      // 2 通目だけ通信に失敗する
      if (++calls === 2) throw new Error("network down");
      return line.fetch(url, init);
    }) as unknown as typeof fetch;
    const results = await processAlarms(store, options(flaky, NOON + 1));
    expect(results.map((r) => r.result)).toEqual(["failed", "failed", "failed", "sent"]);
    expect(await store.alarms(a.id)).toEqual([]);
    expect(await store.alarms(b.id)).toEqual([]);
    expect((await store.notices(a.id)).map((n) => [n.lineUserId, n.status, n.detail])).toEqual([
      ["U-aki", "failed", expect.stringContaining("403")],
      ["U-som", "failed", expect.stringContaining("network down")],
    ]);
  });

  it("LINE とつながっていない人には送らない（予定は消す）", async () => {
    const { id } = await setupGame("mochi", [true, false]);
    await setAlarm(id, [0, 1], NOON);
    const line = fakeLine();
    const results = await processAlarms(store, options(line.fetch, NOON));
    expect(results.map((r) => [r.seat, r.result])).toEqual([
      [0, "sent"],
      [1, "unlinked"],
    ]);
    expect(line.sent.map((s) => s.body.to)).toEqual(["U-aki"]);
    expect(await store.alarms(id)).toEqual([]);
  });

  it("遅れすぎた予定（1 日以上前）は送らずに消す（トークンを入れたときに古い知らせがまとめて届かないように）", async () => {
    const { id } = await setupGame("mochi");
    await setAlarm(id, [0], NOON);
    const line = fakeLine();
    const results = await processAlarms(store, options(line.fetch, NOON + 25 * HOUR));
    expect(results.map((r) => r.result)).toEqual(["stale"]);
    expect(line.sent).toHaveLength(0);
    expect(await store.alarms(id)).toEqual([]);
  });

  it("https でない（手元の）origin ではアイコンを付けない", async () => {
    const { id } = await setupGame("mochi");
    await setAlarm(id, [0], NOON);
    const line = fakeLine();
    await processAlarms(store, options(line.fetch, NOON, { origin: "http://localhost:8787" }));
    expect(line.sent[0]!.body.messages[0]!.contents.body.contents).toHaveLength(1);
  });
});

/** グループで話したことにする（Webhook の message の代わり） */
async function inGroup(groupId: string, users: string[], at = NOON) {
  for (const user of users) await store.seeGroupMember(groupId, user, new Date(at).toISOString());
}

describe("2 人と公式アカウントのグループに知らせる", () => {
  it("2 人ともメンバーのグループがあれば、2 人分の予定を 1 通にまとめてグループへ送り、2 人の言語で並べる", async () => {
    const { id } = await setupGame("mochi");
    await inGroup("C-g1", ["U-aki", "U-som"]);
    await setAlarm(id, [0, 1], NOON);
    const line = fakeLine();
    const results = await processAlarms(store, options(line.fetch, NOON));
    expect(results.map((r) => [r.seat, r.result, r.groupId])).toEqual([
      [0, "sent", "C-g1"],
      [1, "sent", "C-g1"],
    ]);
    expect(line.sent).toHaveLength(1);
    const push = line.sent[0]!;
    expect(push.body.to).toBe("C-g1");
    const message = push.body.messages[0]!;
    expect(message.altText).toBe("もちがおなかをすかせています／โมจิหิวแล้ว");
    const [, texts] = message.contents.body.contents;
    expect(texts.contents.map((t: { text: string }) => t.text)).toEqual([
      "ふたりのもち／โมจิของเรา",
      "もちがおなかをすかせています／โมจิหิวแล้ว",
    ]);
    expect(message.contents.footer.contents[0].action.label).toBe("開く／เปิด");
    expect(await store.alarms(id)).toEqual([]);
    // 記録は 2 人それぞれに 1 行。グループへ送ったと分かる
    expect((await store.notices(id)).map((n) => [n.seat, n.lineUserId, n.status, n.groupId])).toEqual([
      [0, "U-aki", "sent", "C-g1"],
      [1, "U-som", "sent", "C-g1"],
    ]);
  });

  it("2 人の言語が同じなら 1 言語で書く", async () => {
    const { id } = await setupGame("mochi");
    await store.setLang(id, 1, "ja");
    await store.setTimeZone(id, 1, "Asia/Tokyo");
    await inGroup("C-g1", ["U-aki", "U-som"]);
    await setAlarm(id, [0, 1], NOON);
    const line = fakeLine();
    await processAlarms(store, options(line.fetch, NOON));
    expect(line.sent.map((s) => [s.body.to, s.body.messages[0]!.altText])).toEqual([["C-g1", "もちがおなかをすかせています"]]);
  });

  it("手番の人への知らせ（stalled）も、その人の名前で 2 言語にしてグループへ送り、記録は 2 人それぞれに残す", async () => {
    const { id } = await setupGame();
    await inGroup("C-g1", ["U-aki", "U-som"]);
    const line = fakeLine();
    await processAlarms(store, options(line.fetch, NOON + 24 * HOUR));
    expect(line.sent.map((s) => [s.body.to, s.body.messages[0]!.altText])).toEqual([
      ["C-g1", "あきさん、『マルバツ』であなたの番です／あき ถึงตาคุณแล้วใน โอเอ็กซ์"],
    ]);
    expect((await store.notices(id)).map((n) => [n.lineUserId, n.kind, n.groupId])).toEqual([
      ["U-aki", "stalled", "C-g1"],
      ["U-som", "stalled", "C-g1"],
    ]);
  });

  it("まだ時刻になっていない相手の分も、同じ種類の予定なら 1 通にまとめる（あとから同じ知らせを 2 回送らない）", async () => {
    const { id } = await setupGame("mochi");
    await inGroup("C-g1", ["U-aki", "U-som"]);
    const game = (await store.get(id))!;
    await store.setAlarms(id, game.version, [
      { seat: 0, at: NOON, kind: "hungry" },
      { seat: 1, at: NOON + HOUR, kind: "hungry" },
    ]);
    const line = fakeLine();
    await processAlarms(store, options(line.fetch, NOON));
    expect(line.sent).toHaveLength(1);
    expect(await store.alarms(id)).toEqual([]);
    await processAlarms(store, options(line.fetch, NOON + HOUR));
    expect(line.sent).toHaveLength(1);
  });

  it("どちらか 1 人しかメンバーでなければ、今までどおり 1 対 1 で送る", async () => {
    const { id } = await setupGame("mochi");
    await inGroup("C-g1", ["U-aki"]);
    await inGroup("C-g2", ["U-som", "U-nok"]);
    await setAlarm(id, [0, 1], NOON);
    const line = fakeLine();
    const results = await processAlarms(store, options(line.fetch, NOON));
    expect(results.map((r) => [r.result, r.groupId])).toEqual([
      ["sent", undefined],
      ["sent", undefined],
    ]);
    expect(line.sent.map((s) => [s.body.to, s.body.messages[0]!.altText])).toEqual([
      ["U-aki", "もちがおなかをすかせています"],
      ["U-som", "โมจิหิวแล้ว"],
    ]);
    expect((await store.notices(id)).map((n) => n.groupId)).toEqual([null, null]);
  });

  it("2 人がそろったグループが複数あれば、いちばん最近使われた（話した）グループへ送る。抜けたら別のグループへ", async () => {
    const { id } = await setupGame("mochi");
    await inGroup("C-old", ["U-aki", "U-som"], NOON - 2 * HOUR);
    await inGroup("C-new", ["U-aki", "U-som"], NOON - HOUR);
    await inGroup("C-new", ["U-som"], NOON - 20 * 60_000);
    const line = fakeLine();
    await setAlarm(id, [0, 1], NOON);
    await processAlarms(store, options(line.fetch, NOON));
    expect(line.sent.map((s) => s.body.to)).toEqual(["C-new"]);

    // C-new から Som が抜けると、C-old へ
    await store.removeGroupMember("C-new", "U-som");
    await setAlarm(id, [0, 1], NOON + HOUR);
    await processAlarms(store, options(line.fetch, NOON + HOUR));
    expect(line.sent.map((s) => s.body.to)).toEqual(["C-new", "C-old"]);
  });

  it("グループのときは、2 人のどちらかが夜なら、2 人とも昼になるまで遅らせる（日本とタイなら日本の 10 時）", async () => {
    const { id } = await setupGame("mochi");
    await inGroup("C-g1", ["U-aki", "U-som"]);
    const line = fakeLine();
    // 日本の 23:30・タイの 21:30（日本だけ夜）
    const night = Date.UTC(2026, 9, 1, 14, 30);
    await setAlarm(id, [0, 1], night);
    const results = await processAlarms(store, options(line.fetch, night));
    const both = Date.UTC(2026, 9, 2, 1); // 日本の 10 時・タイの 8 時
    expect(results.map((r) => [r.seat, r.result, r.until])).toEqual([
      [0, "deferred", both],
      [1, "deferred", both],
    ]);
    expect(await store.alarms(id)).toEqual([
      { seat: 0, at: both, kind: "hungry" },
      { seat: 1, at: both, kind: "hungry" },
    ]);
    // 日本の 8 時（タイは 6 時で夜）でもまだ送らない
    await processAlarms(store, options(line.fetch, Date.UTC(2026, 9, 1, 23)));
    expect(line.sent).toHaveLength(0);
    await processAlarms(store, options(line.fetch, both));
    expect(line.sent.map((s) => s.body.to)).toEqual(["C-g1"]);

    // 日本の 8:30・タイの 6:30（タイだけ夜）も、タイの 8 時まで遅らせる
    const early = Date.UTC(2026, 9, 2, 23, 30);
    await setAlarm(id, [0, 1], early);
    expect((await processAlarms(store, options(line.fetch, early))).map((r) => [r.result, r.until])).toEqual([
      ["deferred", Date.UTC(2026, 9, 3, 1)],
      ["deferred", Date.UTC(2026, 9, 3, 1)],
    ]);
    // 日本の 22:30・タイの 20:30（日本だけ夜）は、次の日の日本の 10 時まで
    const late = Date.UTC(2026, 9, 3, 13, 30);
    await setAlarm(id, [0, 1], late);
    expect((await processAlarms(store, options(line.fetch, late))).map((r) => r.until)).toEqual([
      Date.UTC(2026, 9, 4, 1),
      Date.UTC(2026, 9, 4, 1),
    ]);
  });

  it(`グループへの 1 通は 2 人それぞれに 1 ずつ数え、同じ対局で 1 日 ${LIMIT_PER_GAME} 通・全部で ${LIMIT_PER_PERSON} 通を超えたら送らない`, async () => {
    const games = [await setupGame("mochi"), await setupGame("mochi"), await setupGame("mochi")];
    await inGroup("C-g1", ["U-aki", "U-som"]);
    const line = fakeLine();
    let now = NOON;
    const sendTo = async (id: string) => {
      now += 10 * 60_000;
      await setAlarm(id, [0, 1], now);
      return (await processAlarms(store, options(line.fetch, now))).map((r) => r.result).join(",");
    };
    const first = games[0]!.id;
    expect([await sendTo(first), await sendTo(first), await sendTo(first), await sendTo(first)]).toEqual([
      "sent,sent",
      "sent,sent",
      "sent,sent",
      "limited,limited",
    ]);
    expect((await store.notices(first)).slice(-2).map((n) => [n.lineUserId, n.status, n.detail, n.groupId])).toEqual([
      ["U-aki", "limited", "per_game", "C-g1"],
      ["U-som", "limited", "per_game", "C-g1"],
    ]);
    expect(await store.alarms(first)).toEqual([]);
    expect([await sendTo(games[1]!.id), await sendTo(games[1]!.id), await sendTo(games[1]!.id), await sendTo(games[2]!.id)]).toEqual([
      "sent,sent",
      "sent,sent",
      "sent,sent",
      "limited,limited",
    ]);
    expect((await store.notices(games[2]!.id)).map((n) => n.detail)).toEqual(["per_person", "per_person"]);
    expect(line.sent).toHaveLength(LIMIT_PER_PERSON);
  });

  it("1 人が 1 対 1 で受け取った分も、グループの上限に数える（どちらか 1 人が上限なら送らない）", async () => {
    const pair = await setupGame("mochi");
    await inGroup("C-g1", ["U-aki", "U-som"]);
    const line = fakeLine();
    let now = NOON;
    // 相手が LINE の外から参加した対局は 1 対 1（同じ対局の上限に当たらないよう、毎回新しい対局で）
    for (let i = 0; i < LIMIT_PER_PERSON; i++) {
      now += 10 * 60_000;
      const { id } = await setupGame("mochi", [true, false]);
      await setAlarm(id, [0], now);
      expect((await processAlarms(store, options(line.fetch, now)))[0]!.result).toBe("sent");
    }
    now += 10 * 60_000;
    await setAlarm(pair.id, [0, 1], now);
    expect((await processAlarms(store, options(line.fetch, now))).map((r) => r.result)).toEqual(["limited", "limited"]);
    expect((await store.notices(pair.id)).map((n) => [n.lineUserId, n.detail])).toEqual([
      ["U-aki", "per_person"],
      ["U-som", "per_person"],
    ]);
  });
});
