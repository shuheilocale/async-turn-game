-- 公式アカウントを招待したグループ（Webhook の join で足し、leave で消す）。複数人トーク（room）も同じ表に入れる
CREATE TABLE IF NOT EXISTS line_groups (
  -- グループ ID（C から始まる）または複数人トークの ID（R から始まる）。push の送り先にそのまま使う
  group_id TEXT PRIMARY KEY,
  joined_at TEXT NOT NULL
);

-- グループのメンバー。グループの中で何か話した人を記録する（Webhook の message。memberJoined では記録しない）。
-- 対局の 2 人がそろってメンバーになっているグループがあれば、時刻になったときの知らせを 1 対 1 ではなくそこへ送る
CREATE TABLE IF NOT EXISTS line_group_members (
  group_id TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  -- さいごにそのグループで話した時刻。送り先のグループが複数あれば、いちばん最近使われたものを選ぶ
  seen_at TEXT NOT NULL,
  PRIMARY KEY (group_id, line_user_id)
);
CREATE INDEX IF NOT EXISTS line_group_members_user ON line_group_members (line_user_id);

-- グループへ送った知らせは、そのグループの ID（1 対 1 なら NULL）。グループへの 1 通は 2 人それぞれに 1 行ずつ記録し、上限も 1 ずつ数える
ALTER TABLE notices ADD COLUMN group_id TEXT;
