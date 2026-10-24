import { describe, expect, it } from "vitest";
import { Ishin } from "@atg/core";
import { translator } from "../i18n/index.tsx";
import messages from "../i18n/games/ishin.ts";
import { PICS, PICTURES, pictureOf } from "./ishin/pictures.tsx";

const { QUESTIONS, GENRES } = Ishin;

describe("ふたりの以心伝心の文言と絵", () => {
  it("日本語・英語・タイ語は同じキーを持つ", () => {
    const keys = (lang: keyof typeof messages) => Object.keys(messages[lang]).sort();
    expect(keys("en")).toEqual(keys("ja"));
    expect(keys("th")).toEqual(keys("ja"));
  });

  for (const lang of ["ja", "en", "th"] as const) {
    it(`${lang}：どの質問にも文と選択肢の言葉がある（多すぎも少なすぎもしない）`, () => {
      const t = translator(lang);
      const has = (key: string) => t(key as `game.${string}`) !== key;
      for (const q of QUESTIONS) {
        const key = `game.ishin.q.${q.id}`;
        expect(has(key), key).toBe(true);
        // 「どっちが？」の選択肢は共通の言葉を使う
        const own = q.genre === "who" ? 0 : q.choices;
        for (let i = 0; i < q.choices; i++) expect(has(`${key}.${i}`), `${key}.${i}`).toBe(i < own);
        expect(has(`${key}.${q.choices}`)).toBe(false);
      }
      for (const k of ["me", "you", "both", "neither"]) expect(has(`game.ishin.who.${k}`)).toBe(true);
      for (const g of GENRES) expect(has(`game.ishin.genre.${g}`)).toBe(true);
      for (const tier of ["perfect", "great", "good", "warm", "fresh"]) {
        expect(has(`game.ishin.tier.${tier}`)).toBe(true);
        expect(has(`game.ishin.tierText.${tier}`)).toBe(true);
      }
      expect(has("error.ishin_no_such_choice")).toBe(true);
    });
  }

  it("文言にない質問の ID はない（core と画面の質問がそろっている）", () => {
    const ids = new Set(QUESTIONS.map((q) => q.id));
    const named = Object.keys(messages.ja)
      .map((k) => k.match(/^game\.ishin\.q\.([a-z]+\.[a-z]+)$/)?.[1])
      .filter(Boolean);
    expect(new Set(named)).toEqual(ids);
  });

  it("どの選択肢にも絵がある", () => {
    for (const q of QUESTIONS) {
      for (let i = 0; i < q.choices; i++) expect(PICS[pictureOf(q.id, i)], `${q.id}.${i}`).toBeDefined();
    }
    expect(Object.keys(PICTURES).sort()).toEqual(
      QUESTIONS.filter((q) => q.genre !== "who")
        .map((q) => q.id)
        .sort(),
    );
  });
});
