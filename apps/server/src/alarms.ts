import type { GameDefinition, Seat } from "@atg/core";

/** 知らせの予定 1 つ（受け取る席ごと） */
export interface AlarmPlan {
  seat: Seat;
  /** 知らせる時刻（ミリ秒） */
  at: number;
  kind: string;
}

/** 順番のあるゲームで、手番の人がこの時間指していなければ 1 回だけ知らせる */
export const STALLED_MS = 24 * 3_600_000;

/**
 * 今の state から、次の知らせの予定を決める（ゲームを問わない）。手を受け取ったとき・参加したときに決め直す。
 * - ゲームが nextAlarm を持っていれば、それを 2 人ともに
 * - 持っていない、ふつうの順番のあるゲームで遊んでいる途中なら、手番の人へ now から STALLED_MS 後に stalled
 * - 終局していれば、なし
 */
export function planAlarms(def: GameDefinition<any, any>, state: unknown, now: number): AlarmPlan[] {
  const status = def.status(state);
  if (status.kind === "finished") return [];
  if (def.nextAlarm) {
    const alarm = def.nextAlarm(state);
    return alarm ? ([0, 1] as Seat[]).map((seat) => ({ seat, at: alarm.at, kind: alarm.kind })) : [];
  }
  // 2 人ともいつでも指せるゲームには「手番の人」がいない
  if (status.free) return [];
  return [{ seat: status.turn, at: now + STALLED_MS, kind: "stalled" }];
}

/** 画面から送られてきたタイムゾーン（IANA 名）。この環境の Intl が知らない名前は受け付けない */
export function cleanTimeZone(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

/** タイムゾーンが分からない人は、言語から推す。言語も分からなければ日本（このアプリの基準の言語） */
const ZONE_OF_LANG: Record<string, string> = { ja: "Asia/Tokyo", th: "Asia/Bangkok", en: "UTC" };
export const timeZoneOf = (timeZone: string | null | undefined, lang: string | null | undefined) =>
  timeZone ?? ZONE_OF_LANG[lang ?? ""] ?? "Asia/Tokyo";

/** 受け取る人のこの時刻からこの時刻までは、知らせを送らない（夜） */
export const QUIET_FROM = 22;
export const QUIET_TO = 8;

/** t（ミリ秒）のときの、timeZone での年月日・時刻 */
function wallClock(t: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(t);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** t のときの、timeZone の時計と UTC の差（ミリ秒） */
function offsetOf(t: number, timeZone: string) {
  const c = wallClock(t, timeZone);
  return Date.UTC(c.y, c.m - 1, c.d, c.h, c.min, c.s) - Math.floor(t / 1000) * 1000;
}

/**
 * t が timeZone で夜（QUIET_FROM 時〜QUIET_TO 時）なら、次の QUIET_TO 時の時刻（ミリ秒）。夜でなければ null。
 * 夏時間の切り替えをはさむときのために、差は 8 時の時点でもう一度測り直す
 */
export function quietUntil(t: number, timeZone: string): number | null {
  const c = wallClock(t, timeZone);
  if (c.h >= QUIET_TO && c.h < QUIET_FROM) return null;
  const morning = Date.UTC(c.y, c.m - 1, c.h >= QUIET_FROM ? c.d + 1 : c.d, QUIET_TO);
  const guess = morning - offsetOf(t, timeZone);
  return morning - offsetOf(guess, timeZone);
}

/**
 * t 以降で、timeZones の全員が昼（夜でない）になるいちばん早い時刻。t のときに全員昼なら t。
 * だれかが夜ならその人の朝まで進め、そこで別の人が夜ならまたその人の朝まで…とくり返す。
 * 昼は 14 時間あり 2 人の昼は必ず重なるので、2 人なら 2 回進めれば見つかる（念のため回数に上限をおく）
 */
export function awakeTogether(t: number, timeZones: string[]): number {
  for (let i = 0; i < 2 * timeZones.length + 2; i++) {
    const next = Math.max(t, ...timeZones.map((zone) => quietUntil(t, zone) ?? t));
    if (next === t) break;
    t = next;
  }
  return t;
}
