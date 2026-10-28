/**
 * LINE のトークに送るカード（Flex Message）。画面（liff.sendMessages・shareTargetPicker）と
 * サーバ（Messaging API の push で時刻になったら知らせる）で同じ見た目にするため、ここで作る
 */
export interface Card {
  /** 通知や一覧に出る短い文 */
  alt: string;
  /** 小さく上に出す文（ゲーム名） */
  label: string;
  title: string;
  body?: string;
  button: string;
  url: string;
  /** 左に出すゲームのアイコン（https の PNG）。なければ出さない */
  icon?: string;
  /** 今の局面（apps/web の snapshot.ts の snapshotToFlex で作った箱）。なければ出さない */
  board?: object;
  /**
   * カードの上に大きく並べる写真（https の JPEG か PNG。2 枚までがきれいに並ぶ）。あれば、左の局面・アイコンは出さない。
   * 写真を使うゲームで、2 人の写真がそろったときに使う
   */
  images?: string[];
  /**
   * 主なボタンの上に並べる小さなボタン。url はリンク（開く）、data はトークのまま押せるボタン（postback）。
   * postback はサーバ（公式アカウント）が送るカードでしか使えない（画面から送る liff.sendMessages・shareTargetPicker はリンクだけ）
   */
  actions?: CardAction[];
}

export type CardAction = { label: string; url: string } | { label: string; data: string };

/** カードを Flex Message 1 通にする。画面と同じく白黒を基調にする */
export function flexMessage(card: Card): { type: "flex"; altText: string; contents: object } {
  // 左に今の局面（なければゲームのアイコン）、右に文字。カードの高さを抑えるため横に並べる
  const texts: object[] = [
    { type: "text", text: card.label, size: "xxs", color: "#5d6577" },
    { type: "text", text: card.title, size: "md", weight: "bold", wrap: true, color: "#171c28" },
  ];
  if (card.body) texts.push({ type: "text", text: card.body, size: "xs", wrap: true, color: "#3a4254" });
  // 写真があれば上に大きく出すので、左の局面・アイコンは出さない
  const images = card.images?.slice(0, 4) ?? [];
  const visual = images.length > 0
    ? null
    : card.board
    ? card.board
    : card.icon
      ? {
          type: "box",
          layout: "vertical",
          width: "52px",
          height: "52px",
          flex: 0,
          cornerRadius: "12px",
          backgroundColor: "#f2f4f8",
          contents: [{ type: "image", url: card.icon, size: "full", aspectMode: "fit", aspectRatio: "1:1" }],
        }
      : null;
  const textBox = { type: "box", layout: "vertical", spacing: "xs", justifyContent: "center", contents: texts };
  return {
    type: "flex",
    altText: card.alt,
    contents: {
      type: "bubble",
      size: "kilo",
      // 写真は上に横並びで、同じ大きさの正方形に切りそろえる
      ...(images.length > 0
        ? {
            hero: {
              type: "box",
              layout: "horizontal",
              spacing: "xs",
              contents: images.map((url) => ({ type: "image", url, size: "full", aspectMode: "cover", aspectRatio: "1:1", flex: 1 })),
            },
          }
        : {}),
      body: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        alignItems: "center",
        paddingAll: "14px",
        contents: visual ? [visual, textBox] : [textBox],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        paddingTop: "0px",
        spacing: "sm",
        contents: [
          ...(card.actions ?? []).map((a) => ({
            type: "button",
            style: "secondary",
            height: "sm",
            // 押したことはトークに出さない（返信で知らせる）。ボタンの文字は 40 字まで（超えると LINE に断られる）
            action:
              "data" in a
                ? { type: "postback", label: a.label.slice(0, 40), data: a.data }
                : { type: "uri", label: a.label.slice(0, 40), uri: a.url },
          })),
          {
            type: "button",
            style: "primary",
            color: "#171c28",
            height: "sm",
            action: { type: "uri", label: card.button, uri: card.url },
          },
        ],
      },
    },
  };
}
