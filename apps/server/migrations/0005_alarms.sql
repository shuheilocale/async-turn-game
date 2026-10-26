-- 時刻になったら LINE の公式アカウントで知らせる予定。対局ごとに次の 1 つだけを、受け取る席ごとに 1 行で持つ
-- （2 人とも受け取るなら 2 行。夜は人ごとに遅らせるので、席ごとに分けておく）。手を受け取るたびに決め直し、送ったら消す
CREATE TABLE IF NOT EXISTS alarms (
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  -- 知らせる時刻（ミリ秒）。夜にあたったら、受け取る人の朝 8 時に書き換える
  at INTEGER NOT NULL,
  -- 知らせの種類（もちの hungry・wake など、ゲームの nextAlarm が返すもの。手番の人が指していないときは stalled）
  kind TEXT NOT NULL,
  -- 予定を決めたときの対局の版。送る前にこの版のままか（あとから決め直されていないか）を条件にして取る
  version INTEGER NOT NULL,
  PRIMARY KEY (game_id, seat)
);
CREATE INDEX IF NOT EXISTS alarms_at ON alarms (at);

-- 知らせの記録（いつ・だれに・種類）。1 日に送る数の上限を数えるのにも使う
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  -- sent：送れた／failed：LINE に断られた（友だちでない など）／limited：上限を超えたので送らなかった
  status TEXT NOT NULL,
  -- failed のときの HTTP の状態コードや理由
  detail TEXT,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notices_user ON notices (line_user_id, sent_at);

-- プレイヤーのタイムゾーン（IANA 名。Asia/Tokyo など）。夜に知らせないために使う。分からなければ NULL（言語から推す）
ALTER TABLE players ADD COLUMN time_zone TEXT;
