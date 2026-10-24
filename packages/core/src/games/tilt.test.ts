import { describe, expect, it } from "vitest";
import { botMove } from "../bot.ts";
import { IllegalMoveError, type Rng, type Seat } from "../types.ts";
import {
  BALL_R,
  BOARD_H,
  BOARD_W,
  GOAL_R,
  HOLE_R,
  MAX_FALLS,
  MAX_MS,
  MAZES,
  MIN_MS,
  roundResult,
  ROUNDS,
  tally,
  tilt,
  timeOf,
  type Maze,
  type TiltMove,
  type TiltState,
  type TiltView,
} from "./tilt.ts";

const start: TiltMove = { kind: "start" };
const finish = (ms: number, falls = 0, input: "motion" | "touch" = "motion"): TiltMove => ({ kind: "finish", ms, falls, input });
const fail: TiltMove = { kind: "fail" };

/** 手番の人が順に指す */
const play = (s: TiltState, moves: TiltMove[]) => moves.reduce((st, m) => tilt.applyMove(st, m, st.turn), s);
/** 1 回戦ぶん：先に挑戦する人が firstMs、あとの人が secondMs（null なら途中で閉じた） */
const round = (firstMs: number | null, secondMs: number | null): TiltMove[] => [
  start,
  firstMs === null ? fail : finish(firstMs),
  start,
  secondMs === null ? fail : finish(secondMs),
];

const fresh = () => tilt.initialState(seeded(1));
const view = (s: TiltState, viewer: Seat | null, revealAll = false) => tilt.viewState!(s, viewer, revealAll) as TiltView;

/** 同じ種から同じ並びを返す乱数（mulberry32） */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 点から長方形の壁までの距離（中にあれば 0） */
function distToWall(x: number, y: number, [wx, wy, ww, wh]: Maze["walls"][number]) {
  const dx = Math.max(wx - x, 0, x - (wx + ww));
  const dy = Math.max(wy - y, 0, y - (wy + wh));
  return Math.hypot(dx, dy);
}

/** 玉（半径 r）の中心が置けるか。板の外・壁・穴（margin だけ余裕を見る）にかからない */
function free(maze: Maze, x: number, y: number, r: number, margin: number) {
  if (x < r || x > BOARD_W - r || y < r || y > BOARD_H - r) return false;
  if (maze.walls.some((w) => distToWall(x, y, w) < r)) return false;
  return maze.holes.every(([hx, hy]) => Math.hypot(x - hx, y - hy) >= HOLE_R + margin);
}

/** 0.5 きざみの格子で、スタートからゴールまで玉が通れる道があるか */
function solvable(maze: Maze, margin: number) {
  const r = BALL_R + margin;
  const S = 0.5;
  const cols = Math.round(BOARD_W / S);
  const rows = Math.round(BOARD_H / S);
  const seen = new Uint8Array((cols + 1) * (rows + 1));
  const queue: [number, number][] = [[Math.round(maze.start[0] / S), Math.round(maze.start[1] / S)]];
  seen[queue[0]![1] * cols + queue[0]![0]] = 1;
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    if (Math.hypot(cx * S - maze.goal[0], cy * S - maze.goal[1]) < GOAL_R) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx!;
      const ny = cy + dy!;
      if (nx < 0 || ny < 0 || nx > cols || ny > rows || seen[ny * cols + nx]) continue;
      seen[ny * cols + nx] = 1;
      if (free(maze, nx * S, ny * S, r, margin)) queue.push([nx, ny]);
    }
  }
  return false;
}

describe("tilt", () => {
  describe("迷路", () => {
    it("候補は 5 つ以上。スタートとゴールは板の中で、壁や穴にかからない", () => {
      expect(MAZES.length).toBeGreaterThanOrEqual(5);
      for (const [i, maze] of MAZES.entries()) {
        for (const [x, y] of [maze.start, maze.goal]) {
          expect(free(maze, x, y, BALL_R + 1, BALL_R + 2), `迷路 ${i}`).toBe(true);
        }
        for (const [x, y] of maze.holes) {
          expect(x >= 0 && x <= BOARD_W && y >= 0 && y <= BOARD_H, `迷路 ${i} の穴`).toBe(true);
        }
        expect(maze.par).toBeGreaterThanOrEqual(MIN_MS);
        expect(maze.par).toBeLessThan(MAX_MS / 2);
      }
    });

    it("どの迷路も、壁と穴に余裕を持って、スタートからゴールまで玉が通れる", () => {
      for (const [i, maze] of MAZES.entries()) expect(solvable(maze, 1), `迷路 ${i}`).toBe(true);
    });

    it("どの迷路にも穴が 4 つ以上ある", () => {
      for (const [i, maze] of MAZES.entries()) expect(maze.holes.length, `迷路 ${i}`).toBeGreaterThanOrEqual(4);
    });
  });

  describe("はじめ", () => {
    it("3 回戦の迷路を rng で候補から選ぶ（同じ迷路は出ない）。1 回戦目は先手から", () => {
      const s = fresh();
      expect(s.mazes).toHaveLength(ROUNDS);
      expect(new Set(s.mazes).size).toBe(ROUNDS);
      for (const m of s.mazes) expect(m >= 0 && m < MAZES.length && Number.isInteger(m)).toBe(true);
      expect(s.rounds).toEqual([{ maze: s.mazes[0], first: 0, tries: [null, null], running: null }]);
      expect(tilt.status(s)).toEqual({ kind: "playing", turn: 0 });
    });

    it("迷路の選び方は rng で変わる", () => {
      const picks = new Set(Array.from({ length: 30 }, (_, i) => tilt.initialState(seeded(i)).mazes.join(",")));
      expect(picks.size).toBeGreaterThan(5);
      expect(tilt.initialState(() => 0).mazes).toHaveLength(ROUNDS);
      expect(new Set(tilt.initialState(() => 0.9999).mazes).size).toBe(ROUNDS);
    });
  });

  describe("挑戦", () => {
    it("「スタート」でサーバに記録し、手番はそのまま。ゴールしたらタイムを送り、相手の番になる", () => {
      let s = play(fresh(), [start]);
      expect(s.rounds[0]!.running).toBe(0);
      expect(tilt.status(s)).toEqual({ kind: "playing", turn: 0 });
      s = play(s, [finish(12_340, 1, "touch")]);
      expect(s.rounds[0]!.tries[0]).toEqual({ ms: 12_340, falls: 1, input: "touch" });
      expect(s.rounds[0]!.running).toBeNull();
      expect(tilt.status(s)).toEqual({ kind: "playing", turn: 1 });
    });

    it("スタートしたら、もう一度スタートはできない。スタートせずにタイムは送れない", () => {
      const s = play(fresh(), [start]);
      expect(() => tilt.applyMove(s, start, 0)).toThrow("tilt_running");
      expect(() => tilt.applyMove(fresh(), finish(9000), 0)).toThrow("tilt_not_started");
      expect(() => tilt.applyMove(fresh(), fail, 0)).toThrow("tilt_not_started");
    });

    it("手番でない人はスタートもゴールもできない", () => {
      expect(() => tilt.applyMove(fresh(), start, 1)).toThrow("not_your_turn");
      const s = play(fresh(), [start]);
      expect(() => tilt.applyMove(s, finish(9000), 1)).toThrow("not_your_turn");
    });

    it("タイムは MIN_MS〜MAX_MS の整数（ミリ秒）、落ちた回数は 0〜MAX_FALLS の整数", () => {
      const s = play(fresh(), [start]);
      expect(tilt.applyMove(s, finish(MIN_MS), 0).rounds[0]!.tries[0]!.ms).toBe(MIN_MS);
      expect(tilt.applyMove(s, finish(MAX_MS, MAX_FALLS), 0).rounds[0]!.tries[0]!.ms).toBe(MAX_MS);
      for (const ms of [MIN_MS - 1, 0, -5, MAX_MS + 1, 1234.5, Number.NaN]) {
        expect(() => tilt.applyMove(s, finish(ms), 0)).toThrow(IllegalMoveError);
        expect(() => tilt.applyMove(s, finish(ms), 0)).toThrow("tilt_ms");
      }
      for (const falls of [-1, MAX_FALLS + 1, 1.5]) {
        expect(() => tilt.applyMove(s, finish(9000, falls), 0)).toThrow("tilt_falls");
      }
    });
  });

  describe("伏せて見せ合う", () => {
    it("先に挑戦した人のタイムは、相手が挑戦し終わるまで相手と観戦者に伏せる", () => {
      const s = play(fresh(), [start, finish(15_000, 2)]);
      expect(view(s, 0).rounds[0]!.tries[0]).toEqual({ ms: 15_000, falls: 2, input: "motion" });
      expect(view(s, 1).rounds[0]!.tries[0]).toBe("hidden");
      expect(view(s, null).rounds[0]!.tries[0]).toBe("hidden");
      // 相手が挑戦している最中も伏せたまま
      const running = play(s, [start]);
      expect(view(running, 1).rounds[0]!.tries[0]).toBe("hidden");
      expect(view(running, 1).rounds[0]!.running).toBe(1);
    });

    it("2 人とも終わったら、2 人のタイムを見せる", () => {
      const s = play(fresh(), round(15_000, 11_000));
      for (const viewer of [0, 1, null] as const) {
        const r = view(s, viewer).rounds[0]!;
        expect(r.tries[0]).toEqual({ ms: 15_000, falls: 0, input: "motion" });
        expect(r.tries[1]).toEqual({ ms: 11_000, falls: 0, input: "motion" });
      }
    });

    it("手の記録では、相手のタイムを伏せる（スタートはそのまま）", () => {
      expect(tilt.viewMove!(finish(9000, 1), 0, 1)).toEqual({ kind: "finish", ms: null, falls: null, input: null });
      expect(tilt.viewMove!(fail, 0, 1)).toEqual({ kind: "finish", ms: null, falls: null, input: null });
      expect(tilt.viewMove!(finish(9000, 1), 0, 0)).toEqual(finish(9000, 1));
      expect(tilt.viewMove!(start, 0, 1)).toEqual(start);
    });

    it("伏せてある回戦は、勝ち数にもタイムの合計にも入れない", () => {
      const s = play(fresh(), [...round(10_000, 12_000), start, finish(8000)]);
      const v = view(s, 0);
      expect(roundResult(v.rounds[1]!)).toBeNull();
      expect(tally(v.rounds)).toEqual({ wins: [1, 0], times: [10_000, 12_000] });
    });
  });

  describe("回戦と勝ち負け", () => {
    it("タイムが短い方がその回戦の勝ち。同じなら引き分け", () => {
      const a = play(fresh(), round(10_000, 12_000));
      expect(roundResult(a.rounds[0]!)).toEqual({ times: [10_000, 12_000], winner: 0 });
      const b = play(fresh(), round(10_000, 9990));
      expect(roundResult(b.rounds[0]!)!.winner).toBe(1);
      const c = play(fresh(), round(10_000, 10_000));
      expect(roundResult(c.rounds[0]!)!.winner).toBeNull();
    });

    it("回戦ごとに先に挑戦する人が交代し、迷路は決めておいた順に出る", () => {
      const s = play(fresh(), round(10_000, 12_000));
      expect(s.rounds).toHaveLength(2);
      expect(s.rounds[1]).toEqual({ maze: s.mazes[1], first: 1, tries: [null, null], running: null });
      expect(tilt.status(s)).toEqual({ kind: "playing", turn: 1 });
      // 2 回戦は後手が先に挑戦して勝つ（1 勝 1 敗なので 3 回戦へ）
      const t = play(s, round(9000, 10_000));
      expect(t.rounds[2]!.first).toBe(0);
      expect(t.rounds[2]!.maze).toBe(t.mazes[2]);
    });

    it("3 回戦で多く勝った方の勝ち", () => {
      // 1 回戦 先手の勝ち、2 回戦（後手が先）後手の勝ち、3 回戦 先手の勝ち
      const s = play(fresh(), [...round(10_000, 12_000), ...round(9000, 11_000), ...round(20_000, 25_000)]);
      expect(s.rounds).toHaveLength(3);
      expect(tally(s.rounds).wins).toEqual([2, 1]);
      expect(tilt.status(s)).toEqual({ kind: "finished", winner: 0 });
      expect(() => tilt.applyMove(s, start, 0)).toThrow("game_over");
      expect(() => tilt.applyMove(s, start, 1)).toThrow("game_over");
    });

    it("2 回戦で 2 勝したら、3 回戦はせずに決着", () => {
      // 2 回戦は後手が先に挑戦する。先手 8 秒・後手 9 秒で、先手の 2 勝
      const s = play(fresh(), [...round(10_000, 12_000), ...round(9000, 8000)]);
      expect(s.rounds).toHaveLength(2);
      expect(tilt.status(s)).toEqual({ kind: "finished", winner: 0 });
    });

    it("勝ち数が同じなら、タイムの合計が短い方の勝ち。それも同じなら引き分け", () => {
      // 1 回戦 引き分け、2 回戦 後手の勝ち、3 回戦 先手の勝ち → 1 勝 1 敗 1 分け
      const s = play(fresh(), [...round(10_000, 10_000), ...round(9000, 12_000), ...round(10_000, 20_000)]);
      expect(tally(s.rounds)).toEqual({ wins: [1, 1], times: [32_000, 39_000] });
      expect(tilt.status(s)).toEqual({ kind: "finished", winner: 0 });
      const d = play(fresh(), [...round(10_000, 10_000), ...round(9000, 12_000), ...round(9000, 12_000)]);
      expect(tally(d.rounds)).toEqual({ wins: [1, 1], times: [31_000, 31_000] });
      expect(tilt.status(d)).toEqual({ kind: "finished", winner: null });
    });
  });

  describe("始めたまま閉じたとき", () => {
    it("失敗扱いで閉じると、いちばん悪いタイム（MAX_MS）として数える", () => {
      const s = play(fresh(), [start, fail]);
      expect(s.rounds[0]!.tries[0]).toEqual({ ms: null, falls: 0, input: null });
      expect(timeOf(s.rounds[0]!.tries[0]!)).toBe(MAX_MS);
      expect(tilt.status(s)).toEqual({ kind: "playing", turn: 1 });
      const done = play(s, [start, finish(MAX_MS - 10)]);
      expect(roundResult(done.rounds[0]!)).toEqual({ times: [MAX_MS, MAX_MS - 10], winner: 1 });
    });

    it("時間切れ（MAX_MS）と失敗扱いは同じタイム", () => {
      const s = play(fresh(), round(MAX_MS, null));
      expect(roundResult(s.rounds[0]!)!.winner).toBeNull();
    });

    it("失敗扱いだったかどうかも、相手には伏せる", () => {
      const s = play(fresh(), [start, fail]);
      expect(view(s, 1).rounds[0]!.tries[0]).toBe("hidden");
    });
  });

  it("parseMove は形だけ確かめる（範囲は applyMove で確かめる）", () => {
    expect(tilt.parseMove({ kind: "start" })).toEqual(start);
    expect(tilt.parseMove({ kind: "fail" })).toEqual(fail);
    expect(tilt.parseMove({ kind: "finish", ms: 9000, falls: 1, input: "touch" })).toEqual(finish(9000, 1, "touch"));
    expect(tilt.parseMove({ kind: "finish", ms: 999_999, falls: 0, input: "motion" })).toEqual(finish(999_999));
    expect(tilt.parseMove({ kind: "finish", ms: 9000.5, falls: 0, input: "motion" })).toBeNull();
    expect(tilt.parseMove({ kind: "finish", ms: 9000, falls: "0", input: "motion" })).toBeNull();
    expect(tilt.parseMove({ kind: "finish", ms: 9000, falls: 0 })).toBeNull();
    expect(tilt.parseMove({ kind: "finish", ms: 9000, falls: 0, input: "mouse" })).toBeNull();
    expect(tilt.parseMove({ kind: "stop" })).toBeNull();
    expect(tilt.parseMove({})).toBeNull();
    expect(tilt.parseMove(null)).toBeNull();
    expect(tilt.parseMove("start")).toBeNull();
  });

  describe("コンピュータ", () => {
    it("自分の番でなければ null。終わっていても null", () => {
      expect(tilt.botMove!(view(fresh(), 1), 1, Math.random)).toBeNull();
      const over = play(fresh(), [...round(10_000, 12_000), ...round(9000, 8000)]);
      expect(tilt.botMove!(view(over, 0), 0, Math.random)).toBeNull();
      expect(tilt.botMove!(view(over, 1), 1, Math.random)).toBeNull();
    });

    it("まずスタートし、スタートしていればタイムを送る", () => {
      expect(tilt.botMove!(view(fresh(), 0), 0, Math.random)).toEqual(start);
      const s = play(fresh(), [start]);
      const m = tilt.botMove!(view(s, 0), 0, Math.random) as TiltMove;
      expect(m.kind).toBe("finish");
    });

    it("タイムは人間らしく、迷路の目安のまわりでばらつき、いつも範囲内", () => {
      const rng = seeded(7);
      const s = play(fresh(), [start]);
      const par = MAZES[s.rounds[0]!.maze]!.par;
      const times: number[] = [];
      for (let i = 0; i < 200; i++) {
        const m = tilt.botMove!(view(s, 0), 0, rng) as Extract<TiltMove, { kind: "finish" }>;
        expect(Number.isInteger(m.ms) && m.ms >= MIN_MS && m.ms <= MAX_MS).toBe(true);
        expect(Number.isInteger(m.falls) && m.falls >= 0 && m.falls <= MAX_FALLS).toBe(true);
        expect(m.input === "motion" || m.input === "touch").toBe(true);
        times.push(m.ms);
      }
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[100]!;
      expect(median).toBeGreaterThan(par * 0.8);
      expect(median).toBeLessThan(par * 1.5);
      expect(sorted[180]! - sorted[20]!).toBeGreaterThan(par * 0.2);
    });

    it("相手の伏せたタイムは見えない形で受け取る", () => {
      const s = play(fresh(), [start, finish(9000), start]);
      const v = view(s, 1);
      expect(v.rounds[0]!.tries[0]).toBe("hidden");
      expect((tilt.botMove!(v, 1, Math.random) as TiltMove).kind).toBe("finish");
    });

    it("コンピュータ同士で 20 局とも途中で止まらずに終わる", () => {
      for (let game = 0; game < 20; game++) {
        const rng = seeded(100 + game);
        let s = tilt.initialState(rng);
        for (let ply = 0; ply < 50 && tilt.status(s).kind === "playing"; ply++) {
          const st = tilt.status(s);
          if (st.kind !== "playing") break;
          const move = botMove(tilt, s, st.turn, rng);
          if (move === null) throw new Error("コンピュータが手を選べなかった");
          s = tilt.applyMove(s, move, st.turn);
        }
        expect(tilt.status(s).kind).toBe("finished");
        expect(s.rounds.length).toBeGreaterThanOrEqual(2);
        expect(s.rounds.length).toBeLessThanOrEqual(ROUNDS);
      }
    });
  });
});
