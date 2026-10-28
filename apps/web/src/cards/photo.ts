import type { GameView, Photo } from "@atg/core";
import type { T } from "../i18n/index.tsx";
import type { Card } from "../line.ts";

/**
 * きょうのおだい写真の LINE のカード。2 人の写真がそろった手（そろって「次のお題へ」を待っているとき・アルバムができたとき）なら、
 * そのページの 2 枚をカードの上に並べ、「写真がそろいました」にする。そろった写真はだれでも見られる URL（/api/photos/<ID>）なので、
 * LINE からも読める。LINE は https の画像しか使えないので、https で開いているときだけ載せる
 */
export default function photoCard(t: T, v: GameView, card: Card): Card {
  const s = v.state as Photo.PhotoView;
  const page = s.pages?.at(-1);
  const finished = v.status.kind === "finished";
  if (!page || !(s.waiting || finished)) return card;
  const images =
    location.protocol === "https:" ? page.entries.map((e) => `${location.origin}/api/photos/${encodeURIComponent(e.photo)}`) : undefined;
  const topic = t("game.photo.card.topic", { topic: t(`game.photo.topic.${page.topic}`) });
  if (finished) return { ...card, body: `${topic}\n${t("game.photo.card.album", { n: s.pages.length })}`, images };
  const title = t("game.photo.card.both");
  return { ...card, alt: `${title} ${topic}`, title, body: topic, images };
}
