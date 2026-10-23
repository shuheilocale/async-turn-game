import type { GameMessages } from "../index.tsx";

/** ヒット＆ブローの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.hitblow.tour.goal": "お互いに秘密の 3 桁の数字を決めて、相手の数字を先に当てた方の勝ちです。",
    "game.hitblow.tour.secret": "まず、相手に当ててもらう数字を決めます。同じ数字は使えません。3 つ押して「これで決定」。",
    "game.hitblow.tour.guess": "次は相手の数字を推理します。3 つ押して「これで決定」で答えてみましょう。",
    "game.hitblow.tour.hint": "数字も位置も合っていればヒット、数字だけ合っていればブロー。これを手がかりに次を考えます。",
    "game.hitblow.tour.end": "先手のあなたが当てても相手にもう 1 回だけ機会があり、相手も当てたら引き分けです。",
  },
  en: {
    "game.hitblow.tour.goal": "Each of you picks a secret 3-digit number. Whoever guesses the other's number first wins.",
    "game.hitblow.tour.secret": "First, pick the number your opponent has to guess, with no repeated digits. Press three digits, then \"Confirm\".",
    "game.hitblow.tour.guess": "Now guess your opponent's number. Press three digits, then \"Confirm\" to answer.",
    "game.hitblow.tour.hint": "A hit is a right digit in the right place; a blow is a right digit in the wrong place. Use them as clues for your next guess.",
    "game.hitblow.tour.end": "Even if you, the first player, guess it, your opponent gets one last try. If they get it too, it's a draw.",
  },
  th: {
    "game.hitblow.tour.goal": "ต่างคนต่างตั้งเลขลับ 3 หลัก ใครทายเลขของอีกฝ่ายถูกก่อนชนะ",
    "game.hitblow.tour.secret": "ก่อนอื่น ตั้งเลขให้อีกฝ่ายทาย ห้ามใช้ตัวเลขซ้ำ กดตัวเลข 3 ตัว แล้วกด \"ยืนยัน\"",
    "game.hitblow.tour.guess": "ต่อไปลองทายเลขของอีกฝ่าย กดตัวเลข 3 ตัว แล้วกด \"ยืนยัน\" เพื่อทาย",
    "game.hitblow.tour.hint": "ฮิตคือตัวเลขและตำแหน่งถูก โบลว์คือตัวเลขถูกแต่ตำแหน่งผิด ใช้เป็นเบาะแสในการทายครั้งต่อไป",
    "game.hitblow.tour.end": "ถึงคุณซึ่งเล่นก่อนจะทายถูก อีกฝ่ายก็ยังได้ทายอีก 1 ครั้ง ถ้าทายถูกเหมือนกันถือว่าเสมอ",
  },
} satisfies GameMessages;
