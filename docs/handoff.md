# 引き継ぎ資料（2026-10-22 時点）

別の PC・別のセッションで作業を再開するためのメモ。最初にこれと [README.md](../README.md)、[docs/企画書.md](企画書.md) を読むこと。

## 今の状態（2026-10-22 更新）

- MVP は完成。ゲーム 5 本、日本語・英語・タイ語に対応。テスト 31 件・型チェックはすべて通る
- GitHub: https://github.com/shuheilocale/async-turn-game （公開、`main`）
- **Cloudflare Workers + D1 で公開済み**: https://async-turn-game.shuhei-yamamoto-fukuoka-japan.workers.dev
  - D1 のデータベース名は `async-turn-game`（置き場所はアジア太平洋）。設定は [apps/server/wrangler.jsonc](../apps/server/wrangler.jsonc)
  - 公開後、本番の URL で 2 人分のマルバツを最後まで指して確かめた
  - 公開のしかたは [README.md](../README.md) の「公開（Cloudflare）」

### Cloudflare 移行で決めたこと

- 保存処理 [store.ts](../apps/server/src/store.ts) は 1 つにまとめ、SQL の実行口（[sql.ts](../apps/server/src/sql.ts)）だけを差し替える。手元とテストは [sqlite.ts](../apps/server/src/sqlite.ts)、本番は [d1.ts](../apps/server/src/d1.ts)
- D1 では BEGIN/COMMIT が使えないので、書き込みは `batch`（全部成功か全部取り消し）で行い、「版が一致したら」「招待コードが残っていたら」という条件は SQL の中に書く
- CLI は wrangler を使った。Cloudflare 公式の新しい CLI `cf` は 2026 年 9 月末に公開ベータになったが、D1 のマイグレーションや SPA の設定の手順がまだそろっていないため見送った。安定版が出たら `cf migrate` で移す
- Cloudflare へのログインは PC ごとに必要（`cd apps/server && npx wrangler login`）

## 次にやること（企画書 12 章の未決事項より）

- 手番の通知（Web プッシュ）。ロードマップで次の最優先。Workers の定期実行（Cron Triggers）が使える
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

- `superpowers:test-driven-development` / `tdd`: 保存処理を async にする変更は、テストを先に直してから進める
- `superpowers:verification-before-completion`: 「デプロイできた」と報告する前に、実際の URL で 2 人分の対局を通しで確かめる
- `run`: アプリを起動して動作を確かめる（ブラウザでの確認には Playwright を使う）
- `daily-journal`: 作業が一区切りしたら追記する
- Cloudflare / Hono / wrangler の書き方は context7 で最新のドキュメントを引く
