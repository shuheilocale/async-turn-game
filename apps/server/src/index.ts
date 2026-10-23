import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { lineVerifier, parseChannelIds } from "./line.ts";
import { sqliteDb } from "./sqlite.ts";
import { GameStore } from "./store.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? resolve(here, "../../../data/games.db");
const port = Number(process.env.PORT ?? 8787);

mkdirSync(dirname(dbPath), { recursive: true });
const store = new GameStore(sqliteDb(dbPath));

const root = new Hono();
const channelIds = parseChannelIds(process.env.LINE_CHANNEL_IDS);
root.route("/", createApp(store, channelIds.length ? { verifyLine: lineVerifier(channelIds) } : {}));

// 本番ではビルド済みの画面（apps/web/dist）も同じサーバから配る
if (process.env.NODE_ENV === "production") {
  const webDist = resolve(here, "../../web/dist");
  root.use("/*", serveStatic({ root: webDist }));
  root.get("*", serveStatic({ root: webDist, path: "index.html" }));
}

serve({ fetch: root.fetch, port }, (info) => {
  console.log(`server listening on http://localhost:${info.port} (db: ${dbPath})`);
});
