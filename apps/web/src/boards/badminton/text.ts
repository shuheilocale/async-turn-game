import { Badminton, type Seat } from "@atg/core";
import type { T } from "../../i18n/index.tsx";

/** バドミントンの文（ラリーの結果・LINE の知らせ）。盤とテストから使う */

export const shotName = (t: T, h: Badminton.Hit) => t(`game.badminton.shot.${Badminton.shotOf(h)}`);

/** 終わったラリーの結果。nameOf は呼び方（「あなた」「〇〇さん」） */
export function rallyText(t: T, r: Badminton.Rally, nameOf: (seat: Seat) => string): string {
  const final = r.hits[r.hits.length - 1]!;
  const who = nameOf(final.seat);
  const shot = shotName(t, final);
  const point = t("game.badminton.point", { who: nameOf(r.winner) });
  return t(`game.badminton.result.${r.reason}`, { who, shot }) + t("game.badminton.then") + point;
}

/**
 * LINE で相手に知らせる文。打った手なら、その球がどうなったか（ネット・アウト）も手だけからわかる
 * （打った所と速さが手に入っている。サーブの打つ所は決まっている）
 */
export function badmintonMovedText(t: T, move: unknown, name: string): string {
  const m = move as Partial<Record<"kind", string> & Record<"f" | "px" | "x" | "y" | "vx" | "vy", number>>;
  if (m.kind === "miss") return t("game.badminton.moved.miss", { name });
  if ((m.kind !== "serve" && m.kind !== "hit") || typeof m.vx !== "number" || typeof m.vy !== "number") {
    return t("game.badminton.moved.hit", { name, shot: "" });
  }
  const seat: Seat = m.vx > 0 ? 0 : 1;
  const serve = m.kind === "serve";
  const hit: Badminton.Hit = serve
    ? { seat, f: 0, px: 0, x: Badminton.sideX(seat, Badminton.SERVE_X), y: Badminton.SERVE_Y, vx: m.vx, vy: m.vy }
    : { seat, f: m.f ?? 1, px: m.px ?? 0, x: m.x ?? 0, y: m.y ?? 0, vx: m.vx, vy: m.vy };
  const shot = shotName(t, hit);
  const reason = Badminton.judge(Badminton.flightOf(hit), seat, serve);
  if (reason !== "in") return t(`game.badminton.moved.${reason}`, { name, shot });
  return t(serve ? "game.badminton.moved.serve" : "game.badminton.moved.hit", { name, shot });
}
