import type { GameDefinition } from "./types.ts";
import { othello } from "./games/othello.ts";
import { tictactoe } from "./games/tictactoe.ts";
import { connect4 } from "./games/connect4.ts";
import { hitblow } from "./games/hitblow.ts";
import { auction } from "./games/auction.ts";
import { gobble } from "./games/gobble.ts";
import { nim } from "./games/nim.ts";
import { tateyoko } from "./games/tateyoko.ts";
import { fading } from "./games/fading.ts";
import { boxes } from "./games/boxes.ts";
import { bridge } from "./games/bridge.ts";
import { korokoro } from "./games/korokoro.ts";
import { bluff } from "./games/bluff.ts";
import { sotto } from "./games/sotto.ts";
import { treasure } from "./games/treasure.ts";
import { stack } from "./games/stack.ts";
import { pour, pourHard } from "./games/pour.ts";
import { balloon } from "./games/balloon.ts";
import { stopwatch } from "./games/stopwatch.ts";

export * from "./types.ts";
export * from "./api.ts";
export { botMove } from "./bot.ts";
export * as Othello from "./games/othello.ts";
export * as TicTacToe from "./games/tictactoe.ts";
export * as Connect4 from "./games/connect4.ts";
export * as HitBlow from "./games/hitblow.ts";
export * as Auction from "./games/auction.ts";
export * as Gobble from "./games/gobble.ts";
export * as Nim from "./games/nim.ts";
export * as Tateyoko from "./games/tateyoko.ts";
export * as Fading from "./games/fading.ts";
export * as Boxes from "./games/boxes.ts";
export * as Bridge from "./games/bridge.ts";
export * as Korokoro from "./games/korokoro.ts";
export * as Bluff from "./games/bluff.ts";
export * as Sotto from "./games/sotto.ts";
export * as Treasure from "./games/treasure.ts";
export * as Stack from "./games/stack.ts";
export * as Pour from "./games/pour.ts";
export * as Balloon from "./games/balloon.ts";
export * as Stopwatch from "./games/stopwatch.ts";

/** 遊べるゲームの一覧。ゲームを追加したらここに登録する（トップ画面の並びは apps/web の boards で決まる） */
export const games: Record<string, GameDefinition<any, any>> = {
  [tictactoe.id]: tictactoe,
  [fading.id]: fading,
  [gobble.id]: gobble,
  [nim.id]: nim,
  [tateyoko.id]: tateyoko,
  [bridge.id]: bridge,
  [korokoro.id]: korokoro,
  [stack.id]: stack,
  [pour.id]: pour,
  [pourHard.id]: pourHard,
  [balloon.id]: balloon,
  [stopwatch.id]: stopwatch,
  [connect4.id]: connect4,
  [boxes.id]: boxes,
  [othello.id]: othello,
  [hitblow.id]: hitblow,
  [auction.id]: auction,
  [bluff.id]: bluff,
  [sotto.id]: sotto,
  [treasure.id]: treasure,
};

export function getGame(id: string): GameDefinition<any, any> | undefined {
  return games[id];
}
