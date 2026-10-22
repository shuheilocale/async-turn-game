import type { GameDefinition } from "./types.ts";
import { othello } from "./games/othello.ts";
import { tictactoe } from "./games/tictactoe.ts";
import { connect4 } from "./games/connect4.ts";
import { hitblow } from "./games/hitblow.ts";
import { auction } from "./games/auction.ts";

export * from "./types.ts";
export * from "./api.ts";
export * as Othello from "./games/othello.ts";
export * as TicTacToe from "./games/tictactoe.ts";
export * as Connect4 from "./games/connect4.ts";
export * as HitBlow from "./games/hitblow.ts";
export * as Auction from "./games/auction.ts";

/** 遊べるゲームの一覧（トップ画面にこの順で並ぶ）。ゲームを追加したらここに登録する */
export const games: Record<string, GameDefinition<any, any>> = {
  [tictactoe.id]: tictactoe,
  [connect4.id]: connect4,
  [othello.id]: othello,
  [hitblow.id]: hitblow,
  [auction.id]: auction,
};

export function getGame(id: string): GameDefinition<any, any> | undefined {
  return games[id];
}
