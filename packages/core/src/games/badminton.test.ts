import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import {
  badminton,
  canHit,
  clampPlayer,
  dirOf,
  DT,
  flight,
  flightOf,
  HALF,
  HOME,
  judge,
  MAX_FRAMES,
  RECEIVE_PX,
  REACH,
  round3,
  RUN,
  SERVE_X,
  SERVE_Y,
  shotOf,
  sideX,
  speedFor,
  startPx,
  TARGET,
  turnOf,
  type BadmintonMove,
  type BadmintonState,
} from "./badminton.ts";

const rng = () => 0.5;

/** seat が、ネットから depth の所へ angle の向きで打つ速さ（向きつき） */
function aim(seat: Seat, x: number, y: number, angle: number, depth: number) {
  const v = speedFor(seat, x, y, angle, depth);
  return { vx: round3(Math.cos(angle) * v * dirOf(seat)), vy: round3(Math.sin(angle) * v) };
}

/** サーブ：ネットから depth の所へ高く上げる */
const serve = (seat: Seat, depth = 6, angle = 0.95): BadmintonMove => ({
  kind: "serve",
  ...aim(seat, sideX(seat, SERVE_X), SERVE_Y, angle, depth),
});

/** 今のシャトルを、届く所で打ち返す手（いちばん早く届くコマ）。打つ向きと落とす所を決める */
function returnMove(s: BadmintonState, angle = 0.9, depth = 5.5): BadmintonMove & { kind: "hit" } {
  const last = s.hits[s.hits.length - 1]!;
  const seat = (1 - last.seat) as Seat;
  const fl = flightOf(last);
  const start = startPx(s);
  for (let f = 1; f < fl.end; f++) {
    const sx = fl.x[f]!;
    const px = round3(clampPlayer(seat, sx + Math.max(-REACH * 0.9, Math.min(REACH * 0.9, start - sx))));
    if (!canHit(fl, f, seat, px, start)) continue;
    const x = fl.x[f]!;
    const y = fl.y[f]!;
    return { kind: "hit", f, px, x: round3(x), y: round3(y), ...aim(seat, x, y, angle, depth) };
  }
  throw new Error("届かない");
}

const apply = (s: BadmintonState, m: BadmintonMove, seat: Seat) => badminton.applyMove(s, badminton.parseMove(m)!, seat);

/** その手が投げるエラーのコード */
function errorOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
}

describe("シャトルの飛び方", () => {
  it("同じ打ち方なら同じ道筋になり、落ちた所で止まる", () => {
    const a = flight(-5, 2.5, 15, 12);
    const b = flight(-5, 2.5, 15, 12);
    expect(a).toEqual(b);
    expect(a.net).toBe(false);
    expect(a.y[a.end]).toBe(0);
    expect(a.end).toBeLessThan(MAX_FRAMES);
  });

  it("強く打っても、空気のブレーキで急に失速する（速さを倍にしても、飛ぶ距離は倍にならない）", () => {
    const land = (v: number) => {
      const fl = flight(-5, 2.5, v * Math.SQRT1_2, v * Math.SQRT1_2, true);
      return fl.x[fl.end]! + 5;
    };
    expect(land(24)).toBeLessThan(land(12) * 1.6);
  });

  it("ネットより低く通るとネットに当たって止まる", () => {
    const fl = flight(-2, 1, 10, 0);
    expect(fl.net).toBe(true);
    expect(fl.x[fl.end]).toBe(0);
    expect(judge(fl, 0, false)).toBe("net");
  });

  it("バックラインより奥はアウト、サーブはショートサービスラインより手前もだめ", () => {
    const long = flight(-3, 2, ...([22, 10] as const));
    expect(long.x[long.end]).toBeGreaterThan(HALF);
    expect(judge(long, 0, false)).toBe("out");
    const short = aim(0, -SERVE_X, SERVE_Y, 0.9, 1.5);
    const fl = flight(-SERVE_X, SERVE_Y, short.vx, short.vy);
    expect(judge(fl, 0, false)).toBe("in");
    expect(judge(fl, 0, true)).toBe("short");
  });

  it("speedFor で決めた速さで打つと、ねらった所に落ちる", () => {
    for (const [angle, depth] of [
      [0.9, 6],
      [0.3, 1.5],
      [0.1, 4],
    ] as const) {
      const v = aim(1, 4, 2.5, angle, depth);
      const fl = flight(4, 2.5, v.vx, v.vy, true);
      expect(fl.x[fl.end]).toBeCloseTo(-depth, 1);
    }
  });

  it("打った所と強さから、ショットの名前がわかる", () => {
    const smash = { seat: 0 as Seat, f: 10, x: -3, y: 2.7, vx: 20, vy: -6 };
    expect(shotOf(smash)).toBe("smash");
    expect(shotOf({ seat: 0, f: 10, x: -5, y: 2.5, ...aim(0, -5, 2.5, 0.85, 6) })).toBe("clear");
    expect(shotOf({ seat: 0, f: 10, x: -5, y: 2.5, ...aim(0, -5, 2.5, 0.25, 1.2) })).toBe("drop");
    expect(shotOf({ seat: 0, f: 10, x: -1, y: 0.6, ...aim(0, -1, 0.6, 1.0, 6) })).toBe("lift");
    expect(shotOf({ seat: 0, f: 10, x: -1, y: 0.8, ...aim(0, -1, 0.8, 0.6, 1) })).toBe("net");
    expect(shotOf({ seat: 0, f: 0, x: -SERVE_X, y: SERVE_Y, ...aim(0, -SERVE_X, SERVE_Y, 0.95, 6) })).toBe("serveHigh");
  });
});

describe("バドミントン", () => {
  it("はじめは 0 対 0 で、先手がサーブする", () => {
    const s = badminton.initialState(rng);
    expect(s.score).toEqual([0, 0]);
    expect(badminton.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("サーブが入ると相手の番で、相手は受ける所から走る", () => {
    const s = apply(badminton.initialState(rng), serve(0), 0);
    expect(s.hits).toHaveLength(1);
    expect(turnOf(s)).toBe(1);
    expect(startPx(s)).toBe(sideX(1, RECEIVE_PX));
  });

  it("サーブがネット・手前すぎ・アウトなら、相手の点で、相手が次にサーブする", () => {
    const s0 = badminton.initialState(rng);
    for (const [move, reason] of [
      [{ kind: "serve", vx: 8, vy: 0 }, "net"],
      [serve(0, 1.5, 0.9), "short"],
      [serve(0, 7.5, 0.6), "out"],
    ] as const) {
      const s = apply(s0, move, 0);
      expect(s.score).toEqual([0, 1]);
      expect(s.server).toBe(1);
      expect(s.hits).toEqual([]);
      expect(s.last?.reason).toBe(reason);
      expect(badminton.status(s)).toEqual({ kind: "playing", turn: 1 });
    }
  });

  it("サーブの番に打ち返す手や、返せなかった手は送れない", () => {
    const s = badminton.initialState(rng);
    expect(errorOf(() => apply(s, { kind: "miss", px: -3 }, 0))).toBe("badminton_serve");
    expect(errorOf(() => apply(s, serve(1), 1))).toBe("not_your_turn");
    // 後ろ向きのサーブ・速すぎるサーブ
    expect(errorOf(() => apply(s, { kind: "serve", vx: -5, vy: 5 }, 0))).toBe("badminton_speed");
    expect(errorOf(() => apply(s, { kind: "serve", vx: 20, vy: 10 }, 0))).toBe("badminton_speed");
  });

  it("届く所で打ち返すと続き、打った所と選手の位置が残る", () => {
    const s1 = apply(badminton.initialState(rng), serve(0), 0);
    const m = returnMove(s1);
    const s2 = apply(s1, m, 1);
    expect(s2.hits).toHaveLength(2);
    expect(s2.hits[1]).toMatchObject({ seat: 1, f: m.f, px: m.px });
    expect(turnOf(s2)).toBe(0);
    // サーブした人は、打った所から真ん中へ戻りながら待つ
    const back = startPx(s2);
    expect(Math.abs(back - sideX(0, HOME))).toBeLessThan(Math.abs(s2.hits[0]!.px - sideX(0, HOME)) + 1e-9);
  });

  it("届かない所・間に合わない所・まだ相手のコートにあるシャトルは打てない", () => {
    const s1 = apply(badminton.initialState(rng), serve(0), 0);
    const m = returnMove(s1);
    // 選手がシャトルから離れすぎ
    expect(errorOf(() => apply(s1, { ...m, px: round3(m.x + Math.sign(m.px - m.x) * (REACH + 0.3)) }, 1))).toBe("badminton_reach");
    // 走って間に合わない（最初のコマで、遠くのシャトルを打つ）
    const fl = flightOf(s1.hits[0]!);
    const early = 1;
    expect(errorOf(() => apply(s1, { ...m, f: early, px: round3(fl.x[early]!), x: round3(fl.x[early]!), y: round3(fl.y[early]!) }, 1))).toBe(
      "badminton_reach",
    );
    // 落ちたあと
    expect(errorOf(() => apply(s1, { ...m, f: fl.end }, 1))).toBe("badminton_reach");
    // 打った所がシャトルの位置と合わない
    expect(errorOf(() => apply(s1, { ...m, y: m.y + 0.5 }, 1))).toBe("badminton_sync");
    // 自分のコートの外にいる
    expect(errorOf(() => apply(s1, { kind: "miss", px: -2 }, 1))).toBe("badminton_reach");
  });

  it("走れる距離は、相手が打ってからの時間で決まる", () => {
    const s1 = apply(badminton.initialState(rng), serve(0), 0);
    const fl = flightOf(s1.hits[0]!);
    const start = startPx(s1);
    // f コマ目に、走れる距離のちょうど端にいる
    const f = Math.floor(fl.end * 0.8);
    const reach = RUN * f * DT;
    const sx = fl.x[f]!;
    const toward = Math.sign(sx - start);
    expect(canHit(fl, f, 1, start + toward * reach, start)).toBe(Math.abs(sx - (start + toward * reach)) <= REACH);
    expect(canHit(fl, f, 1, start + toward * (reach + 0.05), start)).toBe(false);
  });

  it("返せなかったら打った人の点で、打った人が次にサーブする", () => {
    const s1 = apply(badminton.initialState(rng), serve(0), 0);
    const s2 = apply(s1, { kind: "miss", px: 4 }, 1);
    expect(s2.score).toEqual([1, 0]);
    expect(s2.server).toBe(0);
    expect(s2.last).toMatchObject({ winner: 0, reason: "in", missPx: 4 });
    expect(s2.last?.hits).toHaveLength(1);
    expect(badminton.status(s2)).toEqual({ kind: "playing", turn: 0 });
  });

  it("打ち返した球がアウトなら、相手の点", () => {
    const s1 = apply(badminton.initialState(rng), serve(0), 0);
    const s2 = apply(s1, returnMove(s1, 0.5, 7.6), 1);
    expect(s2.score).toEqual([1, 0]);
    expect(s2.last?.reason).toBe("out");
    expect(s2.last?.hits).toHaveLength(2);
  });

  it(`${TARGET} 点取った方の勝ち。終わったあとは打てない`, () => {
    let s = badminton.initialState(rng);
    for (let i = 0; i < TARGET; i++) {
      s = apply(s, serve(0), 0);
      s = apply(s, { kind: "miss", px: 4 }, 1);
    }
    expect(s.score).toEqual([TARGET, 0]);
    expect(badminton.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(errorOf(() => apply(s, serve(0), 0))).toBe("game_over");
  });

  it("parseMove は形の合わない手を受け付けず、値を 0.001 単位にそろえる", () => {
    expect(badminton.parseMove(null)).toBeNull();
    expect(badminton.parseMove({ kind: "smash", vx: 1, vy: 1 })).toBeNull();
    expect(badminton.parseMove({ kind: "serve", vx: "1", vy: 1 })).toBeNull();
    expect(badminton.parseMove({ kind: "serve", vx: Infinity, vy: 1 })).toBeNull();
    expect(badminton.parseMove({ kind: "hit", f: 1.5, px: 1, x: 1, y: 1, vx: 1, vy: 1 })).toBeNull();
    expect(badminton.parseMove({ kind: "hit", f: 0, px: 1, x: 1, y: 1, vx: 1, vy: 1 })).toBeNull();
    expect(badminton.parseMove({ kind: "miss" })).toBeNull();
    expect(badminton.parseMove({ kind: "serve", vx: 1.23456, vy: -0.0001 })).toEqual({ kind: "serve", vx: 1.235, vy: 0 });
    expect(badminton.parseMove({ kind: "hit", f: 30, px: 3.1234, x: 2, y: 1, vx: -5, vy: 5, extra: 1 })).toEqual({
      kind: "hit",
      f: 30,
      px: 3.123,
      x: 2,
      y: 1,
      vx: -5,
      vy: 5,
    });
  });

  it("お試しのコンピュータは、どちらの席でも決まりに合う手だけを打ち、試合が終わる", () => {
    let seed = 3;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let game = 0; game < 30; game++) {
      let s = badminton.initialState(r);
      let moves = 0;
      while (badminton.status(s).kind === "playing") {
        const turn = turnOf(s)!;
        const m = badminton.botMove!(s, turn, r);
        expect(m).not.toBeNull();
        s = badminton.applyMove(s, badminton.parseMove(JSON.parse(JSON.stringify(m)))!, turn);
        expect(++moves).toBeLessThan(2000);
      }
      expect(Math.max(...s.score)).toBe(TARGET);
    }
  });
});
