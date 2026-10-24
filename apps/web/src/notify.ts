import type { GameView, Seat } from "@atg/core";
import { coopText, type T } from "./i18n/index.tsx";
import { miniAppUrl, type Card } from "./line.ts";
import { snapshotOf, snapshotToFlex } from "./snapshot.ts";

/** LINE のトークに送るカードの文面。送る人の言語で書く */

/** LINE のカードに載せるゲームのアイコン（ビルド時に public/icons/ に書き出す PNG）。LINE は https の画像しか使えない */
const iconOf = (gameType: string) =>
  location.protocol === "https:" ? `${location.origin}/icons/${gameType}.png` : undefined;

const namesOf = (v: GameView) => {
  const names = { 0: "", 1: "" } as Record<Seat, string>;
  for (const p of v.players) names[p.seat] = p.name;
  return names;
};

export function inviteCard(t: T, gameType: string, id: string, inviteCode: string, host: string): Card {
  const game = t(`game.${gameType}.name`);
  return {
    alt: t("line.invite.alt", { name: host, game }),
    label: game,
    title: t("line.invite.title", { name: host }),
    body: t("line.invite.body"),
    button: t("join.submit"),
    url: miniAppUrl(`/join/${id}?code=${inviteCode}`),
    icon: iconOf(gameType),
  };
}

/**
 * 指した・参加したあとに、今の状況（次は誰の番か・勝敗）を知らせるカード。what は「〇〇さんが指しました」など。
 * t は受け取る人（相手）の言語のものを渡す
 */
export function progressCard(t: T, v: GameView, what: string): Card {
  const names = namesOf(v);
  const game = t(`game.${v.gameType}.name`);
  const url = miniAppUrl(`/g/${v.id}`);
  const icon = iconOf(v.gameType);
  // 盤面が全部見えるゲームだけ、今の局面を描いて載せる
  const snap = snapshotOf(v.gameType, v.state);
  const board = snap ? snapshotToFlex(snap) : undefined;
  if (v.status.kind === "finished") {
    const w = v.status.winner;
    const coop = v.status.coop;
    const result = coop
      ? coopText(t, v.gameType, coop)
      : w === null
        ? t("status.draw")
        : t("status.winner", { name: names[w], seat: t(`game.${v.gameType}.seat${w}`) });
    return { alt: `${game}: ${result}`, label: game, title: result, body: what, button: t("line.result"), url, icon, board };
  }
  const next = t("status.theirTurn", { name: names[v.status.turn] });
  return { alt: `${what} ${next}`, label: game, title: what, body: next, button: t("line.open"), url, icon, board };
}
