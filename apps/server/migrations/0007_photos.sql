-- 写真を使うゲーム（きょうのおだい写真）でアップロードした写真。画面で縮めて JPEG にしたもの（1 枚 512KB まで）を base64 の文字で持つ
-- （D1 の 1 行は 2MB まで。BLOB は D1 から数の配列で返ってきて重いので、文字にしておく）。対局を消すしくみはないので消さない。
-- 手に使われなかった写真がたまりすぎないよう、1 つの対局・1 人あたりの枚数に上限がある（src/photos.ts）
CREATE TABLE IF NOT EXISTS photos (
  -- 推測できない長い ID。GET /api/photos/:id の URL に使う
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  -- アップロードした人の席。手に載せた写真が、その席の人のものか確かめるのに使う
  seat INTEGER NOT NULL,
  -- image/jpeg か image/webp（中身の先頭のバイトで確かめたもの）
  mime TEXT NOT NULL,
  -- もとの大きさ（バイト）
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_game_seat ON photos (game_id, seat);
