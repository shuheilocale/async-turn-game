import type { StyleId } from "./types.ts";

/**
 * バックボーンごとの服装。どの服を着るか・どこまで覆うかだけを決め、形と色は rig.ts で作る。
 * 色の「seat」はその人の色（青 / オレンジ）、"gi" は道着の布の色
 */
export interface Outfit {
  /**
   * 上半身：裸 / 道着 / テコンドーの道着（V 字の襟）/ シングレット /
   * パーカー / 中国風の上着（結びボタン）/ 燕尾服 / スクラブ / ステージ衣装の上着 / 大きめの T シャツ / コックコート /
   * 忍び装束（道着と同じ作りで、袖口をしぼる）/ 開襟シャツ / スタントスーツ / スーツの上着（白いシャツとネクタイ）/
   * 剣道着（道着と同じ作り）/ 防火服（反射の帯）/ ボンバージャケット（リブの襟・袖口・すそ）/ ベスト（白いシャツの上）/ 恐竜の着ぐるみ
   */
  top:
    | "none"
    | "gi"
    | "dobok"
    | "singlet"
    | "hoodie"
    | "tunic"
    | "tailcoat"
    | "scrub"
    | "jacket"
    | "tee"
    | "chef"
    | "shinobi"
    | "shirt"
    | "stunt"
    | "suit"
    | "kendo"
    | "turnout"
    | "bomber"
    | "vest"
    | "dino";
  /** 袖の長さ（0 = 半袖くらい、1 = 手首まで） */
  sleeve: number;
  /** 上腕を袖で覆う割合（1 = ひじまで。半袖は 0.5 くらい） */
  upper: number;
  /** 袖の先の広がり（1 がぴったり、1 より小さいと袖口がしまる） */
  cuff: number;
  /** 上着のすその長さ（腰から下へ、m）と、胴回りのゆとり */
  hem: number;
  loose: number;
  /** 下半身（tights は足首までのぴったりしたタイツ） */
  bottom: "trunks" | "thai" | "mma" | "pants" | "singlet" | "mawashi" | "kick" | "jammer" | "tights";
  /** ズボン・パンツの丈（脚の付け根からの割合。1 で足首まで） */
  legLen: number;
  /** ズボン・パンツのすその広がり（1 がぴったり） */
  flare: number;
  /** ズボンのゆとり（脚の太さに対する倍率） */
  baggy: number;
  /** 袴・着ぐるみのように、ひざで細くならない太いズボン */
  wide: boolean;
  /** 道着・上着の布の色 */
  cloth: Cloth;
  /** ズボンの布の色 */
  pants: Cloth;
  /** 布のつや（0 = 木綿、1 = 絹・サテン） */
  sheen: number;
  /** 手：素手のこぶし / ボクシングのグローブ / オープンフィンガーグローブ / 白い手袋 / 剣道の小手 / 厚い作業手袋 / 着ぐるみの丸い手 */
  hands: "fist" | "gloves" | "mma" | "white" | "kote" | "work" | "paws";
  /**
   * 足：はだし / ボクシングシューズ / レスリングシューズ / スニーカー / 革靴 / 布の靴 / 足袋 / サンダル（足の甲が見える）/
   * ルチャのひざ下までのブーツ / 消防のゴム長靴 / 着ぐるみの丸い足
   */
  feet: "bare" | "boots" | "shoes" | "sneakers" | "dress" | "slip" | "tabi" | "sandals" | "lucha" | "rubber" | "paws";
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
   * 忍びの頭巾と口元の布 / バンダナ / 剣道の面（格子の面金）/ ルチャの覆面 / 消防のヘルメット / 前向きのキャップ / 眼鏡 /
   * 恐竜のフード（口から顔が見える）
   */
  head: "none" | "tophat" | "toque" | "cap" | "swim" | "headset" | "mic" | "hood" | "bandana" | "men" | "mask" | "helmet" | "capf" | "glasses" | "dino";
  /** 首：蝶ネクタイ / 太いチェーン / スカーフ / 首にかけたタオル / ネクタイ / 首にかけたヘッドホン */
  neck: "none" | "bowtie" | "chain" | "scarf" | "towel" | "tie" | "phones";
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
  /** 剣道の防具の胴と垂（面は head、小手は hands で決める） */
  bogu: boolean;
  /** 防火服の反射の帯（袖とすね） */
  reflect: boolean;
  /** 恐竜のしっぽと、背中のとげ */
  tail: boolean;
}

export type Cloth = "white" | "ivory" | "charcoal" | "black" | "silk" | "navy" | "khaki" | "green" | "seat";
/**
 * 持ち物：ステッキ / フライパン / ペンライト / カバン / ストローの刺さった大きなカップ /
 * 竹刀・ホースの筒先（両手で持つ）/ タブレット
 */
export type Prop = "none" | "cane" | "pan" | "penlight" | "bag" | "cup" | "shinai" | "nozzle" | "tablet";

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
  wide: false,
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
  bogu: false,
  reflect: false,
  tail: false,
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
    case "kendo":
      // 紺の剣道着と、裾の広い袴。面・胴・小手・垂を着け、竹刀を両手で持つ。胴と面の紐はその人の色
      return { ...base, top: "kendo", sleeve: 0.5, cuff: 1.2, bottom: "pants", legLen: 1, flare: 1.45, baggy: 1.6, wide: true, cloth: "navy", pants: "navy", hands: "kote", hair: "none", head: "men", prop: "shinai", bogu: true };
    case "luchador":
      // 上は裸。その人の色の覆面とタイツ、ひざ下までの白いブーツ
      return { ...base, bottom: "tights", legLen: 1, flare: 1.0, pants: "seat", sheen: 0.5, feet: "lucha", hair: "none", head: "mask" };
    case "firefighter":
      // 反射の帯の付いた防火服の上下（すそは長め）、その人の色のヘルメット、厚い手袋、ゴム長靴。ホースの筒先を両手で持つ
      return { ...base, top: "turnout", sleeve: 1, cuff: 1.0, hem: 0.22, loose: 1.16, bottom: "pants", legLen: 1, flare: 1.08, baggy: 1.42, cloth: "khaki", pants: "khaki", hands: "work", feet: "rubber", hair: "none", head: "helmet", prop: "nozzle", reflect: true };
    case "dj":
      // その人の色のボンバージャケット（リブは暗く）、黒いズボン、前向きのキャップ、首にヘッドホン
      return { ...base, top: "bomber", sleeve: 1, cuff: 0.9, hem: 0.08, loose: 1.18, bottom: "pants", legLen: 1, flare: 1.04, baggy: 1.26, cloth: "seat", pants: "charcoal", feet: "sneakers", head: "capf", neck: "phones" };
    case "investor":
      // 白いシャツに濃い色のベスト、その人の色のネクタイ、眼鏡、革靴。右手にタブレット
      return { ...base, top: "vest", sleeve: 1, cuff: 1.0, hem: 0.0, loose: 1.05, bottom: "pants", legLen: 1, flare: 1.02, baggy: 1.14, cloth: "white", pants: "charcoal", sheen: 0.1, feet: "dress", head: "glasses", neck: "tie", prop: "tablet" };
    case "dino":
      // 緑の恐竜の着ぐるみ（ゆったりした上下ひと続き）。おなかと背中のとげはその人の色。丸い手足と太いしっぽ
      return { ...base, top: "dino", sleeve: 1, cuff: 1.05, hem: 0.12, loose: 1.26, bottom: "pants", legLen: 1, flare: 0.92, baggy: 1.45, wide: true, cloth: "green", pants: "green", hands: "paws", feet: "paws", hair: "none", head: "dino", tail: true };
    default:
      return { ...base, bottom: "mma", legLen: 0.45, flare: 1.15 };
  }
}

/**
 * 持ち物の長さ（握るところから先まで、m）。振る技で手をどこまで出すかに使う。
 * カップは、振る技で持ちかえる太いストローの長さ。タブレットは、振る技で持ちかえる電卓の長さ
 */
export const PROP_LENGTH: Record<Prop, number> = { none: 0, cane: 0.9, pan: 0.42, penlight: 0.26, bag: 0.36, cup: 0.5, shinai: 0.86, nozzle: 0.22, tablet: 0.15 };

/** 前腕の向きに続けて持つ（下へ垂らす）持ち物。ほかは親指の側へ伸ばして持つ */
export const hangsDown = (p: Prop) => p === "cane" || p === "bag";

/**
 * 両手で持つ持ち物（竹刀・ホースの筒先）。右手（前の手）が握るところから、左手（後ろの手）の側を
 * TWO_HAND_GAP だけ下がったところを左手が握る。向きは両手の位置で決まる（左手から右手へ伸ばす）
 */
export const twoHanded = (p: Prop) => p === "shinai" || p === "nozzle";
export const TWO_HAND_GAP = 0.2;

/** その人が右手に持っているもの */
export const propOf = (style: StyleId | null): Prop => outfitOf(style).prop;
