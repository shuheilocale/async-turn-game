import { useI18n } from "../i18n/index.tsx";

const REPO = "https://github.com/shuheilocale/async-turn-game";

/** LINE ミニアプリのチャネル設定に載せるプライバシーポリシー。日本語と英語（タイ語は英語を出す） */
export function Privacy() {
  const { lang } = useI18n();
  return <article className="panel prose">{lang === "ja" ? <Ja /> : <En />}</article>;
}

function Ja() {
  return (
    <>
      <h1>プライバシーポリシー</h1>
      <p>このアプリは、知り合い同士でボードゲームを遊ぶために個人が運営しています。</p>
      <h2>扱う情報</h2>
      <ul>
        <li>対局で入力した名前、指した手、対局の状態</li>
        <li>
          LINE から使った場合：LINE のユーザー ID（どの対局のどちらの席かを確かめるためだけに使います）と表示名（名前の入力欄の初期値にだけ使い、保存しません）
        </li>
        <li>ブラウザに保存する、対局ごとの合言葉</li>
      </ul>
      <h2>使い道</h2>
      <p>対局を進めるためだけに使います。広告や分析には使わず、第三者には渡しません。</p>
      <h2>トークへの送信</h2>
      <p>
        LINE のトークから開いて手を指したり参加したりすると、そのトークに「〇〇さんが指しました」などのメッセージをあなたの名前で送ります。招待は、あなたが選んだ相手にだけ送ります。
      </p>
      <h2>保存場所</h2>
      <p>Cloudflare, Inc. のサーバに保存します。</p>
      <h2>削除・問い合わせ</h2>
      <p>
        データの削除などは <a href={`${REPO}/issues`}>GitHub</a> からご連絡ください。
      </p>
      <p className="muted small">2026 年 10 月 23 日 制定</p>
    </>
  );
}

function En() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>This app is run by an individual so that friends can play board games together.</p>
      <h2>What we handle</h2>
      <ul>
        <li>The name you enter, your moves and the state of each game</li>
        <li>
          When used from LINE: your LINE user ID (only to check which seat is yours in a game) and display name (only to
          prefill the name field; not stored)
        </li>
        <li>A per-game passcode saved in your browser</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to run your games. We do not use it for ads or analytics and do not share it with third parties.</p>
      <h2>Messages in LINE chats</h2>
      <p>
        When you open a game from a LINE chat and make a move or join, a message such as “… made a move” is sent to that
        chat in your name. Invitations are sent only to the people you choose.
      </p>
      <h2>Where it is stored</h2>
      <p>On servers of Cloudflare, Inc.</p>
      <h2>Deletion and contact</h2>
      <p>
        To have your data deleted, contact us via <a href={`${REPO}/issues`}>GitHub</a>.
      </p>
      <p className="muted small">Effective October 23, 2026</p>
    </>
  );
}
