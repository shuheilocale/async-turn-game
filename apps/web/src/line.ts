import type { Liff } from "@line/liff";
import { flexMessage, type Card } from "@atg/core";

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
  /** 開いたトークの種類（utou：1 対 1／group：グループ／room：複数人）。トーク以外から開いたなら null */
  chatType: "utou" | "group" | "room" | null;
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
    const type = context?.type;
    const chatType = type === "utou" || type === "group" || type === "room" ? type : null;
    session = {
      liff,
      displayName: profile?.displayName ?? null,
      entryGameId: entry?.[1] ?? null,
      inChat: chatType !== null,
      chatType,
    };
  } catch (e) {
    // LINE の機能が使えなくても、ふつうの Web アプリとしては遊べる
    console.warn("LIFF の初期化に失敗しました", e);
  }
}

export type { Card };

/** トークに送るカード（見た目は @atg/core の flexMessage。サーバの知らせと同じ） */
export const flex = (card: Card): Messages => [flexMessage(card)] as Messages;

/** 公式アカウントのページ（友だち追加の画面）の URL（oaId は @xxxx）。グループに招待する前に、どのアカウントか確かめるのに使う */
export const officialAccountUrl = (oaId: string) => `https://line.me/R/ti/p/${encodeURIComponent(oaId)}`;

/** LINE の中で URL を開く（友だち追加の画面など）。LINE の外ならそのまま移る */
export function openInLine(url: string) {
  if (session) session.liff.openWindow({ url, external: false });
  else location.href = url;
}

/** トークから開いた対局の次の対局へ移るときに呼ぶ。次の対局でも同じトークへ自動で知らせられる */
/** その対局のカードを、開いていたトークへ自動で送ってよいか */
export const canPostTo = (s: Pick<LineSession, "inChat" | "chatType" | "entryGameId">, gameId: string) =>
  s.inChat && (s.chatType === "group" || s.chatType === "room" || s.entryGameId === gameId);

/** グループ・複数人トークから開いているか（招待を選ぶ画面を出さず、このトークへ直接送れる） */
export const inGroupChat = () => session?.chatType === "group" || session?.chatType === "room";

/** 開いているグループへ直接送る（招待など）。グループから開いていなければ、または送れなければ false */
export async function postToGroup(card: Card): Promise<boolean> {
  if (!session || !inGroupChat()) return false;
  try {
    await session.liff.sendMessages(flex(card));
    return true;
  } catch (e) {
    console.warn("グループに送れませんでした", e);
    return false;
  }
}

export function followGame(fromId: string, toId: string) {
  if (session?.entryGameId === fromId) session.entryGameId = toId;
}

/**
 * 開いていたトークに自動で送る。送れない状況（トーク以外から開いた・別の対局）なら false。
 * グループ（2 人と公式アカウントで遊ぶ場所）から開いたときは、トップや一覧を通って開いた対局でも送る
 * （1 対 1 のトークは相手が対局ごとに違うことがあるので、そのカードから開いた対局だけ）
 */
export async function postToChat(gameId: string, card: Card): Promise<boolean> {
  if (!session) return false;
  if (!canPostTo(session, gameId)) return false;
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
