import { flexMessage, gameNames, type Card, type NameLang } from "@atg/core";
import { quietUntil, timeZoneOf } from "./alarms.ts";
import type { DueAlarm, GameStore, NoticeRecord } from "./store.ts";

/**
 * 時刻になったら LINE の公式アカウント（Messaging API）で知らせる。
 * Workers では Cron Trigger（worker.ts の scheduled）、手元の Node.js では一定間隔（index.ts）で processAlarms を呼ぶ
 */

export const PUSH_URL = "https://api.line.me/v2/bot/message/push";

/** 同じ対局で 1 人に送るのは 1 日（24 時間）にこれまで */
export const LIMIT_PER_GAME = 3;
/** 1 人に全部の対局で送るのは 1 日（24 時間）にこれまで（Messaging API の無料枠は月 200 通） */
export const LIMIT_PER_PERSON = 6;
/** 予定の時刻からこれより遅れたものは送らずに消す（トークンを入れたときや止まっていたあとに、古い知らせがまとめて届かないように） */
export const STALE_MS = 24 * 3_600_000;
/** 1 回の処理で見る予定の数 */
const BATCH = 100;
const DAY_MS = 24 * 3_600_000;

/**
 * 知らせの文言。キーは「ゲーム ID.知らせの種類」（ゲームの nextAlarm が返す kind）と、ゲームを問わない stalled など。
 * {name} は受け取る人の名前、{game} はゲーム名
 */
const TEXTS: Record<NameLang, Record<string, string>> = {
  ja: {
    open: "開く",
    stalled: "{name}さん、『{game}』であなたの番です",
    other: "『{game}』からのお知らせです",
    "mochi.hungry": "もちがおなかをすかせています",
    "mochi.wake": "もちが目をさましました",
    "mochi.hatched": "卵がかえりました！",
    "mochi.grown": "もちがおとなになれそうです",
    "mochi.lonely": "もちがさみしそうです",
  },
  en: {
    open: "Open",
    stalled: "{name}, it's your turn in {game}",
    other: "News from {game}",
    "mochi.hungry": "Mochi is hungry",
    "mochi.wake": "Mochi woke up",
    "mochi.hatched": "The egg hatched!",
    "mochi.grown": "Mochi looks ready to grow up",
    "mochi.lonely": "Mochi seems lonely",
  },
  th: {
    open: "เปิด",
    stalled: "{name} ถึงตาคุณแล้วใน {game}",
    other: "มีข่าวจาก {game}",
    "mochi.hungry": "โมจิหิวแล้ว",
    "mochi.wake": "โมจิตื่นแล้ว",
    "mochi.hatched": "ไข่ฟักแล้ว!",
    "mochi.grown": "โมจิใกล้จะโตเป็นผู้ใหญ่แล้ว",
    "mochi.lonely": "โมจิดูเหงาๆ",
  },
};

const asLang = (raw: string | null | undefined): NameLang => (raw === "en" || raw === "th" ? raw : "ja");
const gameName = (lang: NameLang, gameType: string) => gameNames[gameType]?.[lang] ?? gameType;

/** 知らせの文。受け取る人の言語で書く */
export function noticeText(lang: NameLang, gameType: string, kind: string, name: string): string {
  const texts = TEXTS[lang];
  const template = texts[`${gameType}.${kind}`] ?? texts[kind] ?? texts.other!;
  return template.replaceAll("{name}", name).replaceAll("{game}", gameName(lang, gameType));
}

export interface PushOptions {
  /** Messaging API のチャネルアクセストークン（長期）。なければ何もしない */
  token: string | undefined;
  /** 開くボタンの URL（https://miniapp.line.me/<LIFF ID>/g/<対局ID>）に使う */
  liffId: string;
  /** 公開している URL（https://〜）。アイコン（/icons/<ゲームID>.png）に使う。https でなければアイコンを付けない */
  origin?: string;
  /** テストでは偽物に差し替える */
  fetch?: typeof fetch;
  now?: number;
  log?: (line: string) => void;
}

export interface PushResult {
  gameId: string;
  seat: number;
  kind: string;
  /**
   * sent：送れた／failed：LINE に断られた・通信に失敗した／limited：上限を超えた／deferred：夜なので朝まで遅らせた／
   * unlinked：LINE とつながっていない／stale：遅れすぎ／taken：ほかの処理が先に取った・決め直されていた
   */
  result: "sent" | "failed" | "limited" | "deferred" | "unlinked" | "stale" | "taken";
  /** deferred のとき、遅らせた先の時刻 */
  until?: number;
  /** 送った（送ろうとした）メッセージ */
  message?: object;
}

/** 知らせ 1 通のカード。見た目は画面から送るカードと同じ（左にアイコン、右に文と「開く」ボタン） */
export function noticeCard(alarm: DueAlarm, liffId: string, origin?: string): Card {
  const lang = asLang(alarm.lang);
  const text = noticeText(lang, alarm.gameType, alarm.kind, alarm.name);
  return {
    alt: text,
    label: gameName(lang, alarm.gameType),
    title: text,
    button: TEXTS[lang].open!,
    url: `https://miniapp.line.me/${liffId}/g/${alarm.gameId}`,
    icon: origin?.startsWith("https://") ? `${origin.replace(/\/$/, "")}/icons/${alarm.gameType}.png` : undefined,
  };
}

/**
 * 時刻を過ぎた予定を集めて、LINE とつながっているプレイヤーへ push で送る。送ったら予定を消す（次の予定は次の手で決まる）。
 * - 受け取る人のタイムゾーンで夜なら、その人の朝まで遅らせる
 * - 同じ対局で 1 人に 1 日 LIMIT_PER_GAME 通、全部の対局で LIMIT_PER_PERSON 通まで。超える分は送らない
 * - 送る前に予定を条件つきで消して取る。取れたものだけ送るので、同時に動いても 2 回は送らない
 * - LINE に断られても（友だちでない など）、通信に失敗しても、ほかの送信は続ける
 */
export async function processAlarms(store: GameStore, options: PushOptions): Promise<PushResult[]> {
  const now = options.now ?? Date.now();
  const log = options.log ?? ((line: string) => console.log(line));
  if (!options.token) {
    // 送るものがないときまで毎回書くと、手元で一定間隔で動かしたときにうるさいので、予定があるときだけ
    const due = await store.countDueAlarms(now);
    if (due) log(`LINE_MESSAGING_TOKEN がないので、LINE の知らせは送りません（時刻を過ぎた予定 ${due} 件はそのまま）`);
    return [];
  }
  const doFetch = options.fetch ?? fetch;
  const sentAt = new Date(now).toISOString();
  const dayAgo = new Date(now - DAY_MS).toISOString();
  const results: PushResult[] = [];

  // 上限を正しく数えるため、1 件ずつ順に送る
  for (const alarm of await store.dueAlarms(now, BATCH)) {
    const base = { gameId: alarm.gameId, seat: alarm.seat, kind: alarm.kind };
    const done = (result: PushResult["result"], extra: Partial<PushResult> = {}) => {
      results.push({ ...base, result, ...extra });
    };

    if (!alarm.lineUserId || now - alarm.at > STALE_MS) {
      if (await store.takeAlarm(alarm)) done(alarm.lineUserId ? "stale" : "unlinked");
      else done("taken");
      continue;
    }
    const until = quietUntil(now, timeZoneOf(alarm.timeZone, alarm.lang));
    if (until !== null) {
      if (await store.deferAlarm(alarm, until)) done("deferred", { until });
      else done("taken");
      continue;
    }
    if (!(await store.takeAlarm(alarm))) {
      done("taken");
      continue;
    }

    const record = (status: NoticeRecord["status"], detail: string | null = null) =>
      store.recordNotice({ ...base, lineUserId: alarm.lineUserId!, status, detail, sentAt });
    const overGame = (await store.countSent(alarm.lineUserId, dayAgo, alarm.gameId)) >= LIMIT_PER_GAME;
    if (overGame || (await store.countSent(alarm.lineUserId, dayAgo)) >= LIMIT_PER_PERSON) {
      await record("limited", overGame ? "per_game" : "per_person");
      done("limited");
      continue;
    }

    const message = flexMessage(noticeCard(alarm, options.liffId, options.origin));
    let failure: string | null = null;
    try {
      const res = await doFetch(PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
        body: JSON.stringify({ to: alarm.lineUserId, messages: [message] }),
      });
      if (!res.ok) failure = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`.trim();
    } catch (e) {
      failure = String(e instanceof Error ? e.message : e).slice(0, 200);
    }
    if (failure) log(`LINE の知らせを送れませんでした（${alarm.gameId} 席 ${alarm.seat} ${alarm.kind}）: ${failure}`);
    await record(failure ? "failed" : "sent", failure);
    done(failure ? "failed" : "sent", { message });
  }
  return results;
}
