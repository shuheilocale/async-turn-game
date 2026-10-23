import type { Liff } from "@line/liff";

/**
 * LINE ミニアプリ（LIFF）として開かれたときだけ使う機能。
 * LINE の外で開いたときは何もしない（今までどおり合言葉と共有リンクで遊ぶ）。
 */

/** LINE ミニアプリの LIFF ID。既定は本番用（Published） */
const LIFF_ID: string = import.meta.env.VITE_LIFF_ID ?? "2012180396-nO920f3r";

type Messages = Parameters<Liff["sendMessages"]>[0];

export interface LineSession {
  liff: Liff;
  displayName: string | null;
  /**
   * トークのカードから開いた対局の ID。sendMessages は「開いたトーク」に送るので、
   * 別の対局へ移ったあとに送ると関係ないトークに届いてしまう。そのため自動で知らせるのはこの対局だけ
   */
  entryGameId: string | null;
  /** 1 対 1・グループ・複数人のトークから開いたか */
  inChat: boolean;
}

let session: LineSession | null = null;

export const lineSession = () => session;

/** ID トークン（サーバで LINE アカウントを確かめるのに使う）。LINE の外では undefined */
export const lineIdToken = () => session?.liff.getIDToken() ?? undefined;

/** LINE の中で開くための URL（トークに送るカードのリンク） */
export const miniAppUrl = (path: string) => `https://miniapp.line.me/${LIFF_ID}${path}`;

/** LINE の中（またはミニアプリの URL から外部ブラウザ）で開かれたときだけ LIFF を読み込む */
const shouldInit = () => /\bLine\//i.test(navigator.userAgent) || new URLSearchParams(location.search).has("liff.state");

/** 画面を描く前に呼ぶ。ミニアプリの URL の続き（/g/xxx など）への移動も liff.init が行う */
export async function setupLine(): Promise<void> {
  if (!shouldInit()) return;
  try {
    const { default: liff } = await import("@line/liff");
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isInClient()) return;
    const context = liff.getContext();
    const profile = await liff.getProfile().catch(() => null);
    const entry = location.pathname.match(/^\/(?:g|join)\/([\w-]+)/);
    session = {
      liff,
      displayName: profile?.displayName ?? null,
      entryGameId: entry?.[1] ?? null,
      inChat: ["utou", "group", "room"].includes(context?.type ?? ""),
    };
  } catch (e) {
    // LINE の機能が使えなくても、ふつうの Web アプリとしては遊べる
    console.warn("LIFF の初期化に失敗しました", e);
  }
}

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
}

/** トークに送るカード。画面と同じく白黒を基調にする */
function flex(card: Card): Messages {
  const heading: object[] = [
    { type: "text", text: card.label, size: "xs", color: "#5d6577" },
    { type: "text", text: card.title, size: "lg", weight: "bold", wrap: true, color: "#171c28" },
  ];
  // アイコンがあれば左に置き、どのゲームの知らせかひと目で分かるようにする
  const body: object[] = card.icon
    ? [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          alignItems: "center",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: "52px",
              height: "52px",
              cornerRadius: "12px",
              backgroundColor: "#f2f4f8",
              contents: [{ type: "image", url: card.icon, size: "full", aspectMode: "fit", aspectRatio: "1:1" }],
            },
            { type: "box", layout: "vertical", spacing: "xs", contents: heading },
          ],
        },
      ]
    : heading;
  if (card.body) body.push({ type: "text", text: card.body, size: "sm", wrap: true, color: "#3a4254" });
  return [
    {
      type: "flex",
      altText: card.alt,
      contents: {
        type: "bubble",
        size: "kilo",
        body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "18px", contents: body },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "14px",
          paddingTop: "0px",
          contents: [
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
    },
  ] as Messages;
}

/** トークから開いた対局の次の対局へ移るときに呼ぶ。次の対局でも同じトークへ自動で知らせられる */
export function followGame(fromId: string, toId: string) {
  if (session?.entryGameId === fromId) session.entryGameId = toId;
}

/** 開いていたトークに自動で送る。送れない状況（トーク以外から開いた・別の対局）なら false */
export async function postToChat(gameId: string, card: Card): Promise<boolean> {
  if (!session?.inChat || session.entryGameId !== gameId) return false;
  try {
    await session.liff.sendMessages(flex(card));
    return true;
  } catch (e) {
    console.warn("トークに送れませんでした", e);
    return false;
  }
}

export type PickResult = { kind: "sent" } | { kind: "cancelled" } | { kind: "failed"; reason: string };

/** 送り先（友だち・グループ）を選んで送る。使えないときやエラーのときは理由を返す */
export async function pickAndSend(card: Card): Promise<PickResult> {
  if (!session) return { kind: "failed", reason: "not_in_line" };
  if (!session.liff.isApiAvailable("shareTargetPicker")) return { kind: "failed", reason: "share_target_picker_unavailable" };
  try {
    const res = await session.liff.shareTargetPicker(flex(card), { isMultiple: false });
    return res ? { kind: "sent" } : { kind: "cancelled" };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { kind: "failed", reason: [err.code, err.message].filter(Boolean).join(": ") || String(e) };
  }
}
