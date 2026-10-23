/** 0 = 先手, 1 = 後手 */
export type Seat = 0 | 1;

export type GameStatus =
  | { kind: "playing"; turn: Seat }
  | {
      kind: "finished";
      winner: Seat | null;
      /** 協力ゲームだけ：2 人で達成したか（cleared）、できなかったか（failed）。対戦ゲームでは省く */
      coop?: "cleared" | "failed";
    };

/** 0 以上 1 未満の乱数を返す関数。テストでは固定の値を返すものを渡す */
export type Rng = () => number;

/**
 * 1 種類のゲームのルール。純粋関数だけで構成し、サーバとブラウザの両方で使う。
 * 新しいゲームを追加するときはこれを実装して registry に登録する。
 */
export interface GameDefinition<S = unknown, M = unknown> {
  id: string;
  initialState(rng: Rng): S;
  status(state: S): GameStatus;
  /** 不正な手なら IllegalMoveError を投げる */
  applyMove(state: S, move: M, seat: Seat): S;
  /** 外部から来た未検証の値を手として解釈する。解釈できなければ null */
  parseMove(raw: unknown): M | null;
  /**
   * 相手に隠す情報があるゲームだけ実装する。viewer（観戦者は null）が見てよい形に
   * state を加工して返す。revealAll が true（終局後）なら隠さずに同じ形で返す。
   */
  viewState?(state: S, viewer: Seat | null, revealAll: boolean): unknown;
  /** 隠す情報があるゲームだけ実装する。手の記録を viewer が見てよい形にする（終局後は呼ばれない） */
  viewMove?(move: M, mover: Seat, viewer: Seat | null): unknown;
}

/** code は画面側で各言語の文に置き換える（例: "not_your_turn"） */
export class IllegalMoveError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "IllegalMoveError";
  }
}

export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
