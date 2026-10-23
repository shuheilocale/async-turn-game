import type { GameMessages } from "../index.tsx";

/** ニムの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.nim.tour.goal": "棒を交互に取っていき、最後の 1 本を取った方の負けです。",
    "game.nim.tour.oneRow": "1 回に取れるのは 1 つの段からだけ。本数は 1 本からその段の全部まで自由です。",
    "game.nim.tour.take": "棒をタップすると、その棒から右はしまでを取ります。本数を確かめて「これで決定」。取ってみましょう。",
    "game.nim.tour.count": "相手が取った本数と、残りの本数は、盤の下に出ます。",
    "game.nim.tour.end": "残りの本数を数えながら、最後の 1 本を相手に残すように取りましょう。",
  },
  en: {
    "game.nim.tour.goal": "Take turns removing sticks. Whoever takes the last stick loses.",
    "game.nim.tour.oneRow": "Each turn, take from one row only — anywhere from one stick to the whole row.",
    "game.nim.tour.take": "Tap a stick to take it and every stick to its right. Check the count, then press \"Confirm\". Give it a try.",
    "game.nim.tour.count": "Below the sticks, you can see how many your opponent took and how many are left.",
    "game.nim.tour.end": "Keep count of what's left, and try to leave the last stick for your opponent.",
  },
  th: {
    "game.nim.tour.goal": "ผลัดกันหยิบไม้ ใครหยิบไม้อันสุดท้ายแพ้",
    "game.nim.tour.oneRow": "แต่ละตาหยิบได้จากแถวเดียวเท่านั้น จะหยิบ 1 อันไปจนถึงทั้งแถวก็ได้",
    "game.nim.tour.take": "แตะไม้อันไหน จะหยิบตั้งแต่อันนั้นไปจนสุดทางขวา ดูจำนวนให้ดีแล้วกด \"ยืนยัน\" ลองหยิบดูเลย",
    "game.nim.tour.count": "ใต้แถวไม้จะแสดงว่าอีกฝ่ายหยิบไปกี่อัน และเหลืออีกกี่อัน",
    "game.nim.tour.end": "นับไม้ที่เหลือไว้ แล้วพยายามเหลือไม้อันสุดท้ายให้อีกฝ่าย",
  },
} satisfies GameMessages;
