// Cloudflare の型パッケージを丸ごと入れずに済むよう、ExecutionContext は Hono の型を使う
import type { ExecutionContext } from "hono";
import { createApp } from "./app.ts";
import { d1Db, type D1Database } from "./d1.ts";
import { lineVerifier, parseChannelIds } from "./line.ts";
import { processAlarms } from "./push.ts";
import { GameStore } from "./store.ts";

interface Env {
  DB: D1Database;
  /** LINE ミニアプリのチャネル ID（開発用・審査用・本番用）をカンマ区切りで */
  LINE_CHANNEL_IDS?: string;
  /** LINE ミニアプリの LIFF ID。知らせのカードの「開く」ボタン（https://miniapp.line.me/<LIFF ID>/g/<対局ID>）に使う */
  LIFF_ID: string;
  /** 公開している URL。知らせのカードのアイコン（/icons/<ゲームID>.png）に使う */
  APP_ORIGIN?: string;
  /** LINE の公式アカウントの ID（@xxxx）。画面に公式アカウントを入れたグループの案内を出す。なければ出さない */
  LINE_OA_ID?: string;
  /** Messaging API のチャネルアクセストークン（長期）。secret で入れる。なければ知らせを送らない */
  LINE_MESSAGING_TOKEN?: string;
  /** Messaging API のチャネルシークレット。secret で入れる。Webhook の署名を確かめる。なければ Webhook を受け付けない */
  LINE_MESSAGING_SECRET?: string;
}


let cached: { db: D1Database; store: GameStore; app: ReturnType<typeof createApp> } | undefined;

function setup(env: Env) {
  if (cached?.db !== env.DB) {
    const store = new GameStore(d1Db(env.DB));
    cached = {
      db: env.DB,
      store,
      app: createApp(store, {
        verifyLine: lineVerifier(parseChannelIds(env.LINE_CHANNEL_IDS)),
        lineOaId: env.LINE_OA_ID,
        messaging: { secret: env.LINE_MESSAGING_SECRET, token: env.LINE_MESSAGING_TOKEN, liffId: env.LIFF_ID, origin: env.APP_ORIGIN },
      }),
    };
  }
  return cached;
}

/**
 * Cloudflare Workers 用の入口。画面（apps/web/dist）は Workers の静的ファイル配信が返し、
 * /api/* だけがここに届く（wrangler.jsonc の assets.run_worker_first）。
 * 知らせの予定は Cron Trigger（wrangler.jsonc の triggers.crons）で scheduled が呼ばれたときに処理する
 */
export default {
  // ctx も渡す（Webhook が返事を先に返して、処理を waitUntil で続けるため）
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return setup(env).app.fetch(request, env, ctx);
  },

  scheduled(_controller: unknown, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      processAlarms(setup(env).store, {
        token: env.LINE_MESSAGING_TOKEN,
        liffId: env.LIFF_ID,
        origin: env.APP_ORIGIN,
      }),
    );
  },
};
