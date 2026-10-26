import { flexMessage, gameNames, type GameStatus, type NameLang } from "@atg/core";

/**
 * 公式アカウントのゲームのメニュー。グループ（や 1 対 1 のトーク）で「あそぶ」などと送ると、返信で
 * 「新しく遊ぶ」と、遊んでいる途中の対局のカードを横に並べて出す（リッチメニューはグループに出せないため、ことばで呼ぶ）
 */

/** メニューを呼ぶことば。ふだんの会話で反応しないよう、これだけを送ったときにかぎる */
const MENU_WORDS = new Set(["あそぶ", "遊ぶ", "メニュー", "ゲーム", "menu", "play", "game", "games", "เล่น", "เมนู", "เกม"]);

export const isMenuWord = (text: string) => MENU_WORDS.has(text.trim().toLowerCase());

/** 返信に付けるボタン（押すと「あそぶ」を送ってメニューを出す） */
export const MENU_QUICK_REPLY = {
  items: [{ type: "action", action: { type: "message", label: "あそぶ / เล่น", text: "あそぶ" } }],
};

export interface MenuGame {
  id: string;
  gameType: string;
  status: GameStatus;
  /** [先手, 後手] の名前 */
  names: [string | null, string | null];
}

const TEXTS: Record<NameLang, { newTitle: string; newBody: string; choose: string; open: string; free: string; turn: string; alt: string }> = {
  ja: {
    newTitle: "新しく遊ぶ",
    newBody: "ゲームを選んで招待します",
    choose: "ゲームを選ぶ",
    open: "開く",
    free: "いつでも",
    turn: "{name}さんの番",
    alt: "ゲームのメニュー",
  },
  en: {
    newTitle: "Start a new game",
    newBody: "Pick a game and invite",
    choose: "Pick a game",
    open: "Open",
    free: "Anytime",
    turn: "{name}'s turn",
    alt: "Game menu",
  },
  th: {
    newTitle: "เล่นเกมใหม่",
    newBody: "เลือกเกมแล้วชวนเพื่อน",
    choose: "เลือกเกม",
    open: "เปิด",
    free: "ได้ทุกเมื่อ",
    turn: "ถึงตา {name}",
    alt: "เมนูเกม",
  },
};

/** 2 人の言語の文を並べるつなぎ（知らせと同じ） */
const JOIN = "／";
/** カルーセルに並べられるのは 10 枚まで */
const MAX_BUBBLES = 10;

const join = (langs: NameLang[], pick: (lang: NameLang) => string) => [...new Set(langs.map(pick))].join(JOIN);

function statusText(lang: NameLang, game: MenuGame): string {
  if (game.status.kind !== "playing") return "";
  if (game.status.free) return TEXTS[lang].free;
  return TEXTS[lang].turn.replace("{name}", game.names[game.status.turn] ?? "?");
}

/** メニューの返信 1 通（Flex のカルーセル）。langs はグループにいる人の言語（重なりは 1 つにする） */
export function menuMessage(games: MenuGame[], langs: NameLang[], liffId: string, origin?: string): object {
  const ls: NameLang[] = langs.length ? [...new Set(langs)] : ["ja"];
  const base = `https://miniapp.line.me/${liffId}`;
  const iconOf = (gameType: string) =>
    origin?.startsWith("https://") ? `${origin.replace(/\/$/, "")}/icons/${gameType}.png` : undefined;
  const bubble = (card: Parameters<typeof flexMessage>[0]) => flexMessage(card).contents;
  const fresh = bubble({
    alt: join(ls, (l) => TEXTS[l].newTitle),
    label: join(ls, (l) => TEXTS[l].alt),
    title: join(ls, (l) => TEXTS[l].newTitle),
    body: join(ls, (l) => TEXTS[l].newBody),
    button: join(ls, (l) => TEXTS[l].choose),
    url: `${base}/`,
  });
  const ongoing = games.slice(0, MAX_BUBBLES - 1).map((game) =>
    bubble({
      alt: join(ls, (l) => gameNames[game.gameType]?.[l] ?? game.gameType),
      label: join(ls, (l) => gameNames[game.gameType]?.[l] ?? game.gameType),
      title: join(ls, (l) => statusText(l, game)),
      button: join(ls, (l) => TEXTS[l].open),
      url: `${base}/g/${game.id}`,
      icon: iconOf(game.gameType),
    }),
  );
  return {
    type: "flex",
    altText: join(ls, (l) => TEXTS[l].alt),
    contents: { type: "carousel", contents: [fresh, ...ongoing] },
    quickReply: MENU_QUICK_REPLY,
  };
}
