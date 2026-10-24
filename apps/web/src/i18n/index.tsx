import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ja, type MessageKey, type Messages } from "./ja.ts";
import { en } from "./en.ts";
import { th } from "./th.ts";

export type Lang = "ja" | "en" | "th";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "ja", label: "日本語" },
  { id: "en", label: "English" },
  { id: "th", label: "ไทย" },
];

/**
 * ゲームごとの文言（i18n/games/<ゲームID>.ts）。キーは game.<ID>.* と error.<コード>。
 * ゲームを足すときは ja.ts などを触らず、ここにファイルを 1 つ足せばよい
 */
export type GameMessages = Record<Lang, Record<string, string>>;
const gameFiles = import.meta.glob<{ default: GameMessages }>("./games/*.ts", { eager: true });
const gameMessages = (lang: Lang) =>
  Object.values(gameFiles).reduce<Record<string, string>>((all, file) => ({ ...all, ...file.default[lang] }), {});

const dictionaries: Record<Lang, Messages> = {
  ja: { ...gameMessages("ja"), ...ja },
  en: { ...gameMessages("en"), ...en },
  th: { ...gameMessages("th"), ...th },
};
const LANG_KEY = "atg:lang";

/** ゲームごと・エラーごとのキーは実行時に組み立てるので、文字列も受け付ける */
type Key = MessageKey | `game.${string}` | `error.${string}`;
export type T = (key: Key, vars?: Record<string, string | number>) => string;

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ja" || saved === "en" || saved === "th") return saved;
  } catch {
    // 保存できない環境では毎回ブラウザの言語設定から決める
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    if (l.startsWith("ja")) return "ja";
    if (l.startsWith("th")) return "th";
    if (l.startsWith("en")) return "en";
  }
  return "en";
}

/** 指定した言語で文言を作る。画面の言語とは別の言語が要るとき（LINE のカードを相手の言語で作る）に使う */
export function translator(lang: Lang): T {
  const dict = dictionaries[lang] as Record<string, string>;
  return (key, vars) => {
    let text = dict[key] ?? (ja as Record<string, string>)[key] ?? key;
    for (const [name, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(v));
    // コンピュータの名前（botName）には、日本語の「〇〇さん」の「さん」を付けない。目印の文字は残さない
    return text.replace(new RegExp(`${BOT_MARK}([^${BOT_MARK}]*)${BOT_MARK}さん`, "g"), "$1").replaceAll(BOT_MARK, "");
  };
}

/** お試しのコンピュータの名前を囲む目印（画面には出ない文字） */
const BOT_MARK = "\u2063";

/** お試しのコンピュータの名前。文言に入れても「コンピュータさん」にならない */
export const botName = (t: T) => `${BOT_MARK}${t("learn.bot")}${BOT_MARK}`;

/** サーバから届いた言語の文字列を、画面が対応している言語にする。対応していなければ null */
export const asLang = (raw: string | null | undefined): Lang | null =>
  raw === "ja" || raw === "en" || raw === "th" ? raw : null;

const I18nContext = createContext<{ lang: Lang; setLang(lang: Lang): void; t: T } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => {
    const t = translator(lang);
    const setLang = (next: Lang) => {
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        // 保存できなくても切り替え自体はできる
      }
      setLangState(next);
    };
    return { lang, setLang, t };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("I18nProvider がありません");
  return ctx;
}

/** API のエラーコードを今の言語の文にする */
export function errorText(t: T, err: unknown): string {
  const code = (err as { code?: string }).code;
  const text = code ? t(`error.${code}`) : t("error.network");
  return text.startsWith("error.") ? t("error.unknown") : text;
}
