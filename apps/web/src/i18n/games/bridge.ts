import type { GameMessages } from "../index.tsx";

/** つなぎ橋の文言 */
export default {
  ja: {
    "game.bridge.name": "つなぎ橋",
    "game.bridge.desc": "六角形のマスに石を置き、自分の色の向かい合う 2 つの辺を先につないだ方の勝ち。",
    "game.bridge.rules":
      "交互に、空いているマスに自分の石を 1 つずつ置きます。青は上と下の辺を、オレンジは左と右の辺を、自分の石でつないだら勝ち。となり合うマス（六角形の辺がくっついているマス）の石どうしがつながります。かならずどちらかがつながるので、引き分けはありません。先に置く方が有利なので、オレンジは最初の番だけ、置く代わりに「入れ替える」を選べます。青の石を取りのぞき、盤をななめに折り返した場所にオレンジの石を置きます。そのあとは青の番です。",
    "game.bridge.seat0": "青",
    "game.bridge.seat1": "オレンジ",
    "game.bridge.place": "石を置くマスを選んでください",
    "game.bridge.placeOrSwap": "マスを選ぶか、「入れ替える」を押してください",
    "game.bridge.goal0": "あなたは上と下の青い辺をつなぎます",
    "game.bridge.goal1": "あなたは左と右のオレンジの辺をつなぎます",
    "game.bridge.goals": "青は上と下を、オレンジは左と右をつなぎます",
    "game.bridge.swap": "入れ替える",
    "game.bridge.swapHint": "入れ替えると、青の石を取りのぞき、盤をななめに折り返した場所にあなたの石を置きます。次は青の番です。",
    "game.bridge.swapped": "{name}さんが入れ替えました",
    "game.bridge.cell": "{row} 行目 {col} 列目",
    "error.bridge_cannot_swap": "入れ替えられるのは、オレンジの最初の番だけです",
  },
  en: {
    "game.bridge.name": "Hex Bridge",
    "game.bridge.desc": "Place stones on a board of hexagons. Be the first to connect your two opposite sides.",
    "game.bridge.rules":
      "Take turns placing one of your stones on an empty hexagon. Blue wins by linking the top and bottom edges with blue stones; Orange wins by linking the left and right edges. Stones are linked when their hexagons share a side. Someone always gets through, so there are no draws. Going first is an advantage, so on Orange's first turn, Orange may choose \"Swap\" instead of placing: Blue's stone is removed and an orange stone is placed where it lands when the board is folded along its diagonal. Then it's Blue's turn.",
    "game.bridge.seat0": "Blue",
    "game.bridge.seat1": "Orange",
    "game.bridge.place": "Pick a hexagon for your stone",
    "game.bridge.placeOrSwap": "Pick a hexagon, or tap \"Swap\"",
    "game.bridge.goal0": "Link the blue top and bottom edges",
    "game.bridge.goal1": "Link the orange left and right edges",
    "game.bridge.goals": "Blue links top and bottom; Orange links left and right",
    "game.bridge.swap": "Swap",
    "game.bridge.swapHint": "Swapping removes Blue's stone and puts yours where it lands when the board is folded along its diagonal. Then it's Blue's turn.",
    "game.bridge.swapped": "{name} swapped",
    "game.bridge.cell": "Row {row}, column {col}",
    "error.bridge_cannot_swap": "You can only swap on Orange's first turn",
  },
  th: {
    "game.bridge.name": "สะพานเชื่อม",
    "game.bridge.desc": "วางหมากบนช่องหกเหลี่ยม ใครเชื่อมสองขอบฝั่งตรงข้ามของสีตัวเองได้ก่อนชนะ",
    "game.bridge.rules":
      "ผลัดกันวางหมากของตัวเองลงในช่องว่างทีละ 1 ตัว ฝ่ายน้ำเงินชนะเมื่อเชื่อมขอบบนกับขอบล่างด้วยหมากของตัวเอง ฝ่ายส้มชนะเมื่อเชื่อมขอบซ้ายกับขอบขวา หมากในช่องที่มีด้านติดกันถือว่าเชื่อมกัน ต้องมีฝ่ายหนึ่งเชื่อมได้เสมอ จึงไม่มีเสมอ เนื่องจากฝ่ายที่วางก่อนได้เปรียบ ในตาแรกของฝ่ายส้ม จะเลือก \"สลับ\" แทนการวางก็ได้ หมากของฝ่ายน้ำเงินจะถูกเอาออก แล้ววางหมากสีส้มในตำแหน่งที่ได้เมื่อพับกระดานตามแนวทแยง จากนั้นเป็นตาของฝ่ายน้ำเงิน",
    "game.bridge.seat0": "น้ำเงิน",
    "game.bridge.seat1": "ส้ม",
    "game.bridge.place": "เลือกช่องที่จะวางหมาก",
    "game.bridge.placeOrSwap": "เลือกช่องที่จะวาง หรือกด \"สลับ\"",
    "game.bridge.goal0": "คุณต้องเชื่อมขอบบนกับขอบล่างสีน้ำเงิน",
    "game.bridge.goal1": "คุณต้องเชื่อมขอบซ้ายกับขอบขวาสีส้ม",
    "game.bridge.goals": "น้ำเงินเชื่อมบนกับล่าง ส้มเชื่อมซ้ายกับขวา",
    "game.bridge.swap": "สลับ",
    "game.bridge.swapHint": "ถ้าสลับ หมากของฝ่ายน้ำเงินจะถูกเอาออก แล้ววางหมากของคุณในตำแหน่งที่ได้เมื่อพับกระดานตามแนวทแยง จากนั้นเป็นตาของฝ่ายน้ำเงิน",
    "game.bridge.swapped": "{name} เลือกสลับ",
    "game.bridge.cell": "แถว {row} คอลัมน์ {col}",
    "error.bridge_cannot_swap": "สลับได้เฉพาะตาแรกของฝ่ายส้มเท่านั้น",
  },
} satisfies GameMessages;
