import { describe, expect, it } from "vitest";
import { botName, coopText, translator } from "./index.tsx";

describe("文言", () => {
  it("お試しのコンピュータの名前には「さん」を付けない（人の名前には付ける）", () => {
    const t = translator("ja");
    expect(t("status.theirTurn", { name: botName(t) })).toBe("コンピュータの番です");
    expect(t("status.theirTurn", { name: "はる" })).toBe("はるさんの番です");
  });

  it("目印の文字は画面に残らない", () => {
    const t = translator("en");
    expect(t("status.theirTurn", { name: botName(t) })).toBe("Computer's turn");
  });

  it("協力ゲームの終わりは、ゲームに言い方があればそれを使い、なければ共通の文にする", () => {
    const t = translator("ja");
    expect(coopText(t, "ishin", "failed")).toBe("ふたりの相性が出ました");
    expect(coopText(t, "ishin", "failed", "badge")).toBe("相性が出た");
    expect(coopText(t, "heart", "failed")).toBe("失敗しました");
    expect(coopText(t, "heart", "cleared", "badge")).toBe("クリア");
  });
});
