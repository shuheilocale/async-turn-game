import type { StyleId } from "./types.ts";

/**
 * バックボーンごとの服装。どの服を着るか・どこまで覆うかだけを決め、形と色は rig.ts で作る。
 * 色の「seat」はその人の色（青 / オレンジ）、"gi" は道着の布の色
 */
export interface Outfit {
  /**
   * 上半身：裸 / 道着 / テコンドーの道着（V 字の襟）/ シングレット /
   * パーカー / 中国風の上着（結びボタン）/ 燕尾服 / スクラブ / ステージ衣装の上着 / 大きめの T シャツ / コックコート /
   * 忍び装束（道着と同じ作りで、袖口をしぼる）/ 開襟シャツ / スタントスーツ / スーツの上着（白いシャツとネクタイ）
   */
  top: "none" | "gi" | "dobok" | "singlet" | "hoodie" | "tunic" | "tailcoat" | "scrub" | "jacket" | "tee" | "chef" | "shinobi" | "shirt" | "stunt" | "suit";
  /** 袖の長さ（0 = 半袖くらい、1 = 手首まで） */
  sleeve: number;
  /** 上腕を袖で覆う割合（1 = ひじまで。半袖は 0.5 くらい） */
  upper: number;
  /** 袖の先の広がり（1 がぴったり、1 より小さいと袖口がしまる） */
  cuff: number;
  /** 上着のすその長さ（腰から下へ、m）と、胴回りのゆとり */
  hem: number;
  loose: number;
  /** 下半身 */
  bottom: "trunks" | "thai" | "mma" | "pants" | "singlet" | "mawashi" | "kick" | "jammer";
  /** ズボン・パンツの丈（脚の付け根からの割合。1 で足首まで） */
  legLen: number;
  /** ズボン・パンツのすその広がり（1 がぴったり） */
  flare: number;
  /** ズボンのゆとり（脚の太さに対する倍率） */
  baggy: number;
  /** 道着・上着の布の色 */
  cloth: Cloth;
  /** ズボンの布の色 */
  pants: Cloth;
  /** 布のつや（0 = 木綿、1 = 絹・サテン） */
  sheen: number;
  /** 手：素手のこぶし / ボクシングのグローブ / オープンフィンガーグローブ / 白い手袋 */
  hands: "fist" | "gloves" | "mma" | "white";
  /** 足：はだし / ボクシングシューズ / レスリングシューズ / スニーカー / 革靴 / 布の靴 / 足袋 / サンダル（足の甲が見える） */
  feet: "bare" | "boots" | "shoes" | "sneakers" | "dress" | "slip" | "tabi" | "sandals";
  /** 腰：なし / 帯 / カポエラの紐（コルダン） */
  belt: "none" | "belt" | "cord";
  /** ムエタイの腕の飾り布（プラジアット） */
  armbands: boolean;
  /** 足首のサポーター */
  ankles: boolean;
  /** すねのサポーター（キックボクシング） */
  shins: boolean;
  /** 髪：短髪 / 坊主 / まげ / なし（帽子の中） */
  hair: "short" | "buzz" | "topknot" | "none";
  /**
   * 頭：シルクハット / コック帽 / うしろ向きのキャップ / スイムキャップとゴーグル / ヘッドセット / ヘッドセットのマイク /
   * 忍びの頭巾と口元の布 / バンダナ
   */
  head: "none" | "tophat" | "toque" | "cap" | "swim" | "headset" | "mic" | "hood" | "bandana";
  /** 首：蝶ネクタイ / 太いチェーン / スカーフ / 首にかけたタオル / ネクタイ */
  neck: "none" | "bowtie" | "chain" | "scarf" | "towel" | "tie";
  /** 持ち物（右手に持つ）。振る技（swing）で振る */
  prop: Prop;
  /** マント（燕尾服のすそも付ける） */
  cape: boolean;
  /** エプロン（腰から下）と、胸まで覆う胸当て */
  apron: boolean;
  bib: boolean;
  /** 手甲（前腕を覆う布。その人の色） */
  bracers: boolean;
  /** ひじ・ひざのプロテクター */
  pads: boolean;
  /** 背中に負った刀 */
  sword: boolean;
  /** 全身が金属の板（肌を見せない） */
  robot: boolean;
}

export type Cloth = "white" | "ivory" | "charcoal" | "black" | "silk" | "navy" | "seat";
/** 持ち物：ステッキ / フライパン / ペンライト / カバン / ストローの刺さった大きなカップ */
export type Prop = "none" | "cane" | "pan" | "penlight" | "bag" | "cup";

const base: Outfit = {
  top: "none",
  sleeve: 0,
  upper: 1,
  cuff: 1.25,
  hem: 0.14,
  loose: 1.1,
  bottom: "trunks",
  legLen: 0.3,
  flare: 1.15,
  baggy: 1.2,
  cloth: "white",
  pants: "white",
  sheen: 0,
  hands: "fist",
  feet: "bare",
  belt: "none",
  armbands: false,
  ankles: false,
  shins: false,
  hair: "short",
  head: "none",
  neck: "none",
  prop: "none",
  cape: false,
  apron: false,
  bib: false,
  bracers: false,
  pads: false,
  sword: false,
  robot: false,
};

export function outfitOf(style: StyleId | null): Outfit {
  switch (style) {
    case "boxing":
      return { ...base, bottom: "trunks", legLen: 0.27, flare: 1.16, hands: "gloves", feet: "boots" };
    case "muaythai":
      return { ...base, bottom: "thai", legLen: 0.22, flare: 1.3, hands: "gloves", armbands: true, ankles: true, hair: "buzz" };
    case "karate":
      return { ...base, top: "gi", sleeve: 0.55, bottom: "pants", legLen: 0.88, flare: 1.18, cloth: "white", pants: "white", belt: "belt" };
    case "taekwondo":
      return { ...base, top: "dobok", sleeve: 0.95, bottom: "pants", legLen: 0.95, flare: 1.15, cloth: "white", pants: "white", belt: "belt" };
    case "judo":
      return { ...base, top: "gi", sleeve: 0.85, bottom: "pants", legLen: 0.86, flare: 1.15, cloth: "ivory", pants: "ivory", belt: "belt" };
    case "bjj":
      return { ...base, top: "gi", sleeve: 0.95, bottom: "pants", legLen: 0.9, flare: 1.12, cloth: "charcoal", pants: "charcoal", belt: "belt" };
    case "wrestling":
      return { ...base, top: "singlet", bottom: "singlet", legLen: 0.28, flare: 1.04, cloth: "seat", feet: "shoes", hair: "buzz" };
    case "mma":
      return { ...base, bottom: "mma", legLen: 0.48, flare: 1.18, hands: "mma", hair: "buzz" };
    case "capoeira":
      return { ...base, bottom: "pants", legLen: 0.97, flare: 1.28, cloth: "white", pants: "white", belt: "cord" };
    case "sumo":
      return { ...base, bottom: "mawashi", legLen: 0, flare: 1, hair: "topknot" };
    case "kickboxing":
      // ひざまでの長めのキックパンツと、すねのサポーター
      return { ...base, bottom: "kick", legLen: 0.47, flare: 1.32, hands: "gloves", shins: true };
    case "taichi":
      // 絹の上下。上着は袖口の広い中国風、ズボンはゆったり
      return { ...base, top: "tunic", sleeve: 1, cuff: 1.4, hem: 0.2, loose: 1.14, bottom: "pants", legLen: 0.95, flare: 1.22, cloth: "silk", pants: "black", baggy: 1.32, sheen: 1, feet: "slip" };
    case "gamer":
      return { ...base, top: "hoodie", sleeve: 1, cuff: 0.92, hem: 0.1, loose: 1.16, bottom: "pants", legLen: 1, flare: 1.04, cloth: "seat", pants: "charcoal", feet: "sneakers", head: "headset" };
    case "magician":
      return { ...base, top: "tailcoat", sleeve: 1, cuff: 1.02, hem: 0.02, loose: 1.06, bottom: "pants", legLen: 1, flare: 1.04, cloth: "black", pants: "black", sheen: 0.4, hands: "white", feet: "dress", head: "tophat", neck: "bowtie", prop: "cane", cape: true };
    case "nurse":
      // 上下ともその人の色のスクラブ（V 字の襟・半袖）。帽子はかぶらない
      return { ...base, top: "scrub", sleeve: 0, upper: 0.55, cuff: 1.12, hem: 0.16, loose: 1.12, bottom: "pants", legLen: 0.97, flare: 1.1, cloth: "seat", pants: "seat", feet: "sneakers" };
    case "swimmer":
      return { ...base, bottom: "jammer", legLen: 0.46, flare: 1.0, hair: "none", head: "swim" };
    case "idol":
      // きらりと光るステージ衣装の上着（その人の色）と白いズボン、ヘッドセットのマイク
      return { ...base, top: "jacket", sleeve: 1, cuff: 1.08, hem: 0.03, loose: 1.08, bottom: "pants", legLen: 1, flare: 1.06, cloth: "seat", pants: "white", sheen: 1, feet: "sneakers", head: "mic", prop: "penlight" };
    case "rapper":
      // 大きめの T シャツ、ゆるいズボン、うしろ向きのキャップと太いチェーン
      return { ...base, top: "tee", sleeve: 0.12, upper: 1, cuff: 1.3, hem: 0.24, loose: 1.26, bottom: "pants", legLen: 1, flare: 1.08, baggy: 1.42, cloth: "seat", pants: "charcoal", feet: "sneakers", head: "cap", neck: "chain" };
    case "chef":
      return { ...base, top: "chef", sleeve: 0.75, cuff: 1.12, hem: 0.2, loose: 1.14, bottom: "pants", legLen: 1, flare: 1.08, cloth: "white", pants: "charcoal", feet: "dress", head: "toque", neck: "scarf", prop: "pan", apron: true };
    case "robot":
      return { ...base, bottom: "trunks", legLen: 0, hair: "none", robot: true };
    case "ninja":
      // 黒い忍び装束。袖口と裾をしぼり、帯と手甲はその人の色。頭巾と口元の布、足袋、背中に刀
      return { ...base, top: "shinobi", sleeve: 0.9, cuff: 0.86, bottom: "pants", legLen: 0.95, flare: 0.78, baggy: 1.3, cloth: "black", pants: "black", belt: "belt", feet: "tabi", hair: "none", head: "hood", bracers: true, sword: true };
    case "tuktuk":
      // その人の色の半袖の開襟シャツ（すそは出す）、少し短いズボン、首にタオル、サンダル
      return { ...base, top: "shirt", sleeve: 0, upper: 0.55, cuff: 1.16, hem: 0.12, loose: 1.12, bottom: "pants", legLen: 0.8, flare: 1.08, baggy: 1.24, cloth: "seat", pants: "charcoal", feet: "sandals", neck: "towel" };
    case "stuntman":
      // 黒いスタントスーツ（その人の色のライン）、指の出る手袋、ひじ・ひざのプロテクター
      return { ...base, top: "stunt", sleeve: 1, cuff: 0.94, hem: 0.0, loose: 1.03, bottom: "pants", legLen: 1, flare: 0.96, baggy: 1.1, cloth: "black", pants: "black", sheen: 0.3, hands: "mma", feet: "shoes", pads: true };
    case "salaryman":
      // スーツの上着とズボン、白いシャツ、その人の色のネクタイ、革靴。右手にカバン
      return { ...base, top: "suit", sleeve: 1, cuff: 1.0, hem: 0.12, loose: 1.06, bottom: "pants", legLen: 1, flare: 1.02, baggy: 1.16, cloth: "navy", pants: "navy", sheen: 0.15, feet: "dress", neck: "tie", prop: "bag" };
    case "bubbletea":
      // 白い T シャツに、その人の色の胸当てエプロンとバンダナ。右手にストローの刺さった大きなカップ
      return { ...base, top: "tee", sleeve: 0, upper: 0.55, cuff: 1.12, hem: 0.04, loose: 1.1, bottom: "pants", legLen: 1, flare: 1.06, baggy: 1.2, cloth: "white", pants: "charcoal", feet: "sneakers", head: "bandana", prop: "cup", apron: true, bib: true };
    default:
      return { ...base, bottom: "mma", legLen: 0.45, flare: 1.15 };
  }
}

/**
 * 持ち物の長さ（握るところから先まで、m）。振る技で手をどこまで出すかに使う。
 * カップは、振る技で持ちかえる太いストローの長さ
 */
export const PROP_LENGTH: Record<Prop, number> = { none: 0, cane: 0.9, pan: 0.42, penlight: 0.26, bag: 0.36, cup: 0.5 };

/** 前腕の向きに続けて持つ（下へ垂らす）持ち物。ほかは親指の側へ伸ばして持つ */
export const hangsDown = (p: Prop) => p === "cane" || p === "bag";

/** その人が右手に持っているもの */
export const propOf = (style: StyleId | null): Prop => outfitOf(style).prop;
