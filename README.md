# async-turn-game

離れた 2 人が、時間をそろえずに一手ずつ遊べる Web のターン制ボードゲーム集。
スマホでも PC でもブラウザだけで遊べる。画面は日本語・英語・タイ語に対応。

| ゲーム | ID | 種類 |
| --- | --- | --- |
| マルバツ | `tictactoe` | 盤面が全部見えるゲーム |
| かぶせマルバツ | `gobble` | 盤面が全部見えるゲーム |
| ニム | `nim` | 盤面が全部見えるゲーム |
| きえるマルバツ | `fading` | 盤面が全部見えるゲーム |
| タテヨコ置き | `tateyoko` | 盤面が全部見えるゲーム |
| つなぎ橋 | `bridge` | 盤面が全部見えるゲーム |
| ころころ | `korokoro` | 盤面が全部見えるゲーム |
| いしつみ | `stack` | 盤面が全部見えるゲーム（物理演算） |
| 線とり陣取り | `boxes` | 盤面が全部見えるゲーム |
| 四目並べ | `connect4` | 盤面が全部見えるゲーム |
| オセロ | `othello` | 盤面が全部見えるゲーム |
| ヒット＆ブロー | `hitblow` | 相手に隠す情報があるゲーム |
| 数字のせり | `auction` | 相手に隠す情報があるゲーム |
| はったり三枚 | `bluff` | 相手に隠す情報があるゲーム |
| みずそそぎ | `pour` | 相手に隠す情報があるゲーム（長押しで注ぐ。あふれる量が隠れている） |
| みずそそぎ・ハード | `pourhard` | 相手に隠す情報があるゲーム（みずそそぎの上級版。150 ml から目隠しで、水位と注いだ量が 2 人とも見えない） |
| ふうせん | `balloon` | 相手に隠す情報があるゲーム（タップでふくらませる。割れる回数が隠れている） |
| ぴったりストップ | `stopwatch` | 相手に隠す情報があるゲーム（目隠しで秒数ぴったりに止める。出題した人の記録が隠れている） |
| ひとふでチャレンジ | `freehand` | 相手に隠す情報があるゲーム（指で一筆で描き、形のきれいさを点数で比べる。相手が描くまで絵と点数が隠れている） |
| そっと出し | `sotto` | 協力ゲーム（相手の手札は見えない） |
| 宝と岩 | `treasure` | 協力ゲーム（宝と岩は片方にしか見えない） |

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

## LINE ミニアプリとして使う

LINE Developers に「LINE ミニアプリ」のチャネルを作ってある（未認証のまま公開）。LINE の中で開くと次の機能が使える。LINE の外ではこれまでどおり。

| 機能 | しくみ |
| --- | --- |
| LINE アカウントで本人確認 | 画面が `liff.getIDToken()` の ID トークンを送り、サーバが LINE に問い合わせて確かめる（[apps/server/src/line.ts](apps/server/src/line.ts)）。席と LINE ユーザー ID を結びつけ、別の端末でも合言葉を発行し直せる（`POST /api/games/:id/claim`、`POST /api/me/games`） |
| 招待を LINE で送る | `liff.shareTargetPicker()` で送り先を選んで招待カードを送る |
| 指したら相手に知らせる | トークのカードから開いた対局なら、`liff.sendMessages()` でそのトークに「〇〇さんが指しました」を自動で送る。送れないときは「LINE で知らせる」ボタンを出す |

- 画面側の LINE の処理は [apps/web/src/line.ts](apps/web/src/line.ts) と [apps/web/src/notify.ts](apps/web/src/notify.ts)。LIFF SDK は LINE の中で開いたときだけ読み込む
- LIFF ID は既定で本番用（Published）。変えるときはビルド時に `VITE_LIFF_ID` を指定する
- 受け付ける LINE のチャネル ID は [wrangler.jsonc](apps/server/wrangler.jsonc) の `LINE_CHANNEL_IDS`（手元の Node.js では同名の環境変数。なければ LINE の確認は使わない）
- トークに送るカードの URL は `https://miniapp.line.me/<LIFF ID>/g/<対局ID>` の形
- プライバシーポリシーは `/privacy`（チャネルの設定に載せる）

## ゲームを追加するには

新しく作るファイルはゲームごとに分かれていて、共有ファイルへの追記は登録の 2 行だけ。

1. `packages/core/src/games/<ID>.ts` に `GameDefinition` を実装し、`<ID>.test.ts` にルールのテストを書く。`packages/core/src/index.ts` の `games` に登録する
   - 相手に隠す情報があるなら `viewState` と `viewMove` も実装する（`hitblow.ts` / `auction.ts` が例）
   - 同じ人が続けて指す（手番が移らない）手は LINE で知らせない
2. `apps/web/src/boards/<名前>Board.tsx` に盤の見た目を作り、`apps/web/src/boards/index.ts` の `boards` に登録する（長さの目安もここ）。盤だけで使う CSS は同じフォルダの `<名前>Board.css` に書いて、盤から読み込む
3. 文言は `apps/web/src/i18n/games/<ID>.ts` に日本語・英語・タイ語をまとめて書く（`game.<ID>.name / desc / rules / seat0 / seat1` など。エラーなら `error.<コード>`）。置くだけで読み込まれる
4. アイコンは `apps/web/src/glyphs/<ID>.tsx` に SVG で描く（viewBox は 0 0 64 64。色は `icons.tsx` の `g-*` クラス）。置くだけで読み込まれる

サーバ側の変更は不要。
