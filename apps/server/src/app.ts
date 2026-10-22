import { Hono, type Context } from "hono";
import {
  getGame,
  IllegalMoveError,
  type CreateGameResponse,
  type GameView,
  type JoinGameResponse,
  type Seat,
} from "@atg/core";
import type { GameRecord, GameStore } from "./store.ts";

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
    players: game.players,
    you,
    waitingForOpponent: game.players.length < 2,
    inviteCode: you === null ? null : game.inviteCode,
    updatedAt: game.updatedAt,
  };
}

export function createApp(store: GameStore) {
  const app = new Hono().basePath("/api");

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/games", async (c) => {
    const body = await jsonBody(c);
    const def = getGame(String(body.gameType ?? ""));
    if (!def) return c.json({ error: "unknown_game" }, 400);
    const seat: Seat =
      body.seat === 0 || body.seat === 1 ? body.seat : Math.random() < 0.5 ? 0 : 1;
    const { id, token, inviteCode } = store.create(def.id, def.initialState(Math.random), {
      seat,
      name: cleanName(body.name),
    });
    return c.json<CreateGameResponse>({ id, token, seat, inviteCode }, 201);
  });

  app.get("/games/:id", (c) => {
    const id = c.req.param("id");
    const game = store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    return c.json(toView(game, store.seatOf(id, bearer(c))));
  });

  app.post("/games/:id/join", async (c) => {
    const id = c.req.param("id");
    const body = await jsonBody(c);
    const joined = store.join(id, String(body.inviteCode ?? ""), cleanName(body.name));
    if (!joined) return c.json({ error: "invite_invalid" }, 409);
    return c.json<JoinGameResponse>(joined, 201);
  });

  app.post("/games/:id/moves", async (c) => {
    const id = c.req.param("id");
    const game = store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    const seat = store.seatOf(id, bearer(c));
    if (seat === null) return c.json({ error: "not_participant" }, 401);
    if (game.players.length < 2) return c.json({ error: "waiting_opponent" }, 409);

    const body = await jsonBody(c);
    if (body.version !== game.version) return c.json({ error: "version_conflict" }, 409);
    const def = getGame(game.gameType)!;
    const move = def.parseMove(body.move);
    if (move === null) return c.json({ error: "bad_move" }, 400);

    let next: unknown;
    try {
      next = def.applyMove(game.state, move, seat);
    } catch (e) {
      if (e instanceof IllegalMoveError) return c.json({ error: e.code }, 422);
      throw e;
    }
    if (!store.recordMove(id, game.version, seat, move, next)) return c.json({ error: "version_conflict" }, 409);
    return c.json(toView(store.get(id)!, seat));
  });

  app.get("/games/:id/moves", (c) => {
    const id = c.req.param("id");
    const game = store.get(id);
    if (!game) return c.json({ error: "not_found" }, 404);
    const def = getGame(game.gameType)!;
    const viewMove = def.viewMove;
    if (!viewMove || def.status(game.state).kind === "finished") return c.json(store.moves(id));
    const viewer = store.seatOf(id, bearer(c));
    return c.json(store.moves(id).map((m) => ({ ...m, move: viewMove(m.move, m.seat, viewer) })));
  });

  return app;
}
