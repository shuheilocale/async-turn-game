import { describe, expect, it } from "vitest";
import { IllegalMoveError, other, type Seat } from "../types.ts";
import {
  destinations,
  korokoro,
  roll,
  SIZE,
  START_FACES,
  type Dir,
  type Faces,
  type KorokoroState,
} from "./korokoro.ts";

// マスの番号（行優先）。上が北、右が東
//  0  1  2  3
//  4  5  6  7
//  8  9 10 11
// 12 13 14 15

const B = 0 as const;
const O = 1 as const;

/** 先手から交互に、止まるマスを並べて転がす */
function play(cells: number[], from = korokoro.initialState(Math.random)): KorokoroState {
  let s = from;
  cells.forEach((to, i) => {
    s = korokoro.applyMove(s, { to }, (i % 2) as Seat);
  });
  return s;
}

/** 決まった順に値を返す乱数（テストを毎回同じにするため） */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/**
 * 途中の局面を作る。board は 16 文字で、"b" が青・"o" がオレンジ・"." が空き
 */
function position(board: string, cell: number, faces: Faces, turn: Seat): KorokoroState {
  const s = korokoro.initialState(Math.random);
  return {
    ...s,
    board: [...board.replace(/\s/g, "")].map((ch) => (ch === "b" ? B : ch === "o" ? O : null)),
    cube: { cell, faces },
    turn,
  };
}

const faces = (top: Seat, bottom: Seat, north: Seat, south: Seat, east: Seat, west: Seat): Faces => ({
  top,
  bottom,
  north,
  south,
  east,
  west,
});

describe("korokoro", () => {
  it("キューブは左上の角にあり、下・東・南がオレンジ、上・西・北が青。どのマスも空きで先手から", () => {
    const s = korokoro.initialState(Math.random);
    expect(s.board).toHaveLength(SIZE * SIZE);
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(s.cube.cell).toBe(0);
    expect(s.cube.faces).toEqual(faces(B, O, B, O, O, B));
    expect(START_FACES).toEqual(s.cube.faces);
    expect(s.lastMove).toBeNull();
    expect(s.winLine).toBeNull();
    expect(korokoro.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("初手は、たてもよこも 1 マス先がオレンジ、2・3 マス先が青", () => {
    const s = korokoro.initialState(Math.random);
    const colors = Object.fromEntries(destinations(s).map((d) => [d.to, d.color]));
    expect(colors).toEqual({ 1: O, 2: B, 3: B, 4: O, 8: B, 12: B });
    // 実際に転がしても同じ色で塗られる
    for (const [to, color] of Object.entries(colors)) {
      const next = korokoro.applyMove(s, { to: Number(to) }, 0);
      expect(next.board[Number(to)]).toBe(color);
      expect(next.cube.faces.bottom).toBe(color);
    }
  });

  it("1 マス転がるごとに、転がる向きの面が下に、下の面が反対側に回る（4 方向）", () => {
    const f = faces(B, O, B, O, O, B);
    // 右（東）へ：東の面が下へ、上の面が東へ、西の面が上へ、下の面が西へ。北と南はそのまま
    expect(roll(f, "right")).toEqual(faces(B, O, B, O, B, O));
    // 左（西）へ：西の面が下へ、上の面が西へ、東の面が上へ、下の面が東へ
    expect(roll(f, "left")).toEqual(faces(O, B, B, O, O, B));
    // 下（南）へ：南の面が下へ、上の面が南へ、北の面が上へ、下の面が北へ。東と西はそのまま
    expect(roll(f, "down")).toEqual(faces(B, O, O, B, O, B));
    // 上（北）へ：北の面が下へ、上の面が北へ、南の面が上へ、下の面が南へ
    expect(roll(f, "up")).toEqual(faces(O, B, B, O, O, B));
  });

  it("同じ向きに 4 回転がると元に戻り、反対の向きに転がると元に戻る。向かい合う面はいつも別の色", () => {
    const opposite: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    for (const dir of ["up", "down", "left", "right"] as Dir[]) {
      let f = START_FACES;
      for (let i = 0; i < 4; i++) {
        f = roll(f, dir);
        expect(f.top).not.toBe(f.bottom);
        expect(f.north).not.toBe(f.south);
        expect(f.east).not.toBe(f.west);
      }
      expect(f).toEqual(START_FACES);
      expect(roll(roll(START_FACES, dir), opposite[dir])).toEqual(START_FACES);
    }
  });

  it("何マスも転がすと、1 マスごとに転がった向きになる（右 2・下 3・左 1・上 2）", () => {
    // 右へ 2 マス：0 → 2
    const s1 = play([2]);
    expect(s1.cube).toEqual({ cell: 2, faces: faces(O, B, B, O, B, O) });
    expect(s1.board[2]).toBe(B);
    expect(s1.lastMove).toEqual({ seat: 0, from: 0, to: 2, dir: "right", path: [0, 1, 2], color: B });

    // 下へ 3 マス：2 → 14。後手が転がしても、下になった面が青なら青で塗る
    const s2 = play([2, 14]);
    expect(s2.cube).toEqual({ cell: 14, faces: faces(O, B, O, B, B, O) });
    expect(s2.board[14]).toBe(B);
    expect(s2.lastMove).toEqual({ seat: 1, from: 2, to: 14, dir: "down", path: [2, 6, 10, 14], color: B });

    // 左へ 1 マス：14 → 13
    const s3 = play([2, 14, 13]);
    expect(s3.cube).toEqual({ cell: 13, faces: faces(B, O, O, B, B, O) });
    expect(s3.board[13]).toBe(O);

    // 上へ 2 マス：13 → 5
    const s4 = play([2, 14, 13, 5]);
    expect(s4.cube).toEqual({ cell: 5, faces: faces(O, B, B, O, B, O) });
    expect(s4.board[5]).toBe(B);
    expect(s4.lastMove).toEqual({ seat: 1, from: 13, to: 5, dir: "up", path: [13, 9, 5], color: B });
    expect(s4.board.filter((c) => c !== null)).toHaveLength(4);
    expect(korokoro.status(s4)).toEqual({ kind: "playing", turn: 0 });
  });

  it("塗ったマスの上は通れるが、止まれない", () => {
    // 0 → 1（オレンジ）→ 13 → 12。13 が塗られている
    const s = play([1, 13, 12]);
    expect(s.board[13]).not.toBeNull();
    expect(s.cube.cell).toBe(12);
    // 13 を通り越して 14 に止まれる
    const passed = korokoro.applyMove(s, { to: 14 }, 1);
    expect(passed.cube.cell).toBe(14);
    expect(passed.lastMove?.path).toEqual([12, 13, 14]);
    // 13 には止まれない
    expect(() => korokoro.applyMove(s, { to: 13 }, 1)).toThrow(new IllegalMoveError("korokoro_painted"));
    expect(destinations(s).map((d) => d.to)).not.toContain(13);
  });

  it("最初にキューブがいた角のマスは空きなので、あとで止まれる", () => {
    const s = play([4]);
    expect(s.board[0]).toBeNull();
    expect(destinations(s).map((d) => d.to)).toContain(0);
    expect(korokoro.applyMove(s, { to: 0 }, 1).board[0]).not.toBeNull();
  });

  it("たてかよこにまっすぐでないと転がせない。その場にとどまることもできない", () => {
    const s = korokoro.initialState(Math.random);
    for (const to of [0, 5, 6, 15, 9]) {
      expect(() => korokoro.applyMove(s, { to }, 0)).toThrow(new IllegalMoveError("korokoro_not_straight"));
    }
  });

  it("自分の番でなければ転がせない。転がすと手番が替わる", () => {
    const s = korokoro.initialState(Math.random);
    expect(() => korokoro.applyMove(s, { to: 1 }, 1)).toThrow(new IllegalMoveError("not_your_turn"));
    const s1 = korokoro.applyMove(s, { to: 1 }, 0);
    expect(korokoro.status(s1)).toEqual({ kind: "playing", turn: 1 });
    expect(() => korokoro.applyMove(s1, { to: 5 }, 0)).toThrow(new IllegalMoveError("not_your_turn"));
  });

  it("青がよこに 3 つ並ぶと、後手が塗っても青（先手）の勝ち", () => {
    // 6 にいるキューブを上へ 1 マス転がすと、北の面（青）が下になり 2 を青で塗る
    const s = position("bb.. .... .... ....", 6, faces(O, B, B, O, O, B), 1);
    expect(destinations(s).find((d) => d.to === 2)?.color).toBe(B);
    const end = korokoro.applyMove(s, { to: 2 }, 1);
    expect(end.board[2]).toBe(B);
    expect(korokoro.status(end)).toEqual({ kind: "finished", winner: 0 });
    expect(end.winLine).toEqual([0, 1, 2]);
    expect(end.lastMove).toMatchObject({ seat: 1, color: B });
    expect(() => korokoro.applyMove(end, { to: 3 }, 0)).toThrow(new IllegalMoveError("game_over"));
    expect(korokoro.legalMoves!(end, 0)).toEqual([]);
    expect(korokoro.legalMoves!(end, 1)).toEqual([]);
  });

  it("オレンジがたてに 3 つ並ぶと、先手が塗ってもオレンジ（後手）の勝ち", () => {
    // 3 にいるキューブを左へ 3 マス転がすと、東の面（オレンジ）が下になる。0・4・8 がオレンジでたてに並ぶ
    const s = position("...b o... o... ....", 3, faces(B, O, B, O, O, B), 0);
    const end = korokoro.applyMove(s, { to: 0 }, 0);
    expect(end.board[0]).toBe(O);
    expect(korokoro.status(end)).toEqual({ kind: "finished", winner: 1 });
    expect(end.winLine).toEqual([0, 4, 8]);
  });

  it("4 つ並んだら 4 マスとも勝った並びに入る。たてとよこが同時にそろえば両方", () => {
    // 14 から上へ 3 マス転がると、南の面（青）が下になって 2 を青で塗る（6・10 は塗ってあるが通れる）
    const s = position("bb.b ..b. ..b. ..o.", 14, faces(B, O, O, B, O, B), 0);
    const end = korokoro.applyMove(s, { to: 2 }, 0);
    expect(end.board[2]).toBe(B);
    expect(korokoro.status(end)).toEqual({ kind: "finished", winner: 0 });
    // よこの 0〜3 と、たての 2・6・10
    expect(end.winLine).toEqual([0, 1, 2, 3, 6, 10]);
  });

  it("ななめに 3 つ並んでも勝ちにならない", () => {
    // 0・5 が青。14 から上へ 1 マス転がすと、北の面（青）が下になって 10 を青で塗る
    const s = position("b... .b.. .... ..o.", 14, faces(O, B, B, O, O, B), 0);
    const next = korokoro.applyMove(s, { to: 10 }, 0);
    expect(next.board[10]).toBe(B);
    expect(next.winLine).toBeNull();
    expect(korokoro.status(next)).toEqual({ kind: "playing", turn: 1 });
  });

  it("次の人がどこにも止まれなければ引き分け", () => {
    // 3 から左へ 3 マスで 0 に止まる。0 の行（1・2・3）と列（4・8・12）はすべて塗ってあり、3 つ並びもない
    const s = position(".obo o... b... o...", 3, faces(B, O, B, O, O, B), 0);
    const end = korokoro.applyMove(s, { to: 0 }, 0);
    expect(end.cube.cell).toBe(0);
    expect(end.winLine).toBeNull();
    expect(destinations(end)).toEqual([]);
    expect(korokoro.status(end)).toEqual({ kind: "finished", winner: null });
    // 止まれなくなったのは次の手番の後手
    expect(end.turn).toBe(1);
    expect(korokoro.legalMoves!(end, 1)).toEqual([]);
    expect(() => korokoro.applyMove(end, { to: 5 }, 1)).toThrow(new IllegalMoveError("game_over"));
  });

  it("legalMoves は applyMove で通る手とぴったり同じ。手番でない席・終局後は空", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seeded(seed);
      let s = korokoro.initialState(rng);
      let moves = 0;
      while (korokoro.status(s).kind === "playing") {
        const turn = s.turn;
        const legal = korokoro.legalMoves!(s, turn);
        const accepted = Array.from({ length: SIZE * SIZE }, (_, to) => to).filter((to) => {
          try {
            korokoro.applyMove(s, { to }, turn);
            return true;
          } catch {
            return false;
          }
        });
        expect(legal.map((m) => m.to).sort((a, b) => a - b)).toEqual(accepted);
        expect(legal.length).toBeGreaterThan(0);
        expect(korokoro.legalMoves!(s, other(turn))).toEqual([]);
        for (const m of legal) expect(korokoro.parseMove(JSON.parse(JSON.stringify(m)))).toEqual(m);
        s = korokoro.applyMove(s, legal[Math.floor(rng() * legal.length)]!, turn);
        moves++;
      }
      // 1 手で 1 マスずつ塗るので、多くても 16 手で終わる
      expect(moves).toBeLessThanOrEqual(SIZE * SIZE);
      expect(s.board.filter((c) => c !== null)).toHaveLength(moves);
      expect(korokoro.legalMoves!(s, 0)).toEqual([]);
      expect(korokoro.legalMoves!(s, 1)).toEqual([]);
      const st = korokoro.status(s);
      if (st.kind === "finished" && st.winner !== null) {
        // 勝った並びは、勝った人の色で塗られている
        expect(s.winLine!.length).toBeGreaterThanOrEqual(3);
        for (const c of s.winLine!) expect(s.board[c]).toBe(st.winner);
      }
    }
  });

  it("parseMove は盤の中のマスの番号だけ受け付ける", () => {
    expect(korokoro.parseMove({ to: 0 })).toEqual({ to: 0 });
    expect(korokoro.parseMove({ to: 15 })).toEqual({ to: 15 });
    expect(korokoro.parseMove({ to: 16 })).toBeNull();
    expect(korokoro.parseMove({ to: -1 })).toBeNull();
    expect(korokoro.parseMove({ to: 1.5 })).toBeNull();
    expect(korokoro.parseMove({ to: "3" })).toBeNull();
    expect(korokoro.parseMove({ dir: "up", dist: 1 })).toBeNull();
    expect(korokoro.parseMove({})).toBeNull();
    expect(korokoro.parseMove(null)).toBeNull();
    expect(korokoro.parseMove(3)).toBeNull();
  });
});
