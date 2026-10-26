import type { GameMessages } from "../index.tsx";

/**
 * みずそそぎ・ハードの文言。盤はみずそそぎと同じものを使うので、共通の文言は game.pour.* をそのまま使い、
 * 目隠しにかかわるものだけここに置く。{who} には「あなた」か「〇〇さん」が入る
 */
export default {
  ja: {
    "game.pourhard.desc":
      "みずそそぎの上級版。150 ml に届いたら目隠しになり、水の量も注いだ量も見えなくなる。最低量は小さくなるが、1 回ごとに増えていく。",
    "game.pourhard.rules":
      "みずそそぎの上級版です。1 つのコップに、2 人で交互に水を注ぎます（先手から）。自分の番では「そそぐ」ボタンを 1 回だけ長押しします。押している間だけ水が出て、離すと止まります。はじめは、1 回に注ぐ量は 20〜45 ml です。水が 150 ml 以上になったら、そこから先は目隠しです。今の水の量も、注いだ量も、2 人とも見えなくなります（自分の分も）。頼れるのは押した時間の感覚だけです。そのかわり、目隠しになってからの 1 回目は 3 ml から注げて、最低量は 1 回ごとに 3 ml ずつ増えます（3 → 6 → 9 …）。長く押しても 45 ml で止まります。コップのふちは 200 ml で、ふちまではあふれません。ふちを越えても、表面張力でもつことがあります。どこまでもつか（200〜230 ml）はコップごとにちがい、終わるまで分かりません。注いだ水であふれさせた人の負けです。終わったら、すべての量が見えます。",
    "game.pourhard.seat0": "先手",
    "game.pourhard.seat1": "後手",
    "game.pourhard.unknown": "？",
    "game.pourhard.blindMin": "目隠し中・最低 {min} ml",
    "game.pourhard.ladder": "{from} ml に届いたら目隠し。そこからの 1 回の最低量（ml）",
    "game.pourhard.count0": "目隠しになりました。1 回の最低量（ml）",
    "game.pourhard.count": "目隠しのあと {n} 回注ぎました。1 回の最低量（ml）",
    "game.pourhard.ladderLabel": "目隠しのあとの、1 回ごとの最低量",
    "game.pourhard.cup": "コップ。目隠し中で、水の量は見えません。ふちは {rim} ml",
    "game.pourhard.blindLine": "目隠し",
    "game.pourhard.blindNow": "目隠し！",
    "game.pourhard.yourTurn": "目隠し中です。感覚をたよりに「そそぐ」を長押ししてください",
    "game.pourhard.pouredBlind": "{who}が注ぎました",
    "game.pourhard.band": "1 回に {min}〜{max} ml。どれだけ注いだかは見えません",
    "game.pourhard.pouring": "そそいでいます…",
    "game.pourhard.blindShort": "目隠し",
    "error.pour_blind_amount": "目隠しの間は、1 回に注ぐ量は今の最低量〜45 ml です",
    "game.pourhard.tour.goal": "みずそそぎのハード版です。2 人で交互に水を注ぎ、あふれさせた人の負けです。",
    "game.pourhard.tour.press": "「そそぐ」を押している間だけ水が出ます。はじめは 1 回に 20〜45 ml。押してみましょう。",
    "game.pourhard.tour.blind":
      "水が 150 ml に届いたら目隠しです。水の量も、注いだ量も、2 人とも見えなくなります（自分の分も）。頼れるのは押した時間の感覚だけです。",
    "game.pourhard.tour.min":
      "目隠しになると、最低量は 3 ml まで下がり、1 回ごとに 3 ml ずつ増えます（3 → 6 → 9 …）。今の最低量はここに出ます。",
    "game.pourhard.tour.rim":
      "ふち（200 ml）まではあふれません。ふちのすぐ下で渡せば、増えていく最低量で相手があふれるかもしれません。",
  },
  en: {
    "game.pourhard.desc":
      "The hard version of Don't Spill. At 150 ml you're blindfolded: no one can see the water level or how much is poured. The minimum pour drops, then grows every turn.",
    "game.pourhard.rules":
      "The hard version of Don't Spill. Two players take turns pouring water into one cup (1st player first). On your turn, press and hold the Pour button once. Water flows only while you hold it and stops when you let go. At first, each pour is 20–45 ml. Once the water reaches 150 ml, you are blindfolded: from then on, neither of you can see the water level or how much was poured (not even your own pours). All you have is your sense of how long you held the button. In exchange, the first pour after the blindfold can be as little as 3 ml, and the minimum grows by 3 ml every pour (3 → 6 → 9 …). A long press still stops at 45 ml. The rim of the cup is at 200 ml, and the cup never overflows below the rim. Above the rim, surface tension may hold the water for a while. How much the cup holds (200–230 ml) is different for every cup and stays hidden until the game ends. Whoever makes the cup overflow loses. When the game ends, every amount is shown.",
    "game.pourhard.seat0": "1st",
    "game.pourhard.seat1": "2nd",
    "game.pourhard.unknown": "?",
    "game.pourhard.blindMin": "Blindfolded · min {min} ml",
    "game.pourhard.ladder": "Blindfold at {from} ml. Minimum per pour after that (ml)",
    "game.pourhard.count0": "You're blindfolded. Minimum per pour (ml)",
    "game.pourhard.count": "{n} pours since the blindfold. Minimum per pour (ml)",
    "game.pourhard.ladderLabel": "Minimum for each pour after the blindfold",
    "game.pourhard.cup": "Cup. Blindfolded: the water level is hidden. Rim at {rim} ml",
    "game.pourhard.blindLine": "Blind",
    "game.pourhard.blindNow": "Blindfold!",
    "game.pourhard.yourTurn": "You're blindfolded. Trust your sense of time and hold Pour",
    "game.pourhard.pouredBlind": "{who} poured",
    "game.pourhard.band": "{min}–{max} ml per pour. You can't see how much you pour",
    "game.pourhard.pouring": "Pouring…",
    "game.pourhard.blindShort": "Blind",
    "error.pour_blind_amount": "While blindfolded, each pour must be between the current minimum and 45 ml",
    "game.pourhard.tour.goal": "The hard version of Don't Spill. Take turns pouring water into one cup. Whoever makes it overflow loses.",
    "game.pourhard.tour.press": "Water flows only while you hold Pour. At first, each pour is 20–45 ml. Give it a try.",
    "game.pourhard.tour.blind":
      "Once the water reaches 150 ml, you're blindfolded. Neither of you can see the level or how much is poured, not even your own pours. All you have is your sense of time.",
    "game.pourhard.tour.min":
      "When you're blindfolded, the minimum drops to 3 ml and grows by 3 ml every pour (3 → 6 → 9 …). The current minimum is shown here.",
    "game.pourhard.tour.rim":
      "The cup never overflows below the rim (200 ml). Hand it over just below the rim, and the growing minimum may make your opponent spill.",
  },
  th: {
    "game.pourhard.desc":
      "รินน้ำฉบับยาก เมื่อน้ำถึง 150 มล. จะถูกปิดตา ทั้งสองคนมองไม่เห็นระดับน้ำและปริมาณที่ริน ปริมาณขั้นต่ำจะลดลง แล้วค่อยๆ เพิ่มขึ้นทุกครั้ง",
    "game.pourhard.rules":
      "รินน้ำฉบับยาก ผู้เล่นสองคนผลัดกันรินน้ำลงแก้วใบเดียว (ผู้เล่นก่อนเริ่ม) ในตาของคุณ ให้กดปุ่ม “ริน” ค้างไว้หนึ่งครั้ง น้ำจะไหลเฉพาะตอนกดค้าง และหยุดเมื่อปล่อยนิ้ว ช่วงแรกรินได้ครั้งละ 20–45 มล. เมื่อน้ำถึง 150 มล. จะถูกปิดตา หลังจากนั้นทั้งสองคนจะมองไม่เห็นระดับน้ำและปริมาณที่ริน (รวมถึงของตัวเองด้วย) ต้องอาศัยความรู้สึกว่ากดค้างไว้นานแค่ไหน แต่หลังถูกปิดตา ครั้งแรกรินได้น้อยสุด 3 มล. และปริมาณขั้นต่ำจะเพิ่มขึ้นครั้งละ 3 มล. (3 → 6 → 9 …) กดนานแค่ไหนก็หยุดที่ 45 มล. ขอบแก้วอยู่ที่ 200 มล. ถ้ายังไม่ถึงขอบน้ำจะไม่ล้น เมื่อเกินขอบ แรงตึงผิวอาจช่วยให้น้ำยังไม่ล้นได้อีกนิด แก้วแต่ละใบรับได้ไม่เท่ากัน (200–230 มล.) และจะรู้ก็ต่อเมื่อเกมจบ ใครรินจนน้ำล้นแพ้ เมื่อเกมจบจะเห็นปริมาณทั้งหมด",
    "game.pourhard.seat0": "เล่นก่อน",
    "game.pourhard.seat1": "เล่นทีหลัง",
    "game.pourhard.unknown": "?",
    "game.pourhard.blindMin": "ปิดตาอยู่ · ขั้นต่ำ {min} มล.",
    "game.pourhard.ladder": "ปิดตาเมื่อถึง {from} มล. ขั้นต่ำต่อครั้งหลังจากนั้น (มล.)",
    "game.pourhard.count0": "ถูกปิดตาแล้ว ขั้นต่ำต่อครั้ง (มล.)",
    "game.pourhard.count": "รินไปแล้ว {n} ครั้งหลังปิดตา ขั้นต่ำต่อครั้ง (มล.)",
    "game.pourhard.ladderLabel": "ปริมาณขั้นต่ำแต่ละครั้งหลังปิดตา",
    "game.pourhard.cup": "แก้ว ปิดตาอยู่ จึงมองไม่เห็นระดับน้ำ ขอบอยู่ที่ {rim} มล.",
    "game.pourhard.blindLine": "ปิดตา",
    "game.pourhard.blindNow": "ปิดตา!",
    "game.pourhard.yourTurn": "ปิดตาอยู่ ใช้ความรู้สึกแล้วกด “ริน” ค้างไว้",
    "game.pourhard.pouredBlind": "{who} รินแล้ว",
    "game.pourhard.band": "ครั้งละ {min}–{max} มล. มองไม่เห็นว่ารินไปเท่าไร",
    "game.pourhard.pouring": "กำลังริน…",
    "game.pourhard.blindShort": "ปิดตา",
    "error.pour_blind_amount": "ระหว่างปิดตา รินได้ตั้งแต่ขั้นต่ำตอนนี้ถึง 45 มล.",
    "game.pourhard.tour.goal": "รินน้ำฉบับยาก ผลัดกันรินน้ำลงแก้วใบเดียว ใครทำน้ำล้นแพ้",
    "game.pourhard.tour.press": "น้ำจะไหลเฉพาะตอนกด “ริน” ค้างไว้ ช่วงแรกรินได้ครั้งละ 20–45 มล. ลองกดดูเลย",
    "game.pourhard.tour.blind":
      "เมื่อน้ำถึง 150 มล. จะถูกปิดตา ทั้งสองคนมองไม่เห็นระดับน้ำและปริมาณที่ริน (รวมถึงของตัวเอง) ต้องอาศัยความรู้สึกเรื่องเวลา",
    "game.pourhard.tour.min":
      "เมื่อถูกปิดตา ขั้นต่ำจะลดเหลือ 3 มล. และเพิ่มขึ้นครั้งละ 3 มล. (3 → 6 → 9 …) ขั้นต่ำตอนนี้แสดงอยู่ตรงนี้",
    "game.pourhard.tour.rim":
      "ถ้ายังไม่ถึงขอบ (200 มล.) น้ำจะไม่ล้น ถ้าส่งต่อตอนน้ำอยู่ใต้ขอบพอดี ขั้นต่ำที่เพิ่มขึ้นอาจทำให้อีกฝ่ายทำน้ำล้น",
  },
} satisfies GameMessages;
