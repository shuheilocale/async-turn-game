/**
 * 格闘ゲーム「バックボーン・ファイト」の 3D の舞台（FighterStage）と、ルール・画面の間の受け渡しの形。
 * ルールの担当と 3D の担当が同時に作るため、先にここで決めておく（変えるときは両方に合わせる）
 */

/** バックボーン（格闘技の種類）。packages/core の fight のルールと同じ ID を使う */
export type StyleId =
  | "karate"
  | "muaythai"
  | "boxing"
  | "mma"
  | "judo"
  | "bjj"
  | "capoeira"
  | "taekwondo"
  | "wrestling"
  | "sumo";

/** パラメータ（それぞれ 1〜8、合計 20）。体格の見た目にも使う */
export interface FighterStats {
  /** 攻撃。肩・腕・首が太くなる */
  power: number;
  /** 防御。胴が厚く、どっしりする */
  guard: number;
  /** すばやさ。細身で手足が長く、構えが軽くなる */
  speed: number;
  /** スタミナ。息づかいがゆったりし、胸が大きくなる */
  stamina: number;
}

export interface FighterLook {
  style: StyleId;
  stats: FighterStats;
  /** 0 = 青、1 = オレンジ（道着・グローブ・パンツなどの色） */
  seat: 0 | 1;
}

/** 技の動きの種類。ルールの技はどれかの動きに対応させる（同じ動きを複数の技で使ってよい） */
export type ActionKind =
  | "jab"
  | "straight"
  | "hook"
  | "uppercut"
  | "kick_high"
  | "kick_mid"
  | "kick_low"
  | "spin_kick"
  | "knee"
  | "elbow"
  | "push"
  | "clinch"
  | "takedown"
  | "throw"
  | "submission"
  | "block"
  | "dodge"
  | "counter";

/** 1 回の攻防のうち、1 人の技とその結果 */
export interface StageStrike {
  /** 技を出した人 */
  by: 0 | 1;
  kind: ActionKind;
  /** hit = 当たった、blocked = 防がれた、dodged = かわされた、countered = 返された、whiff = 空振り */
  result: "hit" | "blocked" | "dodged" | "countered" | "whiff";
  /** 与えたダメージ（表示用） */
  damage: number;
}

/** 再生する攻防。id が変わるたびに 1 回だけ再生する。2 人分の技を順に（または同時に）見せる */
export interface StageEvent {
  id: number;
  strikes: StageStrike[];
  /** この攻防のあとの位置関係 */
  position: "standing" | "clinch" | "ground";
  /** この攻防で倒れた人（KO）。いなければ null */
  ko: 0 | 1 | null;
}

export interface FighterStageProps {
  /** 2 人の見た目。null はまだ決まっていない（シルエットで見せる） */
  fighters: [FighterLook | null, FighterLook | null];
  /** custom = キャラ作り（1 人を少し回り込みながら見せる）、fight = 2 人が向かい合う */
  mode: "custom" | "fight";
  /** custom のときに見せる人 */
  focus?: 0 | 1;
  /** 画面の手前に立つ人（自分）。fight のとき、この人を左手前にする。観戦者は 0 */
  me?: 0 | 1;
  /** 再生する攻防 */
  event?: StageEvent | null;
  /** 再生が終わったら呼ぶ */
  onEventDone?(id: number): void;
  /** 0〜100。少ないほど息が荒く前かがみ、0 なら倒れた姿勢 */
  hp?: [number, number];
  className?: string;
}
