import type { FC } from "react";
import type { GameStatus, Seat } from "@atg/core";
import { OthelloBoard } from "./OthelloBoard.tsx";
import { TicTacToeBoard } from "./TicTacToeBoard.tsx";
import { Connect4Board } from "./Connect4Board.tsx";
import { HitBlowBoard } from "./HitBlowBoard.tsx";
import { AuctionBoard } from "./AuctionBoard.tsx";
import { GobbleBoard } from "./GobbleBoard.tsx";
import { NimBoard } from "./NimBoard.tsx";

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
}

/** ゲームの一覧画面で出す情報 */
export interface GameMeta {
  length: "short" | "medium" | "long";
  hidden?: boolean;
}

/** ゲームごとの画面部品。ルールは @atg/core、見た目と文言はここと i18n */
export interface BoardUI extends GameMeta {
  Board: FC<BoardProps>;
}

/** アイコンは icons.tsx の GameGlyph に、ゲームの ID ごとに描いてある */
export const boards: Record<string, BoardUI> = {
  tictactoe: { Board: TicTacToeBoard, length: "short" },
  gobble: { Board: GobbleBoard, length: "short" },
  nim: { Board: NimBoard, length: "short" },
  connect4: { Board: Connect4Board, length: "medium" },
  othello: { Board: OthelloBoard, length: "long" },
  hitblow: { Board: HitBlowBoard, length: "medium", hidden: true },
  auction: { Board: AuctionBoard, length: "medium", hidden: true },
};
