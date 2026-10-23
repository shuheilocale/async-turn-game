import type { GameMessages } from "../index.tsx";

export default {
  ja: {
    "game.fading.name": "きえるマルバツ",
    "game.fading.desc": "自分の印は 3 つまで。4 つ目を置くと、一番古い印が消えるマルバツ。",
    "game.fading.rules":
      "交互に空いているマスに自分の印を置き、縦・横・斜めのどれかに 3 つ並べたら勝ち。盤に置ける自分の印は 3 つまでです。すでに 3 つあるときに置くと、自分の一番古い印（薄く表示している印）が先に消えてから新しい印が置かれるので、消える印は並びに数えません。次に消える印のマスには置けません。30 手で決着がつかなければ引き分けです。",
    "game.fading.seat0": "○",
    "game.fading.seat1": "×",
    "game.fading.pick": "印は 3 つまで。4 つ目で一番古い印が消えます",
    "game.fading.willFade": "次に置くと、あなたの薄い印が消えます",
    "game.fading.vanished": "{name}さんの一番古い印が消えました",
    "game.fading.vanishedYou": "あなたの一番古い印が消えました",
    "game.fading.left": "あと {n} 手で引き分け",
    "game.fading.next": "次に消える",
    "game.fading.gone": "さっき消えた",
  },
  en: {
    "game.fading.name": "Fading Tic-Tac-Toe",
    "game.fading.desc": "Tic-tac-toe where you keep only 3 marks. Placing a 4th removes your oldest one.",
    "game.fading.rules":
      "Take turns marking an empty square. Get three in a row — across, down, or diagonally — to win. You can have at most 3 marks on the board. If you already have 3, your oldest mark (shown faded) is removed before the new one is placed, so it doesn't count toward a line. You can't place on the square of the mark that is about to fade. The game is a draw after 30 moves.",
    "game.fading.seat0": "○",
    "game.fading.seat1": "×",
    "game.fading.pick": "You keep 3 marks. Placing a 4th removes your oldest",
    "game.fading.willFade": "Your next mark will remove your faded one",
    "game.fading.vanished": "{name}'s oldest mark faded away",
    "game.fading.vanishedYou": "Your oldest mark faded away",
    "game.fading.left": "Draw in {n} moves",
    "game.fading.next": "fades next",
    "game.fading.gone": "just faded",
  },
  th: {
    "game.fading.name": "โอเอ็กซ์จางหาย",
    "game.fading.desc": "โอเอ็กซ์ที่มีเครื่องหมายของตัวเองได้แค่ 3 ตัว วางตัวที่ 4 แล้วตัวที่เก่าที่สุดจะหายไป",
    "game.fading.rules":
      "ผลัดกันวางเครื่องหมายของตัวเองในช่องว่าง ใครเรียงได้ 3 ตัวในแนวนอน แนวตั้ง หรือแนวทแยงก่อนชนะ บนกระดานมีเครื่องหมายของตัวเองได้ไม่เกิน 3 ตัว ถ้ามีครบ 3 ตัวแล้ววางเพิ่ม เครื่องหมายที่เก่าที่สุดของตัวเอง (ที่แสดงจางๆ) จะหายไปก่อนแล้วจึงวางตัวใหม่ จึงไม่นับรวมในแถว และวางในช่องของเครื่องหมายที่กำลังจะหายไม่ได้ ถ้าครบ 30 ตาแล้วยังไม่มีผู้ชนะถือว่าเสมอ",
    "game.fading.seat0": "○",
    "game.fading.seat1": "×",
    "game.fading.pick": "มีเครื่องหมายได้ 3 ตัว วางตัวที่ 4 แล้วตัวที่เก่าที่สุดจะหายไป",
    "game.fading.willFade": "ถ้าวางอีกตัว เครื่องหมายจางๆ ของคุณจะหายไป",
    "game.fading.vanished": "เครื่องหมายที่เก่าที่สุดของ {name} หายไปแล้ว",
    "game.fading.vanishedYou": "เครื่องหมายที่เก่าที่สุดของคุณหายไปแล้ว",
    "game.fading.left": "อีก {n} ตาจะเสมอ",
    "game.fading.next": "จะหายเป็นตัวต่อไป",
    "game.fading.gone": "เพิ่งหายไป",
  },
} satisfies GameMessages;
