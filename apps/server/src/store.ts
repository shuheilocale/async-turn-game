import type { Seat } from "@atg/core";
import { q, type Sql } from "./sql.ts";

export interface PlayerRecord {
  seat: Seat;
  name: string;
  /** 画面で使っている言語（ja / en / th）。分からなければ null */
  lang?: string | null;
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
        "INSERT INTO players (game_id, seat, name, token_hash, line_user_id, lang) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        creator.seat,
        creator.name,
        tokenHash,
        lineUserId,
        creator.lang ?? null,
      ),
      q("INSERT INTO tokens (token_hash, game_id, seat) VALUES (?, ?, ?)", tokenHash, id, creator.seat),
    ]);
    return { id, token, inviteCode };
  }

  async get(id: string): Promise<GameRecord | null> {
    const [row] = await this.db.all<Record<string, any>>("SELECT * FROM games WHERE id = ?", id);
    if (!row) return null;
    const players = await this.db.all<PlayerRecord>(
      "SELECT seat, name, lang FROM players WHERE game_id = ? ORDER BY seat",
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
        `INSERT INTO players (game_id, seat, name, token_hash, line_user_id, lang)
         SELECT ?, 1 - seat, name, token_hash, line_user_id, lang FROM players WHERE game_id = ? AND ${notYet}`,
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
        `INSERT INTO players (game_id, seat, name, token_hash, line_user_id, lang) SELECT ?, ?, ?, ?, ?, ? ${stillOpen}`,
        id,
        seat,
        name,
        tokenHash,
        lineUserId,
        lang,
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
}
