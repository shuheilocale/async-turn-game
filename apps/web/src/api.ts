import type {
  CreateGameRequest,
  CreateGameResponse,
  GameView,
  JoinGameRequest,
  JoinGameResponse,
  MyGame,
  NextGameResponse,
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
  /** LINE アカウントで本人と確かめて、この端末用の合言葉をもらう */
  claim: (id: string, idToken: string) =>
    request<JoinGameResponse>(`/games/${id}/claim`, { method: "POST", body: JSON.stringify({ idToken }) }),
  myGames: (idToken: string) => request<MyGame[]>("/me/games", { method: "POST", body: JSON.stringify({ idToken }) }),
  /** 終わった対局から次の対局を作る。gameType を省くともう一局 */
  next: (id: string, token: string, gameType?: string) =>
    request<NextGameResponse>(`/games/${id}/next`, { method: "POST", body: JSON.stringify({ gameType }) }, token),
  move: (id: string, token: string, version: number, move: unknown) =>
    request<GameView>(`/games/${id}/moves`, { method: "POST", body: JSON.stringify({ version, move }) }, token),
};
