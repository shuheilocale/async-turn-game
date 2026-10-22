import type { Seat } from "@atg/core";
import { q, type Sql } from "./sql.ts";

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

  /** 対局を作り、作成者のトークンを返す */
  async create(gameType: string, state: unknown, creator: PlayerRecord): Promise<{ id: string; token: string; inviteCode: string }> {
    const id = newToken(9);
    const token = newToken();
    const inviteCode = newToken(9);
    const t = now();
    await this.db.batch([
      q("INSERT INTO games VALUES (?, ?, ?, 0, ?, ?, ?)", id, gameType, JSON.stringify(state), inviteCode, t, t),
      q("INSERT INTO players VALUES (?, ?, ?, ?)", id, creator.seat, creator.name, await hash(token)),
    ]);
    return { id, token, inviteCode };
  }

  async get(id: string): Promise<GameRecord | null> {
    const [row] = await this.db.all<Record<string, any>>("SELECT * FROM games WHERE id = ?", id);
    if (!row) return null;
    const players = await this.db.all<PlayerRecord>("SELECT seat, name FROM players WHERE game_id = ? ORDER BY seat", id);
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
  async seatOf(id: string, token: string | undefined): Promise<Seat | null> {
    if (!token) return null;
    const [row] = await this.db.all<{ seat: Seat }>(
      "SELECT seat FROM players WHERE game_id = ? AND token_hash = ?",
      id,
      await hash(token),
    );
    return row ? row.seat : null;
  }

  /** 招待コードで参加する。成功したら参加者のトークンを返す */
  async join(id: string, inviteCode: string, name: string): Promise<{ token: string; seat: Seat } | null> {
    const game = await this.get(id);
    if (!game || game.inviteCode === null || game.inviteCode !== inviteCode) return null;
    const taken = game.players[0]?.seat;
    const seat: Seat = taken === 0 ? 1 : 0;
    const token = newToken();
    // 招待コードがまだ残っているときだけ参加者を足し、同時にコードを消す
    const [inserted] = await this.db.batch([
      q(
        "INSERT INTO players SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM games WHERE id = ? AND invite_code = ?)",
        id,
        seat,
        name,
        await hash(token),
        id,
        inviteCode,
      ),
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
