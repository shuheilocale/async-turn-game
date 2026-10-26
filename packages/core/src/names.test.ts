import { describe, expect, it } from "vitest";
import { gameNames, games } from "./index.ts";

describe("ゲームの名前", () => {
  it("登録したゲームはすべて、ja・en・th の名前を持つ（画面とサーバの LINE の知らせで使う）", () => {
    for (const id of Object.keys(games)) {
      for (const lang of ["ja", "en", "th"] as const) expect(gameNames[id]?.[lang], `${id}.${lang}`).toBeTruthy();
    }
    expect(Object.keys(gameNames).sort()).toEqual(Object.keys(games).sort());
  });
});
