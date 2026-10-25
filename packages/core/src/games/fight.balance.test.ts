import { describe, expect, it } from "vitest";
import { botBuild, STYLE_IDS, type FighterStats } from "./fight.ts";
import { checkChunk, SLOW, tally } from "./fight.balance.shared.ts";

/**
 * バックボーン・ファイトのバランス（コンピュータ同士の勝率）。たくさん対局して時間がかかるので、ほかのテストと並んで動くよう
 * fight.test.ts とは別のファイルにしてある。全部の組み合わせは 4 つに分け、fight.balance.test.ts と fight.balance2〜4.test.ts で並んで確かめる
 */

const stats = (power: number, guard: number, speed: number, stamina: number): FighterStats => ({ power, guard, speed, stamina });

describe("fight", () => {
  describe("バランス", () => {
    checkChunk(0);

    it("極端な振り分けにも勝ち目と弱点がある", () => {
      const extremes: FighterStats[] = [stats(8, 1, 3, 8), stats(8, 1, 8, 3), stats(1, 8, 3, 8), stats(3, 8, 8, 1), stats(1, 3, 8, 8), stats(8, 8, 1, 3)];
      for (const x of extremes) {
        // どのバックボーンで使うかごとに、ふつうに振り分けた相手（バックボーンはでたらめ）との勝率
        const rates = STYLE_IDS.map(
          (style, i) =>
            tally(
              (rng) => {
                const opp = STYLE_IDS[Math.floor(rng() * STYLE_IDS.length)]!;
                return [
                  { style, stats: x },
                  { style: opp, stats: botBuild(opp, rng) },
                ];
              },
              40,
              99 + i,
            ).rate,
        );
        const label = JSON.stringify(x);
        // 合うバックボーンなら五分以上に戦え（勝ち目）、どれでも勝ち越せるわけではない（弱点）。勝ちすぎ・負けすぎもない
        expect(Math.max(...rates), label).toBeGreaterThan(0.45);
        expect(Math.min(...rates), label).toBeLessThan(0.5);
        const avg = rates.reduce((a, r) => a + r, 0) / rates.length;
        expect(avg, label).toBeGreaterThan(0.3);
        expect(avg, label).toBeLessThan(0.7);
      }
    }, SLOW);
  });
});
