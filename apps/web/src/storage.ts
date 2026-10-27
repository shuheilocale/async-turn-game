import type { Seat } from "@atg/core";

/**
 * 参加中の対局の「合言葉（トークン）」をこの端末に覚えておく。
 * アカウントがないので、これを失うとその対局には指せなくなる。
 * 別の端末で続けたいときは「自分用リンク」で持ち出す。
 */
export interface SavedGame {
  token: string;
  seat: Seat;
  savedAt: string;
}

const GAMES_KEY = "atg:games";
const NAME_KEY = "atg:name";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // プライベートブラウズなどで保存できない場合は諦める
  }
}

export const savedGames = {
  all: () => read<Record<string, SavedGame>>(GAMES_KEY, {}),
  get: (id: string): SavedGame | undefined => savedGames.all()[id],
  save(id: string, game: Omit<SavedGame, "savedAt">) {
    write(GAMES_KEY, { ...savedGames.all(), [id]: { ...game, savedAt: new Date().toISOString() } });
  },
  remove(id: string) {
    const all = savedGames.all();
    delete all[id];
    write(GAMES_KEY, all);
  },
};

export const savedName = {
  get: () => read<string>(NAME_KEY, ""),
  set: (name: string) => write(NAME_KEY, name),
};

/** トップの「終わった対局」を開いているか */
export const savedFinishedOpen = {
  get: () => read<boolean>("atg:finishedOpen", false),
  set: (open: boolean) => write("atg:finishedOpen", open),
};

/** トップのゲーム一覧で選んでいる種類（"all" か種類の名前） */
export const savedCategory = {
  get: () => read<string>("atg:category", "all"),
  set: (category: string) => write("atg:category", category),
};

/** 対局画面の「公式アカウントを友だち追加すると知らせが届く」の案内を閉じたか */
export const savedNoticeHintClosed = {
  get: () => read<boolean>("atg:noticeHintClosed", false),
  set: (closed: boolean) => write("atg:noticeHintClosed", closed),
};

/**
 * 順番のないゲームで、相手に LINE で知らせた時刻（ミリ秒）と、自分がさいごに指したあとの版（対局ごと）。
 * 同じ人が短い間に続けて指したときに、毎回は知らせないために使う（notify.ts の freeNotice）
 */
export const savedNotified = {
  get: (id: string): Notified | undefined => read<Record<string, Notified>>("atg:notified", {})[id],
  set(id: string, value: Notified) {
    write("atg:notified", { ...read<Record<string, Notified>>("atg:notified", {}), [id]: value });
  },
};

export interface Notified {
  at: number;
  version: number;
}

/** グループに招待を送った対局。グループへはボタン 1 つで送れるので、開き直しても二重に送らないよう覚えておく */
export const savedInvited = {
  has: (id: string) => read<string[]>("atg:invited", []).includes(id),
  add(id: string) {
    const all = read<string[]>("atg:invited", []);
    if (!all.includes(id)) write("atg:invited", [...all.slice(-49), id]);
  },
};
