import { describe, expect, it } from "vitest";
import { Badminton, getGame } from "@atg/core";
import { translator } from "../../i18n/index.tsx";
import { boards } from "../index.ts";
import { rallyText } from "./text.ts";

const t = translator("ja");
const B = Badminton;

/** seat が (x, y) から、ネットから depth の所へ angle の向きで打つ速さ */
function aim(seat: 0 | 1, x: number, y: number, angle: number, depth: number) {
  const v = B.speedFor(seat, x, y, angle, depth);
  return { vx: B.round3(Math.cos(angle) * v * B.dirOf(seat)), vy: B.round3(Math.sin(angle) * v) };
}

describe("バドミントンの文", () => {
  const moved = (move: unknown) => boards.badminton!.movedText!(t, move, "J");

  it("LINE の知らせは、手からショットの名前と、入ったかどうかを書く", () => {
    const serve = { kind: "serve", ...aim(0, -B.SERVE_X, B.SERVE_Y, 0.95, 6) };
    expect(moved(serve)).toBe("Jさんがロングサーブを打ちました");
    expect(moved({ kind: "serve", vx: 8, vy: 0 })).toBe("Jさんのショートサーブはネットにかかりました");
    expect(moved({ kind: "serve", ...aim(1, B.SERVE_X, B.SERVE_Y, 0.9, 1.5) })).toBe("Jさんのサーブは手前すぎました");
    expect(moved({ kind: "hit", f: 100, px: 3, x: 3, y: 2.7, vx: -20, vy: -6 })).toBe("Jさんがスマッシュで返しました");
    expect(moved({ kind: "hit", f: 100, px: -5, x: -5, y: 2.5, ...aim(0, -5, 2.5, 0.6, 7.6) })).toBe("Jさんのクリアはアウトでした");
    expect(moved({ kind: "miss", px: 3 })).toBe("Jさんは返せませんでした");
  });

  it("終わったラリーの結果を、だれの点かまで書く", () => {
    const def = getGame("badminton")!;
    let s = def.initialState(Math.random) as Badminton.BadmintonState;
    s = def.applyMove(s, { kind: "serve", vx: 8, vy: 0 }, 0) as Badminton.BadmintonState;
    const nameOf = (seat: 0 | 1) => (seat === 0 ? "あなた" : "Jさん");
    expect(rallyText(t, s.last!, nameOf)).toBe("あなたのショートサーブはネットにかかりました。Jさんの点");
    s = def.applyMove(s, { kind: "serve", ...aim(1, B.SERVE_X, B.SERVE_Y, 0.95, 6) }, 1) as Badminton.BadmintonState;
    s = def.applyMove(s, { kind: "miss", px: -3 }, 0) as Badminton.BadmintonState;
    expect(rallyText(t, s.last!, nameOf)).toBe("Jさんのロングサーブが決まりました。Jさんの点");
  });
});
