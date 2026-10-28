import { describe, expect, it, vi } from "vitest";
import { flexMessage, getGame, Photo, type GameView, type Seat } from "@atg/core";
import { translator } from "../i18n/index.tsx";
import { progressCard } from "../notify.ts";

// LINE は https の画像しか使えないので、https で開いているときだけ写真を載せる
vi.stubGlobal("location", { protocol: "https:", origin: "https://example.workers.dev" });

const def = getGame("photo")!;
let n = 0;
const shot = (s: Photo.PhotoState, seat: Seat) =>
  def.applyMove(s, def.stampMove!({ kind: "photo", photo: `photo-${String(n++).padStart(20, "0")}`, note: "" }, 1_000), seat) as Photo.PhotoState;

const view = (state: Photo.PhotoState): GameView => ({
  id: "g1",
  gameType: "photo",
  version: 2,
  state: def.viewState!(state, 0, def.status(state).kind === "finished"),
  status: def.status(state),
  players: [
    { seat: 0, name: "あき", lang: "ja" },
    { seat: 1, name: "はる", lang: "ja" },
  ],
  you: 0,
  waitingForOpponent: false,
  inviteCode: null,
  nextGameId: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("きょうのおだい写真の LINE のカード", () => {
  const t = translator("ja");

  it("2 人の写真がそろったら、2 枚をカードの上に並べる", () => {
    const s = shot(shot(def.initialState(() => 0.5) as Photo.PhotoState, 1), 0);
    const card = progressCard(t, view(s), "あきさんが写真を出しました");
    const page = s.pages[0]!;
    expect(card.title).toBe("2 人の写真がそろいました");
    expect(card.body).toBe(`お題「${t(`game.photo.topic.${page.topic}`)}」`);
    expect(card.images).toEqual(page.entries.map((e) => `https://example.workers.dev/api/photos/${e.photo}`));

    const flex = flexMessage(card).contents as { hero?: { contents: { url: string }[] }; body: { contents: unknown[] } };
    expect(flex.hero?.contents.map((c) => c.url)).toEqual(card.images);
    // 写真があれば、左のアイコンは出さない
    expect(flex.body.contents).toHaveLength(1);
  });

  it("1 人だけ出したときは、写真を載せない（相手の写真はまだ見せない）", () => {
    const s = shot(def.initialState(() => 0.5) as Photo.PhotoState, 0);
    const card = progressCard(t, view(s), "あきさんが写真を出しました");
    expect(card.title).toBe("あきさんが写真を出しました");
    expect(card.images).toBeUndefined();
    expect((flexMessage(card).contents as { hero?: unknown }).hero).toBeUndefined();
  });

  it("アルバムができたら、さいごのページの写真を載せて、もう一局のボタンも付ける", () => {
    let s = def.initialState(() => 0.5) as Photo.PhotoState;
    for (let i = 0; i < Photo.ROUNDS; i++) {
      s = shot(shot(s, 0), 1);
      if (i < Photo.ROUNDS - 1) s = def.applyMove(s, { kind: "next", at: 1 }, 0) as Photo.PhotoState;
    }
    const card = progressCard(t, view(s), "はるさんが写真を出しました");
    expect(card.title).toBe("アルバムができました");
    expect(card.images).toHaveLength(2);
    expect(card.actions).toHaveLength(2);
  });
});
