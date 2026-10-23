import type { GameDefinition } from "./types.ts";
import { othello } from "./games/othello.ts";
import { tictactoe } from "./games/tictactoe.ts";
import { connect4 } from "./games/connect4.ts";
import { hitblow } from "./games/hitblow.ts";
import { auction } from "./games/auction.ts";
import { gobble } from "./games/gobble.ts";
import { nim } from "./games/nim.ts";
import { fading } from "./games/fading.ts";

export * from "./types.ts";
export * from "./api.ts";
export * as Othello from "./games/othello.ts";
export * as TicTacToe from "./games/tictactoe.ts";
export * as Connect4 from "./games/connect4.ts";
export * as HitBlow from "./games/hitblow.ts";
export * as Auction from "./games/auction.ts";
export * as Gobble from "./games/gobble.ts";
export * as Nim from "./games/nim.ts";
export * as Fading from "./games/fading.ts";

/** 遊べるゲームの一覧（トップ画面にこの順で並ぶ）。ゲームを追加したらここに登録する */
export const games: Record<string, GameDefinition<any, any>> = {
  [tictactoe.id]: tictactoe,
  [gobble.id]: gobble,
  [nim.id]: nim,
  [connect4.id]: connect4,
  [othello.id]: othello,
  [hitblow.id]: hitblow,
  [auction.id]: auction,
  [fading.id]: fading,
};

export function getGame(id: string): GameDefinition<any, any> | undefined {
  return games[id];
}
