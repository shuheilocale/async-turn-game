/**
 * 端末のセンサーで遊ぶゲーム（ふりふりソーダ・かたむけコロコロ）で共通の、遊び方の記録。
 * センサーを使えない・許可しなかったときは指の操作で代わりに遊べるので、どちらで遊んだかを結果に残して見せる
 */

/** motion = 端末のセンサー（振る・傾ける）、touch = 指の操作（こする・連打・画面のスティック） */
export const INPUTS = ["motion", "touch"] as const;
export type Input = (typeof INPUTS)[number];

export const isInput = (v: unknown): v is Input => v === "motion" || v === "touch";
