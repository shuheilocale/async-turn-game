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

const I18nContext = createContext<{ lang: Lang; setLang(lang: Lang): void; t: T } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => {
    const dict = dictionaries[lang];
    const t: T = (key, vars) => {
      let text = (dict as Record<string, string>)[key] ?? (ja as Record<string, string>)[key] ?? key;
      for (const [name, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(v));
      return text;
    };
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
