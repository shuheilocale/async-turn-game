/**
 * 保存処理が使う SQL の実行口。手元では node:sqlite（sqlite.ts）、
 * 本番では Cloudflare D1（d1.ts）が同じ形で実装する。
 */
export interface Statement {
  sql: string;
  params: unknown[];
}

export interface Sql {
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** まとめて実行する。全部成功するか、全部取り消される。各文で変わった行数を返す */
  batch(statements: Statement[]): Promise<number[]>;
}

export const q = (sql: string, ...params: unknown[]): Statement => ({ sql, params });
