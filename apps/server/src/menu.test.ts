import { describe, expect, it } from "vitest";
import { isMenuWord, menuMessage, type MenuGame } from "./menu.ts";

const LIFF = "2012180396-nO920f3r";

describe("ゲームのメニュー（グループで「あそぶ」と送ったとき）", () => {
  it("決まったことばだけに反応する（ふだんの会話には反応しない）", () => {
    for (const word of ["あそぶ", " 遊ぶ ", "メニュー", "ゲーム", "Menu", "PLAY", "เล่น", "เมนู", "เกม"]) expect(isMenuWord(word)).toBe(true);
    for (const text of ["あそぶ？", "今日あそぶ", "ok", ""]) expect(isMenuWord(text)).toBe(false);
  });

  it("先頭は新しく遊ぶカード、続けて遊んでいる途中の対局（新しい順）を並べる", () => {
    const games: MenuGame[] = [
      { id: "g1", gameType: "mochi", status: { kind: "playing", turn: 0, free: true }, names: ["あき", "Nok"] },
      { id: "g2", gameType: "tictactoe", status: { kind: "playing", turn: 1 }, names: ["あき", "Nok"] },
    ];
    const m = menuMessage(games, ["ja", "th"], LIFF, "https://example.workers.dev") as any;
    expect(m.type).toBe("flex");
    const bubbles = m.contents.contents;
    expect(m.contents.type).toBe("carousel");
    expect(bubbles).toHaveLength(3);
    // 新しく遊ぶ：ミニアプリのトップを開く
    expect(JSON.stringify(bubbles[0])).toContain(`https://miniapp.line.me/${LIFF}/`);
    // 順番なしのゲームは「いつでも」、順番のあるゲームは手番の人の名前
    expect(JSON.stringify(bubbles[1])).toContain("いつでも");
    expect(JSON.stringify(bubbles[1])).toContain(`https://miniapp.line.me/${LIFF}/g/g1`);
    expect(JSON.stringify(bubbles[2])).toContain("Nokさんの番");
    expect(JSON.stringify(bubbles[2])).toContain("ถึงตา Nok");
    // アイコンは https のときだけ
    expect(JSON.stringify(bubbles[1])).toContain("https://example.workers.dev/icons/mochi.png");
  });

  it("対局がなければ新しく遊ぶカードだけ。言語が 1 つならその言語だけ", () => {
    const m = menuMessage([], ["ja"], LIFF) as any;
    expect(m.contents.contents).toHaveLength(1);
    expect(JSON.stringify(m.contents)).not.toContain("เล่น");
  });

  it("カルーセルは 10 枚まで（新しく遊ぶ + 対局 9 つ）", () => {
    const games: MenuGame[] = Array.from({ length: 15 }, (_, i) => ({
      id: `g${i}`,
      gameType: "tictactoe",
      status: { kind: "playing", turn: 0 },
      names: ["あき", "Nok"],
    }));
    expect((menuMessage(games, ["ja"], LIFF) as any).contents.contents).toHaveLength(10);
  });
});
