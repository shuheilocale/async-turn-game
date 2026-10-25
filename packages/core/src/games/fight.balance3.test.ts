import { describe } from "vitest";
import { checkChunk } from "./fight.balance.shared.ts";

/** バックボーン・ファイトのバランス（組み合わせの 3 つ目の分け前）。fight.balance.test.ts と並んで動かすため、別のファイルにしてある */
describe("fight", () => {
  describe("バランス", () => {
    checkChunk(2);
  });
});
