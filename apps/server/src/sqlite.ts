import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Sql } from "./sql.ts";

type Params = Parameters<StatementSync["run"]>;

const defaultMigrations = fileURLToPath(new URL("../migrations", import.meta.url));

/** migrations/ の SQL のうち未適用のものを流す。記録の表は wrangler（D1）と同じ名前にしておく */
function migrate(db: DatabaseSync, dir: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const done = new Set(db.prepare("SELECT name FROM d1_migrations").all().map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(`${dir}/${file}`, "utf8"));
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/** 手元での開発・テスト用。Node.js 組み込みの SQLite を使う */
export function sqliteDb(path: string, migrationsDir = defaultMigrations): Sql {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  migrate(db, migrationsDir);
  return {
    async all<T>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...(params as Params)) as T[];
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const changes = statements.map((s) => Number(db.prepare(s.sql).run(...(s.params as Params)).changes));
        db.exec("COMMIT");
        return changes;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
