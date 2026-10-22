# ゆっくり対局（async-turn-game）

離れた 2 人が、時間をそろえずに一手ずつ遊べる Web のターン制ボードゲーム集。
スマホでも PC でもブラウザだけで遊べる。画面は日本語・英語・タイ語に対応。

| ゲーム | ID | 種類 |
| --- | --- | --- |
| マルバツ | `tictactoe` | 盤面が全部見えるゲーム |
| 四目並べ | `connect4` | 盤面が全部見えるゲーム |
| オセロ | `othello` | 盤面が全部見えるゲーム |
| ヒット＆ブロー | `hitblow` | 相手に隠す情報があるゲーム |
| 数字のせり | `auction` | 相手に隠す情報があるゲーム |

企画の内容は [docs/企画書.md](docs/企画書.md) を参照。

## 必要なもの

- Node.js 22.13 以上（組み込みの SQLite を使うため）

## 使い方

```bash
npm install

# 開発（サーバ :8787 と画面 :5173 を同時に起動）
npm run dev
# → http://localhost:5173 を開く。同じ Wi-Fi のスマホからは http://<PCのIP>:5173

# テスト・型チェック
npm test
npm run typecheck

# 本番相当（画面をビルドして、サーバ 1 つで配る）
npm run build
npm start            # → http://localhost:8787
```

環境変数

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `8787` | サーバのポート |
| `DB_PATH` | `data/games.db` | 対局データを保存する SQLite ファイル |

## フォルダ構成

```
packages/core/      ゲームのルール（純粋関数）と、サーバ⇔画面でやりとりする型
  src/games/        ゲームごとのルール（1 ゲーム 1 ファイル）とテスト
apps/server/        API サーバ（Hono + SQLite）
  src/store.ts      保存処理（別のデータベースに移すときはここを差し替える）
  src/app.ts        API の定義
apps/web/           画面（React + Vite）
  src/boards/       ゲームごとの盤の見た目
  src/i18n/         画面の文言（ja.ts が基準、en.ts / th.ts は同じキーを持つ）
  src/pages/        トップ / 参加 / 対局 の 3 画面
docs/企画書.md
```

## しくみ

- アカウントはない。対局を作る・参加すると **トークン**（その対局での本人確認用の合言葉）が発行され、ブラウザに保存される
- 指すときは「今の盤面の版（version）」を一緒に送る。別端末で先に指されていたら 409 を返し、二重に指されるのを防ぐ
- 相手の手は 5 秒ごとにサーバへ確認しに行って反映する（画面が見えているときだけ）
- **隠す情報があるゲーム**は、ルールに `viewState`（見る人ごとに状態を加工する関数）を持たせる。サーバは必ずこれを通してから返すので、相手の秘密の数字や手札はブラウザにも届かない。終局後は全部公開する
- サーバのエラーは `not_your_turn` のような**コード**で返し、画面側で各言語の文に置き換える

### API

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/games` | 対局を作る `{ gameType, name, seat: 0 \| 1 \| "random" }` |
| GET | `/api/games/:id` | 盤面を見る（`Authorization: Bearer <token>` を付けると自分の席が分かる） |
| POST | `/api/games/:id/join` | 招待コードで参加 `{ inviteCode, name }` |
| POST | `/api/games/:id/moves` | 手を指す `{ version, move }` |
| GET | `/api/games/:id/moves` | 手の記録 |

## ゲームを追加するには

1. `packages/core/src/games/<名前>.ts` に `GameDefinition` を実装し、`packages/core/src/index.ts` の `games` に登録する
   - 相手に隠す情報があるなら `viewState` と `viewMove` も実装する（`hitblow.ts` / `auction.ts` が例）
2. `apps/web/src/boards/<名前>Board.tsx` に盤の見た目を作り、`apps/web/src/boards/index.ts` の `boards` に登録する（長さの目安・アイコンもここ）
3. `apps/web/src/i18n/ja.ts` に `game.<ID>.name / desc / rules / seat0 / seat1` などを足し、`en.ts` と `th.ts` にも同じキーを足す（足りないと型チェックで止まる）
4. ルールのテストを `*.test.ts` に書く

サーバ側の変更は不要。
