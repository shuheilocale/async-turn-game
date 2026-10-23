import type { GameMessages } from "../index.tsx";

/** タテヨコ置きの文言 */
export default {
  ja: {
    "game.tateyoko.name": "タテヨコ置き",
    "game.tateyoko.desc": "5×5 のマスに、縦と横の棒を交互に置く。置ける場所がなくなった方の負け。",
    "game.tateyoko.rules":
      "5×5 のマスに、2 マス分の棒を交互に置きます。先手（青）はいつも縦向き、後手（オレンジ）はいつも横向きです。棒は空いているマスにだけ置けて、ほかの棒とは重ねられません。自分の番に置ける場所がなくなった方の負けです。引き分けはありません。",
    "game.tateyoko.seat0": "タテ",
    "game.tateyoko.seat1": "ヨコ",
    "game.tateyoko.pick0": "縦の棒を置く場所をタップしてください",
    "game.tateyoko.pick1": "横の棒を置く場所をタップしてください",
    "game.tateyoko.room": "置ける場所 あなた {me}／相手 {opp}",
    "game.tateyoko.roomOf": "置ける場所 {name0} {n0}／{name1} {n1}",
    "game.tateyoko.noRoom": "{name}さんの置ける場所がなくなりました",
    "game.tateyoko.noRoomYou": "あなたの置ける場所がなくなりました",
  },
  en: {
    "game.tateyoko.name": "Domineering",
    "game.tateyoko.desc": "Take turns placing bars on a 5×5 grid, one player vertical and the other horizontal. Whoever can't place a bar loses.",
    "game.tateyoko.rules":
      "Take turns placing a bar that covers two squares of the 5×5 grid. The first player (blue) always places bars vertically, and the second player (orange) always places them horizontally. Bars go on empty squares only and can't overlap other bars. If it's your turn and there's nowhere left to place your bar, you lose. There are no draws.",
    "game.tateyoko.seat0": "Vertical",
    "game.tateyoko.seat1": "Horizontal",
    "game.tateyoko.pick0": "Tap where to place your vertical bar",
    "game.tateyoko.pick1": "Tap where to place your horizontal bar",
    "game.tateyoko.room": "Places left: you {me} / opponent {opp}",
    "game.tateyoko.roomOf": "Places left: {name0} {n0} / {name1} {n1}",
    "game.tateyoko.noRoom": "{name} has nowhere left to place a bar",
    "game.tateyoko.noRoomYou": "You have nowhere left to place a bar",
  },
  th: {
    "game.tateyoko.name": "แท่งตั้ง แท่งนอน",
    "game.tateyoko.desc": "ผลัดกันวางแท่งบนกระดาน 5×5 ฝ่ายหนึ่งวางแนวตั้ง อีกฝ่ายวางแนวนอน ใครไม่มีที่วางแพ้",
    "game.tateyoko.rules":
      "ผลัดกันวางแท่งยาว 2 ช่องบนกระดาน 5×5 ผู้ที่เล่นก่อน (สีน้ำเงิน) วางแนวตั้งเสมอ ผู้ที่เล่นทีหลัง (สีส้ม) วางแนวนอนเสมอ วางได้เฉพาะบนช่องว่าง และห้ามทับแท่งอื่น ถ้าถึงตาคุณแล้วไม่มีที่ให้วางแท่ง คุณแพ้ ไม่มีการเสมอ",
    "game.tateyoko.seat0": "แนวตั้ง",
    "game.tateyoko.seat1": "แนวนอน",
    "game.tateyoko.pick0": "แตะช่องที่จะวางแท่งแนวตั้ง",
    "game.tateyoko.pick1": "แตะช่องที่จะวางแท่งแนวนอน",
    "game.tateyoko.room": "ที่ที่วางได้: คุณ {me} / อีกฝ่าย {opp}",
    "game.tateyoko.roomOf": "ที่ที่วางได้: {name0} {n0} / {name1} {n1}",
    "game.tateyoko.noRoom": "{name} ไม่มีที่วางแท่งแล้ว",
    "game.tateyoko.noRoomYou": "คุณไม่มีที่วางแท่งแล้ว",
  },
} satisfies GameMessages;
