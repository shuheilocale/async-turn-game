/**
 * 「ルールを学ぶ」（ひとりで遊ぶお試し）で出す案内の 1 枚。
 * ゲームごとに tours/<ゲームID>.ts の default export で、3〜5 枚の配列を置く（置くだけで読み込まれる）
 */
export interface TourStep {
  /** 案内の文の i18n キー。i18n/games/<ゲームID>.ts に game.<ID>.tour.<名前> として ja・en・th を書く */
  text: `game.${string}`;
  /** 光らせる場所（お試し画面の中の CSS セレクタ。例 ".grid-board"、".confirm"）。省くと盤の上に出す */
  target?: string;
  /** "move" なら、自分が 1 手指したら次へ進む（「次へ」ボタンを出さない）。省くと「次へ」で進む */
  advance?: "next" | "move";
}

const tourFiles = import.meta.glob<{ default: TourStep[] }>("./tours/*.ts", { eager: true });

/** ゲームの案内。なければ空 */
export function tourOf(gameType: string): TourStep[] {
  return tourFiles[`./tours/${gameType}.ts`]?.default ?? [];
}
