import { Hono, type Context } from "hono";
import {
  getGame,
  IllegalMoveError,
  type CreateGameResponse,
  type GameView,
  type JoinGameResponse,
  type NextGameResponse,
  type AppConfig,
  type Seat,
} from "@atg/core";
import { cleanTimeZone, planAlarms } from "./alarms.ts";
import type { VerifyLine } from "./line.ts";
import type { GameRecord, GameStore } from "./store.ts";

const MAX_NAME = 20;

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_NAME) : "";
  return name || "プレイヤー";
}

/** 画面が対応している言語だけ受け付ける */
const LANGS = ["ja", "en", "th"];
const cleanLang = (raw: unknown): string | null => (typeof raw === "string" && LANGS.includes(raw) ? raw : null);

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
  /** LINE の公式アカウントの ID（@xxxx）。画面で「友だち追加すると知らせが届く」の案内を出すのに使う。なければ出さない */
  lineOaId?: string;
}

export function createApp(store: GameStore, { verifyLine, lineOaId }: AppOptions = {}) {
  const app = new Hono().basePath("/api");
  const oaId = lineOaId?.trim() ? (lineOaId.trim().startsWith("@") ? lineOaId.trim() : `@${lineOaId.trim()}`) : null;

  /**
   * 2 人そろった対局の、次の知らせの予定を決め直す（手を受け取ったとき・参加したとき・次の対局を作ったとき）。
   * 予定が入れられなくても対局は止めない
   */
  async function replan(game: GameRecord | null) {
    if (!game || game.players.length < 2) return;
    try {
      await store.setAlarms(game.id, game.version, planAlarms(getGame(game.gameType)!, game.state, Date.now()));
    } catch (e) {
      console.error("知らせの予定を入れられませんでした", e);
    }
  }

  /**
   * 本文に idToken があれば LINE のユーザー ID にする。なければ null（LINE の外から使っている）。
   * idToken があるのに確かめられなければ "invalid"
   */
  async function lineUserOf(body: Record<string, unknown>): Promise<string | null | "invalid"> {
    if (typeof body.idToken !== "string" || !verifyLine) return null;
    return (await verifyLine(body.idToken))?.userId ?? "invalid";
  }

  app.get("/health", (c) => c.json({ ok: true }));

  // 画面に渡す設定
  app.get("/config", (c) => c.json<AppConfig>({ lineOaId: oaId }));

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
    if (game.players.length < 2) return c.json({ error: "waiting_opponent" }, 409);

    const body = await jsonBody(c);
    if (body.version !== game.version) return c.json({ error: "version_conflict" }, 409);
    const def = getGame(game.gameType)!;
    const parsed = def.parseMove(body.move);
    if (parsed === null) return c.json({ error: "bad_move" }, 400);
    // 時間を使うゲームは、受け取った時刻をサーバの時計で手に書き込む（送られてきた時刻は使わない）。記録にもこの手が残る
    const move = def.stampMove ? def.stampMove(parsed, Date.now()) : parsed;

    let next: unknown;
    try {
      next = def.applyMove(game.state, move, seat);
    } catch (e) {
      if (e instanceof IllegalMoveError) return c.json({ error: e.code }, 422);
      throw e;
    }
    if (!(await store.recordMove(id, game.version, seat, move, next))) return c.json({ error: "version_conflict" }, 409);
    const lang = cleanLang(body.lang);
    const me = game.players.find((p) => p.seat === seat);
    if (lang && me?.lang !== lang) await store.setLang(id, seat, lang);
    const timeZone = cleanTimeZone(body.timeZone);
    if (timeZone && me?.timeZone !== timeZone) await store.setTimeZone(id, seat, timeZone);
    const updated = (await store.get(id))!;
    await replan(updated);
    return c.json(toView(updated, seat));
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
