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
