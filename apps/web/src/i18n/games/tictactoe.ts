import type { GameMessages } from "../index.tsx";

/** マルバツの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.tictactoe.tour.goal": "縦・横・斜めのどれかに、自分の ○ を 3 つ並べたら勝ちです。",
    "game.tictactoe.tour.players": "あなたは ○、相手のコンピュータは × です。いま番の人は、色の枠で囲まれます。",
    "game.tictactoe.tour.place": "空いているマスをタップして、画面下の「これで決定」を押すと置けます。置いてみましょう。",
    "game.tictactoe.tour.block": "相手の × が 2 つ並んだら、残りのマスに先に置いてふさぎます。もう 1 手置いてみましょう。",
    "game.tictactoe.tour.end": "マスが全部埋まって、どちらも 3 つ並ばなければ引き分けです。",
  },
  en: {
    "game.tictactoe.tour.goal": "Line up three of your ○ marks across, down, or diagonally to win.",
    "game.tictactoe.tour.players": "You are ○ and the computer is ×. The player whose turn it is gets a colored outline.",
    "game.tictactoe.tour.place": "Tap an empty square, then press \"Confirm\" at the bottom of the screen. Try placing a mark.",
    "game.tictactoe.tour.block": "If the computer gets two × in a row, take the third square first to block it. Place one more mark.",
    "game.tictactoe.tour.end": "If the board fills up and no one has three in a row, it's a draw.",
  },
  th: {
    "game.tictactoe.tour.goal": "เรียง ○ ของคุณให้ได้ 3 ตัวในแนวนอน แนวตั้ง หรือแนวทแยงเพื่อชนะ",
    "game.tictactoe.tour.players": "คุณคือ ○ คอมพิวเตอร์คือ × ฝ่ายที่ถึงตาจะมีกรอบสีล้อมรอบ",
    "game.tictactoe.tour.place": "แตะช่องว่าง แล้วกด \"ยืนยัน\" ที่ด้านล่างของหน้าจอ ลองวางดูเลย",
    "game.tictactoe.tour.block": "ถ้าคอมพิวเตอร์เรียง × ได้ 2 ตัว ให้วางปิดช่องที่เหลือก่อน ลองวางอีก 1 ตาดู",
    "game.tictactoe.tour.end": "ถ้าช่องเต็มหมดแล้วยังไม่มีใครเรียงได้ 3 ตัว ถือว่าเสมอ",
  },
} satisfies GameMessages;
