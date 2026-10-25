import { describe, expect, it } from "vitest";
import { bodyOf, NEUTRAL_STATS } from "./body.ts";
import { outfitOf, PROP_LENGTH, propOf } from "./outfit.ts";
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
];

describe("服装の決め方", () => {
  it("20 のバックボーンは、どれも違う服装になる", () => {
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

  it("看護師は上下ともその人の色のスクラブで、帽子はかぶらない", () => {
    const o = outfitOf("nurse");
    expect(o).toMatchObject({ top: "scrub", cloth: "seat", pants: "seat", head: "none" });
    expect(o.upper).toBeLessThan(1);
  });

  it("どの人も、その人の色（seat）をどこかに使う（服・グローブ・帯・持ち物・首まわり・帽子など）", () => {
    // 服の色に seat がない人は、rig.ts でその人の色の部品（縁取り・リボン・ペンライトなど）を付ける
    const usesSeat = (s: StyleId) => {
      const o = outfitOf(s);
      return o.cloth === "seat" || o.pants === "seat" || o.hands === "gloves" || o.belt !== "none" || o.bottom !== "pants" || o.neck !== "none" || o.head !== "none" || o.prop !== "none" || o.robot || o.top === "tunic";
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

  it("白い手袋はこぶしを隠し、スイムキャップは髪を隠す。水着のときは脚が見える", () => {
    expect(hiddenParts(outfitOf("magician"), d, false).has("fist")).toBe(true);
    const swim = hiddenParts(outfitOf("swimmer"), d, false);
    expect(swim.has("hair")).toBe(true);
    expect(swim.has("shin")).toBe(false);
    expect(swim.has("ribs")).toBe(false);
  });
});
