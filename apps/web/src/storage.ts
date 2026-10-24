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
