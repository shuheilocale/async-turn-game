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
  /** 終局後に作られた次の対局（もう一局・ほかのゲーム）。なければ null */
  nextGameId: string | null;
  updatedAt: string;
}

export interface CreateGameRequest {
  gameType: string;
  name: string;
  seat: Seat | "random";
  /** LINE から使っているときの ID トークン。サーバが LINE アカウントを確かめて席と結びつける */
  idToken?: string;
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
  idToken?: string;
}

export interface JoinGameResponse {
  token: string;
  seat: Seat;
}

/** 次の対局を作った結果。seat は次の対局での自分の席（前の対局と入れ替わる） */
export interface NextGameResponse {
  id: string;
  seat: Seat;
}

/** LINE アカウントで参加している対局 */
export interface MyGame {
  id: string;
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
