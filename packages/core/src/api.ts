import type { GameStatus, Seat } from "./types.ts";

/** サーバとブラウザでやりとりする型 */

export interface PlayerView {
  seat: Seat;
  name: string;
}

export interface GameView {
  id: string;
  gameType: string;
  /** 手が指されるたびに 1 増える。指すときにこの値を送り返して食い違いを防ぐ */
  version: number;
  /** 隠す情報があるゲームでは、閲覧者が見てよい形に加工済み */
  state: unknown;
  status: GameStatus;
  players: PlayerView[];
  /** 閲覧者の席。参加者でなければ null */
  you: Seat | null;
  /** 相手の参加待ちなら true */
  waitingForOpponent: boolean;
  /** 参加者にだけ見える招待コード（相手が参加すると null） */
  inviteCode: string | null;
  updatedAt: string;
}

export interface CreateGameRequest {
  gameType: string;
  name: string;
  seat: Seat | "random";
}

export interface CreateGameResponse {
  id: string;
  token: string;
  seat: Seat;
  inviteCode: string;
}

export interface JoinGameRequest {
  inviteCode: string;
  name: string;
}

export interface JoinGameResponse {
  token: string;
  seat: Seat;
}

export interface MoveRequest {
  version: number;
  move: unknown;
}

export interface ApiError {
  /** エラーの種類。画面側で各言語の文に置き換える（例: "not_your_turn"） */
  error: string;
}
