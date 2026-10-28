import { Billiards, type Seat } from "@atg/core";
import type { T } from "../../i18n/index.tsx";

/** ビリヤードの文（結果・LINE の知らせ）。盤とテストから使う */

/** 球の番号を並べる（例「3 番・12 番」） */
export const ballsText = (t: T, ids: readonly number[]) =>
  ids.map((n) => t("game.billiards.ball", { n })).join(t("game.billiards.join"));

/** 1 打の結果。who は打った人、next は相手の呼び方 */
export function shotText(t: T, shot: Billiards.Shot, nameOf: (seat: Seat) => string): string {
  const who = nameOf(shot.seat);
  const next = nameOf(shot.seat === 0 ? 1 : 0);
  const made = shot.pocketed.filter((id) => id !== Billiards.CUE);
  const reason = shot.foul ? t(`game.billiards.foul.${shot.foul}`) : "";
  switch (shot.outcome) {
    case "rerack":
      return t("game.billiards.result.rerack", { who });
    case "win":
      return t("game.billiards.result.win", { who });
    case "lose":
      return shot.foul ? t("game.billiards.result.loseFoul", { who, reason }) : t("game.billiards.result.loseEarly", { who });
    case "foul":
      return t("game.billiards.result.foul", { who, reason, next });
    case "continue": {
      const text = t("game.billiards.result.continue", { who, balls: ballsText(t, made) });
      if (!shot.assigned) return text;
      return text + t("game.billiards.then") + t("game.billiards.result.assigned", { who, group: t(`game.billiards.${shot.assigned}`) });
    }
    default:
      return made.length > 0
        ? t("game.billiards.result.missPotted", { who, balls: ballsText(t, made) })
        : t("game.billiards.result.miss", { who });
  }
}

/**
 * LINE で相手に知らせる文。知らせるのは手番が相手に移ったとき（入らなかった・ファウル）と終局のとき。
 * 手だけからわかることで書く（最初に相手の球に当てたファウルは、手だけではわからないので「打ちました」）
 */
export function billiardsMovedText(t: T, move: unknown, name: string): string {
  const m = move as Partial<Billiards.BilliardsMove>;
  const pocketed = Array.isArray(m.pocketed) ? m.pocketed : [];
  if (pocketed.includes(Billiards.EIGHT)) return t("game.billiards.moved.eight", { name });
  if (pocketed.includes(Billiards.CUE)) return t("game.billiards.moved.foul", { name, reason: t("game.billiards.foul.scratch") });
  if (m.firstHit === null) return t("game.billiards.moved.foul", { name, reason: t("game.billiards.foul.noHit") });
  const made = pocketed.filter((id) => id !== Billiards.CUE);
  if (made.length > 0) return t("game.billiards.moved.potted", { name, balls: ballsText(t, made) });
  return t("game.billiards.moved.shot", { name });
}
