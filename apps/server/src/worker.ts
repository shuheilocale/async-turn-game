import { createApp } from "./app.ts";
import { d1Db, type D1Database } from "./d1.ts";
import { GameStore } from "./store.ts";

interface Env {
  DB: D1Database;
}

let cached: { db: D1Database; app: ReturnType<typeof createApp> } | undefined;

/**
 * Cloudflare Workers 用の入口。画面（apps/web/dist）は Workers の静的ファイル配信が返し、
 * /api/* だけがここに届く（wrangler.jsonc の assets.run_worker_first）。
 */
export default {
  fetch(request: Request, env: Env) {
    if (cached?.db !== env.DB) cached = { db: env.DB, app: createApp(new GameStore(d1Db(env.DB))) };
    return cached.app.fetch(request, env);
  },
};
