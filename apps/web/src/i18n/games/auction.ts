import type { GameMessages } from "../index.tsx";

/** 数字のせりの「ルールを学ぶ」の案内（名前やルール文は ja.ts などにある） */
export default {
  ja: {
    "game.auction.tour.goal": "毎ラウンド得点カードが 1 枚出ます。手札の数字で取り合い、9 ラウンドで得点の多い方の勝ちです。",
    "game.auction.tour.bid": "手札から出すカードをタップして「これで決定」。相手には見えません。出してみましょう。",
    "game.auction.tour.win": "2 人とも出したら見せ合い、大きい数字を出した方が得点カードをもらいます。",
    "game.auction.tour.tie": "同じ数字なら、得点カードは次のラウンドに持ち越しです。出したカードは手札に戻りません。",
    "game.auction.tour.end": "どの数字も 1 枚ずつしかありません。大きい数字をどの得点カードに使うか考えて出しましょう。",
  },
  en: {
    "game.auction.tour.goal": "Each round, one prize card comes up, and you bid for it with your number cards. After 9 rounds, whoever has more points wins.",
    "game.auction.tour.bid": "Tap the card you want to bid, then press \"Confirm\". Your opponent can't see it. Give it a try.",
    "game.auction.tour.win": "Once you've both bid, the cards are shown and the higher number takes the prize card.",
    "game.auction.tour.tie": "On a tie, the prize carries over to the next round. Cards you bid don't come back to your hand.",
    "game.auction.tour.end": "You have only one of each number, so think about which prizes are worth your big cards.",
  },
  th: {
    "game.auction.tour.goal": "แต่ละรอบจะมีไพ่คะแนนออกมา 1 ใบ ใช้ไพ่ตัวเลขในมือแย่งกัน ครบ 9 รอบ ใครได้คะแนนมากกว่าชนะ",
    "game.auction.tour.bid": "แตะไพ่ที่จะลง แล้วกด \"ยืนยัน\" อีกฝ่ายจะมองไม่เห็น ลองลงดูเลย",
    "game.auction.tour.win": "เมื่อลงไพ่ครบทั้งสองคนแล้วจะเปิดดูกัน คนที่ลงเลขสูงกว่าได้ไพ่คะแนนไป",
    "game.auction.tour.tie": "ถ้าลงเลขเท่ากัน ไพ่คะแนนจะทบไปรอบถัดไป ไพ่ที่ลงแล้วจะไม่กลับมาในมือ",
    "game.auction.tour.end": "ไพ่แต่ละเลขมีแค่ใบเดียว คิดให้ดีว่าจะใช้ไพ่เลขสูงกับไพ่คะแนนใบไหน",
  },
} satisfies GameMessages;
