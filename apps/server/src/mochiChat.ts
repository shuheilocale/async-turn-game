import { gameNames, Mochi, type Card, type CardAction, type NameLang, type Seat } from "@atg/core";
import type { GameRecord } from "./store.ts";

/**
 * ふたりのもちを、LINE のトークのままお世話する。知らせ（push.ts）と返信（webhook.ts）のカードに、お世話のボタン（postback）を付ける。
 * ボタンを押すと Webhook に postback が届き、その人のお世話として指して、返信でもちのようすを返す（返信は無料枠を使わない）。
 * 文言は画面（apps/web/src/i18n/games/mochi.ts）と同じもの
 */

type Care = Mochi.Care;

const TEXTS: Record<
  NameLang,
  {
    who: string;
    open: string;
    care: Record<Care, string>;
    did: Record<Care, string>;
    react: Record<Care | "matched", string>;
    eggReact: Record<Care, string>;
    want: Record<Care | "none" | "asleep" | "egg", string>;
    hatched: string;
    child: string;
    adult: string;
  }
> = {
  ja: {
    who: "{name}さん",
    open: "開く",
    care: { feed: "ごはん", play: "あそぶ", pet: "なでる", talk: "おしゃべり", sleep: "ねかしつける", walk: "おでかけ" },
    did: {
      feed: "{who}がごはんをあげました",
      play: "{who}があそびました",
      pet: "{who}がなでました",
      talk: "{who}がおしゃべりしました",
      sleep: "{who}がねかしつけました",
      walk: "{who}がおでかけにつれていきました",
    },
    react: {
      feed: "もぐもぐ… おいしい！",
      play: "きゃっきゃっ！",
      pet: "ふにゃ〜",
      talk: "うんうん、それで？",
      sleep: "すや…",
      walk: "いってきまーす！",
      matched: "うれしそう！",
    },
    eggReact: {
      feed: "生まれたら、いっしょに食べようね",
      play: "卵をころころ転がしてあげた",
      pet: "卵がほんのりあたたかい",
      talk: "卵がこつんと返事をした",
      sleep: "卵に毛布をかけてあげた",
      walk: "卵を抱いて、ちょっとおさんぽ",
    },
    want: {
      feed: "おなかがすいたみたい",
      play: "あそびたそう",
      pet: "なでてほしそう",
      talk: "おしゃべりしたそう",
      sleep: "ねむそう",
      walk: "おでかけしたそう",
      none: "ごきげん。なにをしてもうれしそう",
      asleep: "すやすや眠っています",
      egg: "卵の中で、少しずつ育っています",
    },
    hatched: "卵がかえりました！",
    child: "こどもになりました！",
    adult: "もちがおとなになりました！",
  },
  en: {
    who: "{name}",
    open: "Open",
    care: { feed: "Feed", play: "Play", pet: "Pat", talk: "Chat", sleep: "Tuck in", walk: "Outing" },
    did: {
      feed: "{who} fed it",
      play: "{who} played with it",
      pet: "{who} gave it a pat",
      talk: "{who} had a chat with it",
      sleep: "{who} tucked it in",
      walk: "{who} took it on an outing",
    },
    react: {
      feed: "Nom nom… yummy!",
      play: "Wheee!",
      pet: "Mmm…",
      talk: "Mm-hm, and then?",
      sleep: "Zzz…",
      walk: "Off we go!",
      matched: "So happy!",
    },
    eggReact: {
      feed: "Something to share once it hatches",
      play: "You rolled the egg gently",
      pet: "The egg feels a little warm",
      talk: "The egg tapped back",
      sleep: "You tucked a blanket around the egg",
      walk: "You carried the egg on a little walk",
    },
    want: {
      feed: "Looks hungry",
      play: "Wants to play",
      pet: "Wants a pat",
      talk: "Wants to chat",
      sleep: "Looks sleepy",
      walk: "Wants to go out",
      none: "In a good mood. Anything makes it happy",
      asleep: "Sleeping soundly",
      egg: "Growing little by little inside the egg",
    },
    hatched: "The egg hatched!",
    child: "It grew into a kid!",
    adult: "Your mochi is all grown up!",
  },
  th: {
    who: "{name}",
    open: "เปิด",
    care: { feed: "ให้อาหาร", play: "เล่นด้วย", pet: "ลูบหัว", talk: "คุยด้วย", sleep: "กล่อมนอน", walk: "พาไปเที่ยว" },
    did: {
      feed: "{who} ให้อาหารแล้ว",
      play: "{who} เล่นด้วยแล้ว",
      pet: "{who} ลูบหัวให้แล้ว",
      talk: "{who} คุยด้วยแล้ว",
      sleep: "{who} กล่อมนอนแล้ว",
      walk: "{who} พาไปเที่ยวแล้ว",
    },
    react: {
      feed: "งั่มๆ… อร่อยจัง!",
      play: "เย้! สนุกจัง!",
      pet: "อืม~ ชอบจัง",
      talk: "อือๆ แล้วไงต่อ?",
      sleep: "คร่อก…",
      walk: "ไปเที่ยวกัน!",
      matched: "ดีใจสุดๆ!",
    },
    eggReact: {
      feed: "ฟักออกมาแล้วค่อยกินด้วยกันนะ",
      play: "กลิ้งไข่ให้เบาๆ",
      pet: "ไข่อุ่นขึ้นนิดหนึ่ง",
      talk: "ไข่เคาะตอบกลับมา ก๊อก",
      sleep: "ห่มผ้าห่มให้ไข่แล้ว",
      walk: "อุ้มไข่ไปเดินเล่นนิดหน่อย",
    },
    want: {
      feed: "ดูเหมือนจะหิว",
      play: "อยากเล่น",
      pet: "อยากให้ลูบหัว",
      talk: "อยากคุยด้วย",
      sleep: "ดูง่วงๆ",
      walk: "อยากออกไปเที่ยว",
      none: "อารมณ์ดี ทำอะไรให้ก็ชอบ",
      asleep: "หลับปุ๋ยอยู่",
      egg: "กำลังค่อยๆ โตอยู่ในไข่",
    },
    hatched: "ไข่ฟักแล้ว!",
    child: "โตเป็นวัยเด็กแล้ว!",
    adult: "โมจิโตเป็นผู้ใหญ่แล้ว!",
  },
};

/** 2 人の言語の文を並べるつなぎ（知らせ・メニューと同じ） */
const JOIN = "／";
/** 知らせのカードに付けるお世話のボタンの数 */
const BUTTONS = 2;

const join = (langs: NameLang[], pick: (lang: NameLang) => string) => [...new Set(langs.map(pick))].join(JOIN);

/** 知らせの種類ごとに、まず出すお世話（ほしがっているものがなければ） */
const PREFER: Record<string, Care> = { hungry: "feed", wake: "play", lonely: "talk", hatched: "pet", grown: "feed" };

/** postback の data。どの対局に、どの手を指すか（webhook.ts の chatMoveOf で読む）。LINE の上限は 300 字 */
export const moveData = (gameId: string, move: unknown) => JSON.stringify({ g: gameId, m: move });

/** postback の data を読む。読めなければ null */
export function chatMoveOf(data: string | undefined): { gameId: string; move: unknown } | null {
  try {
    const parsed = JSON.parse(data ?? "") as { g?: unknown; m?: unknown };
    return typeof parsed.g === "string" && parsed.m !== undefined ? { gameId: parsed.g, move: parsed.m } : null;
  } catch {
    return null;
  }
}

/**
 * now の時点で出すお世話のボタン。ほしがっているもの → 知らせの種類で決めたもの → なでる の順に、重ならないよう BUTTONS 個。
 * おとなになったあとは出さない
 */
export function careActions(gameId: string, state: Mochi.MochiState, now: number, langs: NameLang[], kind?: string): CardAction[] {
  if (state.form !== null) return [];
  const want = Mochi.wantOf(state, Mochi.conditionAt(state, Mochi.nowOf(state, now)));
  const cares = [...new Set([want, kind ? PREFER[kind] : undefined, "pet" as const, "talk" as const])]
    .filter((c): c is Care => !!c)
    .slice(0, BUTTONS);
  return cares.map((care) => ({ label: join(langs, (l) => TEXTS[l].care[care]), data: moveData(gameId, { care }) }));
}

/** 対局の 2 人の言語（席の順。重なりは 1 つ）。分からなければ日本語 */
export function langsOf(game: GameRecord, first?: Seat): NameLang[] {
  const players = [...game.players].sort((a, b) => (a.seat === first ? -1 : b.seat === first ? 1 : a.seat - b.seat));
  const langs = players.map((p) => (p.lang === "en" || p.lang === "th" ? p.lang : "ja") as NameLang);
  return [...new Set(langs)];
}

/**
 * トークのボタンでお世話したあとの返信のカード。だれが何をしたか、もちの反応（卵がかえった・こどもになった なども）、
 * 今ほしがっているものと、続けてお世話するボタン
 */
export function careReply(
  before: GameRecord,
  after: GameRecord,
  seat: Seat,
  care: Care,
  langs: NameLang[],
  liffId: string,
  origin?: string,
): Card {
  const prev = before.state as Mochi.MochiState;
  const next = after.state as Mochi.MochiState;
  const at = next.at ?? Date.now();
  const stageBefore = Mochi.conditionAt(prev, at).stage;
  const now = Mochi.conditionAt(next, at);
  const stageAfter = next.form !== null ? "adult" : Mochi.stageOf(next.growth);
  const name = after.players.find((p) => p.seat === seat)?.name ?? "";
  const want = Mochi.wantOf(next, now);

  const reaction = (l: NameLang) => {
    const t = TEXTS[l];
    if (stageAfter !== stageBefore && stageAfter !== "egg") return t[stageAfter === "baby" ? "hatched" : stageAfter];
    if (stageBefore === "egg") return t.eggReact[care];
    return next.last?.matched ? t.react.matched : t.react[care];
  };
  const wantText = (l: NameLang) => {
    const t = TEXTS[l];
    if (next.form !== null) return "";
    return t.want[now.stage === "egg" ? "egg" : now.asleep ? "asleep" : (want ?? "none")];
  };
  const title = join(langs, (l) => TEXTS[l].did[care].replace("{who}", TEXTS[l].who.replace("{name}", name)));
  return {
    alt: title,
    label: join(langs, (l) => gameNames.mochi?.[l] ?? "mochi"),
    title,
    body: [...new Set(langs.map((l) => [reaction(l), wantText(l)].filter(Boolean).join(" ")))].join("\n"),
    button: join(langs, (l) => TEXTS[l].open),
    url: `https://miniapp.line.me/${liffId}/g/${after.id}`,
    icon: origin?.startsWith("https://") ? `${origin.replace(/\/$/, "")}/icons/mochi.png` : undefined,
    actions: careActions(after.id, next, at, langs),
  };
}
