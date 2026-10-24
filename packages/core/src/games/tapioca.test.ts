import { describe, expect, it } from "vitest";
import { IllegalMoveError, type Seat } from "../types.ts";
import {
  COLS,
  ICE,
  landingIndex,
  ROWS,
  tapioca,
  travelOf,
  type Piece,
  type TapiocaMove,
  type TapiocaState,
} from "./tapioca.ts";

// マスの番号（行優先）。0 行目が一番上（グラスのふち側）、5 行目が一番下
//  0  1  2  3  4
//  5  6  7  8  9
// 10 11 12 13 14
// 15 16 17 18 19
// 20 21 22 23 24
// 25 26 27 28 29

const at = (row: number, col: number) => row * COLS + col;
const pearl = (col: number): TapiocaMove => ({ col, piece: "pearl" });
const ice = (col: number): TapiocaMove => ({ col, piece: "ice" });

/** 先手から交互に入れる */
function play(moves: TapiocaMove[], from = tapioca.initialState(Math.random)): TapiocaState {
  let s = from;
  for (const m of moves) s = tapioca.applyMove(s, m, s.turn);
  return s;
}

/**
 * 途中の局面を作る。rows は上の段から順に COLS 文字ずつ。
 * "b" が青のタピオカ、"B" が青の氷、"o" がオレンジのタピオカ、"O" がオレンジの氷、"." が空き
 */
function position(rows: string[], turn: Seat, iceLeft: [number, number] = [ICE[0], ICE[1]]): TapiocaState {
  const cells = rows.join("").replace(/\s/g, "");
  expect(cells).toHaveLength(COLS * ROWS);
  const board = [...cells].map((ch) => {
    if (ch === ".") return null;
    const seat: Seat = ch.toLowerCase() === "b" ? 0 : 1;
    const piece: Piece = ch === ch.toUpperCase() ? "ice" : "pearl";
    return { seat, piece };
  });
  return { ...tapioca.initialState(Math.random), board, turn, ice: iceLeft };
}

const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.code;
    throw e;
  }
  return null;
};

describe("tapioca", () => {
  it("5 列 × 6 段の空のグラスで、先手から。氷は先手 3 個・後手 4 個", () => {
    const s = tapioca.initialState(Math.random);
    expect([COLS, ROWS]).toEqual([5, 6]);
    expect(s.board).toHaveLength(COLS * ROWS);
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(s.ice).toEqual([3, 4]);
    expect(s.lastMove).toBeNull();
    expect(s.winLine).toBeNull();
    expect(tapioca.status(s)).toEqual({ kind: "playing", turn: 0 });
  });

  it("タピオカは一番下の空きに沈み、氷は一番上の空きに浮かぶ", () => {
    let s = play([pearl(2)]);
    expect(s.board[at(5, 2)]).toEqual({ seat: 0, piece: "pearl" });
    expect(s.lastMove).toBe(at(5, 2));
    expect(s.turn).toBe(1);

    s = play([ice(2)], s);
    expect(s.board[at(0, 2)]).toEqual({ seat: 1, piece: "ice" });
    expect(s.lastMove).toBe(at(0, 2));

    // 2 つ目は、それぞれ 1 つ目の上・下に止まる
    s = play([pearl(2), ice(2)], s);
    expect(s.board[at(4, 2)]).toEqual({ seat: 0, piece: "pearl" });
    expect(s.board[at(1, 2)]).toEqual({ seat: 1, piece: "ice" });
    expect(landingIndex(s.board, 2, "pearl")).toBe(at(3, 2));
    expect(landingIndex(s.board, 2, "ice")).toBe(at(2, 2));
  });

  it("列は下と上から埋まり、真ん中が最後に埋まる。満杯の列には、タピオカも氷も入れられない", () => {
    const s = play([pearl(2), ice(2), pearl(2), ice(2), pearl(2)]);
    // 残りは真ん中の 1 マス。タピオカでも氷でも同じところに止まる
    expect(landingIndex(s.board, 2, "pearl")).toBe(at(2, 2));
    expect(landingIndex(s.board, 2, "ice")).toBe(at(2, 2));

    const full = play([ice(2)], s);
    expect(full.board[at(2, 2)]).toEqual({ seat: 1, piece: "ice" });
    expect(landingIndex(full.board, 2, "pearl")).toBeNull();
    expect(errorOf(() => tapioca.applyMove(full, pearl(2), 0))).toBe("column_full");
    expect(errorOf(() => tapioca.applyMove(full, ice(2), 0))).toBe("column_full");
    expect(tapioca.legalMoves!(full, 0).some((m) => m.col === 2)).toBe(false);
    expect(tapioca.legalMoves!(full, 0)).toHaveLength((COLS - 1) * 2);
  });

  it("氷を入れると残りが減り、使い切ったら氷は入れられない（タピオカは入れられる）", () => {
    const s = play([ice(0), pearl(0), ice(1), pearl(1), ice(3), pearl(3)]);
    expect(s.ice).toEqual([0, 4]);
    // 一番上の段に青の氷が 0・1・3 列。2 列目に氷を入れれば 4 つ並ぶが、もう氷がない
    expect(errorOf(() => tapioca.applyMove(s, ice(2), 0))).toBe("tapioca_no_ice");
    expect(tapioca.legalMoves!(s, 0)).toEqual([0, 1, 2, 3, 4].map(pearl));
    const next = tapioca.applyMove(s, pearl(2), 0);
    expect(next.board[at(5, 2)]).toEqual({ seat: 0, piece: "pearl" });
    expect(next.finished).toBe(false);
    // 後手の氷は減っていない
    expect(tapioca.legalMoves!(next, 1)).toHaveLength(COLS * 2);
  });

  it("たてに 4 つ並んだら勝ち。勝った並びを持つ", () => {
    const s = play([pearl(0), pearl(1), pearl(0), pearl(1), pearl(0), pearl(1), pearl(0)]);
    expect(tapioca.status(s)).toEqual({ kind: "finished", winner: 0 });
    expect(s.winLine).toEqual([at(2, 0), at(3, 0), at(4, 0), at(5, 0)]);
    expect(s.turn).toBe(0);
  });

  it("よこの並びは、タピオカと氷をまぜて数える", () => {
    const s = position(
      [
        "BBB..", //
        "...o.",
        "...b.",
        "...o.",
        "...b.",
        "oo.o.",
      ],
      0,
      [0, 4],
    );
    // 3 列目は一番上だけが空いているので、タピオカでも一番上に止まる
    const next = tapioca.applyMove(s, pearl(3), 0);
    expect(next.lastMove).toBe(at(0, 3));
    expect(tapioca.status(next)).toEqual({ kind: "finished", winner: 0 });
    expect(next.winLine).toEqual([at(0, 0), at(0, 1), at(0, 2), at(0, 3)]);
  });

  it("たての並びも、上の氷と下のタピオカがつながれば数える", () => {
    const s = position(
      [
        ".B...", //
        ".B...",
        ".....",
        ".b...",
        ".o...",
        ".oo..",
      ],
      0,
      [1, 4],
    );
    for (const piece of ["pearl", "ice"] as const) {
      const next = tapioca.applyMove(s, { col: 1, piece }, 0);
      expect(next.winLine).toEqual([at(0, 1), at(1, 1), at(2, 1), at(3, 1)]);
      expect(tapioca.status(next)).toEqual({ kind: "finished", winner: 0 });
    }
  });

  it("ななめに 4 つ並んだら勝ち。同じ列でも、氷だと上に浮かんで並ばない", () => {
    const s = position(
      [
        ".....", //
        ".....",
        ".....",
        "..bo.",
        ".bob.",
        "boobo",
      ],
      0,
    );
    const byPearl = tapioca.applyMove(s, pearl(3), 0);
    expect(byPearl.lastMove).toBe(at(2, 3));
    expect(byPearl.winLine).toEqual([at(2, 3), at(3, 2), at(4, 1), at(5, 0)]);
    expect(tapioca.status(byPearl)).toEqual({ kind: "finished", winner: 0 });

    const byIce = tapioca.applyMove(s, ice(3), 0);
    expect(byIce.lastMove).toBe(at(0, 3));
    expect(byIce.winLine).toBeNull();
    expect(tapioca.status(byIce)).toEqual({ kind: "playing", turn: 1 });
  });

  it("グラスがいっぱいになって、どちらも並ばなければ引き分け", () => {
    // 2 段ごとにくり返す、4 つ並ばない埋め方。2 段目の真ん中だけ空けておく
    const s = position(
      [
        "bboob", //
        "ooBbo",
        "bb.ob",
        "oobbO",
        "bboOb",
        "oobbo",
      ],
      1,
      [2, 2],
    );
    const end = tapioca.applyMove(s, pearl(2), 1);
    expect(end.board.every((c) => c !== null)).toBe(true);
    expect(end.finished).toBe(true);
    expect(end.winLine).toBeNull();
    expect(tapioca.status(end)).toEqual({ kind: "finished", winner: null });
    expect(tapioca.legalMoves!(end, 0)).toEqual([]);
    expect(tapioca.legalMoves!(end, 1)).toEqual([]);
  });

  it("手番でない人は入れられない。終局後は誰も入れられない", () => {
    const s = tapioca.initialState(Math.random);
    expect(errorOf(() => tapioca.applyMove(s, pearl(0), 1))).toBe("not_your_turn");
    expect(tapioca.legalMoves!(s, 1)).toEqual([]);
    const won = play([pearl(0), pearl(1), pearl(0), pearl(1), pearl(0), pearl(1), pearl(0)]);
    expect(errorOf(() => tapioca.applyMove(won, pearl(4), 1))).toBe("game_over");
    expect(errorOf(() => tapioca.applyMove(won, pearl(4), 0))).toBe("game_over");
  });

  it("legalMoves は、入れられる列ごとにタピオカと（残っていれば）氷を返し、applyMove と食い違わない", () => {
    const first = tapioca.legalMoves!(tapioca.initialState(Math.random), 0);
    expect(first).toHaveLength(COLS * 2);
    expect(first).toContainEqual(pearl(4));
    expect(first).toContainEqual(ice(4));

    // でたらめに進めながら、形の上でありうる手すべてと照らし合わせる
    let x = 7;
    const rng = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const every = Array.from({ length: COLS }, (_, col) => [pearl(col), ice(col)]).flat();
    for (let game = 0; game < 30; game++) {
      let s = tapioca.initialState(rng);
      while (!s.finished) {
        const moves = tapioca.legalMoves!(s, s.turn);
        const ok = every.filter((m) => errorOf(() => tapioca.applyMove(s, m, s.turn)) === null);
        expect(moves).toEqual(ok);
        s = tapioca.applyMove(s, moves[Math.floor(rng() * moves.length)]!, s.turn);
      }
    }
  });

  it("parseMove は、列の番号とタピオカか氷かを確かめる", () => {
    expect(tapioca.parseMove({ col: 0, piece: "pearl" })).toEqual(pearl(0));
    expect(tapioca.parseMove({ col: COLS - 1, piece: "ice", extra: 1 })).toEqual(ice(COLS - 1));
    for (const raw of [
      { col: COLS, piece: "pearl" },
      { col: -1, piece: "pearl" },
      { col: 1.5, piece: "pearl" },
      { col: "1", piece: "pearl" },
      { col: 1 },
      { col: 1, piece: "boba" },
      { piece: "ice" },
      null,
      "ice",
      3,
    ]) {
      expect(tapioca.parseMove(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("travelOf：入れたものが動いたマスの数（画面の動きに使う）", () => {
    let s = play([pearl(0)]);
    expect(travelOf(s.board, at(5, 0))).toBe(ROWS - 1);
    s = play([ice(0)], s);
    expect(travelOf(s.board, at(0, 0))).toBe(ROWS - 2);
    s = play([pearl(0)], s);
    expect(travelOf(s.board, at(4, 0))).toBe(ROWS - 3);
    s = play([pearl(0), ice(0), ice(0)], s);
    // 最後の 1 マスは動かずに止まる
    expect(s.lastMove).toBe(at(2, 0));
    expect(travelOf(s.board, at(2, 0))).toBe(0);
    expect(travelOf(s.board, at(1, 1))).toBe(0);
  });
});
