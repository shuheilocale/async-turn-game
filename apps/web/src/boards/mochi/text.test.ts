import { describe, expect, it } from "vitest";
import { Mochi } from "@atg/core";
import { coopText, translator, type Lang } from "../../i18n/index.tsx";
import messages from "../../i18n/games/mochi.ts";
import { boards } from "../index.ts";

const LANGS: Lang[] = ["ja", "en", "th"];

/** 盤が組み立てて使うキー（お世話・段階・姿・できごと・たからもの など） */
const used = [
  ...Mochi.CARES.flatMap((c) => [`care.${c}`, `did.${c}`, `react.${c}`, `eggReact.${c}`, `want.${c}`]),
  ...Mochi.STAGES.map((s) => `stage.${s}`),
  ...Mochi.FORMS.flatMap((f) => [`form.${f}`, `formDesc.${f}`]),
  ...Mochi.ITEMS.flatMap((i) => [`item.${i}`, `itemIn.${i}`]),
  ...Mochi.DREAMS.map((d) => `dream.${d}`),
  ...Mochi.MOMENTS.map((m) => `moment.${m}`),
  ...Mochi.EGG_MOMENTS.map((m) => `egg.${m}`),
  ...["egg", "asleep", "sleepy", "hungry", "sad", "happy", "calm"].map((m) => `mood.${m}`),
  ...["tummy", "joy", "sleepy"].map((n) => `need.${n}`),
  "want.none",
  "want.asleep",
  "want.egg",
  "want.mark",
  "react.matched",
  "react.tap",
  "hap.found",
  "hap.foundWalk",
  "hap.hatched",
  "hap.grew",
].map((k) => `game.mochi.${k}`);

describe("ふたりのもちの文言", () => {
  it("日本語・英語・タイ語のキーがそろっていて、盤で使うキーはどれもある", () => {
    const keys = Object.keys(messages.ja).sort();
    for (const lang of LANGS) {
      expect(Object.keys(messages[lang]).sort(), lang).toEqual(keys);
      for (const k of used) expect(messages[lang], `${lang} ${k}`).toHaveProperty([k]);
      for (const v of Object.values(messages[lang])) expect(v.trim().length, lang).toBeGreaterThan(0);
    }
  });

  it("終わりの文言は「おとなになりました」（協力ゲームの共通の「クリア」の代わり）", () => {
    expect(coopText(translator("ja"), "mochi", "cleared")).toBe("もちがおとなになりました！");
    expect(coopText(translator("ja"), "mochi", "cleared", "badge")).toBe("おとなになった");
    expect(coopText(translator("en"), "mochi", "cleared")).toBe("Your mochi is all grown up!");
    expect(coopText(translator("th"), "mochi", "cleared", "badge")).toBe("โตแล้ว");
  });

  it("拾ったものの名前は文の中に入る（英語は a / an 付き）", () => {
    expect(translator("ja")("game.mochi.hap.found", { item: translator("ja")("game.mochi.itemIn.mango") })).toBe(
      "留守のあいだに、マンゴーを拾ってきたみたい",
    );
    expect(translator("en")("game.mochi.hap.found", { item: translator("en")("game.mochi.itemIn.acorn") })).toBe(
      "While you were away, it found an acorn",
    );
  });

  it("LINE の知らせは「指しました」ではなく、したお世話の文にする", () => {
    const moved = boards.mochi!.movedText!;
    expect(moved(translator("ja"), { care: "feed" }, "あき")).toBe("あきさんがごはんをあげました");
    expect(moved(translator("th"), { care: "pet" }, "Nok")).toContain("Nok");
  });
});
