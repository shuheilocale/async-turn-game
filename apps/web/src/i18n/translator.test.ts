import { describe, expect, it } from "vitest";
import { botName, translator } from "./index.tsx";

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
});
