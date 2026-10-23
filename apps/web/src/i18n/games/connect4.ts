import type { GameMessages } from "../index.tsx";

/** 四目並べの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.connect4.tour.goal": "縦・横・斜めのどれかに、自分のコマを 4 つ並べたら勝ちです。",
    "game.connect4.tour.drop": "列のどこかをタップすると、その列の一番下の空いている場所にコマが入ります。「これで決定」で落としましょう。",
    "game.connect4.tour.block": "相手が 3 つ並べたら、4 つ目が入る場所に先に落としてふさぎます。もう 1 手指してみましょう。",
    "game.connect4.tour.end": "盤が全部埋まって、どちらも 4 つ並ばなければ引き分けです。",
  },
  en: {
    "game.connect4.tour.goal": "Line up four of your pieces across, down, or diagonally to win.",
    "game.connect4.tour.drop": "Tap anywhere in a column and your piece goes to the lowest empty spot. Press \"Confirm\" to drop it.",
    "game.connect4.tour.block": "If your opponent has three in a row, drop a piece in the fourth spot first to block it. Make another move.",
    "game.connect4.tour.end": "If the board fills up and no one has four in a row, it's a draw.",
  },
  th: {
    "game.connect4.tour.goal": "เรียงเหรียญของคุณให้ได้ 4 ตัวในแนวนอน แนวตั้ง หรือแนวทแยงเพื่อชนะ",
    "game.connect4.tour.drop": "แตะตรงไหนก็ได้ในแถวตั้ง เหรียญจะลงไปยังช่องว่างที่ต่ำที่สุด กด \"ยืนยัน\" เพื่อหย่อนเหรียญ",
    "game.connect4.tour.block": "ถ้าอีกฝ่ายเรียงได้ 3 ตัวแล้ว ให้หย่อนเหรียญลงช่องที่ 4 ก่อนเพื่อปิดทาง ลองเล่นอีก 1 ตาดู",
    "game.connect4.tour.end": "ถ้ากระดานเต็มแล้วยังไม่มีใครเรียงได้ 4 ตัว ถือว่าเสมอ",
  },
} satisfies GameMessages;
