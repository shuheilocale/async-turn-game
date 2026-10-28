import { getGame, IllegalMoveError, type Seat } from "@atg/core";
import { cleanTimeZone, planAlarms } from "./alarms.ts";
import type { GameRecord, GameStore } from "./store.ts";

/**
 * 手を受け取って対局を進める。画面から（POST /games/:id/moves）と、LINE のトークのボタンから（webhook.ts の postback）の両方で使う
 */

/** 画面が対応している言語だけ受け付ける */
const LANGS = ["ja", "en", "th"];
export const cleanLang = (raw: unknown): string | null => (typeof raw === "string" && LANGS.includes(raw) ? raw : null);

/**
 * 2 人そろった対局の、次の知らせの予定を決め直す（手を受け取ったとき・参加したとき・次の対局を作ったとき）。
 * 予定が入れられなくても対局は止めない
 */
export async function replan(store: GameStore, game: GameRecord | null) {
  if (!game || game.players.length < 2) return;
  try {
    await store.setAlarms(game.id, game.version, planAlarms(getGame(game.gameType)!, game.state, Date.now()));
  } catch (e) {
    console.error("知らせの予定を入れられませんでした", e);
  }
}

export type PlayResult =
  | { ok: true; game: GameRecord; move: unknown }
  | { ok: false; status: 400 | 409 | 422; error: string };

/**
 * seat の人の手 raw を、版 version の対局 game に指す。指せたら進んだあとの対局と、記録した手（時刻を書き込んだもの）。
 * lang・timeZone を渡すと、その人の言語・タイムゾーンも覚え直す
 */
export async function playMove(
  store: GameStore,
  game: GameRecord,
  seat: Seat,
  raw: unknown,
  version: unknown,
  extra: { lang?: unknown; timeZone?: unknown } = {},
): Promise<PlayResult> {
  if (game.players.length < 2) return { ok: false, status: 409, error: "waiting_opponent" };
  if (version !== game.version) return { ok: false, status: 409, error: "version_conflict" };
  const def = getGame(game.gameType)!;
  const parsed = def.parseMove(raw);
  if (parsed === null) return { ok: false, status: 400, error: "bad_move" };
  // 時間を使うゲームは、受け取った時刻をサーバの時計で手に書き込む（送られてきた時刻は使わない）。記録にもこの手が残る
  const move = def.stampMove ? def.stampMove(parsed, Date.now()) : parsed;
  // 写真を使うゲームは、手に載せた写真がこの対局・この席の人がアップロードしたものか確かめる（applyMove には見られない）
  for (const photoId of def.photosOfMove?.(move) ?? []) {
    if ((await store.photoSeat(game.id, photoId)) !== seat) return { ok: false, status: 422, error: "photo_not_found" };
  }

  let next: unknown;
  try {
    next = def.applyMove(game.state, move, seat);
  } catch (e) {
    if (e instanceof IllegalMoveError) return { ok: false, status: 422, error: e.code };
    throw e;
  }
  if (!(await store.recordMove(game.id, game.version, seat, move, next))) {
    return { ok: false, status: 409, error: "version_conflict" };
  }
  const me = game.players.find((p) => p.seat === seat);
  const lang = cleanLang(extra.lang);
  if (lang && me?.lang !== lang) await store.setLang(game.id, seat, lang);
  const timeZone = cleanTimeZone(extra.timeZone);
  if (timeZone && me?.timeZone !== timeZone) await store.setTimeZone(game.id, seat, timeZone);
  const updated = (await store.get(game.id))!;
  await replan(store, updated);
  return { ok: true, game: updated, move };
}
