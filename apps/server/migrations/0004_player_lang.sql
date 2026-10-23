-- プレイヤーが画面で使っている言語（ja / en / th）。LINE のカードを受け取る人の言語で作るのに使う
ALTER TABLE players ADD COLUMN lang TEXT;
