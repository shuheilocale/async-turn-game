import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import { photo, REDRAWS, ROUNDS, NOTE_MAX, TOPICS, type PhotoMove, type PhotoState, type PhotoView } from "./photo.ts";

const fixed = (v: number) => () => v;
const start = () => photo.initialState(fixed(0.3));

let n = 0;
const pid = () => `photo-id-${String(n++).padStart(6, "0")}`;

const play = (s: PhotoState, move: PhotoMove, seat: Seat, at = 1_000) => photo.applyMove(s, photo.stampMove!(move, at), seat);
const shot = (s: PhotoState, seat: Seat, note = "") => play(s, { kind: "photo", photo: pid(), note }, seat);

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

describe("photo", () => {
  it("お題は 40 個あり、種から順番が決まる。1 冊で同じお題は出ない", () => {
    expect(TOPICS.length).toBe(40);
    expect(new Set(TOPICS).size).toBe(40);
    const a = photo.initialState(fixed(0.3));
    expect(a).toEqual(photo.initialState(fixed(0.3)));
    expect(new Set(a.order).size).toBe(40);
    expect(a.topic).toBe(a.order[0]);
    expect(TOPICS.length).toBeGreaterThan(ROUNDS + REDRAWS);
  });

  it("順番はなく、2 人とも出すとページになり、どちらかが「次のお題へ」を押すと次のお題になる", () => {
    let s = start();
    expect(photo.status(s)).toMatchObject({ kind: "playing", free: true });
    const first = s.topic;
    s = shot(s, 1, "おひるです");
    expect(s.entries[1]?.note).toBe("おひるです");
    expect(s.pages).toHaveLength(0);
    s = shot(s, 0);
    expect(s.pages).toHaveLength(1);
    expect(s.pages[0]!.topic).toBe(first);
    expect(s.topic).toBeNull();
    expect(s.entries).toEqual([null, null]);
    // そろったまま待っているあいだは出せない
    expect(code(() => shot(s, 0))).toBe("photo_press_next");
    s = play(s, { kind: "next" }, 1);
    expect(s.topic).toBe(s.order[1]);
    expect(code(() => play(s, { kind: "next" }, 0))).toBe("photo_not_ready");
  });

  it("相手が出す前なら、自分の写真を出しなおせる。同じ写真は 2 つのお題に使えない", () => {
    let s = start();
    const id = pid();
    s = play(s, { kind: "photo", photo: id, note: "" }, 0);
    s = play(s, { kind: "photo", photo: id, note: "やっぱり" }, 0);
    expect(s.entries[0]).toMatchObject({ photo: id, note: "やっぱり" });
    const other = pid();
    s = play(s, { kind: "photo", photo: other, note: "" }, 0);
    expect(s.entries[0]?.photo).toBe(other);
    // 相手が自分の写真と同じ ID を出すことはできない
    expect(code(() => play(s, { kind: "photo", photo: other, note: "" }, 1))).toBe("photo_used");
    s = shot(s, 1);
    s = play(s, { kind: "next" }, 0);
    expect(code(() => play(s, { kind: "photo", photo: other, note: "" }, 0))).toBe("photo_used");
  });

  it("お題は、まだどちらも出していないうちだけ、1 冊で決まった回数まで引き直せる", () => {
    let s = start();
    const seen = [s.topic];
    for (let i = 0; i < REDRAWS; i++) {
      s = play(s, { kind: "redraw" }, (i % 2) as Seat);
      seen.push(s.topic);
    }
    expect(new Set(seen).size).toBe(REDRAWS + 1);
    expect(code(() => play(s, { kind: "redraw" }, 0))).toBe("photo_no_redraw");
    const t = shot(photo.initialState(fixed(0.5)), 0);
    expect(code(() => play(t, { kind: "redraw" }, 1))).toBe("photo_redraw_after_photo");
  });

  it(`${ROUNDS} ページそろうとアルバムができて、2 人でクリア`, () => {
    let s = start();
    for (let i = 0; i < ROUNDS; i++) {
      s = shot(shot(s, 0), 1);
      if (i < ROUNDS - 1) s = play(s, { kind: "next" }, 0);
    }
    expect(photo.status(s)).toEqual({ kind: "finished", winner: null, coop: "cleared" });
    expect(new Set(s.pages.map((p) => p.topic)).size).toBe(ROUNDS);
    expect(code(() => play(s, { kind: "next" }, 0))).toBe("game_over");
  });

  it("相手の写真とひとことは、そろうまで見えない（出したかどうかだけ見える）", () => {
    let s = shot(start(), 0, "ひみつ");
    const mine = photo.viewState!(s, 0, false) as PhotoView;
    const theirs = photo.viewState!(s, 1, false) as PhotoView;
    expect(mine.entries[0]).toMatchObject({ note: "ひみつ" });
    expect(theirs.entries[0]).toBe("hidden");
    expect(JSON.stringify(theirs)).not.toContain("ひみつ");
    expect(JSON.stringify(theirs)).not.toContain(s.entries[0]!.photo);
    // これからのお題も見せない
    expect(JSON.stringify(theirs)).not.toContain(s.order[5]!);
    s = shot(s, 1);
    const both = photo.viewState!(s, 1, false) as PhotoView;
    expect(both.waiting).toBe(true);
    expect(both.pages[0]!.entries[0].note).toBe("ひみつ");
  });

  it("写真を見てよい人：そろったページの写真はだれでも、まだの写真は出した本人だけ", () => {
    let s = shot(start(), 0);
    const id = s.entries[0]!.photo;
    expect(photo.canSeePhoto!(s, id, 0)).toBe(true);
    expect(photo.canSeePhoto!(s, id, 1)).toBe(false);
    expect(photo.canSeePhoto!(s, id, null)).toBe(false);
    expect(photo.canSeePhoto!(s, "unknown-photo", 0)).toBe(false);
    s = shot(s, 1);
    expect(photo.canSeePhoto!(s, id, null)).toBe(true);
  });

  it("手を読む：写真の ID の形を確かめ、ひとことは短く整え、時刻は使わない", () => {
    expect(photo.parseMove({ kind: "photo", photo: "abc" })).toBeNull();
    expect(photo.parseMove({ kind: "photo", photo: "../../etc/passwd" })).toBeNull();
    expect(photo.parseMove({ kind: "next", at: 5 })).toEqual({ kind: "next" });
    const long = "あ".repeat(NOTE_MAX + 10);
    const m = photo.parseMove({ kind: "photo", photo: "abcdefghijkl", note: `  ${long}\n` });
    expect(m).toEqual({ kind: "photo", photo: "abcdefghijkl", note: "あ".repeat(NOTE_MAX) });
    expect(photo.parseMove({ kind: "nope" })).toBeNull();
    expect(photo.photosOfMove!({ kind: "photo", photo: "abcdefghijkl", note: "" })).toEqual(["abcdefghijkl"]);
    expect(photo.photosOfMove!({ kind: "next" })).toEqual([]);
  });

  it("手の記録では、相手の写真とひとことを伏せる", () => {
    const move: PhotoMove = { kind: "photo", photo: "abcdefghijkl", note: "ないしょ", at: 5 };
    expect(photo.viewMove!(move, 0, 0)).toEqual(move);
    expect(photo.viewMove!(move, 0, 1)).toEqual({ kind: "photo", photo: null, note: null, at: 5 });
    expect(photo.viewMove!({ kind: "next", at: 5 }, 0, 1)).toEqual({ kind: "next", at: 5 });
  });
});
