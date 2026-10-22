# 引き継ぎ資料（2026-10-22 時点）

別の PC・別のセッションで作業を再開するためのメモ。最初にこれと [README.md](../README.md)、[docs/企画書.md](企画書.md) を読むこと。

## 今の状態

- MVP は完成。ゲーム 5 本、日本語・英語・タイ語に対応。テスト 28 件・型チェックはすべて通る
- GitHub で管理を始めた: https://github.com/shuheilocale/async-turn-game （公開、`main`）
  - 最初のコミット `612a1f4`
  - `af596ec`: 「数字のせり」で、相手の手札を見ると今出したカードが分かってしまう不具合を修正
- **デプロイはまだしていない**

## 次にやること: Cloudflare Workers + D1 に移してデプロイする

ユーザーの条件は「費用は 0 円がいい」。デプロイ先の候補を比べて、**Cloudflare Workers（サーバ処理を動かす場所）+ D1（Cloudflare のデータベース。中身は SQLite）** を提案し、ユーザーの了承を得ている。

選んだ理由:

- サーバは Hono で書いており、Hono はもともと Workers で動く
- D1 の中身は SQLite なので、いまのテーブル定義をほぼそのまま使える
- 無料でも止まらず、最初の 1 手で起動待ちが起きない
- 無料の上限は 1 日 10 万リクエスト。2 人で 1 時間遊んで約 1,400 回なので十分
- 手番通知（Web プッシュ）は、あとで Workers の定期実行（Cron Triggers）で作れる

選ばなかった候補とその理由:

- Render・Koyeb の無料枠: 再起動のたびにディスクが消え、対局データが消える。Render は時間がたつと止まる
- Fly.io・Railway: 新しく登録する人向けの無料枠が実質ない
- Oracle Cloud の無料のサーバ: 登録の審査やサーバの管理に手間がかかる

※ 無料枠の条件は 2026 年半ばまでの知識に基づく。作業の前に最新の料金ページで確かめること。

### 作業の要点（コードを読んで分かったこと）

1. **保存処理 [apps/server/src/store.ts](../apps/server/src/store.ts)**
   - いまは `node:sqlite` の `DatabaseSync` を使い、呼び出しは待たずに結果が返る（同期）形。D1 は結果を待つ（非同期）形でしか呼べないので、メソッド（`create` / `get` / `seatOf` / `join` / `recordMove` / `moves`）を `async` にする
   - 呼び出す側の [apps/server/src/app.ts](../apps/server/src/app.ts) にも `await` を足す
   - `recordMove` は「盤面の版（version）が一致したときだけ書く」作りで、二重に指されるのを防いでいる。D1 でも同じ条件付きの `UPDATE ... WHERE version = ?` と、変更件数の確認で守ること
   - `node:crypto`（`createHash` / `randomBytes`）を使っている。Workers の `nodejs_compat` フラグを有効にするか、Web Crypto（`crypto.getRandomValues` / `crypto.subtle.digest`）に置き換える
   - `PRAGMA journal_mode = WAL` とコンストラクタ内の `CREATE TABLE` は、D1 ではマイグレーション（テーブルを作る SQL ファイル）に移す
2. **入口**
   - [apps/server/src/index.ts](../apps/server/src/index.ts) は Node.js 用（`@hono/node-server`）。Workers 用の入口（`export default { fetch }`）を別に作る
   - 画面（`apps/web/dist`）は Workers の静的ファイル配信（Static Assets）で配る。今は使えるはずだが、作業時に確認すること
   - 別の URL を開いても `index.html` を返す設定（SPA フォールバック）も必要
3. **テスト**: [apps/server/src/app.test.ts](../apps/server/src/app.test.ts) は `new GameStore(":memory:")` を使っている。保存処理が async になったら合わせて直す。手元での開発・テスト用に Node 版の保存処理を残すか、wrangler の手元実行（Miniflare）に寄せるかは作業時に決める（同じ形のインターフェースを 2 つ実装するのが無難）
4. **デプロイ**: `wrangler` を入れ、`wrangler.toml` に D1 の設定を書く
   - **途中でユーザーに `wrangler login`（ブラウザで Cloudflare にログイン）をお願いする必要がある**
   - D1 のデータベース作成、マイグレーションの適用、デプロイはユーザーに確認してから行う

### 移行が終わったら更新するもの

- [docs/企画書.md](企画書.md) の 9 章（公開のしかたと費用）、11 章（ロードマップ。今は「公開（Fly.io など）」となっている）、12 章の「公開先」。9 章には「Fly.io / Render は 0〜数百円」とあるが、上の比較のとおり今は実態と合わない
- [README.md](../README.md) の「使い方」「環境変数」「フォルダ構成」

## そのあとの候補（企画書 12 章の未決事項より）

- 手番の通知（Web プッシュ）。ロードマップで次の最優先
- 英語・タイ語の訳（AI 訳）をネイティブの人に確認してもらう
- サービス名（「ゆっくり対局」は仮）、次のゲーム、持ち時間の初期値

## 別の PC で始めるときの注意

- clone しただけでは git のユーザー設定が引き継がれない。この PC ではリポジトリ内だけ、名前を `shuheilocale`、メールを GitHub の匿名アドレス（noreply）にしていた。パソコン全体の設定は会社のメールなので、公開リポジトリに会社のアドレスが残らないよう、最初のコミットの前にリポジトリ内で設定し直す
  - `git config user.name shuheilocale`
  - `git config user.email <GitHub の noreply アドレス>`（`gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"'` で出せる）
- Node.js 22.13 以上が必要。`npm install` → `npm test` / `npm run typecheck` で状態を確かめてから始める
- `gh` は shuheilocale アカウントでログインしておく
- Claude Code のサンドボックス（Claude が変更できる範囲を制限するしくみ）の中では、`gh` がキーチェーンを読めず「token invalid」と出たり、`.git` への書き込みが拒否されたりした。その場合はサンドボックスの外で実行する

## ユーザーの好み・やり方

- 説明は平易な日本語で。専門用語は、初めて出すときに 1 行で言い換える（非エンジニアも読む）
- 費用はできるだけ 0 円
- 公開・課金・外部サービスへの登録など、取り消しにくい操作は先に確認する
- 作業が一区切りしたら、daily-journal スキルで日次ジャーナルに追記する

## 使うとよいスキル

- `superpowers:writing-plans`: 移行作業の計画を立てる（変更するファイルが多いので、先に計画を作る）
- `superpowers:test-driven-development` / `tdd`: 保存処理を async にする変更は、テストを先に直してから進める
- `superpowers:verification-before-completion`: 「デプロイできた」と報告する前に、実際の URL で 2 人分の対局を通しで確かめる
- `run`: アプリを起動して動作を確かめる（ブラウザでの確認には Playwright を使う）
- `daily-journal`: 作業が一区切りしたら追記する
- Cloudflare / Hono / wrangler の書き方は context7 で最新のドキュメントを引く
