import { describe, expect, it } from "vitest";
import { canPostTo } from "./line.ts";

describe("開いていたトークへ自動で送ってよいか", () => {
  it("グループ・複数人トークから開いたなら、トップや一覧を通って開いた対局でも送る", () => {
    expect(canPostTo({ inChat: true, chatType: "group", entryGameId: null }, "g1")).toBe(true);
    expect(canPostTo({ inChat: true, chatType: "room", entryGameId: "g2" }, "g1")).toBe(true);
  });

  it("1 対 1 のトークは、そのカードから開いた対局だけ（相手が違うトークに送らない）", () => {
    expect(canPostTo({ inChat: true, chatType: "utou", entryGameId: "g1" }, "g1")).toBe(true);
    expect(canPostTo({ inChat: true, chatType: "utou", entryGameId: null }, "g1")).toBe(false);
    expect(canPostTo({ inChat: true, chatType: "utou", entryGameId: "g2" }, "g1")).toBe(false);
  });

  it("トーク以外から開いたなら送らない", () => {
    expect(canPostTo({ inChat: false, chatType: null, entryGameId: "g1" }, "g1")).toBe(false);
  });
});
