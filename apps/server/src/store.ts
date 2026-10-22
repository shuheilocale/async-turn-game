import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { Seat } from "@atg/core";

export interface PlayerRecord {
  seat: Seat;
  name: string;
}

export interface GameRecord {
  id: string;
  gameType: string;
  state: unknown;
  version: number;
  /** 2 人目が参加すると null になる */
  inviteCode: string | null;
  players: PlayerRecord[];
  createdAt: string;
  updatedAt: string;
}

export const newToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const now = () => new Date().toISOString();

/**
 * 対局データの保存先。SQLite を使うが、ほかの保存先（Cloudflare D1 など）に
 * 乗り換えるときはこのクラスと同じメソッドを持つものを用意すればよい。
 */
export class GameStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        game_type TEXT NOT NULL,
        state_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        invite_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS players (
        game_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        PRIMARY KEY (game_id, seat)
      );
      CREATE TABLE IF NOT EXISTS moves (
        game_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        seat INTEGER NOT NULL,
        move_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (game_id, seq)
      );
    `);
  }

  /** 対局を作り、作成者のトークンを返す */
  create(gameType: string, state: unknown, creator: PlayerRecord): { id: string; token: string; inviteCode: string } {
    const id = newToken(9);
    const token = newToken();
    const inviteCode = newToken(9);
    const t = now();
    this.db
      .prepare("INSERT INTO games VALUES (?, ?, ?, 0, ?, ?, ?)")
      .run(id, gameType, JSON.stringify(state), inviteCode, t, t);
    this.db.prepare("INSERT INTO players VALUES (?, ?, ?, ?)").run(id, creator.seat, creator.name, hash(token));
    return { id, token, inviteCode };
  }

  get(id: string): GameRecord | null {
    const row = this.db.prepare("SELECT * FROM games WHERE id = ?").get(id) as Record<string, any> | undefined;
    if (!row) return null;
    const players = this.db
      .prepare("SELECT seat, name FROM players WHERE game_id = ? ORDER BY seat")
      .all(id) as unknown as PlayerRecord[];
    return {
      id: row.id,
      gameType: row.game_type,
      state: JSON.parse(row.state_json),
      version: row.version,
      inviteCode: row.invite_code,
      players,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** トークンからその対局での席を調べる。該当しなければ null */
  seatOf(id: string, token: string | undefined): Seat | null {
    if (!token) return null;
    const row = this.db
      .prepare("SELECT seat FROM players WHERE game_id = ? AND token_hash = ?")
      .get(id, hash(token)) as { seat: Seat } | undefined;
    return row ? row.seat : null;
  }

  /** 招待コードで参加する。成功したら参加者のトークンを返す */
  join(id: string, inviteCode: string, name: string): { token: string; seat: Seat } | null {
    const game = this.get(id);
    if (!game || game.inviteCode === null || game.inviteCode !== inviteCode) return null;
    const taken = game.players[0]?.seat;
    const seat: Seat = taken === 0 ? 1 : 0;
    const token = newToken();
    this.db.exec("BEGIN");
    try {
      const res = this.db
        .prepare("UPDATE games SET invite_code = NULL, updated_at = ? WHERE id = ? AND invite_code = ?")
        .run(now(), id, inviteCode);
      if (res.changes === 0) {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.db.prepare("INSERT INTO players VALUES (?, ?, ?, ?)").run(id, seat, name, hash(token));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { token, seat };
  }

  /**
   * 手を記録して状態を更新する。expectedVersion が今の版と違えば（別の端末から先に
   * 指されていたら）何もせず false を返す。
   */
  recordMove(id: string, expectedVersion: number, seat: Seat, move: unknown, nextState: unknown): boolean {
    const t = now();
    this.db.exec("BEGIN");
    try {
      const res = this.db
        .prepare("UPDATE games SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
        .run(JSON.stringify(nextState), t, id, expectedVersion);
      if (res.changes === 0) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db
        .prepare("INSERT INTO moves VALUES (?, ?, ?, ?, ?)")
        .run(id, expectedVersion + 1, seat, JSON.stringify(move), t);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  moves(id: string): { seq: number; seat: Seat; move: unknown; createdAt: string }[] {
    const rows = this.db
      .prepare("SELECT seq, seat, move_json, created_at FROM moves WHERE game_id = ? ORDER BY seq")
      .all(id) as Record<string, any>[];
    return rows.map((r) => ({ seq: r.seq, seat: r.seat, move: JSON.parse(r.move_json), createdAt: r.created_at }));
  }
}
