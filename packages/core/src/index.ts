import type { GameDefinition } from "./types.ts";
import { othello } from "./games/othello.ts";
import { tictactoe } from "./games/tictactoe.ts";
import { connect4 } from "./games/connect4.ts";
import { tapioca } from "./games/tapioca.ts";
import { hitblow } from "./games/hitblow.ts";
import { auction } from "./games/auction.ts";
import { gobble } from "./games/gobble.ts";
import { nim } from "./games/nim.ts";
import { chain } from "./games/chain.ts";
import { tateyoko } from "./games/tateyoko.ts";
import { fading } from "./games/fading.ts";
import { boxes } from "./games/boxes.ts";
import { bridge } from "./games/bridge.ts";
import { korokoro } from "./games/korokoro.ts";
import { bluff } from "./games/bluff.ts";
import { doors } from "./games/doors.ts";
import { memory } from "./games/memory.ts";
import { tsubo } from "./games/tsubo.ts";
import { shopping } from "./games/shopping.ts";
import { sotto } from "./games/sotto.ts";
import { treasure } from "./games/treasure.ts";
import { oekaki } from "./games/oekaki.ts";
import { stack } from "./games/stack.ts";
import { pour, pourHard } from "./games/pour.ts";
import { balloon } from "./games/balloon.ts";
import { stopwatch } from "./games/stopwatch.ts";
import { quickdraw } from "./games/quickdraw.ts";
import { soda } from "./games/soda.ts";
import { tilt } from "./games/tilt.ts";
import { freehand } from "./games/freehand.ts";

export * from "./types.ts";
export * from "./api.ts";
export { botMove } from "./bot.ts";
export * as Othello from "./games/othello.ts";
export * as TicTacToe from "./games/tictactoe.ts";
export * as Connect4 from "./games/connect4.ts";
export * as Tapioca from "./games/tapioca.ts";
export * as HitBlow from "./games/hitblow.ts";
export * as Auction from "./games/auction.ts";
export * as Gobble from "./games/gobble.ts";
export * as Nim from "./games/nim.ts";
export * as Chain from "./games/chain.ts";
export * as Tateyoko from "./games/tateyoko.ts";
export * as Fading from "./games/fading.ts";
export * as Boxes from "./games/boxes.ts";
export * as Bridge from "./games/bridge.ts";
export * as Korokoro from "./games/korokoro.ts";
export * as Bluff from "./games/bluff.ts";
export * as Doors from "./games/doors.ts";
export * as Memory from "./games/memory.ts";
export * as Tsubo from "./games/tsubo.ts";
export * as Shopping from "./games/shopping.ts";
export * as Sotto from "./games/sotto.ts";
export * as Treasure from "./games/treasure.ts";
export * as Oekaki from "./games/oekaki.ts";
export * as Stack from "./games/stack.ts";
export * as Pour from "./games/pour.ts";
export * as Balloon from "./games/balloon.ts";
export * as Stopwatch from "./games/stopwatch.ts";
export * as Quickdraw from "./games/quickdraw.ts";
export * as Soda from "./games/soda.ts";
export * as Tilt from "./games/tilt.ts";
export * as Freehand from "./games/freehand.ts";

/** 遊べるゲームの一覧。ゲームを追加したらここに登録する（トップ画面の並びは apps/web の boards で決まる） */
export const games: Record<string, GameDefinition<any, any>> = {
  [tictactoe.id]: tictactoe,
  [fading.id]: fading,
  [gobble.id]: gobble,
  [nim.id]: nim,
  [chain.id]: chain,
  [tateyoko.id]: tateyoko,
  [bridge.id]: bridge,
  [korokoro.id]: korokoro,
  [stack.id]: stack,
  [pour.id]: pour,
  [pourHard.id]: pourHard,
  [balloon.id]: balloon,
  [stopwatch.id]: stopwatch,
  [quickdraw.id]: quickdraw,
  [soda.id]: soda,
  [tilt.id]: tilt,
  [freehand.id]: freehand,
  [connect4.id]: connect4,
  [tapioca.id]: tapioca,
  [boxes.id]: boxes,
  [othello.id]: othello,
  [hitblow.id]: hitblow,
  [auction.id]: auction,
  [bluff.id]: bluff,
  [doors.id]: doors,
  [memory.id]: memory,
  [tsubo.id]: tsubo,
  [shopping.id]: shopping,
  [sotto.id]: sotto,
  [treasure.id]: treasure,
  [oekaki.id]: oekaki,
};

export function getGame(id: string): GameDefinition<any, any> | undefined {
  return games[id];
}
