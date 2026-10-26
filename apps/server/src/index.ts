import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { lineVerifier, parseChannelIds } from "./line.ts";
import { processAlarms, type PushOptions } from "./push.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? resolve(here, "../../../data/games.db");
const port = Number(process.env.PORT ?? 8787);
const production = process.env.NODE_ENV === "production";

mkdirSync(dirname(dbPath), { recursive: true });
const store = new GameStore(sqliteDb(dbPath));

const root = new Hono();
const channelIds = parseChannelIds(process.env.LINE_CHANNEL_IDS);
root.route(
  "/",
  createApp(store, {
    ...(channelIds.length ? { verifyLine: lineVerifier(channelIds) } : {}),
    lineOaId: process.env.LINE_OA_ID,
  }),
);

// 知らせの予定の処理。Workers の Cron Trigger の代わりに一定間隔で動かす（ALARM_INTERVAL_MS を 0 にすると止める）
const pushOptions = (): PushOptions => ({
  token: process.env.LINE_MESSAGING_TOKEN,
  liffId: process.env.LIFF_ID ?? "2012180396-nO920f3r",
  origin: process.env.APP_ORIGIN,
});
const alarmInterval = Number(process.env.ALARM_INTERVAL_MS ?? (production ? 15 * 60_000 : 60_000));
if (alarmInterval > 0) {
  setInterval(() => {
    processAlarms(store, pushOptions()).catch((e) => console.error("知らせの予定を処理できませんでした", e));
  }, alarmInterval);
}

if (!production) {
  /**
   * 開発のときだけ：知らせの予定を今すぐ処理する。本番（NODE_ENV=production）と Workers にはこの口はない。
   * 本文 { now?: ミリ秒, fake?: true }。now を先の時刻にすると、その時刻になったものとして処理する。
   * fake なら LINE には送らず、送るはずだった中身を返す（トークンがなくても）
   */
  root.post("/api/dev/alarms", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { now?: unknown; fake?: unknown };
    const now = typeof body.now === "number" ? body.now : Date.now();
    if (!body.fake) return c.json({ results: await processAlarms(store, { ...pushOptions(), now }) });
    const sent: unknown[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}");
    }) as unknown as typeof globalThis.fetch;
    const results = await processAlarms(store, { ...pushOptions(), token: "dev-fake-token", fetch, now });
    return c.json({ results, sent });
  });
}

// 本番ではビルド済みの画面（apps/web/dist）も同じサーバから配る
if (production) {
  const webDist = resolve(here, "../../web/dist");
  root.use("/*", serveStatic({ root: webDist }));
  root.get("*", serveStatic({ root: webDist, path: "index.html" }));
}

serve({ fetch: root.fetch, port }, (info) => {
  console.log(`server listening on http://localhost:${info.port} (db: ${dbPath})`);
});
