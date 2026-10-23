import type { GameMessages } from "../index.tsx";

/** かぶせマルバツの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.gobble.tour.goal": "一番上に見えている自分のコマを、縦・横・斜めに 3 つ並べたら勝ちです。",
    "game.gobble.tour.place": "下の手持ちから置くコマを選び、置くマスをタップして「これで決定」。置いてみましょう。",
    "game.gobble.tour.cover": "大きいコマは、小さいコマにかぶせられます（相手のコマにも自分のコマにも）。できればかぶせてみましょう。",
    "game.gobble.tour.move": "置く代わりに、盤の上で一番上にある自分のコマを選んで、別のマスへ動かすこともできます。",
    "game.gobble.tour.end": "動かしたコマの下から相手の 3 つの並びが出てくると、相手の勝ちになるので気をつけましょう。",
  },
  en: {
    "game.gobble.tour.goal": "Get three of your pieces in a row — across, down, or diagonally. Only the pieces on top count.",
    "game.gobble.tour.place": "Pick a piece from your pieces below, tap a square, then press \"Confirm\". Try placing one.",
    "game.gobble.tour.cover": "A bigger piece can cover a smaller one — yours or the computer's. Try covering one if you can.",
    "game.gobble.tour.move": "Instead of placing, you can pick one of your pieces on top of the board and move it to another square.",
    "game.gobble.tour.end": "Careful: if moving a piece uncovers a line of three for your opponent, your opponent wins.",
  },
  th: {
    "game.gobble.tour.goal": "เรียงหมากของคุณที่มองเห็นอยู่บนสุดให้ได้ 3 ตัวในแนวนอน แนวตั้ง หรือแนวทแยงเพื่อชนะ",
    "game.gobble.tour.place": "เลือกหมากจากหมากของคุณด้านล่าง แตะช่องที่จะวาง แล้วกด \"ยืนยัน\" ลองวางดูเลย",
    "game.gobble.tour.cover": "หมากที่ใหญ่กว่าครอบหมากที่เล็กกว่าได้ ทั้งของคุณและของคอมพิวเตอร์ ถ้าทำได้ลองครอบดู",
    "game.gobble.tour.move": "แทนที่จะวาง คุณจะเลือกหมากของคุณที่อยู่บนสุดบนกระดาน แล้วย้ายไปช่องอื่นก็ได้",
    "game.gobble.tour.end": "ระวัง ถ้าย้ายหมากแล้วเผยให้เห็นแถว 3 ตัวของอีกฝ่าย อีกฝ่ายจะชนะ",
  },
} satisfies GameMessages;
