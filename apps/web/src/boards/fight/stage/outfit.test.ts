import { describe, expect, it } from "vitest";
import { bodyOf, NEUTRAL_STATS } from "./body.ts";
import { hangsDown, outfitOf, PROP_LENGTH, propOf, twoHanded } from "./outfit.ts";
import { hiddenParts } from "./rig.ts";
import type { StyleId } from "./types.ts";

const STYLES: StyleId[] = [
  "boxing",
  "muaythai",
  "karate",
  "taekwondo",
  "judo",
  "bjj",
  "wrestling",
  "mma",
  "capoeira",
  "sumo",
  "kickboxing",
  "taichi",
  "gamer",
  "magician",
  "nurse",
  "swimmer",
  "idol",
  "rapper",
  "chef",
  "robot",
  "ninja",
  "tuktuk",
  "stuntman",
  "salaryman",
  "bubbletea",
  "kendo",
  "luchador",
  "firefighter",
  "dj",
  "investor",
  "dino",
];

describe("服装の決め方", () => {
  it("どのバックボーンも、違う服装になる", () => {
    const keys = new Set(STYLES.map((s) => JSON.stringify(outfitOf(s))));
    expect(keys.size).toBe(STYLES.length);
  });

  it("新しい人たちは、一目で分かる服と持ち物を持つ", () => {
    expect(outfitOf("kickboxing")).toMatchObject({ bottom: "kick", hands: "gloves", shins: true });
    expect(outfitOf("taichi")).toMatchObject({ top: "tunic", feet: "slip", sheen: 1 });
    expect(outfitOf("gamer")).toMatchObject({ top: "hoodie", head: "headset", feet: "sneakers" });
    expect(outfitOf("magician")).toMatchObject({ top: "tailcoat", head: "tophat", neck: "bowtie", hands: "white", cape: true, prop: "cane" });
    expect(outfitOf("swimmer")).toMatchObject({ bottom: "jammer", head: "swim", hair: "none" });
    expect(outfitOf("idol")).toMatchObject({ top: "jacket", head: "mic", prop: "penlight" });
    expect(outfitOf("rapper")).toMatchObject({ top: "tee", head: "cap", neck: "chain" });
    expect(outfitOf("chef")).toMatchObject({ top: "chef", head: "toque", apron: true, prop: "pan" });
    expect(outfitOf("robot").robot).toBe(true);
  });

  it("忍者・トゥクトゥク運転手・スタントマン・サラリーマン・タピオカ店員は、それと分かる服と持ち物を持つ", () => {
    expect(outfitOf("ninja")).toMatchObject({ top: "shinobi", head: "hood", feet: "tabi", belt: "belt", bracers: true, sword: true, cloth: "black", prop: "none" });
    expect(outfitOf("tuktuk")).toMatchObject({ top: "shirt", cloth: "seat", neck: "towel", feet: "sandals" });
    expect(outfitOf("tuktuk").upper).toBeLessThan(1);
    expect(outfitOf("stuntman")).toMatchObject({ top: "stunt", cloth: "black", pants: "black", pads: true });
    expect(outfitOf("salaryman")).toMatchObject({ top: "suit", neck: "tie", feet: "dress", prop: "bag" });
    expect(outfitOf("bubbletea")).toMatchObject({ head: "bandana", prop: "cup", apron: true, bib: true });
  });

  it("剣道家・ルチャドール・消防士・DJ・投資家・恐竜の着ぐるみは、それと分かる服と持ち物を持つ", () => {
    expect(outfitOf("kendo")).toMatchObject({ top: "kendo", cloth: "navy", pants: "navy", head: "men", hands: "kote", feet: "bare", prop: "shinai", bogu: true, wide: true });
    expect(outfitOf("luchador")).toMatchObject({ top: "none", bottom: "tights", head: "mask", feet: "lucha", prop: "none" });
    expect(outfitOf("firefighter")).toMatchObject({ top: "turnout", pants: "khaki", head: "helmet", hands: "work", feet: "rubber", prop: "nozzle", reflect: true });
    expect(outfitOf("dj")).toMatchObject({ top: "bomber", cloth: "seat", head: "capf", neck: "phones", feet: "sneakers" });
    expect(outfitOf("investor")).toMatchObject({ top: "vest", cloth: "white", neck: "tie", head: "glasses", prop: "tablet", feet: "dress" });
    expect(outfitOf("dino")).toMatchObject({ top: "dino", cloth: "green", pants: "green", head: "dino", hands: "paws", feet: "paws", tail: true, wide: true });
    // 袴は裾が広がり、ルチャのタイツは脚にぴったり
    expect(outfitOf("kendo").flare).toBeGreaterThan(1.3);
    expect(outfitOf("luchador").flare).toBeLessThanOrEqual(1.0);
  });

  it("竹刀とホースの筒先は両手で持ち、竹刀は筒先より長い。タブレットは片手で持つ", () => {
    expect(twoHanded("shinai")).toBe(true);
    expect(twoHanded("nozzle")).toBe(true);
    expect(twoHanded("tablet")).toBe(false);
    expect(twoHanded("cane")).toBe(false);
    expect(PROP_LENGTH.shinai).toBeGreaterThan(PROP_LENGTH.nozzle * 3);
    expect(PROP_LENGTH.tablet).toBeGreaterThan(0);
    expect(hangsDown("shinai")).toBe(false);
  });

  it("カバンは手の下に垂らし、カップは立てて持つ。カップで振るのは太いストロー", () => {
    expect(hangsDown("bag")).toBe(true);
    expect(hangsDown("cane")).toBe(true);
    expect(hangsDown("cup")).toBe(false);
    expect(hangsDown("pan")).toBe(false);
    expect(PROP_LENGTH.cup).toBeGreaterThan(PROP_LENGTH.penlight);
    expect(PROP_LENGTH.bag).toBeGreaterThan(0);
  });

  it("看護師は上下ともその人の色のスクラブで、帽子はかぶらない", () => {
    const o = outfitOf("nurse");
    expect(o).toMatchObject({ top: "scrub", cloth: "seat", pants: "seat", head: "none" });
    expect(o.upper).toBeLessThan(1);
  });

  it("どの人も、その人の色（seat）をどこかに使う（服・グローブ・帯・持ち物・首まわり・帽子など）", () => {
    // 服の色に seat がない人は、rig.ts でその人の色の部品（縁取り・リボン・ペンライトなど）を付ける
    const usesSeat = (s: StyleId) => {
      const o = outfitOf(s);
      return (
        o.cloth === "seat" ||
        o.pants === "seat" ||
        o.hands === "gloves" ||
        o.hands === "mma" ||
        o.belt !== "none" ||
        o.bottom !== "pants" ||
        o.neck !== "none" ||
        o.head !== "none" ||
        o.prop !== "none" ||
        o.robot ||
        o.top === "tunic" ||
        o.top === "stunt" ||
        o.pads ||
        o.bracers ||
        o.bib ||
        o.bogu ||
        o.tail ||
        o.top === "bomber" ||
        o.top === "vest"
      );
    };
    for (const s of STYLES) expect(usesSeat(s), s).toBe(true);
  });

  it("持ち物は右手に 1 つ。振る技で、持ち物の長さだけ手前から当てる", () => {
    expect(propOf("magician")).toBe("cane");
    expect(propOf("chef")).toBe("pan");
    expect(propOf("idol")).toBe("penlight");
    expect(propOf("boxing")).toBe("none");
    expect(propOf(null)).toBe("none");
    expect(PROP_LENGTH.cane).toBeGreaterThan(PROP_LENGTH.pan);
    expect(PROP_LENGTH.pan).toBeGreaterThan(PROP_LENGTH.penlight);
    expect(PROP_LENGTH.none).toBe(0);
  });
});

describe("服で隠れる体の部品", () => {
  const d = bodyOf(NEUTRAL_STATS);

  it("ロボットは体の部品をすべて金属の板に置きかえる", () => {
    const h = hiddenParts(outfitOf("robot"), d, false);
    for (const p of ["head", "hair", "ribs", "fist", "thigh", "foot", "neck"]) expect(h.has(p)).toBe(true);
    // シルエットのときは何も隠さない
    expect(hiddenParts(outfitOf("robot"), d, true).size).toBe(0);
  });

  it("長袖の上着は腕まで隠し、半袖のスクラブは上腕の肌を見せる", () => {
    const coat = hiddenParts(outfitOf("magician"), d, false);
    expect(coat.has("ribs") && coat.has("upperArm")).toBe(true);
    const scrub = hiddenParts(outfitOf("nurse"), d, false);
    expect(scrub.has("ribs")).toBe(true);
    expect(scrub.has("upperArm")).toBe(false);
  });

  it("忍び装束は道着と同じく胴と腕を隠し、頭巾は髪を隠す。サンダルは足の甲が見え、半袖のシャツは上腕が見える", () => {
    const ninja = hiddenParts(outfitOf("ninja"), d, false);
    for (const p of ["ribs", "upperArm", "hair", "foot", "thigh"]) expect(ninja.has(p), p).toBe(true);
    const tuk = hiddenParts(outfitOf("tuktuk"), d, false);
    expect(tuk.has("foot")).toBe(false);
    expect(tuk.has("upperArm")).toBe(false);
    expect(tuk.has("ribs")).toBe(true);
    // 少し短いズボンなので、足首のあたりは見える
    expect(tuk.has("shin")).toBe(false);
    const suit = hiddenParts(outfitOf("salaryman"), d, false);
    for (const p of ["ribs", "upperArm", "thigh", "shin", "foot"]) expect(suit.has(p), p).toBe(true);
  });

  it("覆面は頭をすっかり包み、小手・作業手袋・着ぐるみの手はこぶしを隠す。剣道ははだしで、面から顔が見える", () => {
    const mask = hiddenParts(outfitOf("luchador"), d, false);
    for (const p of ["head", "hair", "thigh", "shin", "foot"]) expect(mask.has(p), p).toBe(true);
    // ルチャドールは上が裸
    for (const p of ["ribs", "pec", "upperArm", "fist"]) expect(mask.has(p), p).toBe(false);
    for (const s of ["kendo", "firefighter", "dino"] as const) {
      const h = hiddenParts(outfitOf(s), d, false);
      expect(h.has("fist"), s).toBe(true);
      expect(h.has("hair"), s).toBe(true);
      expect(h.has("head"), s).toBe(false);
    }
    expect(hiddenParts(outfitOf("kendo"), d, false).has("foot")).toBe(false);
    expect(hiddenParts(outfitOf("dino"), d, false).has("foot")).toBe(true);
    // ベストの下は長袖の白いシャツ（腕は見えない）、DJ は手が見える
    expect(hiddenParts(outfitOf("investor"), d, false).has("upperArm")).toBe(true);
    expect(hiddenParts(outfitOf("dj"), d, false).has("fist")).toBe(false);
  });

  it("白い手袋はこぶしを隠し、スイムキャップは髪を隠す。水着のときは脚が見える", () => {
    expect(hiddenParts(outfitOf("magician"), d, false).has("fist")).toBe(true);
    const swim = hiddenParts(outfitOf("swimmer"), d, false);
    expect(swim.has("hair")).toBe(true);
    expect(swim.has("shin")).toBe(false);
    expect(swim.has("ribs")).toBe(false);
  });
});
