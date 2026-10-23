import type { GameMessages } from "../index.tsx";

/** オセロの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.othello.tour.goal": "あなたは黒です。最後に、盤の上の自分の石が多い方の勝ちです。",
    "game.othello.tour.place": "置けるのは、相手の石をはさめるマスだけです。小さな点のマスをタップして「これで決定」。置いてみましょう。",
    "game.othello.tour.flip": "はさんだ石はすべて自分の色になります。マスを選ぶと、ひっくり返る石が点線で囲まれます。確かめて置いてみましょう。",
    "game.othello.tour.count": "いまの石の数はここに出ます。置ける場所がないとパスになり、ここに知らせが出ます。",
    "game.othello.tour.end": "2 人とも置けなくなったら終わりです。角の石はひっくり返されないので、取れると有利です。",
  },
  en: {
    "game.othello.tour.goal": "You play black. Whoever has more discs on the board at the end wins.",
    "game.othello.tour.place": "You can only place where you trap your opponent's discs. Tap a square with a small dot, then press \"Confirm\". Give it a try.",
    "game.othello.tour.flip": "Every disc you trap flips to your color. When you pick a square, the discs that will flip get a dashed outline. Check them, then place.",
    "game.othello.tour.count": "The disc count is shown here. If someone has no valid move, they pass, and a note appears here.",
    "game.othello.tour.end": "The game ends when neither player can move. Corner discs can never be flipped, so they're worth taking.",
  },
  th: {
    "game.othello.tour.goal": "คุณเล่นหมากสีดำ ตอนจบใครมีหมากบนกระดานมากกว่าชนะ",
    "game.othello.tour.place": "วางได้เฉพาะช่องที่หนีบหมากของอีกฝ่ายได้ แตะช่องที่มีจุดเล็กๆ แล้วกด \"ยืนยัน\" ลองวางดูเลย",
    "game.othello.tour.flip": "หมากที่ถูกหนีบทั้งหมดจะพลิกเป็นสีของคุณ เมื่อเลือกช่อง หมากที่จะพลิกจะมีเส้นประล้อมรอบ ดูให้ดีแล้วลองวาง",
    "game.othello.tour.count": "จำนวนหมากแสดงอยู่ตรงนี้ ถ้าไม่มีที่วางจะต้องข้ามตา และจะมีข้อความแจ้งตรงนี้",
    "game.othello.tour.end": "เมื่อทั้งสองฝ่ายวางไม่ได้แล้วเกมจบ หมากที่มุมจะไม่ถูกพลิก ถ้ายึดมุมได้จะได้เปรียบ",
  },
} satisfies GameMessages;
