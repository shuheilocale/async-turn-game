-- 1 人が複数の端末から指せるよう、合言葉（のハッシュ）を席ごとに何個でも持てるようにする
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL
);
INSERT OR IGNORE INTO tokens (token_hash, game_id, seat) SELECT token_hash, game_id, seat FROM players;

-- LINE から作成・参加した人の LINE ユーザー ID。LINE の外から参加した人は NULL
ALTER TABLE players ADD COLUMN line_user_id TEXT;
CREATE INDEX IF NOT EXISTS players_line_user ON players (line_user_id);
