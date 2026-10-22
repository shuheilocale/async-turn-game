import type { Sql } from "./sql.ts";

// Cloudflare の型パッケージを丸ごと入れずに済むよう、使う分だけ書いておく
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<{ meta: { changes: number } }[]>;
}

/** 本番用。Cloudflare D1 を使う。batch は 1 つのトランザクションとして実行される */
export function d1Db(db: D1Database): Sql {
  return {
    async all<T>(sql: string, ...params: unknown[]) {
      return (await db.prepare(sql).bind(...params).all<T>()).results;
    },
    async batch(statements) {
      const results = await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.params)));
      return results.map((r) => r.meta.changes);
    },
  };
}
