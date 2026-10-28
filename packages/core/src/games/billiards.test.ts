import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import {
  BALL_R,
  billiards,
  canPlaceCue,
  CUE,
  EIGHT,
  groupOf,
  HALF_L,
  HALF_W,
  HEAD_SPOT,
  HEAD_X,
  onEight,
  rackBalls,
  rackOrder,
  rackSpots,
  targetsOf,
  type Ball,
  type BilliardsMove,
  type BilliardsState,
} from "./billiards.ts";

const rng = () => 0.5;
const start = () => billiards.initialState(rng);

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof IllegalMoveError ? e.code : "other";
  }
}

interface ShotOpts {
  /** 入れる球（順に） */
  pocket?: number[];
  /** 最初に当てる球。省くと、入れる球の最初（なければ台の上のいちばん小さい的球） */
  hit?: number | null;
  /** 動かす球の行き先 */
  move?: Record<number, [number, number]>;
  /** 手球を置く位置 */
  cue?: [number, number];
}

/** 打つ前の球（手球を置くならその位置）から、言われたとおりの結果の手を作る。動かさない球はそのまま */
function shot(s: BilliardsState, o: ShotOpts = {}): BilliardsMove {
  const pocket = o.pocket ?? [];
  let before: Ball[] = s.balls;
  if (o.cue) before = [{ id: CUE, x: o.cue[0], y: o.cue[1] }, ...s.balls.filter((b) => b.id !== CUE)];
  const firstObject = before.map((b) => b.id).filter((id) => id !== CUE).sort((a, b) => a - b)[0] ?? null;
  const hit = o.hit !== undefined ? o.hit : (pocket.find((id) => id !== CUE) ?? firstObject);
  const balls = before
    .filter((b) => !pocket.includes(b.id))
    .map((b): [number, number, number] => {
      const to = o.move?.[b.id];
      return to ? [b.id, to[0], to[1]] : [b.id, b.x, b.y];
    });
  return { ...(o.cue ? { cue: o.cue } : {}), angle: 0.1, speed: 3, spin: 0, pocketed: pocket, firstHit: hit, balls };
}

/** 今の手番の人が打つ */
function play(s: BilliardsState, o: ShotOpts = {}): BilliardsState {
  const st = billiards.status(s);
  if (st.kind !== "playing") throw new Error("finished");
  return billiards.applyMove(s, shot(s, o), st.turn);
}

/** 手球が落ちたときなどに、手球を置く空いた場所 */
const free: [number, number] = [-0.6, 0.3];

/** ブレイクを済ませ、テーブルがオープンで先手の番から始まる局面（ブレイクで 1 番を入れた） */
const afterBreak = () => play(start(), { pocket: [1] });

/**
 * グループが決まった局面：先手がソリッド。台には solids と stripes で選んだ球と、8 と手球だけを残す。
 * 手番は turn
 */
function grouped(solids: number[], stripes: number[], turn: Seat = 0): BilliardsState {
  const keep = new Set([CUE, EIGHT, ...solids, ...stripes]);
  const s = start();
  return { ...s, breaking: false, shots: 1, solids: 0, turn, balls: s.balls.filter((b) => keep.has(b.id)), run: [] };
}

describe("billiards", () => {
  describe("はじめ", () => {
    it("15 個の的球を三角形に並べ、8 はまん中、奥の両端はソリッドとストライプが 1 つずつ。手球はヘッドスポット", () => {
      const s = start();
      expect(s.balls).toHaveLength(16);
      expect(s.balls.map((b) => b.id)).toEqual(Array.from({ length: 16 }, (_, i) => i));
      expect(s.balls[0]).toEqual({ id: CUE, x: HEAD_SPOT[0], y: HEAD_SPOT[1] });
      const order = rackOrder(s.seed, 0);
      expect(order[4]).toBe(EIGHT);
      expect([groupOf(order[10]!), groupOf(order[14]!)].sort()).toEqual(["solid", "stripe"]);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      expect(billiards.status(s)).toEqual({ kind: "playing", turn: 0 });
      expect(s.breaking).toBe(true);
      expect(s.solids).toBeNull();
    });

    it("ラックの球は重ならず、すきまはごくわずか。先頭はフットスポットで、奥へ並ぶ", () => {
      const spots = rackSpots();
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const d = Math.hypot(spots[i]![0] - spots[j]![0], spots[i]![1] - spots[j]![1]);
          expect(d).toBeGreaterThan(2 * BALL_R);
        }
      }
      // となりの球とのすきまは 1 mm 未満
      expect(Math.hypot(spots[1]![0] - spots[0]![0], spots[1]![1] - spots[0]![1]) - 2 * BALL_R).toBeLessThan(0.001);
      expect(spots[0]).toEqual([HALF_L / 2, 0]);
      expect(Math.max(...spots.map((p) => p[0]))).toBeLessThan(HALF_L - BALL_R);
    });

    it("並びは対局の種で決まる。同じ種なら同じ、種やラックの回数が違えば変わる", () => {
      expect(rackOrder(123, 0)).toEqual(rackOrder(123, 0));
      expect(rackOrder(123, 0)).not.toEqual(rackOrder(124, 0));
      expect(rackOrder(123, 0)).not.toEqual(rackOrder(123, 1));
      const seeds = new Set(Array.from({ length: 20 }, (_, i) => rackOrder(i * 7919, 0).join(",")));
      expect(seeds.size).toBeGreaterThan(15);
      expect(billiards.initialState(() => 0.25).seed).not.toBe(billiards.initialState(() => 0.75).seed);
    });
  });

  describe("ブレイク", () => {
    it("先手が打つ。入ればそのまま続けて打ち、テーブルはオープンのまま（ブレイクで入った球ではグループを決めない）", () => {
      const s = play(start(), { pocket: [3, 11] });
      expect(s.turn).toBe(0);
      expect(s.solids).toBeNull();
      expect(s.breaking).toBe(false);
      expect(s.balls.map((b) => b.id)).not.toContain(3);
      expect(s.run.map((r) => [r.seat, r.break, r.outcome])).toEqual([[0, true, "continue"]]);
    });

    it("入らなければ交代", () => {
      const s = play(start());
      expect(s.turn).toBe(1);
      expect(s.inHand).toBe(false);
      expect(s.run.at(-1)!.outcome).toBe("miss");
    });

    it("ブレイクで手球が落ちたらファウル。相手はフリーボール", () => {
      const s = play(start(), { pocket: [CUE, 5] });
      expect(s.turn).toBe(1);
      expect(s.inHand).toBe(true);
      expect(s.balls.some((b) => b.id === CUE)).toBe(false);
      expect(s.run.at(-1)).toMatchObject({ foul: "scratch", outcome: "foul" });
    });

    it("ブレイクで 8 が入ったら、球を並べ直して同じ人がもう一度ブレイクする", () => {
      const s0 = start();
      const s = play(s0, { pocket: [EIGHT, 2] });
      expect(s.turn).toBe(0);
      expect(s.breaking).toBe(true);
      expect(s.rack).toBe(1);
      expect(s.balls).toEqual(rackBalls(s0.seed, 1));
      expect(s.winner).toBeNull();
      expect(s.run.at(-1)!.outcome).toBe("rerack");
      // もう一度ブレイクできる
      expect(play(s).breaking).toBe(false);
    });

    it("手球はヘッドストリングより手前なら好きな所に置ける。越えた所・球に重なる所には置けない", () => {
      const s = start();
      const placed = play(s, { cue: [HEAD_X - 0.2, 0.25] });
      expect(placed.run[0]!.before.find((b) => b.id === CUE)).toEqual({ id: CUE, x: HEAD_X - 0.2, y: 0.25 });
      expect(codeOf(() => play(s, { cue: [HEAD_X + 0.05, 0] }))).toBe("billiards_place");
      expect(codeOf(() => play(s, { cue: [-HALF_L, 0] }))).toBe("billiards_place");
    });
  });

  describe("グループ（ソリッド・ストライプ）", () => {
    it("オープンのあいだは、正しく入れた最初の球のグループが打った人のもの。相手はもう一方", () => {
      const s = play(afterBreak(), { pocket: [12, 4] });
      expect(s.solids).toBe(1);
      expect(s.turn).toBe(0);
      expect(s.run.at(-1)).toMatchObject({ assigned: "stripe", outcome: "continue" });
      expect(targetsOf(s, 0).every((id) => groupOf(id) === "stripe")).toBe(true);
      expect(targetsOf(s, 1).every((id) => groupOf(id) === "solid")).toBe(true);
    });

    it("オープンのあいだは、8 以外ならどの球に先に当ててもよい。入らなければ交代で、オープンのまま", () => {
      const s = play(afterBreak(), { hit: 13 });
      expect(s.turn).toBe(1);
      expect(s.solids).toBeNull();
      expect(s.inHand).toBe(false);
    });

    it("オープンのあいだに 8 に先に当てるとファウル", () => {
      const s = play(afterBreak(), { hit: EIGHT });
      expect(s.run.at(-1)!.foul).toBe("eightFirst");
      expect(s.inHand).toBe(true);
    });

    it("ファウルで入った球ではグループを決めない", () => {
      const s = play(afterBreak(), { pocket: [2, CUE] });
      expect(s.solids).toBeNull();
      expect(s.run.at(-1)!.foul).toBe("scratch");
    });
  });

  describe("続けて打つ・交代", () => {
    it("自分の球を入れたら続けて打つ。相手の球だけ入れたら交代（入った相手の球は戻さない）", () => {
      const s = grouped([1, 2, 3], [9, 10]);
      const again = play(s, { pocket: [2] });
      expect(again.turn).toBe(0);
      const theirs = play(s, { pocket: [9], hit: 1 });
      expect(theirs.turn).toBe(1);
      expect(theirs.balls.map((b) => b.id)).not.toContain(9);
      expect(theirs.run.at(-1)!.outcome).toBe("miss");
    });

    it("自分の球と相手の球を一緒に入れたら、続けて打つ", () => {
      const s = play(grouped([1, 2], [9, 10]), { pocket: [9, 1], hit: 2 });
      expect(s.turn).toBe(0);
    });

    it("続けて打った打は、ひと続きとして覚えておく。打つ人が替わったら新しく始める", () => {
      let s = grouped([1, 2, 3], [9, 10]);
      s = play(s, { pocket: [1] });
      s = play(s, { pocket: [2] });
      s = play(s, { hit: 3 });
      expect(s.run.map((r) => [r.seat, r.outcome])).toEqual([
        [0, "continue"],
        [0, "continue"],
        [0, "miss"],
      ]);
      expect(s.run.map((r) => r.n)).toEqual([s.shots - 2, s.shots - 1, s.shots]);
      s = play(s, { hit: 9 });
      expect(s.run.map((r) => [r.seat, r.outcome])).toEqual([[1, "miss"]]);
    });

    it("手番でなければ打てない", () => {
      const s = start();
      expect(codeOf(() => billiards.applyMove(s, shot(s), 1))).toBe("not_your_turn");
    });
  });

  describe("ファウルとフリーボール", () => {
    it("手球が落ちたらファウル。手球は台からなくなり、相手は好きな所に置いて打つ", () => {
      const s = play(grouped([1, 2], [9, 10]), { pocket: [CUE] });
      expect(s.turn).toBe(1);
      expect(s.inHand).toBe(true);
      expect(s.balls.some((b) => b.id === CUE)).toBe(false);
      // 置かずには打てない
      expect(codeOf(() => billiards.applyMove(s, shot(s), 1))).toBe("billiards_place");
      const next = play(s, { cue: free, hit: 9 });
      expect(next.run.at(-1)!.before.find((b) => b.id === CUE)).toEqual({ id: CUE, x: free[0], y: free[1] });
      expect(next.inHand).toBe(false);
    });

    it("どの球にも当たらなければファウル（手球は落ちていなければそのまま。相手は動かしてもよい）", () => {
      const s = play(grouped([1, 2], [9, 10]), { hit: null, move: { [CUE]: [0.3, -0.2] } });
      expect(s.run.at(-1)!.foul).toBe("noHit");
      expect(s.inHand).toBe(true);
      expect(s.balls.find((b) => b.id === CUE)).toEqual({ id: CUE, x: 0.3, y: -0.2 });
      expect(play(s, { hit: 9 }).turn).toBe(0);
    });

    it("最初に相手の球に当てたらファウル。そのとき自分の球が入っても続けて打てない", () => {
      const s = play(grouped([1, 2], [9, 10]), { pocket: [1], hit: 9 });
      expect(s.run.at(-1)!.foul).toBe("wrongBall");
      expect(s.turn).toBe(1);
      expect(s.inHand).toBe(true);
    });

    it("自分の球が残っているのに 8 に先に当てたらファウル", () => {
      const s = play(grouped([1], [9]), { hit: EIGHT });
      expect(s.run.at(-1)!.foul).toBe("eightFirst");
    });

    it("フリーボールでは、ほかの球に重なる所・クッションの外には置けない", () => {
      const s = play(grouped([1, 2], [9, 10]), { pocket: [CUE] });
      const ball = s.balls.find((b) => b.id === 9)!;
      expect(codeOf(() => play(s, { cue: [ball.x + BALL_R, ball.y] }))).toBe("billiards_place");
      expect(codeOf(() => play(s, { cue: [HALF_L - BALL_R / 2, 0] }))).toBe("billiards_place");
      expect(codeOf(() => play(s, { cue: [0, HALF_W] }))).toBe("billiards_place");
      // フリーボールならヘッドストリングの向こうにも置ける
      expect(codeOf(() => play(s, { cue: [0.3, 0.1], hit: 9 }))).toBeNull();
    });

    it("フリーボールでもブレイクでもないときは、手球を置けない", () => {
      const s = grouped([1, 2], [9, 10]);
      expect(codeOf(() => play(s, { cue: free }))).toBe("billiards_place");
    });
  });

  describe("8 番", () => {
    it("自分の球を全部入れたあとに、8 に先に当てて正しく入れたら勝ち", () => {
      const s = grouped([], [9, 10]);
      expect(onEight(s, 0)).toBe(true);
      const won = play(s, { pocket: [EIGHT] });
      expect(billiards.status(won)).toEqual({ kind: "finished", winner: 0 });
      expect(won.run.at(-1)!.outcome).toBe("win");
      expect(codeOf(() => billiards.applyMove(won, shot(won), 0))).toBe("game_over");
    });

    it("自分の球が残っているうちに 8 を入れたら負け", () => {
      const s = play(grouped([1], [9]), { pocket: [EIGHT], hit: 1 });
      expect(billiards.status(s)).toEqual({ kind: "finished", winner: 1 });
      expect(s.run.at(-1)!.outcome).toBe("lose");
    });

    it("最後の自分の球と 8 を同じ 1 打で入れても負け（入れ終えるのが先）", () => {
      const s = play(grouped([1], [9]), { pocket: [1, EIGHT] });
      expect(s.winner).toBe(1);
    });

    it("8 を入れたときに手球も落ちたら負け", () => {
      const s = play(grouped([], [9]), { pocket: [EIGHT, CUE] });
      expect(s.winner).toBe(1);
      expect(s.run.at(-1)).toMatchObject({ foul: "scratch", outcome: "lose" });
    });

    it("8 だけ残っていても、最初に相手の球に当ててから 8 が入ったら負け", () => {
      const s = play(grouped([], [9]), { pocket: [EIGHT], hit: 9 });
      expect(s.winner).toBe(1);
    });

    it("オープンのまま 8 を入れたら負け", () => {
      const s = play(afterBreak(), { pocket: [EIGHT], hit: 2 });
      expect(s.winner).toBe(1);
    });

    it("後手も、自分の球を入れ終えたら 8 で勝てる", () => {
      const s = play(grouped([1, 2], [], 1), { pocket: [EIGHT] });
      expect(s.winner).toBe(1);
    });
  });

  describe("結果が筋の通ったものか", () => {
    const s = grouped([1, 2], [9, 10]);
    const base = () => shot(s, { pocket: [1] });

    it("台にない球・同じ球が 2 回・足りない球は受け付けない", () => {
      expect(codeOf(() => billiards.applyMove(s, { ...base(), pocketed: [1, 5] }, 0))).toBe("billiards_result");
      expect(codeOf(() => billiards.applyMove(s, { ...base(), pocketed: [1, 1] }, 0))).toBe("billiards_result");
      const m = base();
      expect(codeOf(() => billiards.applyMove(s, { ...m, balls: m.balls.slice(1) }, 0))).toBe("billiards_result");
      expect(codeOf(() => billiards.applyMove(s, { ...m, balls: [...m.balls, [1, 0, 0]] }, 0))).toBe("billiards_result");
    });

    it("台の外の位置・重なった球は受け付けない", () => {
      const m = base();
      const out = m.balls.map((b): [number, number, number] => (b[0] === 9 ? [9, HALF_L + 0.2, 0] : b));
      expect(codeOf(() => billiards.applyMove(s, { ...m, balls: out }, 0))).toBe("billiards_out");
      const ten = m.balls.find((b) => b[0] === 10)!;
      const overlap = m.balls.map((b): [number, number, number] => (b[0] === 9 ? [9, ten[1] + BALL_R / 2, ten[2]] : b));
      expect(codeOf(() => billiards.applyMove(s, { ...m, balls: overlap }, 0))).toBe("billiards_result");
    });

    it("どの球にも当たっていないのに、的球が入ったり動いたりはしない", () => {
      expect(codeOf(() => billiards.applyMove(s, { ...base(), firstHit: null }, 0))).toBe("billiards_result");
      const moved = shot(s, { hit: null, move: { 9: [0.1, 0.1] } });
      expect(codeOf(() => billiards.applyMove(s, moved, 0))).toBe("billiards_result");
    });

    it("最初に当てた球は台にあった的球（手球は数えない）", () => {
      expect(codeOf(() => billiards.applyMove(s, { ...base(), firstHit: 5 }, 0))).toBe("billiards_result");
      expect(codeOf(() => billiards.applyMove(s, { ...base(), firstHit: CUE }, 0))).toBe("billiards_result");
    });

    it("位置は 0.1 mm 単位にそろえて保存する", () => {
      const m = shot(s, { move: { 9: [0.123456, -0.2000049] }, hit: 9 });
      const next = billiards.applyMove(s, m, 0);
      expect(next.balls.find((b) => b.id === 9)).toEqual({ id: 9, x: 0.1235, y: -0.2 });
    });

    it("parseMove：形が違うもの・範囲の外は null", () => {
      const ok = base();
      expect(billiards.parseMove(ok)).toEqual(ok);
      expect(billiards.parseMove(JSON.parse(JSON.stringify(shot(s, { cue: free }))))).toEqual(shot(s, { cue: free }));
      expect(billiards.parseMove(null)).toBeNull();
      expect(billiards.parseMove({ ...ok, speed: 100 })).toBeNull();
      expect(billiards.parseMove({ ...ok, speed: 0 })).toBeNull();
      expect(billiards.parseMove({ ...ok, spin: 2 })).toBeNull();
      expect(billiards.parseMove({ ...ok, angle: 4 })).toBeNull();
      expect(billiards.parseMove({ ...ok, pocketed: [16] })).toBeNull();
      expect(billiards.parseMove({ ...ok, pocketed: [1.5] })).toBeNull();
      expect(billiards.parseMove({ ...ok, firstHit: "1" })).toBeNull();
      expect(billiards.parseMove({ ...ok, balls: [[1, 0]] })).toBeNull();
      expect(billiards.parseMove({ ...ok, balls: [[1, Infinity, 0]] })).toBeNull();
      expect(billiards.parseMove({ ...ok, cue: [0] })).toBeNull();
      expect(billiards.parseMove({ ...ok, firstHit: undefined })).toBeNull();
    });
  });

  it("canPlaceCue：手球自身とは重なってもよい（置き直すので）", () => {
    const s = start();
    expect(canPlaceCue(HEAD_SPOT[0], HEAD_SPOT[1], s.balls, true)).toBe(true);
    expect(canPlaceCue(HEAD_SPOT[0], HALF_W, s.balls, true)).toBe(false);
  });
});
