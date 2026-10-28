# async-turn-game

離れた 2 人が、時間をそろえずに一手ずつ遊べる Web のターン制ボードゲーム集。
スマホでも PC でもブラウザだけで遊べる。画面は日本語・英語・タイ語に対応。

| ゲーム | ID | 種類 |
| --- | --- | --- |
| マルバツ | `tictactoe` | 盤面が全部見えるゲーム |
| かぶせマルバツ | `gobble` | 盤面が全部見えるゲーム |
| ニム | `nim` | 盤面が全部見えるゲーム |
| まねっこチェーン | `chain` | 盤面が全部見えるゲーム（光った並びを順にタップでまねして 1 つ足す。まちがえたら負け） |
| きえるマルバツ | `fading` | 盤面が全部見えるゲーム |
| タテヨコ置き | `tateyoko` | 盤面が全部見えるゲーム |
| つなぎ橋 | `bridge` | 盤面が全部見えるゲーム |
| ころころ | `korokoro` | 盤面が全部見えるゲーム |
| いしつみ | `stack` | 盤面が全部見えるゲーム（物理演算） |
| 3D カーリング | `curling` | 盤面が全部見えるゲーム（物理演算。Three.js の 3D で描き、WebGL がなければ上から見た 2D） |
| たまうちバトル | `artillery` | 盤面が全部見えるゲーム（地形の上の大砲で撃ち合う。Phaser で描く） |
| 線とり陣取り | `boxes` | 盤面が全部見えるゲーム |
| 四目並べ | `connect4` | 盤面が全部見えるゲーム |
| しずむタピオカ・うかぶ氷 | `tapioca` | 盤面が全部見えるゲーム（タピオカは沈み、氷は浮く四目並べ） |
| オセロ | `othello` | 盤面が全部見えるゲーム |
| ヒット＆ブロー | `hitblow` | 相手に隠す情報があるゲーム |
| 数字のせり | `auction` | 相手に隠す情報があるゲーム |
| はったり三枚 | `bluff` | 相手に隠す情報があるゲーム |
| バックボーン・ファイト | `fight` | 相手に隠す情報があるゲーム（格闘技 14 種と異種格闘技 17 種からバックボーンを選んでパラメータを振り分け、毎回こっそり技を選んで同時に出す。打撃・組み・守りの 3 すくみに、回復と強化・弱体。先に決めた人のキャラと、先に選んだ人の技が隠れている） |
| わなの扉 | `doors` | 相手に隠す情報があるゲーム（1・2・3 点の扉の 1 つにわなを仕掛け、相手がくぐる扉を読み合う。仕掛けた扉はくぐるまで隠れている） |
| めくりあわせ | `memory` | 相手に隠す情報があるゲーム（神経衰弱。伏せた札の絵が 2 人とも見えない） |
| ツボさがし | `tsubo` | 相手に隠す情報があるゲーム（タイ古式マッサージ。背中のこりの場所を、押した所の近さを手がかりに探す） |
| ブランド爆買いオークション | `shopping` | 相手に隠す情報があるゲーム（1000 万円でハイブランド品などをこっそり入札。出品の順番と相手の入札額が隠れている） |
| みずそそぎ | `pour` | 相手に隠す情報があるゲーム（長押しで注ぐ。あふれる量が隠れている） |
| みずそそぎ・ハード | `pourhard` | 相手に隠す情報があるゲーム（みずそそぎの上級版。150 ml から目隠しで、水位と注いだ量が 2 人とも見えない） |
| ふうせん | `balloon` | 相手に隠す情報があるゲーム（タップでふくらませる。割れる回数が隠れている） |
| ぴったりストップ | `stopwatch` | 相手に隠す情報があるゲーム（目隠しで秒数ぴったりに止める。出題した人の記録が隠れている） |
| はやうち | `quickdraw` | 相手に隠す情報があるゲーム（合図が出たら早押し。先に挑戦した人の記録と、合図までの待ち時間が隠れている） |
| ふりふりソーダ | `soda` | 相手に隠す情報があるゲーム（端末を振って圧力を上げる。吹き出す限界が隠れている。センサーが使えなければ画面をこする） |
| かたむけコロコロ | `tilt` | 相手に隠す情報があるゲーム（端末を傾けて迷路の玉を転がし、タイムを比べる。先に挑戦した人のタイムが隠れている。センサーが使えなければ画面のスティック） |
| ひとふでチャレンジ | `freehand` | 相手に隠す情報があるゲーム（指で一筆で描き、形のきれいさを点数で比べる。相手が描くまで絵と点数が隠れている） |
| そっと出し | `sotto` | 協力ゲーム（相手の手札は見えない） |
| 宝と岩 | `treasure` | 協力ゲーム（宝と岩は片方にしか見えない） |
| おえかきクイズ | `oekaki` | 協力ゲーム（描いた絵を見て、お題を 4 つから当てる。お題は描く人にしか見えない） |
| はんぶんこハート | `heart` | 協力ゲーム（2 人で半分ずつ描いて 1 つのハートにする。先に描いた半分は、もう 1 人が描き終えるまで隠れている） |
| ふたりの以心伝心 | `ishin` | 協力ゲーム（6 問の質問に、自分の答えと相手の答えの予想を出し合う。先に出した答えは相手が出すまで隠れている） |
| ふたりのもち | `mochi` | 協力ゲーム（交代でお世話して、卵からかえる「もち」を育てる放置ゲーム。お世話のあいだも本物の時計で育ち、5〜7 日ほどでおとなになる） |
| きょうのおだい写真 | `photo` | 協力ゲーム（同じお題で写真を 1 枚ずつ出し合う。相手の写真は 2 人とも出すまで隠れている。7 つのお題で 1 冊のアルバム） |
| ふたりのボス戦 | `raid` | 協力ゲーム（バックボーン・ファイトのキャラで 2 人が組み、日常のボス 3 体に順に挑む。ボスは次の行動を先に見せ、2 人が伏せて行動を選ぶ。先に選んだ人の行動は、もう 1 人が選ぶまで隠れている） |

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
| `ALARM_INTERVAL_MS` | 開発 `60000`・本番 `900000` | 知らせの予定を処理する間隔（`0` で止める）。Workers の Cron Trigger の代わり |
| `LINE_MESSAGING_TOKEN` / `LINE_MESSAGING_SECRET` / `LINE_OA_ID` / `LIFF_ID` / `APP_ORIGIN` | なし | 「LINE で時刻になったら知らせる」を参照（Workers では `wrangler.jsonc` の vars と secret） |

これらは Node.js で動かすときだけ使う。Workers では D1 を `wrangler.jsonc` の `DB` という名前でつなぐ。

## フォルダ構成

```
packages/core/      ゲームのルール（純粋関数）と、サーバ⇔画面でやりとりする型
  src/games/        ゲームごとのルール（1 ゲーム 1 ファイル）とテスト
apps/server/        API サーバ（Hono。本番は Cloudflare Workers + D1、手元は Node.js + SQLite）
  migrations/       テーブルを作る・変える SQL（D1 と手元の SQLite で共通）
  src/app.ts        API の定義
  src/store.ts      保存処理。SQL の実行口（sql.ts）だけを差し替えて使う
  src/alarms.ts     知らせの予定の決め方・夜の判定
  src/push.ts       時刻になったら LINE の公式アカウントで知らせる（送り先の決め方・文言の表もここ）
  src/webhook.ts    公式アカウントの Webhook（公式アカウントを入れたグループとメンバーを記録する）
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
- **写真を使うゲーム**（`photo`）は、ルールに `photosOfMove`（手が使う写真の ID）と `canSeePhoto`（その写真を見てよいか）を持たせる。写真は画面で長い辺 1024px・300KB くらいの JPEG に描きなおしてから（位置情報などの EXIF は消える）、D1 の `photos` 表に base64 で保存する（[apps/server/src/photos.ts](apps/server/src/photos.ts)）。手を受け取るときに、手の写真が「その対局・その席の人がアップロードしたもの」かを確かめる（[moves.ts](apps/server/src/moves.ts)）。2 人そろったときの LINE のカードには、2 枚の写真を上に並べる（`card.ts` の `images`。画面の `cards/<ゲームID>.ts` でカードを手直しする）

### API

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/games` | 対局を作る `{ gameType, name, seat: 0 \| 1 \| "random" }` |
| GET | `/api/games/:id` | 盤面を見る（`Authorization: Bearer <token>` を付けると自分の席が分かる） |
| POST | `/api/games/:id/join` | 招待コードで参加 `{ inviteCode, name }` |
| POST | `/api/games/:id/moves` | 手を指す `{ version, move }` |
| GET | `/api/games/:id/moves` | 手の記録 |
| POST | `/api/games/:id/photos` | 写真を使うゲームで写真を 1 枚アップロードする（本文は画像そのもの。`image/jpeg` か `image/webp`、512KB まで、1 対局・1 人 30 枚まで。参加者だけ）→ `{ id }` |
| GET | `/api/photos/:photoId` | 写真。2 人そろった写真はだれでも（長くキャッシュ）、まだの写真は出した本人（合言葉）だけ。ほかは 404 |
| GET | `/api/config` | 画面に渡す設定 `{ lineOaId }`（LINE の公式アカウントの ID。なければ null）。`?game=<対局ID>` と合言葉を付けると、その 2 人がそろったグループがあるか（`noticeGroup`）も返す |
| POST | `/api/line/webhook` | LINE の公式アカウントの Webhook（`X-Line-Signature` を確かめる） |

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

## LINE で時刻になったら知らせる

トークの流れに埋もれても気づけるよう、時間がたったらサーバから LINE の公式アカウントで知らせる（Messaging API の push）。相手に 1 対 1 の友だち追加をさせなくて済むよう、**2 人と公式アカウントの 3 人のグループ**に届ける。2 人はそのグループからミニアプリを開いて遊ぶ（招待や手のカードは、今までどおりアプリを開いたトークに送られる）。

| いつ | だれに | 例 |
| --- | --- | --- |
| ゲームが `nextAlarm(state)` を持っていれば、その時刻 | 2 人とも | もちがおなかをすかせた・目をさました・卵がかえった・おとなになれそう・さみしそう |
| 持っていない、順番のあるゲームで、手番の人が 24 時間指していない | 手番の人に 1 回だけ | 「あきさん、『オセロ』であなたの番です」 |

送り先の決め方（[apps/server/src/push.ts](apps/server/src/push.ts)）

- 対局の 2 人の LINE ユーザー ID が**両方とも**メンバーになっているグループがあれば、そこへ送る（いくつもあれば、いちばん最近だれかが話したもの）
  - 同じ対局・同じ種類の予定が 2 人分あっても（相手の分がまだ時刻前でも）1 通にまとめる
  - 2 人の言語が違えば、文を 2 言語で並べる（例：「もちがおなかをすかせています／โมจิหิวแล้ว」）。同じなら 1 言語
- なければ、今までどおり 1 人ずつ 1 対 1 へ（公式アカウントを友だち追加している人だけ届く）
- グループとメンバーは公式アカウントの Webhook（`POST /api/line/webhook`、[apps/server/src/webhook.ts](apps/server/src/webhook.ts)）で D1 の `line_groups`・`line_group_members` に記録する
  - `join`（グループに招待された）：グループを記録し、返信で 3 言語のあいさつ（「このグループで遊ぶ人は、何かひとこと送ってください」）
  - `message`（グループで話した）：その人をメンバーとして記録する。初めての人にだけ返信で「〇〇さんの対局の知らせを、このグループに届けます」（名前は対局で使っている名前、なければ LINE の名前）
  - 「あそぶ」「メニュー」「เล่น」「play」など（[apps/server/src/menu.ts](apps/server/src/menu.ts)）だけを送ると、返信でゲームのメニュー（新しく遊ぶカードと、遊んでいる途中の対局のカード）を横に並べて出す。グループでは 2 人がそろって参加している対局、1 対 1 のトークではその人の対局。リッチメニューはグループに出せないので、ことばで呼ぶ。返信の文には「あそぶ」のボタン（quick reply）を付ける
  - `postback`：カードのボタンをトークのまま押した。押した人を LINE のユーザー ID から対局の席に結びつけて、その人の手として指し、返信でようすを返す（[apps/server/src/mochiChat.ts](apps/server/src/mochiChat.ts)）。いまは、ふたりのもちの知らせに付けるお世話のボタン（ほしがっているもの と もう 1 つ）だけ。版を持たないボタンなので、順番のないゲームにかぎる。同じ人が同じお世話を 30 秒のうちにもう一度押したら 2 度押しとして何もしない。押したことはトークに出さない。返信は無料枠を使わない
  - `memberLeft`：メンバーを消す。`leave`：グループごと消す。`memberJoined` は記録しない（話したときに記録する）。1 対 1 のトークでは、メニューのことば以外には何もしない
  - 返信は reply API なので無料枠を使わない。署名（`X-Line-Signature`）が合わなければ 401、チャネルシークレットがなければ 503
- 予定は D1 の `alarms`（対局・席ごとに次の 1 つ）。手を受け取ったとき・参加したとき・次の対局を作ったときに決め直し、終局したら消す（[apps/server/src/alarms.ts](apps/server/src/alarms.ts)）
- Cron Trigger（`wrangler.jsonc` の `triggers.crons`。15 分ごと）で時刻を過ぎた予定を集めて送り、送ったら消す。送った記録は `notices`（グループへ送ったものは `group_id` 付きで 2 人それぞれに 1 行）
- 文言の表は `push.ts`、ゲーム名は画面と共通の `packages/core/src/names.ts`。カードの見た目は画面から送るものと同じ（`packages/core/src/card.ts`）で、「開く」はミニアプリのその対局を開く
- タイムゾーンは画面が作成・参加・指すときに送る（`Intl.DateTimeFormat().resolvedOptions().timeZone`）。分からなければ言語から推す（ja→日本、th→タイ、en→UTC）

送る量の決まり

- **夜は送らない**：受け取る人のタイムゾーンで 22 時〜8 時なら、その人の 8 時まで遅らせる。グループのときは、2 人のどちらかが夜なら 2 人とも昼になるまで（日本とタイなら、日本の 10 時〜タイの 22 時のあいだ）
- **送りすぎない**：同じ対局で 1 人に 1 日（24 時間）3 通、全部の対局で 1 人 1 日 6 通まで。グループへの 1 通は 2 人それぞれに 1 通と数え、どちらかが上限なら送らない。超える分は送らずに捨てる（無料枠は月 200 通。グループへの push は受け取る人数分に数えられる）。1 日以上遅れた予定も送らずに捨てる
- LINE とつながっていない人（LINE の外から参加した人）には送らない。友だちでない・失敗したときも、ほかの送信は続ける。同じ予定は条件つきで消して取ってから送るので、2 回は送らない
- `LINE_MESSAGING_TOKEN` がなければ何もしない（時刻を過ぎた予定があればログに 1 行）

設定のしかた

1. [LINE Developers](https://developers.line.biz/console/) で、LINE ミニアプリと**同じプロバイダー**に Messaging API のチャネル（公式アカウント）を作る。プロバイダーが違うと LINE のユーザー ID が変わり、届かない
2. チャネルの「Messaging API 設定」で長期のチャネルアクセストークンを発行し、「チャネル基本設定」のチャネルシークレットと一緒に Workers の secret に入れる

   ```bash
   cd apps/server
   npx wrangler secret put LINE_MESSAGING_TOKEN
   npx wrangler secret put LINE_MESSAGING_SECRET
   ```

3. 「Messaging API 設定」で
   - 「グループトーク・複数人トークへの参加を許可する」をオンにする（LINE Official Account Manager の「設定 → アカウント設定」の「グループ・複数人トークへの参加」でも同じ）
   - Webhook URL に `https://async-turn-game.shuhei-yamamoto-fukuoka-japan.workers.dev/api/line/webhook` を入れて「検証」し、「Webhook の利用」をオンにする
   - 応答メッセージ（自動応答）はオフにしておくと、グループで話すたびに自動応答が返らない
4. 公式アカウントの ID（`@xxxx`）を [wrangler.jsonc](apps/server/wrangler.jsonc) の vars の `LINE_OA_ID` に入れて公開する。LINE の中の対局画面に案内とボタン（公式アカウントのページを開く）が出る
   - グループで開いているとき：「知らせを受け取るには、このグループに公式アカウントを招待してください（グループのメニュー → 招待）」
   - 1 対 1 のトーク（やトークの外）で開いているとき：「知らせを受け取るには、2 人と公式アカウントのグループを作って、そこから遊んでください」
   - この対局の 2 人がそろったグループがもうあれば出さない（`/api/config?game=`）。閉じたらその端末では出さない
5. 先に `npm run db:migrate`（`0005_alarms.sql`・`0006_line_groups.sql`。写真のゲームは `0007_photos.sql`）を流してから `npm run deploy` する
6. 2 人のグループに公式アカウントを招待し、**2 人ともグループで 1 回ずつ何かひとこと話す**（話した人がメンバーとして記録され、2 人そろうとそのグループに届く）

- 手元の確かめ方：`npm run dev` のサーバは 1 分ごとに予定を処理する。開発のときだけ `POST /api/dev/alarms`（本文 `{ "now": ミリ秒, "fake": true }`）で今すぐ処理できる。`now` を先にするとその時刻として、`fake` なら LINE に送らずに送るはずだった中身を返す（本番の Node.js と Workers にはこの口はない）
- Webhook も手元で試せる：`LINE_MESSAGING_SECRET` を入れて動かし、その値で署名した偽のイベントを `POST /api/line/webhook` に送る。開発のときに `LINE_MESSAGING_TOKEN` がなければ、返信は LINE に送らずに覚えておき、`GET /api/dev/line` で中身を見られる

## ゲームを追加するには

新しく作るファイルはゲームごとに分かれていて、共有ファイルへの追記は登録の 2 行とゲーム名の 1 行だけ。

1. `packages/core/src/games/<ID>.ts` に `GameDefinition` を実装し、`<ID>.test.ts` にルールのテストを書く。`packages/core/src/index.ts` の `games` に登録する
   - 相手に隠す情報があるなら `viewState` と `viewMove` も実装する（`hitblow.ts` / `auction.ts` が例）
   - 同じ人が続けて指す（手番が移らない）手は LINE で知らせない
   - ゲーム名（ja・en・th）は `packages/core/src/names.ts` の `gameNames` に足す（画面とサーバの LINE の知らせで共通）
   - 時間がたったら知らせたいことがあるゲームは `nextAlarm(state)` を実装し、その `kind` の文を `apps/server/src/push.ts` の表に「<ID>.<kind>」で足す。持たない順番のあるゲームは、手番の人が 24 時間指していなければ知らせる
   - 時間を使うゲーム（お世話のあいだも時計で育つ など）は `stampMove(move, now)` も実装する。applyMove は時計を読めないので、サーバが手を受け取った時刻（`Date.now()`）を `stampMove` で手に書き込んでから applyMove に渡し、その手を記録する（画面から送られてきた時刻は使わない）。お試しでは 1 手ごとに時計を半日進めて書き込む（`mochi.ts` が例）
2. `apps/web/src/boards/<名前>Board.tsx` に盤の見た目を作り、`apps/web/src/boards/index.ts` の `boards` に登録する（長さの目安もここ）。盤だけで使う CSS は同じフォルダの `<名前>Board.css` に書いて、盤から読み込む
3. 文言は `apps/web/src/i18n/games/<ID>.ts` に日本語・英語・タイ語をまとめて書く（`game.<ID>.desc / rules / seat0 / seat1` など。名前だけは 1. の `gameNames`。エラーなら `error.<コード>`）。置くだけで読み込まれる
4. アイコンは `apps/web/src/glyphs/<ID>.tsx` に SVG で描く（viewBox は 0 0 64 64。色は `icons.tsx` の `g-*` クラス）。置くだけで読み込まれる

サーバ側の変更は不要（`nextAlarm` の知らせの文を足すときだけ `push.ts`）。
