import { Hono, type Context } from "hono";
import {
  getGame,
  type CreateGameResponse,
  type GameView,
  type JoinGameResponse,
  type NextGameResponse,
  type AppConfig,
  type Seat,
} from "@atg/core";
import { cleanTimeZone } from "./alarms.ts";
import type { VerifyLine } from "./line.ts";
import { cleanLang, playMove, replan as replanGame } from "./moves.ts";
import type { GameRecord, GameStore } from "./store.ts";
import { handleEvents, verifySignature } from "./webhook.ts";

const MAX_NAME = 20;

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_NAME) : "";
  return name || "プレイヤー";
}

function bearer(c: Context): string | undefined {
  const header = c.req.header("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

function toView(game: GameRecord, you: Seat | null): GameView {
  const def = getGame(game.gameType)!;
  const status = def.status(game.state);
  return {
    id: game.id,
    gameType: game.gameType,
    version: game.version,
    state: def.viewState ? def.viewState(game.state, you, status.kind === "finished") : game.state,
    status,
    players: game.players.map((p) => ({ seat: p.seat, name: p.name, lang: p.lang ?? null })),
    you,
    waitingForOpponent: game.players.length < 2,
    inviteCode: you === null ? null : game.inviteCode,
    nextGameId: game.nextGameId,
    updatedAt: game.updatedAt,
  };
}

export interface AppOptions {
  /** LINE の ID トークンを確かめる関数。なければ LINE での本人確認は使わない（手元の開発用） */
  verifyLine?: VerifyLine;
  /** LINE の公式アカウントの ID（@xxxx）。画面で「公式アカウントを入れたグループで遊ぶと知らせが届く」の案内を出すのに使う。なければ出さない */
  lineOaId?: string;
  /** 公式アカウント（Messaging API）の Webhook（/api/line/webhook）に使うもの */
  messaging?: {
    /** チャネルシークレット。Webhook の署名を確かめる。なければ Webhook は 503 を返す */
    secret?: string;
    /** チャネルアクセストークン。グループへの返信に使う */
    token?: string;
    /** メニューのカードで開くミニアプリの LIFF ID と、アイコンの URL に使う本番の URL */
    liffId?: string;
    origin?: string;
    /** テストでは偽物に差し替える */
    fetch?: typeof fetch;
  };
}

export function createApp(store: GameStore, { verifyLine, lineOaId, messaging }: AppOptions = {}) {
  const app = new Hono().basePath("/api");
  const oaId = lineOaId?.trim() ? (lineOaId.trim().startsWith("@") ? lineOaId.trim() : `@${lineOaId.trim()}`) : null;

  const replan = (game: GameRecord | null) => replanGame(store, game);

  /**
   * 本文に idToken があれば LINE のユーザー ID にする。なければ null（LINE の外から使っている）。
   * idToken があるのに確かめられなければ "invalid"
   */
  async function lineUserOf(body: Record<string, unknown>): Promise<string | null | "invalid"> {
    if (typeof body.idToken !== "string" || !verifyLine) return null;
    return (await verifyLine(body.idToken))?.userId ?? "invalid";
  }

  app.get("/health", (c) => c.json({ ok: true }));

  /**
   * 画面に渡す設定。?game=<対局ID> と、その対局の合言葉（Authorization）を付けると、
   * その対局の 2 人がそろった（知らせが届く）グループがあるかも返す。参加者でなければ返さない
   */
  app.get("/config", async (c) => {
    const gameId = c.req.query("game");
    if (!gameId || (await store.seatOf(gameId, bearer(c))) === null) return c.json<AppConfig>({ lineOaId: oaId });
    return c.json<AppConfig>({ lineOaId: oaId, noticeGroup: (await store.noticeGroupOf(gameId)) !== null });
  });

  /**
   * LINE の公式アカウントの Webhook。署名を確かめてからイベントを処理する（webhook.ts）。
   * Workers では返事を先に返して、処理は waitUntil で続ける。Node.js（とテスト）では処理を待ってから返す
   */
  app.post("/line/webhook", async (c) => {
    if (!messaging?.secret) {
      console.log("LINE_MESSAGING_SECRET がないので、LINE の Webhook を受け付けません");
      return c.json({ error: "not_configured" }, 503);
    }
    const raw = await c.req.text();
    if (!(await verifySignature(messaging.secret, raw, c.req.header("X-Line-Signature")))) {
      return c.json({ error: "bad_signature" }, 401);
    }
    let events: unknown;
    try {
      events = JSON.parse(raw).events;
    } catch {
      return c.json({ error: "bad_body" }, 400);
    }
    const work = handleEvents(store, Array.isArray(events) ? events : [], messaging).catch((e) =>
      console.error("LINE の Webhook を処理できませんでした", e),
    );
    let ctx: { waitUntil(p: Promise<unknown>): void } | undefined;
    try {
      ctx = c.executionCtx;
    } catch {
      // Node.js では executionCtx がない
    }
    if (ctx) ctx.waitUntil(work);
    else await work;
    return c.json({ ok: true });
  });

  app.post("/games", async (c) => {
    const body = await jsonBody(c);
    const def = getGame(String(body.gameType ?? ""));
    if (!def) return c.json({ error: "unknown_game" }, 400);
    const lineUser = await lineUserOf(body);
    if (lineUser === "invalid") return c.json({ error: "line_auth_failed" }, 401);
    const seat: Seat =
      body.seat === 0 || body.seat === 1 ? body.seat : Math.random() < 0.5 ? 0 : 1;
    const { id, token, inviteCode } = await store.create(
      def.id,
      def.initialState(Math.random),
      { seat, name: cleanName(body.name), lang: cleanLang(body.lang), timeZone: cleanTimeZone(body.timeZone) },
      lineUser,
    );
    return c.json<CreateGameResponse>({ id, token, seat, inviteCode }, 201);
  });

  app.get("/games/:id", async (c) => {
    const id = c.req.param("id");
    const game = await store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    return c.json(toView(game, await store.seatOf(id, bearer(c))));
  });

  app.post("/games/:id/join", async (c) => {
    const id = c.req.param("id");
    const body = await jsonBody(c);
    const lineUser = await lineUserOf(body);
    if (lineUser === "invalid") return c.json({ error: "line_auth_failed" }, 401);
    if (lineUser && (await store.seatOfLineUser(id, lineUser)) !== null) return c.json({ error: "own_game" }, 409);
    const joined = await store.join(
      id,
      String(body.inviteCode ?? ""),
      cleanName(body.name),
      lineUser,
      cleanLang(body.lang),
      cleanTimeZone(body.timeZone),
    );
    if (!joined) return c.json({ error: "invite_invalid" }, 409);
    await replan(await store.get(id));
    return c.json<JoinGameResponse>(joined, 201);
  });

  // 終わった対局から、同じ 2 人で次の対局を作る。gameType を省くと同じゲーム（もう一局）
  app.post("/games/:id/next", async (c) => {
    const id = c.req.param("id");
    const game = await store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    const seat = await store.seatOf(id, bearer(c));
    if (seat === null) return c.json({ error: "not_participant" }, 401);
    if (getGame(game.gameType)!.status(game.state).kind !== "finished") return c.json({ error: "not_finished" }, 409);
    const body = await jsonBody(c);
    const def = getGame(typeof body.gameType === "string" ? body.gameType : game.gameType);
    if (!def) return c.json({ error: "unknown_game" }, 400);
    const nextId = await store.startNext(id, def.id, def.initialState(Math.random));
    if (!nextId) return c.json({ error: "not_found" }, 404);
    await replan(await store.get(nextId));
    return c.json<NextGameResponse>({ id: nextId, seat: seat === 0 ? 1 : 0 }, 201);
  });

  // LINE アカウントで本人と確かめられたら、この端末用の合言葉を発行する（端末を替えたとき・保存が消えたとき）
  app.post("/games/:id/claim", async (c) => {
    const lineUser = await lineUserOf(await jsonBody(c));
    if (!lineUser || lineUser === "invalid") return c.json({ error: "line_auth_failed" }, 401);
    const claimed = await store.claim(c.req.param("id"), lineUser);
    if (!claimed) return c.json({ error: "not_participant" }, 404);
    return c.json<JoinGameResponse>(claimed);
  });

  // LINE アカウントで参加している対局の一覧（ID トークンを本文で送るので POST）
  app.post("/me/games", async (c) => {
    const lineUser = await lineUserOf(await jsonBody(c));
    if (!lineUser || lineUser === "invalid") return c.json({ error: "line_auth_failed" }, 401);
    return c.json(await store.gamesOfLineUser(lineUser));
  });

  app.post("/games/:id/moves", async (c) => {
    const id = c.req.param("id");
    const game = await store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    const seat = await store.seatOf(id, bearer(c));
    if (seat === null) return c.json({ error: "not_participant" }, 401);
    const body = await jsonBody(c);
    const played = await playMove(store, game, seat, body.move, body.version, { lang: body.lang, timeZone: body.timeZone });
    if (!played.ok) return c.json({ error: played.error }, played.status);
    return c.json(toView(played.game, seat));
  });

  app.get("/games/:id/moves", async (c) => {
    const id = c.req.param("id");
    const game = await store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    const def = getGame(game.gameType)!;
    const viewMove = def.viewMove;
    if (!viewMove || def.status(game.state).kind === "finished") return c.json(await store.moves(id));
    const viewer = await store.seatOf(id, bearer(c));
    return c.json((await store.moves(id)).map((m) => ({ ...m, move: viewMove(m.move, m.seat, viewer) })));
  });

  return app;
}
