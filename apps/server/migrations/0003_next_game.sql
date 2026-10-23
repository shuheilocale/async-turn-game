-- 終わった対局から作った次の対局（もう一局・ほかのゲーム）
ALTER TABLE games ADD COLUMN next_game_id TEXT;

-- 次の対局でも同じ合言葉で指せるよう、合言葉の一意性を「対局ごと」にする
CREATE TABLE tokens_new (
  token_hash TEXT NOT NULL,
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  PRIMARY KEY (game_id, token_hash)
);
INSERT INTO tokens_new (token_hash, game_id, seat) SELECT token_hash, game_id, seat FROM tokens;
DROP TABLE tokens;
ALTER TABLE tokens_new RENAME TO tokens;
