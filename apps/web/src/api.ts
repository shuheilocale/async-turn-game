import type {
  CreateGameRequest,
  CreateGameResponse,
  GameView,
  JoinGameRequest,
  JoinGameResponse,
} from "@atg/core";

/** code はサーバが返すエラーの種類（例: "not_your_turn"）。表示用の文は i18n の errorText で作る */
export class ApiRequestError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, body.error ?? "unknown");
  return body as T;
}

export const api = {
  createGame: (req: CreateGameRequest) =>
    request<CreateGameResponse>("/games", { method: "POST", body: JSON.stringify(req) }),
  getGame: (id: string, token?: string) => request<GameView>(`/games/${id}`, {}, token),
  joinGame: (id: string, req: JoinGameRequest) =>
    request<JoinGameResponse>(`/games/${id}/join`, { method: "POST", body: JSON.stringify(req) }),
  move: (id: string, token: string, version: number, move: unknown) =>
    request<GameView>(`/games/${id}/moves`, { method: "POST", body: JSON.stringify({ version, move }) }, token),
};
