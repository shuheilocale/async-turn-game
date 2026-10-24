import type { FC } from "react";
import type { GameStatus, Seat } from "@atg/core";
import { OthelloBoard } from "./OthelloBoard.tsx";
import { TicTacToeBoard } from "./TicTacToeBoard.tsx";
import { Connect4Board } from "./Connect4Board.tsx";
import { TapiocaBoard } from "./TapiocaBoard.tsx";
import { HitBlowBoard } from "./HitBlowBoard.tsx";
import { AuctionBoard } from "./AuctionBoard.tsx";
import { GobbleBoard } from "./GobbleBoard.tsx";
import { NimBoard } from "./NimBoard.tsx";
import { ChainBoard } from "./ChainBoard.tsx";
import { TateyokoBoard } from "./TateyokoBoard.tsx";
import { FadingBoard } from "./FadingBoard.tsx";
import { BoxesBoard } from "./BoxesBoard.tsx";
import { BridgeBoard } from "./BridgeBoard.tsx";
import { KorokoroBoard } from "./KorokoroBoard.tsx";
import { BluffBoard } from "./BluffBoard.tsx";
import { DoorsBoard } from "./DoorsBoard.tsx";
import { MemoryBoard } from "./MemoryBoard.tsx";
import { TsuboBoard } from "./TsuboBoard.tsx";
import { ShoppingBoard } from "./ShoppingBoard.tsx";
import { SottoBoard } from "./SottoBoard.tsx";
import { TreasureBoard } from "./TreasureBoard.tsx";
import { OekakiBoard } from "./OekakiBoard.tsx";
import { HeartBoard } from "./HeartBoard.tsx";
import { StackBoard } from "./StackBoard.tsx";
import { CurlingBoard } from "./CurlingBoard.tsx";
import { ArtilleryBoard } from "./ArtilleryBoard.tsx";
import { PourBoard, PourHardBoard } from "./PourBoard.tsx";
import { BalloonBoard } from "./BalloonBoard.tsx";
import { StopwatchBoard } from "./StopwatchBoard.tsx";
import { QuickdrawBoard } from "./QuickdrawBoard.tsx";
import { SodaBoard } from "./SodaBoard.tsx";
import { TiltBoard } from "./TiltBoard.tsx";
import { FreehandBoard } from "./FreehandBoard.tsx";

export interface BoardProps {
  /** サーバから届いた状態（隠す情報があるゲームでは、自分が見てよい形に加工済み） */
  state: unknown;
  status: GameStatus;
  /** 自分の席。観戦者なら null */
  you: Seat | null;
  names: Record<Seat, string>;
  /** いま盤を触って手を選べるか（自分の手番か） */
  interactive: boolean;
  /** 仮に選んでいる手（確定前）。確定は画面下の「これで決定」で行う */
  selected: unknown | null;
  onSelect(move: unknown | null): void;
  /**
   * 確定を待たずにすぐ送る。結果を見てから取り消せると困るゲーム（石を落として崩れるか見る など）で使う。
   * 送れたら true
   */
  onSubmit(move: unknown): Promise<boolean>;
}

/** ゲームの一覧画面で出す情報 */
export interface GameMeta {
  length: "short" | "medium" | "long";
  hidden?: boolean;
  /** 2 人で一緒に目標を目指す協力ゲーム */
  coop?: boolean;
  /** 長押しやタップの回数など、タイミングで遊ぶゲーム */
  timing?: boolean;
  /** 指で描いて遊ぶゲーム */
  drawing?: boolean;
  /** トップの一覧での種類。省くと上の目印から決まる（categoryOf） */
  category?: Category;
}

/** トップの一覧で、ゲームを分ける種類（この順に並ぶ） */
export const CATEGORIES = ["board", "mind", "action", "coop"] as const;
export type Category = (typeof CATEGORIES)[number];

/** ゲームの種類。協力 → 協力、タイミング・お絵かき → 手さばき、隠す情報あり → かけひき、ほかは盤ゲーム */
export function categoryOf(ui: GameMeta): Category {
  if (ui.category) return ui.category;
  if (ui.coop) return "coop";
  if (ui.timing || ui.drawing) return "action";
  if (ui.hidden) return "mind";
  return "board";
}

/** ゲームごとの画面部品。ルールは @atg/core、見た目と文言はここと i18n */
export interface BoardUI extends GameMeta {
  Board: FC<BoardProps>;
}

/** トップ画面にこの順で並ぶ（短いゲームから）。アイコンは icons.tsx と glyphs/ に描いてある */
export const boards: Record<string, BoardUI> = {
  tictactoe: { Board: TicTacToeBoard, length: "short" },
  fading: { Board: FadingBoard, length: "short" },
  gobble: { Board: GobbleBoard, length: "short" },
  nim: { Board: NimBoard, length: "short" },
  chain: { Board: ChainBoard, length: "short", category: "mind" },
  tateyoko: { Board: TateyokoBoard, length: "short" },
  bridge: { Board: BridgeBoard, length: "short" },
  korokoro: { Board: KorokoroBoard, length: "short" },
  stack: { Board: StackBoard, length: "short", category: "action" },
  curling: { Board: CurlingBoard, length: "medium", category: "action" },
  artillery: { Board: ArtilleryBoard, length: "medium", category: "action" },
  pour: { Board: PourBoard, length: "short", hidden: true, timing: true },
  pourhard: { Board: PourHardBoard, length: "short", hidden: true, timing: true },
  balloon: { Board: BalloonBoard, length: "short", hidden: true, timing: true },
  stopwatch: { Board: StopwatchBoard, length: "short", hidden: true, timing: true },
  quickdraw: { Board: QuickdrawBoard, length: "short", hidden: true, timing: true },
  soda: { Board: SodaBoard, length: "short", hidden: true, timing: true },
  tilt: { Board: TiltBoard, length: "short", hidden: true, timing: true },
  freehand: { Board: FreehandBoard, length: "short", hidden: true, drawing: true },
  connect4: { Board: Connect4Board, length: "medium" },
  tapioca: { Board: TapiocaBoard, length: "medium" },
  boxes: { Board: BoxesBoard, length: "medium" },
  othello: { Board: OthelloBoard, length: "long" },
  hitblow: { Board: HitBlowBoard, length: "medium", hidden: true },
  auction: { Board: AuctionBoard, length: "medium", hidden: true },
  bluff: { Board: BluffBoard, length: "medium", hidden: true },
  doors: { Board: DoorsBoard, length: "short", hidden: true },
  memory: { Board: MemoryBoard, length: "medium", hidden: true },
  tsubo: { Board: TsuboBoard, length: "short", hidden: true },
  shopping: { Board: ShoppingBoard, length: "medium", hidden: true },
  sotto: { Board: SottoBoard, length: "short", hidden: true, coop: true },
  treasure: { Board: TreasureBoard, length: "short", hidden: true, coop: true },
  oekaki: { Board: OekakiBoard, length: "medium", hidden: true, coop: true },
  heart: { Board: HeartBoard, length: "short", hidden: true, coop: true },
};
