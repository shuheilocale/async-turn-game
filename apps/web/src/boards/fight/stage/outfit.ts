import type { StyleId } from "./types.ts";

/**
 * バックボーンごとの服装。どの服を着るか・どこまで覆うかだけを決め、形と色は rig.ts で作る。
 * 色の「seat」はその人の色（青 / オレンジ）、"gi" は道着の布の色
 */
export interface Outfit {
  /** 上半身：裸 / 道着 / テコンドーの道着（V 字の襟）/ シングレット */
  top: "none" | "gi" | "dobok" | "singlet";
  /** 袖の長さ（0 = 半袖くらい、1 = 手首まで） */
  sleeve: number;
  /** 下半身 */
  bottom: "trunks" | "thai" | "mma" | "pants" | "singlet" | "mawashi";
  /** ズボン・パンツの丈（脚の付け根からの割合。1 で足首まで） */
  legLen: number;
  /** ズボン・パンツのすその広がり（1 がぴったり） */
  flare: number;
  /** 道着・ズボンの布の色 */
  cloth: "white" | "ivory" | "charcoal" | "seat";
  /** 手：素手のこぶし / ボクシングのグローブ / オープンフィンガーグローブ */
  hands: "fist" | "gloves" | "mma";
  /** 足：はだし / ボクシングシューズ / レスリングシューズ */
  feet: "bare" | "boots" | "shoes";
  /** 腰：なし / 帯 / カポエラの紐（コルダン） */
  belt: "none" | "belt" | "cord";
  /** ムエタイの腕の飾り布（プラジアット） */
  armbands: boolean;
  /** 足首のサポーター */
  ankles: boolean;
  /** 髪：短髪 / 坊主 / まげ */
  hair: "short" | "buzz" | "topknot";
}

const base: Outfit = {
  top: "none",
  sleeve: 0,
  bottom: "trunks",
  legLen: 0.3,
  flare: 1.15,
  cloth: "white",
  hands: "fist",
  feet: "bare",
  belt: "none",
  armbands: false,
  ankles: false,
  hair: "short",
};

export function outfitOf(style: StyleId | null): Outfit {
  switch (style) {
    case "boxing":
      return { ...base, bottom: "trunks", legLen: 0.27, flare: 1.16, hands: "gloves", feet: "boots" };
    case "muaythai":
      return { ...base, bottom: "thai", legLen: 0.22, flare: 1.3, hands: "gloves", armbands: true, ankles: true, hair: "buzz" };
    case "karate":
      return { ...base, top: "gi", sleeve: 0.55, bottom: "pants", legLen: 0.88, flare: 1.18, cloth: "white", belt: "belt" };
    case "taekwondo":
      return { ...base, top: "dobok", sleeve: 0.95, bottom: "pants", legLen: 0.95, flare: 1.15, cloth: "white", belt: "belt" };
    case "judo":
      return { ...base, top: "gi", sleeve: 0.85, bottom: "pants", legLen: 0.86, flare: 1.15, cloth: "ivory", belt: "belt" };
    case "bjj":
      return { ...base, top: "gi", sleeve: 0.95, bottom: "pants", legLen: 0.9, flare: 1.12, cloth: "charcoal", belt: "belt" };
    case "wrestling":
      return { ...base, top: "singlet", bottom: "singlet", legLen: 0.28, flare: 1.04, cloth: "seat", feet: "shoes", hair: "buzz" };
    case "mma":
      return { ...base, bottom: "mma", legLen: 0.48, flare: 1.18, hands: "mma", hair: "buzz" };
    case "capoeira":
      return { ...base, bottom: "pants", legLen: 0.97, flare: 1.28, cloth: "white", belt: "cord" };
    case "sumo":
      return { ...base, bottom: "mawashi", legLen: 0, flare: 1, hair: "topknot" };
    default:
      return { ...base, bottom: "mma", legLen: 0.45, flare: 1.15 };
  }
}
