import { flexMessage, gameNames, type Card, type CardAction, type Mochi, type NameLang } from "@atg/core";
import { awakeTogether, quietUntil, timeZoneOf } from "./alarms.ts";
import { careActions } from "./mochiChat.ts";
import type { DueAlarm, GameStore, LinePlayer, NoticeRecord } from "./store.ts";

/**
 * 時刻になったら LINE の公式アカウント（Messaging API）で知らせる。送り先は 2 人と公式アカウントのグループ（webhook.ts で記録）、
 * なければ 1 人ずつ 1 対 1。Workers では Cron Trigger（worker.ts の scheduled）、手元の Node.js では一定間隔（index.ts）で processAlarms を呼ぶ
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
  /** グループへ送った（送ろうとした）ときは、そのグループの ID */
  groupId?: string;
}

/** グループへ送るとき、2 人の言語の文を並べるつなぎ */
const JOIN = "／";

/**
 * 知らせ 1 通のカード。見た目は画面から送るカードと同じ（左にアイコン、右に文と「開く」ボタン）。
 * langs を渡すと（グループへ送るとき）その言語の文を順に並べる。なければ受け取る人の言語だけ。
 * actions は「開く」の上に並べるボタン（もちのお世話など）
 */
export function noticeCard(
  alarm: DueAlarm,
  liffId: string,
  origin?: string,
  langs: NameLang[] = [asLang(alarm.lang)],
  actions?: CardAction[],
): Card {
  const text = langs.map((lang) => noticeText(lang, alarm.gameType, alarm.kind, alarm.name)).join(JOIN);
  return {
    alt: text,
    label: langs.map((lang) => gameName(lang, alarm.gameType)).join(JOIN),
    title: text,
    button: langs.map((lang) => TEXTS[lang].open!).join(JOIN),
    url: `https://miniapp.line.me/${liffId}/g/${alarm.gameId}`,
    icon: origin?.startsWith("https://") ? `${origin.replace(/\/$/, "")}/icons/${alarm.gameType}.png` : undefined,
    ...(actions?.length ? { actions } : {}),
  };
}

/** 知らせのカードに付ける、トークのまま押せるボタン。いまは、ふたりのもちのお世話だけ（mochiChat.ts） */
async function actionsFor(run: Run, alarm: DueAlarm, langs: NameLang[]): Promise<CardAction[] | undefined> {
  if (alarm.gameType !== "mochi") return undefined;
  const game = await run.store.get(alarm.gameId);
  return game ? careActions(game.id, game.state as Mochi.MochiState, run.now, langs, alarm.kind) : undefined;
}

/** 1 回の処理（processAlarms）で共通に使うもの */
interface Run {
  store: GameStore;
  options: PushOptions;
  now: number;
  sentAt: string;
  dayAgo: string;
  log: (line: string) => void;
}

/** push で 1 通送る。失敗したらその理由（HTTP の状態コードや通信のエラー）、送れたら null */
async function push(run: Run, to: string, message: object): Promise<string | null> {
  try {
    const res = await (run.options.fetch ?? fetch)(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${run.options.token}` },
      body: JSON.stringify({ to, messages: [message] }),
    });
    if (!res.ok) return `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`.trim();
    return null;
  } catch (e) {
    return String(e instanceof Error ? e.message : e).slice(0, 200);
  }
}

/** その LINE ユーザーが上限に当たっていれば理由（per_game・per_person）、まだ送れるなら null */
async function overLimit(run: Run, lineUserId: string, gameId: string): Promise<"per_game" | "per_person" | null> {
  if ((await run.store.countSent(lineUserId, run.dayAgo, gameId)) >= LIMIT_PER_GAME) return "per_game";
  if ((await run.store.countSent(lineUserId, run.dayAgo)) >= LIMIT_PER_PERSON) return "per_person";
  return null;
}

/** 1 対 1 で、予定の席の人へ送る（グループがないとき） */
async function toPerson(run: Run, alarm: DueAlarm): Promise<PushResult> {
  const base = { gameId: alarm.gameId, seat: alarm.seat, kind: alarm.kind };
  const until = quietUntil(run.now, timeZoneOf(alarm.timeZone, alarm.lang));
  if (until !== null) {
    return (await run.store.deferAlarm(alarm, until)) ? { ...base, result: "deferred", until } : { ...base, result: "taken" };
  }
  if (!(await run.store.takeAlarm(alarm))) return { ...base, result: "taken" };

  const record = (status: NoticeRecord["status"], detail: string | null = null) =>
    run.store.recordNotice({ ...base, lineUserId: alarm.lineUserId!, status, detail, sentAt: run.sentAt });
  const over = await overLimit(run, alarm.lineUserId!, alarm.gameId);
  if (over) {
    await record("limited", over);
    return { ...base, result: "limited" };
  }
  const langs = [asLang(alarm.lang)];
  const card = noticeCard(alarm, run.options.liffId, run.options.origin, langs, await actionsFor(run, alarm, langs));
  const message = flexMessage(card);
  const failure = await push(run, alarm.lineUserId!, message);
  if (failure) run.log(`LINE の知らせを送れませんでした（${alarm.gameId} 席 ${alarm.seat} ${alarm.kind}）: ${failure}`);
  await record(failure ? "failed" : "sent", failure);
  return { ...base, result: failure ? "failed" : "sent", message };
}

/**
 * 2 人がそろったグループへ送る。同じ対局・同じ種類の予定は（相手の分がまだ時刻前でも）まとめて 1 通にする。
 * - 2 人のどちらかが夜なら、2 人とも昼になるまで遅らせる
 * - 1 通を 2 人それぞれに 1 通と数え、どちらかが上限なら送らない。記録も 2 人それぞれに 1 行（グループの ID 付き）
 */
async function toGroup(run: Run, groupId: string, unit: DueAlarm[], players: LinePlayer[]): Promise<PushResult[]> {
  const results: PushResult[] = [];
  const done = (alarm: DueAlarm, result: PushResult["result"], extra: Partial<PushResult> = {}) =>
    results.push({ gameId: alarm.gameId, seat: alarm.seat, kind: alarm.kind, result, groupId, ...extra });

  const from = awakeTogether(run.now, players.map((p) => timeZoneOf(p.timeZone, p.lang)));
  if (from > run.now) {
    for (const alarm of unit) {
      if (await run.store.deferAlarm(alarm, from)) done(alarm, "deferred", { until: from });
      else done(alarm, "taken");
    }
    return results;
  }
  const taken: DueAlarm[] = [];
  for (const alarm of unit) {
    if (await run.store.takeAlarm(alarm)) taken.push(alarm);
    else done(alarm, "taken");
  }
  const [first] = taken;
  if (!first) return results;

  const record = async (status: NoticeRecord["status"], detail: string | null = null) => {
    for (const p of players) {
      await run.store.recordNotice({
        gameId: first.gameId,
        seat: p.seat,
        lineUserId: p.lineUserId!,
        kind: first.kind,
        status,
        detail,
        sentAt: run.sentAt,
        groupId,
      });
    }
  };
  let over: string | null = null;
  for (const p of players) over ??= await overLimit(run, p.lineUserId!, first.gameId);
  if (over) {
    await record("limited", over);
    for (const alarm of taken) done(alarm, "limited");
    return results;
  }

  // 文は、予定の席の人（stalled なら手番の人）の言語を先に、相手の言語が違えば続けて
  const langs = [first.lang, ...players.filter((p) => p.seat !== first.seat).map((p) => p.lang)].map(asLang);
  const both = [...new Set(langs)];
  const card = noticeCard(first, run.options.liffId, run.options.origin, both, await actionsFor(run, first, both));
  const message = flexMessage(card);
  const failure = await push(run, groupId, message);
  if (failure) run.log(`LINE の知らせをグループに送れませんでした（${first.gameId} ${first.kind} → ${groupId}）: ${failure}`);
  await record(failure ? "failed" : "sent", failure);
  for (const alarm of taken) done(alarm, failure ? "failed" : "sent", { message });
  return results;
}

/**
 * 時刻を過ぎた予定を集めて、LINE で知らせる。送ったら予定を消す（次の予定は次の手で決まる）。
 * - 対局の 2 人が両方メンバーになっているグループ（公式アカウントを招待して、2 人とも話したもの）があれば、そこへ 1 通
 * - なければ、LINE とつながっているプレイヤーへ 1 対 1 で（公式アカウントを友だち追加している人だけ届く）
 * - 受け取る人のタイムゾーンで夜なら朝まで遅らせる（グループなら 2 人とも昼になるまで）
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
  const run: Run = {
    store,
    options,
    now,
    sentAt: new Date(now).toISOString(),
    dayAgo: new Date(now - DAY_MS).toISOString(),
    log,
  };
  const results: PushResult[] = [];
  // グループへまとめて送った予定（対局:席）。あとから同じ予定を 1 対 1 で送らないように
  const handled = new Set<string>();

  // 上限を正しく数えるため、1 件ずつ順に送る
  for (const alarm of await store.dueAlarms(now, BATCH)) {
    if (handled.has(`${alarm.gameId}:${alarm.seat}`)) continue;
    const base = { gameId: alarm.gameId, seat: alarm.seat, kind: alarm.kind };

    if (!alarm.lineUserId || now - alarm.at > STALE_MS) {
      const taken = await store.takeAlarm(alarm);
      results.push({ ...base, result: taken ? (alarm.lineUserId ? "stale" : "unlinked") : "taken" });
      continue;
    }

    const groupId = await store.noticeGroupOf(alarm.gameId);
    if (groupId) {
      const unit = (await store.gameAlarms(alarm.gameId)).filter((a) => a.kind === alarm.kind && a.version === alarm.version);
      for (const a of unit) handled.add(`${a.gameId}:${a.seat}`);
      if (unit.length) results.push(...(await toGroup(run, groupId, unit, await store.linePlayers(alarm.gameId))));
      else results.push({ ...base, result: "taken" });
      continue;
    }
    results.push(await toPerson(run, alarm));
  }
  return results;
}
