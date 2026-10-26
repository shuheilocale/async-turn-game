import type { Seat } from "@atg/core";
import type { AlarmPlan } from "./alarms.ts";
import { q, type Sql } from "./sql.ts";

export interface PlayerRecord {
  seat: Seat;
  name: string;
  /** 画面で使っている言語（ja / en / th）。分からなければ null */
  lang?: string | null;
  /** タイムゾーン（IANA 名）。夜に LINE で知らせないために使う。分からなければ null */
  timeZone?: string | null;
}

/** 時刻を過ぎた知らせの予定と、受け取る人 */
export interface DueAlarm extends AlarmPlan {
  gameId: string;
  gameType: string;
  /** 予定を決めたときの対局の版 */
  version: number;
  name: string;
  lang: string | null;
  timeZone: string | null;
  /** LINE とつながっていなければ null（送れない） */
  lineUserId: string | null;
}

/** 知らせの記録。status は sent（送れた）／failed（LINE に断られた）／limited（上限を超えたので送らなかった） */
export interface NoticeRecord {
  gameId: string;
  seat: Seat;
  lineUserId: string;
  kind: string;
  status: "sent" | "failed" | "limited";
  detail: string | null;
  sentAt: string;
  /** グループへ送ったときは、そのグループの ID。1 対 1 なら null */
  groupId?: string | null;
}

/** 対局の席と、その人の LINE ユーザー ID（LINE とつながっていなければ null） */
export interface LinePlayer extends PlayerRecord {
  lineUserId: string | null;
}

export interface GameRecord {
  id: string;
  gameType: string;
  state: unknown;
  version: number;
  /** 2 人目が参加すると null になる */
  inviteCode: string | null;
  players: PlayerRecord[];
  /** 終局後に作られた次の対局。なければ null */
  nextGameId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Node.js と Workers の両方で動くよう、Web Crypto を使う
export const newToken = (bytes = 24) => {
  const raw = String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const hash = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const now = () => new Date().toISOString();

/**
 * 対局データの保存先。SQL の実行口（Sql）を差し替えれば、手元の SQLite でも
 * Cloudflare D1 でも同じように動く。D1 では BEGIN/COMMIT が使えないので、
 * 書き込みはすべて batch（全部成功か全部取り消し）で行い、条件は SQL の中に書く。
 */
export class GameStore {
  constructor(private db: Sql) {}

  /** 対局を作り、作成者のトークンを返す。lineUserId は LINE から作ったときだけ */
  async create(
    gameType: string,
    state: unknown,
    creator: PlayerRecord,
    lineUserId: string | null = null,
  ): Promise<{ id: string; token: string; inviteCode: string }> {
    const id = newToken(9);
    const token = newToken();
    const tokenHash = await hash(token);
    const inviteCode = newToken(9);
    const t = now();
    await this.db.batch([
      q(
        "INSERT INTO games (id, game_type, state_json, version, invite_code, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
        id,
        gameType,
        JSON.stringify(state),
        inviteCode,
        t,
        t,
      ),
      q(
        "INSERT INTO players (game_id, seat, name, token_hash, line_user_id, lang, time_zone) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        creator.seat,
        creator.name,
        tokenHash,
        lineUserId,
        creator.lang ?? null,
        creator.timeZone ?? null,
      ),
      q("INSERT INTO tokens (token_hash, game_id, seat) VALUES (?, ?, ?)", tokenHash, id, creator.seat),
    ]);
    return { id, token, inviteCode };
  }

  async get(id: string): Promise<GameRecord | null> {
    const [row] = await this.db.all<Record<string, any>>("SELECT * FROM games WHERE id = ?", id);
    if (!row) return null;
    const players = await this.db.all<PlayerRecord>(
      "SELECT seat, name, lang, time_zone AS timeZone FROM players WHERE game_id = ? ORDER BY seat",
      id,
    );
    return {
      id: row.id,
      gameType: row.game_type,
      state: JSON.parse(row.state_json),
      version: row.version,
      inviteCode: row.invite_code,
      players,
      nextGameId: row.next_game_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** トークンからその対局での席を調べる。該当しなければ null */
  async seatOf(id: string, token: string | undefined): Promise<Seat | null> {
    if (!token) return null;
    const [row] = await this.db.all<{ seat: Seat }>(
      "SELECT seat FROM tokens WHERE game_id = ? AND token_hash = ?",
      id,
      await hash(token),
    );
    return row ? row.seat : null;
  }

  /** LINE アカウントからその対局での席を調べる。該当しなければ null */
  async seatOfLineUser(id: string, lineUserId: string): Promise<Seat | null> {
    const [row] = await this.db.all<{ seat: Seat }>(
      "SELECT seat FROM players WHERE game_id = ? AND line_user_id = ?",
      id,
      lineUserId,
    );
    return row ? row.seat : null;
  }

  /** プレイヤーの言語を書き換える（指すたびに、そのときの画面の言語を送ってもらう） */
  async setLang(id: string, seat: Seat, lang: string): Promise<void> {
    await this.db.batch([q("UPDATE players SET lang = ? WHERE game_id = ? AND seat = ?", lang, id, seat)]);
  }

  /** プレイヤーのタイムゾーンを書き換える（言語と同じく、指すたびに送ってもらう） */
  async setTimeZone(id: string, seat: Seat, timeZone: string): Promise<void> {
    await this.db.batch([q("UPDATE players SET time_zone = ? WHERE game_id = ? AND seat = ?", timeZone, id, seat)]);
  }

  /** LINE アカウントで本人と確かめられたら、この端末用の合言葉を新しく発行する */
  async claim(id: string, lineUserId: string): Promise<{ token: string; seat: Seat } | null> {
    const seat = await this.seatOfLineUser(id, lineUserId);
    if (seat === null) return null;
    const token = newToken();
    await this.db.batch([q("INSERT INTO tokens (token_hash, game_id, seat) VALUES (?, ?, ?)", await hash(token), id, seat)]);
    return { token, seat };
  }

  /** LINE アカウントで参加している対局（新しく動いた順） */
  async gamesOfLineUser(lineUserId: string): Promise<{ id: string; seat: Seat }[]> {
    return this.db.all<{ id: string; seat: Seat }>(
      `SELECT g.id AS id, p.seat AS seat FROM players p JOIN games g ON g.id = p.game_id
       WHERE p.line_user_id = ? ORDER BY g.updated_at DESC LIMIT 50`,
      lineUserId,
    );
  }

  /**
   * 終わった対局から、同じ 2 人で次の対局を作る（先手と後手は入れ替える）。合言葉と LINE の結びつきも引き継ぐ。
   * すでに作られていれば（相手が先に押していれば）それを返す
   */
  async startNext(id: string, gameType: string, state: unknown): Promise<string | null> {
    const game = await this.get(id);
    if (!game) return null;
    if (game.nextGameId) return game.nextGameId;
    const nextId = newToken(9);
    const t = now();
    // どの文も「まだ次の対局がない」ときだけ効く。同時に押されても片方の分しか作られない
    const notYet = "EXISTS (SELECT 1 FROM games WHERE id = ? AND next_game_id IS NULL)";
    await this.db.batch([
      q(
        `INSERT INTO games (id, game_type, state_json, version, invite_code, created_at, updated_at)
         SELECT ?, ?, ?, 0, NULL, ?, ? WHERE ${notYet}`,
        nextId,
        gameType,
        JSON.stringify(state),
        t,
        t,
        id,
      ),
      q(
        `INSERT INTO players (game_id, seat, name, token_hash, line_user_id, lang, time_zone)
         SELECT ?, 1 - seat, name, token_hash, line_user_id, lang, time_zone FROM players WHERE game_id = ? AND ${notYet}`,
        nextId,
        id,
        id,
      ),
      q(
        `INSERT INTO tokens (token_hash, game_id, seat) SELECT token_hash, ?, 1 - seat FROM tokens WHERE game_id = ? AND ${notYet}`,
        nextId,
        id,
        id,
      ),
      q("UPDATE games SET next_game_id = ?, updated_at = ? WHERE id = ? AND next_game_id IS NULL", nextId, t, id),
    ]);
    return (await this.get(id))?.nextGameId ?? null;
  }

  /** 招待コードで参加する。成功したら参加者のトークンを返す。lineUserId は LINE から参加したときだけ */
  async join(
    id: string,
    inviteCode: string,
    name: string,
    lineUserId: string | null = null,
    lang: string | null = null,
    timeZone: string | null = null,
  ): Promise<{ token: string; seat: Seat } | null> {
    const game = await this.get(id);
    if (!game || game.inviteCode === null || game.inviteCode !== inviteCode) return null;
    const taken = game.players[0]?.seat;
    const seat: Seat = taken === 0 ? 1 : 0;
    const token = newToken();
    const tokenHash = await hash(token);
    const stillOpen = "WHERE EXISTS (SELECT 1 FROM games WHERE id = ? AND invite_code = ?)";
    // 招待コードがまだ残っているときだけ参加者を足し、同時にコードを消す
    const [inserted] = await this.db.batch([
      q(
        `INSERT INTO players (game_id, seat, name, token_hash, line_user_id, lang, time_zone) SELECT ?, ?, ?, ?, ?, ?, ? ${stillOpen}`,
        id,
        seat,
        name,
        tokenHash,
        lineUserId,
        lang,
        timeZone,
        id,
        inviteCode,
      ),
      q(`INSERT INTO tokens (token_hash, game_id, seat) SELECT ?, ?, ? ${stillOpen}`, tokenHash, id, seat, id, inviteCode),
      q("UPDATE games SET invite_code = NULL, updated_at = ? WHERE id = ? AND invite_code = ?", now(), id, inviteCode),
    ]);
    return inserted ? { token, seat } : null;
  }

  /**
   * 手を記録して状態を更新する。expectedVersion が今の版と違えば（別の端末から先に
   * 指されていたら）何もせず false を返す。
   */
  async recordMove(id: string, expectedVersion: number, seat: Seat, move: unknown, nextState: unknown): Promise<boolean> {
    const t = now();
    // どちらの文も「版が expectedVersion のとき」だけ効くので、違えば両方とも何もしない
    const [inserted] = await this.db.batch([
      q(
        "INSERT INTO moves SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM games WHERE id = ? AND version = ?)",
        id,
        expectedVersion + 1,
        seat,
        JSON.stringify(move),
        t,
        id,
        expectedVersion,
      ),
      q(
        "UPDATE games SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
        JSON.stringify(nextState),
        t,
        id,
        expectedVersion,
      ),
    ]);
    return inserted === 1;
  }

  async moves(id: string): Promise<{ seq: number; seat: Seat; move: unknown; createdAt: string }[]> {
    const rows = await this.db.all<Record<string, any>>(
      "SELECT seq, seat, move_json, created_at FROM moves WHERE game_id = ? ORDER BY seq",
      id,
    );
    return rows.map((r) => ({ seq: r.seq, seat: r.seat, move: JSON.parse(r.move_json), createdAt: r.created_at }));
  }

  // ---------- 時刻になったら LINE で知らせる（push.ts） ----------

  /**
   * 対局の知らせの予定を plans に置きかえる。version は予定を決めたときの対局の版で、
   * 今の版と違えば（あとから別の手が指されていれば）古い予定で上書きしないよう何もしない
   */
  async setAlarms(id: string, version: number, plans: AlarmPlan[]): Promise<void> {
    const current = "EXISTS (SELECT 1 FROM games WHERE id = ? AND version = ?)";
    await this.db.batch([
      q(`DELETE FROM alarms WHERE game_id = ? AND ${current}`, id, id, version),
      ...plans.map((p) =>
        q(
          `INSERT INTO alarms (game_id, seat, at, kind, version) SELECT ?, ?, ?, ?, ? WHERE ${current}`,
          id,
          p.seat,
          p.at,
          p.kind,
          version,
          id,
          version,
        ),
      ),
    ]);
  }

  /** 対局の知らせの予定（席の順） */
  async alarms(id: string): Promise<AlarmPlan[]> {
    return this.db.all<AlarmPlan>("SELECT seat, at, kind FROM alarms WHERE game_id = ? ORDER BY seat", id);
  }

  /** 時刻（now）を過ぎた予定を、早い順に limit 件 */
  async dueAlarms(now: number, limit: number): Promise<DueAlarm[]> {
    return this.db.all<DueAlarm>(`${DUE_ALARMS} WHERE a.at <= ? ORDER BY a.at, a.game_id, a.seat LIMIT ?`, now, limit);
  }

  /** 対局の予定を、時刻を問わず全部（グループへ 2 人分をまとめて送るとき、相手の分も一緒に取るため） */
  async gameAlarms(id: string): Promise<DueAlarm[]> {
    return this.db.all<DueAlarm>(`${DUE_ALARMS} WHERE a.game_id = ? ORDER BY a.seat`, id);
  }

  /** 対局の 2 人と LINE ユーザー ID（席の順） */
  async linePlayers(id: string): Promise<LinePlayer[]> {
    return this.db.all<LinePlayer>(
      "SELECT seat, name, lang, time_zone AS timeZone, line_user_id AS lineUserId FROM players WHERE game_id = ? ORDER BY seat",
      id,
    );
  }

  /** 時刻を過ぎた予定の数 */
  async countDueAlarms(now: number): Promise<number> {
    const [row] = await this.db.all<{ n: number }>("SELECT COUNT(*) AS n FROM alarms WHERE at <= ?", now);
    return row?.n ?? 0;
  }

  /** 予定を at まで遅らせる。そのあいだに決め直されていたら何もしない */
  async deferAlarm(alarm: DueAlarm, at: number): Promise<boolean> {
    const [changed] = await this.db.batch([
      q(
        "UPDATE alarms SET at = ? WHERE game_id = ? AND seat = ? AND version = ? AND at = ?",
        at,
        alarm.gameId,
        alarm.seat,
        alarm.version,
        alarm.at,
      ),
    ]);
    return changed === 1;
  }

  /**
   * 送る前に予定を取る（消す）。取れたときだけ true。同時に動いたほかの処理が先に取っていたり、
   * あとから決め直されていたりすれば false なので、同じ予定を 2 回送らない
   */
  async takeAlarm(alarm: DueAlarm): Promise<boolean> {
    const [deleted] = await this.db.batch([
      q(
        "DELETE FROM alarms WHERE game_id = ? AND seat = ? AND version = ? AND at = ?",
        alarm.gameId,
        alarm.seat,
        alarm.version,
        alarm.at,
      ),
    ]);
    return deleted === 1;
  }

  async recordNotice(n: NoticeRecord): Promise<void> {
    await this.db.batch([
      q(
        "INSERT INTO notices (game_id, seat, line_user_id, kind, status, detail, sent_at, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        n.gameId,
        n.seat,
        n.lineUserId,
        n.kind,
        n.status,
        n.detail,
        n.sentAt,
        n.groupId ?? null,
      ),
    ]);
  }

  /** since（ISO の時刻）よりあとに、その LINE ユーザーへ送れた知らせの数。gameId を渡すとその対局の分だけ */
  async countSent(lineUserId: string, since: string, gameId?: string): Promise<number> {
    const [row] = await this.db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notices WHERE line_user_id = ? AND status = 'sent' AND sent_at > ?${gameId ? " AND game_id = ?" : ""}`,
      lineUserId,
      since,
      ...(gameId ? [gameId] : []),
    );
    return row?.n ?? 0;
  }

  /** 対局の知らせの記録（古い順） */
  async notices(id: string): Promise<NoticeRecord[]> {
    return this.db.all<NoticeRecord>(
      `SELECT game_id AS gameId, seat, line_user_id AS lineUserId, kind, status, detail, sent_at AS sentAt, group_id AS groupId
       FROM notices WHERE game_id = ? ORDER BY id`,
      id,
    );
  }

  // ---------- 公式アカウントを入れたグループ（webhook.ts） ----------

  /** 公式アカウントがグループに招待された（すでにあれば何もしない） */
  async addLineGroup(groupId: string, at: string): Promise<void> {
    await this.db.batch([q("INSERT OR IGNORE INTO line_groups (group_id, joined_at) VALUES (?, ?)", groupId, at)]);
  }

  /** 公式アカウントがグループから抜けた（メンバーの記録も消す） */
  async removeLineGroup(groupId: string): Promise<void> {
    await this.db.batch([
      q("DELETE FROM line_group_members WHERE group_id = ?", groupId),
      q("DELETE FROM line_groups WHERE group_id = ?", groupId),
    ]);
  }

  /**
   * グループで話した人をメンバーとして記録し、話した時刻（at）を新しくする。グループの記録がなければ一緒に作る
   * （Webhook を設定する前から公式アカウントがいたグループでも、話せば使えるように）。初めて記録した人なら true
   */
  async seeGroupMember(groupId: string, lineUserId: string, at: string): Promise<boolean> {
    const [, inserted] = await this.db.batch([
      q("INSERT OR IGNORE INTO line_groups (group_id, joined_at) VALUES (?, ?)", groupId, at),
      q("INSERT OR IGNORE INTO line_group_members (group_id, line_user_id, seen_at) VALUES (?, ?, ?)", groupId, lineUserId, at),
      q("UPDATE line_group_members SET seen_at = ? WHERE group_id = ? AND line_user_id = ?", at, groupId, lineUserId),
    ]);
    return inserted === 1;
  }

  /** メンバーがグループを抜けた */
  async removeGroupMember(groupId: string, lineUserId: string): Promise<void> {
    await this.db.batch([
      q("DELETE FROM line_group_members WHERE group_id = ? AND line_user_id = ?", groupId, lineUserId),
    ]);
  }

  /** グループの記録とメンバー（記録した順）。なければ null */
  async lineGroup(groupId: string): Promise<{ groupId: string; members: { lineUserId: string; seenAt: string }[] } | null> {
    const [group] = await this.db.all<{ groupId: string }>("SELECT group_id AS groupId FROM line_groups WHERE group_id = ?", groupId);
    if (!group) return null;
    const members = await this.db.all<{ lineUserId: string; seenAt: string }>(
      "SELECT line_user_id AS lineUserId, seen_at AS seenAt FROM line_group_members WHERE group_id = ? ORDER BY rowid",
      groupId,
    );
    return { groupId: group.groupId, members };
  }

  /**
   * 対局の 2 人が両方ともメンバーになっているグループ。いくつもあれば、いちばん最近だれかが話したもの。
   * なければ（どちらかが LINE とつながっていない・そろったグループがない）null
   */
  async noticeGroupOf(id: string): Promise<string | null> {
    const [row] = await this.db.all<{ groupId: string }>(
      `SELECT m0.group_id AS groupId
       FROM players p0
       JOIN players p1 ON p1.game_id = p0.game_id AND p1.seat <> p0.seat
       JOIN line_group_members m0 ON m0.line_user_id = p0.line_user_id
       JOIN line_group_members m1 ON m1.group_id = m0.group_id AND m1.line_user_id = p1.line_user_id
       JOIN line_groups g ON g.group_id = m0.group_id
       WHERE p0.game_id = ? AND p0.seat = 0 AND p0.line_user_id <> p1.line_user_id
       ORDER BY MAX(m0.seen_at, m1.seen_at) DESC, g.joined_at DESC LIMIT 1`,
      id,
    );
    return row?.groupId ?? null;
  }

  /** LINE ユーザーが対局でさいごに使った名前。どの対局にも出ていなければ null */
  async nameOfLineUser(lineUserId: string): Promise<string | null> {
    const [row] = await this.db.all<{ name: string }>(
      `SELECT p.name AS name FROM players p JOIN games g ON g.id = p.game_id
       WHERE p.line_user_id = ? ORDER BY g.updated_at DESC LIMIT 1`,
      lineUserId,
    );
    return row?.name ?? null;
  }
}

/** 予定と、受け取る人（dueAlarms・gameAlarms の共通部分） */
const DUE_ALARMS = `SELECT a.game_id AS gameId, g.game_type AS gameType, a.seat AS seat, a.at AS at, a.kind AS kind, a.version AS version,
       p.name AS name, p.lang AS lang, p.time_zone AS timeZone, p.line_user_id AS lineUserId
FROM alarms a JOIN games g ON g.id = a.game_id JOIN players p ON p.game_id = a.game_id AND p.seat = a.seat`;
