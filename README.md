# async-turn-game

離れた 2 人が、時間をそろえずに一手ずつ遊べる Web のターン制ボードゲーム集。
スマホでも PC でもブラウザだけで遊べる。画面は日本語・英語・タイ語に対応。

| ゲーム | ID | 種類 |
| --- | --- | --- |
| マルバツ | `tictactoe` | 盤面が全部見えるゲーム |
| かぶせマルバツ | `gobble` | 盤面が全部見えるゲーム |
| ニム | `nim` | 盤面が全部見えるゲーム |
| 四目並べ | `connect4` | 盤面が全部見えるゲーム |
| オセロ | `othello` | 盤面が全部見えるゲーム |
| ヒット＆ブロー | `hitblow` | 相手に隠す情報があるゲーム |
| 数字のせり | `auction` | 相手に隠す情報があるゲーム |

公開中: https://async-turn-game.shuhei-yamamoto-fukuoka-japan.workers.dev （Cloudflare Workers + D1）

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

# 本番相当を Node.js で（画面をビルドして、サーバ 1 つで配る）
npm run build
npm start            # → http://localhost:8787

# 本番と同じ Workers + D1 を手元で動かす（データは apps/server/.wrangler/ に入る）
npm run build
npx -w @atg/server wrangler d1 migrations apply async-turn-game --local
npm run dev:worker -w @atg/server   # → http://localhost:8787
```

### 公開（Cloudflare）

最初に一度だけ `cd apps/server && npx wrangler login` で Cloudflare にログインする。

```bash
npm run db:migrate   # 本番の D1 にテーブルの変更を反映する（migrations/ に SQL を足したとき）
npm run deploy       # 画面をビルドして Workers に公開する
```

- 設定は [apps/server/wrangler.jsonc](apps/server/wrangler.jsonc)。`/api/*` だけを Worker が受け、それ以外は画面のファイル（見つからなければ `index.html`）を返す
- テーブルを変えるときは、`apps/server/migrations/` に `0002_〜.sql` のように番号順で SQL を足す。手元の SQLite も起動時に同じファイルを流す
- 公開後のログは `npx -w @atg/server wrangler tail` で見られる

環境変数

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `8787` | サーバのポート |
| `DB_PATH` | `data/games.db` | 対局データを保存する SQLite ファイル |

これらは Node.js で動かすときだけ使う。Workers では D1 を `wrangler.jsonc` の `DB` という名前でつなぐ。

## フォルダ構成

```
packages/core/      ゲームのルール（純粋関数）と、サーバ⇔画面でやりとりする型
  src/games/        ゲームごとのルール（1 ゲーム 1 ファイル）とテスト
apps/server/        API サーバ（Hono。本番は Cloudflare Workers + D1、手元は Node.js + SQLite）
  migrations/       テーブルを作る・変える SQL（D1 と手元の SQLite で共通）
  src/app.ts        API の定義
  src/store.ts      保存処理。SQL の実行口（sql.ts）だけを差し替えて使う
  src/sqlite.ts     実行口：Node.js 組み込みの SQLite（開発・テスト用）
  src/d1.ts         実行口：Cloudflare D1（本番）
  src/index.ts      Node.js 用の入口
  src/worker.ts     Cloudflare Workers 用の入口
  wrangler.jsonc    Cloudflare の設定
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
2. `apps/web/src/boards/<名前>Board.tsx` に盤の見た目を作り、`apps/web/src/boards/index.ts` の `boards` に登録する（長さの目安もここ）。アイコンは `apps/web/src/icons.tsx` の `glyphs` に SVG で描く
3. `apps/web/src/i18n/ja.ts` に `game.<ID>.name / desc / rules / seat0 / seat1` などを足し、`en.ts` と `th.ts` にも同じキーを足す（足りないと型チェックで止まる）
4. ルールのテストを `*.test.ts` に書く

サーバ側の変更は不要。
