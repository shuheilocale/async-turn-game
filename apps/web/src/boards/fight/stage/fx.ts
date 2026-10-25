import * as THREE from "three";
import type { ShotKind } from "./track.ts";
import type { StageStrike } from "./types.ts";

/**
 * 新しい技の効果：飛ぶもの（トランプ・ロケットパンチ・光の玉・手裏剣・名刺・タピオカ）と、
 * 小さな粒（ハート・音符・きらめき・煙・湯気・回復の光・音の波）、ゲーマーの光の枠、ロボットの再起動の光の線とレーザー、
 * 体を包む光、忍者の残像。
 * どれも舞台を作るときに数を決めて作っておき、使い回す（見えていないものは描かない）
 */

/** 粒の形 */
export type Speck = "heart" | "note" | "star" | "smoke" | "orb" | "pixel" | "wave" | "coin";

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_FRONT = new THREE.Vector3(0, 0, 1);
const SPECKS = 56;
const CARDS = 4;
const SHURIKENS = 2;
const PEARLS = 6;
/** 放水の水の粒の数 */
const DROPS = 34;
/** 残像の長さ（秒） */
const GHOST_LIFE = 0.42;

/** 白い形を描いたテクスチャ（色は材質の色でつける） */
function shapeTexture(kind: Speck) {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  switch (kind) {
    case "heart": {
      g.beginPath();
      g.moveTo(32, 54);
      g.bezierCurveTo(6, 36, 6, 12, 22, 12);
      g.bezierCurveTo(28, 12, 32, 18, 32, 22);
      g.bezierCurveTo(32, 18, 36, 12, 42, 12);
      g.bezierCurveTo(58, 12, 58, 36, 32, 54);
      g.fill();
      break;
    }
    case "note": {
      // 八分音符（たま・ぼう・はた）
      g.beginPath();
      g.ellipse(24, 46, 10, 7.5, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(31, 12, 5, 34);
      g.beginPath();
      g.moveTo(36, 12);
      g.quadraticCurveTo(52, 20, 48, 34);
      g.quadraticCurveTo(46, 24, 36, 22);
      g.fill();
      break;
    }
    case "star": {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.7)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 6 : 32;
        g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case "smoke": {
      // もくもくした煙（ふちのやわらかい、いくつかの丸）
      for (const [x, y, r] of [
        [32, 34, 20],
        [20, 28, 13],
        [44, 26, 14],
        [30, 20, 12],
      ] as const) {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(0.6, "rgba(255,255,255,0.6)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
      }
      break;
    }
    case "orb": {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      break;
    }
    case "pixel": {
      g.fillRect(14, 14, 36, 36);
      break;
    }
    case "wave": {
      // 音の波：右へふくらむ弧（「)」の形）。向きは粒を回してそろえる
      g.lineCap = "round";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(10, 32, 30, -0.9, 0.9);
      g.stroke();
      break;
    }
    case "coin": {
      // コイン：明るい円に、少し暗いふちと内側の輪（色は材質で金にする。模様や文字は描かない）
      g.beginPath();
      g.arc(32, 32, 27, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(150,150,150,1)";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(32, 32, 25, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(32, 32, 16, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.ellipse(24, 22, 6, 3, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** トランプの表（白地に、その人の色のふちとひし形） */
function cardTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf6";
  g.beginPath();
  g.roundRect(2, 2, 60, 92, 8);
  g.fill();
  g.strokeStyle = "#c9c4b8";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "#d8344a";
  g.beginPath();
  g.moveTo(32, 26);
  g.lineTo(46, 48);
  g.lineTo(32, 70);
  g.lineTo(18, 48);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 名刺（白い紙に、名前と連絡先のような灰色の線。ロゴや社名は描かない） */
function meishiTexture() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfbf8";
  g.fillRect(0, 0, 96, 64);
  // 明るい舞台でも見えるよう、ふちを濃くし、左に紺の帯を入れる
  g.strokeStyle = "#7d828f";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 92, 60);
  g.fillStyle = "#2b3550";
  g.fillRect(4, 4, 10, 56);
  g.fillStyle = "#2a2d36";
  g.fillRect(30, 24, 46, 8);
  g.fillStyle = "#8d919b";
  g.fillRect(22, 12, 26, 4);
  g.fillRect(22, 42, 58, 4);
  g.fillRect(22, 50, 44, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 手裏剣（4 つの刃の、平たい星。XY 面、半径 1） */
function shurikenGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 4;
    const r = i % 2 ? 0.28 : 1;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.05);
  return g;
}

/** 光るグラフ（薄い目もりと、右肩上がりの折れ線・先の矢印）。下向きは上下を返して使う */
function chartTexture() {
  const W = 256;
  const H = 160;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = 2;
  for (let y = 30; y < H; y += 30) {
    g.beginPath();
    g.moveTo(10, y);
    g.lineTo(W - 10, y);
    g.stroke();
  }
  const pts: [number, number][] = [
    [14, 134],
    [58, 112],
    [92, 120],
    [134, 82],
    [168, 92],
    [214, 40],
  ];
  g.lineJoin = "round";
  g.lineCap = "round";
  g.shadowColor = "#fff";
  g.shadowBlur = 12;
  g.strokeStyle = "#fff";
  g.lineWidth = 14;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  // 矢印の先
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(240, 14);
  g.lineTo(196, 30);
  g.lineTo(226, 58);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 光るレコード（暗い盤に細い溝、明るいふちとラベル。色は材質でその人の色にする） */
function vinylTexture() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const R = S / 2 - 14;
  // 盤のまわりの光
  const halo = g.createRadialGradient(S / 2, S / 2, R - 4, S / 2, S / 2, S / 2);
  halo.addColorStop(0, "rgba(255,255,255,0.9)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.fillStyle = "rgba(24,24,32,0.95)";
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.lineWidth = 1;
  for (let r = 18; r < R - 3; r += 4) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // 光の筋（回っているのが分かるように、盤の上の 2 か所を明るく）
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 3;
  for (const a of [0, Math.PI]) {
    g.beginPath();
    g.arc(S / 2, S / 2, R - 10, a - 0.5, a + 0.2);
    g.stroke();
  }
  g.lineWidth = 3;
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(S / 2, S / 2, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(20,20,26,1)";
  g.beginPath();
  g.arc(S / 2, S / 2, 3, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 画面のような光の枠（四隅の印と、横線） */
function frameTexture() {
  const W = 256;
  const H = 160;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#fff";
  g.shadowColor = "#fff";
  g.shadowBlur = 10;
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(14, 14, W - 28, H - 28, 14);
  g.stroke();
  g.lineWidth = 9;
  for (const [x, y, dx, dy] of [
    [10, 10, 1, 1],
    [W - 10, 10, -1, 1],
    [10, H - 10, 1, -1],
    [W - 10, H - 10, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(x, y + dy * 30);
    g.lineTo(x, y);
    g.lineTo(x + dx * 30, y);
    g.stroke();
  }
  g.shadowBlur = 0;
  g.globalAlpha = 0.28;
  g.fillStyle = "#fff";
  for (let y = 26; y < H - 26; y += 8) g.fillRect(26, y, W - 52, 2);
  g.globalAlpha = 0.85;
  // 体力のゲージのような 2 本の棒
  g.fillRect(36, 34, 90, 9);
  g.fillRect(W - 126, 34, 90, 9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface SpeckState {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vel: THREE.Vector3;
  grow: number;
  size: number;
  spin: number;
  gravity: number;
  /** 揺れながら進む（音符） */
  sway: number;
  alpha: number;
}

interface Shot {
  kind: ShotKind;
  result: StageStrike["result"];
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 経過時間（攻防の時計で進む）と、届くまでの時間 */
  age: number;
  flight: number;
  /** 戻る先（ロケットパンチの腕） */
  home: (() => THREE.Vector3) | null;
  back: number;
  done: boolean;
  /** 届いたあとの落ち方（トランプ） */
  fall: THREE.Vector3[];
}

export class StageFx {
  readonly group = new THREE.Group();
  private readonly tex: Record<Speck, THREE.Texture>;
  private readonly specks: SpeckState[] = [];
  private next = 0;
  private readonly cardTex = cardTexture();
  private readonly cardGeo = new THREE.PlaneGeometry(0.1, 0.145);
  private readonly cards: THREE.Mesh[] = [];
  private readonly orb: THREE.Sprite;
  private readonly orbCore: THREE.Sprite;
  private readonly rocket: THREE.Group;
  private readonly flame: THREE.Sprite;
  private readonly frame: THREE.Mesh;
  private readonly frameTex = frameTexture();
  private readonly rings: THREE.Mesh[] = [];
  private readonly aura: THREE.Sprite;
  private readonly cardMat: THREE.MeshBasicMaterial;
  private readonly meishiMat: THREE.MeshBasicMaterial;
  private readonly shurikens: THREE.Mesh[] = [];
  /** タピオカの粒（1 回の描画でまとめて描く） */
  private readonly pearls: THREE.InstancedMesh;
  private readonly ice: THREE.InstancedMesh;
  /** 金色のコイン（タピオカと同じ飛び方で、くるくる回る） */
  private readonly coins: THREE.InstancedMesh;
  /** 放水の水の粒（筒先から相手へ、1 回の描画でまとめて描く） */
  private readonly drops: THREE.InstancedMesh;
  private readonly dropQ = new THREE.Quaternion();
  private readonly dropS = new THREE.Vector3();
  /** 光るグラフ・光るレコード・足もとの光の輪 */
  private readonly chart: THREE.Mesh;
  private readonly chartTex = chartTexture();
  private readonly vinyl: THREE.Mesh;
  private readonly vinylTex = vinylTexture();
  private readonly floorRing: THREE.Mesh;
  private readonly euler = new THREE.Euler();
  private readonly pearlVel: THREE.Vector3[] = [];
  private readonly pearlPos: THREE.Vector3[] = [];
  private readonly m4 = new THREE.Matrix4();
  /** レーザー：外側の光（その人の色）と白い芯、目もとと当たる所の光 */
  private readonly beam: THREE.Mesh;
  private readonly beamCore: THREE.Mesh;
  private readonly beamEnds: THREE.Sprite[] = [];
  /** 残像：同じ形をまとめて描く（形ごとに 1 回の描画） */
  private readonly ghosts = new Map<THREE.BufferGeometry, THREE.InstancedMesh>();
  private readonly ghostMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false });
  private ghostLife = 0;
  private shot: Shot | null = null;
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly dirV = new THREE.Vector3();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly camera: THREE.Camera) {
    this.tex = {
      heart: shapeTexture("heart"),
      note: shapeTexture("note"),
      star: shapeTexture("star"),
      smoke: shapeTexture("smoke"),
      orb: shapeTexture("orb"),
      pixel: shapeTexture("pixel"),
      wave: shapeTexture("wave"),
      coin: shapeTexture("coin"),
    };
    for (let i = 0; i < SPECKS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.star, transparent: true, depthWrite: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 12;
      this.group.add(sprite);
      this.specks.push({ sprite, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0, size: 0.1, spin: 0, gravity: 0, sway: 0, alpha: 1 });
    }
    // トランプと名刺は同じ板を使い、材質（絵）と縦横の比を変える
    this.cardMat = new THREE.MeshBasicMaterial({ map: this.cardTex, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const meishiTex = meishiTexture();
    this.meishiMat = new THREE.MeshBasicMaterial({ map: meishiTex, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.disposables.push(this.cardMat, this.meishiMat, meishiTex, this.cardGeo);
    for (let i = 0; i < CARDS; i++) {
      const m = new THREE.Mesh(this.cardGeo, this.cardMat);
      m.visible = false;
      this.group.add(m);
      this.cards.push(m);
    }
    // 手裏剣：黒い鉄の星
    const starGeo = shurikenGeometry();
    // 明るい舞台でも形が見えるよう、黒に近い色で、金属の映り込みは控えめにする
    const starMat = new THREE.MeshStandardMaterial({ color: "#1d2026", roughness: 0.4, metalness: 0.45 });
    this.disposables.push(starGeo, starMat);
    for (let i = 0; i < SHURIKENS; i++) {
      const m = new THREE.Mesh(starGeo, starMat);
      m.scale.setScalar(0.085);
      m.visible = false;
      this.group.add(m);
      this.shurikens.push(m);
    }
    // タピオカ：黒くつやのある粒
    const pearlGeo = new THREE.SphereGeometry(0.03, 12, 8);
    const pearlMat = new THREE.MeshStandardMaterial({ color: "#241a16", roughness: 0.18, metalness: 0.1 });
    this.disposables.push(pearlGeo, pearlMat);
    this.pearls = new THREE.InstancedMesh(pearlGeo, pearlMat, PEARLS);
    this.pearls.frustumCulled = false;
    this.pearls.visible = false;
    this.group.add(this.pearls);
    // 氷のかけら：すき通った水色の小さな角（タピオカと同じ飛び方）
    const iceGeo = new THREE.BoxGeometry(0.045, 0.04, 0.035);
    const iceMat = new THREE.MeshStandardMaterial({ color: "#cfeaff", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 });
    this.disposables.push(iceGeo, iceMat);
    this.ice = new THREE.InstancedMesh(iceGeo, iceMat, PEARLS);
    this.ice.frustumCulled = false;
    this.ice.visible = false;
    this.group.add(this.ice);
    // 金色のコイン
    const coinGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.009, 18);
    const coinMat = new THREE.MeshStandardMaterial({ color: "#e9bf4f", roughness: 0.25, metalness: 0.85 });
    this.disposables.push(coinGeo, coinMat);
    this.coins = new THREE.InstancedMesh(coinGeo, coinMat, PEARLS);
    this.coins.frustumCulled = false;
    this.coins.visible = false;
    this.group.add(this.coins);
    for (let i = 0; i < PEARLS; i++) {
      this.pearlVel.push(new THREE.Vector3());
      this.pearlPos.push(new THREE.Vector3());
    }
    // 放水：すき通った水色の粒を、流れの向きに少し伸ばして並べる
    const dropGeo = new THREE.SphereGeometry(1, 8, 6);
    const dropMat = new THREE.MeshStandardMaterial({ color: "#9fd8ff", roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.9, emissive: "#2f74a8" });
    this.disposables.push(dropGeo, dropMat);
    this.drops = new THREE.InstancedMesh(dropGeo, dropMat, DROPS);
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    this.group.add(this.drops);
    // 光るグラフ（左から描いていく）・光るレコード・足もとの光の輪
    this.chartTex.wrapS = THREE.ClampToEdgeWrapping;
    this.chart = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.chartTex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    );
    this.vinyl = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      new THREE.MeshBasicMaterial({ map: this.vinylTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    );
    this.floorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
    );
    for (const m of [this.chart, this.vinyl, this.floorRing]) {
      m.visible = false;
      m.renderOrder = 12;
      m.frustumCulled = false;
      this.group.add(m);
    }
    // レーザー（上下が開いた筒を、2 点のあいだに伸ばす）
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.disposables.push(beamGeo);
    const beamMat = (color: string) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.beam = new THREE.Mesh(beamGeo, beamMat("#ff3b3b"));
    this.beamCore = new THREE.Mesh(beamGeo, beamMat("#ffffff"));
    this.beam.visible = this.beamCore.visible = false;
    this.beam.renderOrder = this.beamCore.renderOrder = 12;
    this.beam.frustumCulled = this.beamCore.frustumCulled = false;
    this.group.add(this.beam, this.beamCore);
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.orb, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.visible = false;
      s.renderOrder = 12;
      this.group.add(s);
      this.beamEnds.push(s);
    }
    const glow = (map: THREE.Texture) => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    // 光の玉：その人の色の玉（明るい舞台でも見えるよう、ふつうに重ねる）と、白く光る芯
    this.orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.orb, transparent: true, depthWrite: false, fog: false }));
    this.orbCore = glow(this.tex.orb);
    this.orb.visible = this.orbCore.visible = false;
    this.orb.renderOrder = this.orbCore.renderOrder = 12;
    this.group.add(this.orb, this.orbCore);
    // ロケットパンチ：金属のこぶしと、後ろの炎
    this.rocket = new THREE.Group();
    const fistGeo = new THREE.BoxGeometry(0.13, 0.12, 0.14);
    const fistMat = new THREE.MeshStandardMaterial({ color: "#b9c0cb", roughness: 0.3, metalness: 0.75 });
    const cuffGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.05, 12).rotateX(Math.PI / 2);
    const cuffMat = new THREE.MeshStandardMaterial({ color: "#1f2228", roughness: 0.45 });
    this.disposables.push(fistGeo, fistMat, cuffGeo, cuffMat);
    const fist = new THREE.Mesh(fistGeo, fistMat);
    const cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.z = -0.08;
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.orb, transparent: true, depthWrite: false, fog: false }));
    this.flame.position.z = -0.16;
    this.flame.material.color.set("#ff9a2e");
    this.rocket.add(fist, cuff, this.flame);
    this.rocket.visible = false;
    this.group.add(this.rocket);
    // 光の枠
    this.frame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.29),
      new THREE.MeshBasicMaterial({ map: this.frameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    this.frame.visible = false;
    this.frame.renderOrder = 12;
    this.group.add(this.frame);
    // 再生の光の線（体のまわりを上へ走る輪）
    const ringGeo = new THREE.TorusGeometry(0.32, 0.006, 4, 40).rotateX(Math.PI / 2);
    this.disposables.push(ringGeo);
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      r.visible = false;
      r.renderOrder = 12;
      this.group.add(r);
      this.rings.push(r);
    }
    // 体を包むやわらかい光（回復）
    this.aura = glow(this.tex.orb);
    // 床や体に切られないよう、いつも手前に重ねる（やわらかい光なので体の上でもうるさくない）
    this.aura.material.depthTest = false;
    this.aura.visible = false;
    this.aura.renderOrder = 7;
    this.group.add(this.aura);
  }

  /** 粒を 1 つ出す */
  spawn(
    kind: Speck,
    at: THREE.Vector3,
    vel: THREE.Vector3,
    o: { color: string; size: number; life: number; grow?: number; spin?: number; gravity?: number; sway?: number; alpha?: number; additive?: boolean; rot?: number },
  ) {
    const s = this.specks[this.next]!;
    this.next = (this.next + 1) % SPECKS;
    const m = s.sprite.material;
    if (m.map !== this.tex[kind]) {
      m.map = this.tex[kind];
      m.needsUpdate = true;
    }
    const add = o.additive ?? (kind === "star" || kind === "orb");
    if ((m.blending === THREE.AdditiveBlending) !== add) {
      m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    m.color.set(o.color);
    m.rotation = o.rot ?? (Math.random() - 0.5) * 0.6;
    s.sprite.position.copy(at);
    s.sprite.visible = true;
    s.vel.copy(vel);
    s.life = s.max = o.life;
    s.size = o.size;
    s.grow = o.grow ?? 0;
    s.spin = o.spin ?? 0;
    s.gravity = o.gravity ?? 0;
    s.sway = o.sway ?? 0;
    s.alpha = o.alpha ?? 1;
    s.sprite.scale.setScalar(o.size);
  }

  /** 飛ぶものを放つ。flight 秒（攻防の時計）で to に届く */
  launch(kind: ShotKind, from: THREE.Vector3, to: THREE.Vector3, flight: number, result: StageStrike["result"], color: string, home: (() => THREE.Vector3) | null, back: number) {
    this.clearShot();
    this.shot = { kind, result, from: from.clone(), to: to.clone(), age: 0, flight: Math.max(0.05, flight), home, back, done: false, fall: [] };
    if (kind === "orb") {
      this.orb.material.color.set(color);
      this.orbCore.material.color.set("#ffffff");
    }
    if (kind === "cards" || kind === "meishi")
      for (const c of this.cards) {
        c.material = kind === "meishi" ? this.meishiMat : this.cardMat;
        // 名刺は横長（91 × 55 mm くらい）
        c.scale.set(kind === "meishi" ? 1.1 : 1, kind === "meishi" ? 0.46 : 1, 1);
      }
    if (kind === "pearls" || kind === "ice" || kind === "coins") {
      // 粒ごとに少しずつ違う向き・速さで飛ばす（山なりに）
      for (let i = 0; i < PEARLS; i++) {
        this.pearlPos[i]!.copy(from);
        this.pearlVel[i]!.set((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5);
      }
    }
  }

  private clearShot() {
    this.shot = null;
    this.cards.forEach((c) => (c.visible = false));
    this.shurikens.forEach((c) => (c.visible = false));
    this.pearls.visible = this.ice.visible = this.coins.visible = false;
    this.orb.visible = this.orbCore.visible = false;
    this.rocket.visible = false;
  }

  /**
   * レーザー：from（目）から to（相手の胸）へ光の線を伸ばす。reach は 0〜1 の伸び（1 で届いた）、k は明るさ
   */
  showLaser(from: THREE.Vector3, to: THREE.Vector3, reach: number, k: number, color: string) {
    const on = k > 0.01 && reach > 0;
    this.beam.visible = this.beamCore.visible = on;
    this.beamEnds[0]!.visible = on;
    this.beamEnds[1]!.visible = on && reach >= 1;
    if (!on) return;
    const end = this.v.copy(from).lerp(to, Math.min(1, reach));
    const dir = this.dirV.subVectors(end, from);
    const len = Math.max(0.001, dir.length());
    const mid = this.v2.copy(from).add(end).multiplyScalar(0.5);
    const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 18);
    for (const [m, r] of [
      [this.beam, 0.024],
      [this.beamCore, 0.008],
    ] as const) {
      m.position.copy(mid);
      m.quaternion.setFromUnitVectors(Y_UP, dir.normalize());
      m.scale.set(r * flicker * (0.6 + 0.4 * k), len, r * flicker * (0.6 + 0.4 * k));
      (m.material as THREE.MeshBasicMaterial).opacity = k;
    }
    (this.beam.material as THREE.MeshBasicMaterial).color.set(color);
    const [a, b] = this.beamEnds as [THREE.Sprite, THREE.Sprite];
    a.position.copy(from);
    a.scale.setScalar(0.16 * flicker * k);
    a.material.color.set(color);
    b.position.copy(end);
    b.scale.setScalar(0.3 * flicker * k);
    b.material.color.set("#ffffff");
  }

  /**
   * 残像：root の下の見えている形を、いまの位置のまま半透明で写しとる（同じ形はまとめて 1 回で描く）。
   * しばらくその場に残り、薄れて消える
   */
  ghost(root: THREE.Object3D, color: string) {
    const groups = new Map<THREE.BufferGeometry, THREE.Matrix4[]>();
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let list = groups.get(m.geometry);
      if (!list) groups.set(m.geometry, (list = []));
      list.push(m.matrixWorld);
    });
    for (const im of this.ghosts.values()) im.visible = false;
    for (const [geo, list] of groups) {
      let im = this.ghosts.get(geo);
      if (!im || im.instanceMatrix.count < list.length) {
        if (im) {
          this.group.remove(im);
          im.dispose();
        }
        im = new THREE.InstancedMesh(geo, this.ghostMat, Math.max(8, list.length));
        im.frustumCulled = false;
        im.renderOrder = 6;
        this.group.add(im);
        this.ghosts.set(geo, im);
      }
      list.forEach((mat, i) => im!.setMatrixAt(i, mat));
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
      im.visible = true;
    }
    this.ghostMat.color.set(color);
    this.ghostLife = GHOST_LIFE;
  }

  private stepGhost(dt: number) {
    if (this.ghostLife <= 0) return;
    this.ghostLife -= dt;
    const u = Math.max(0, this.ghostLife / GHOST_LIFE);
    this.ghostMat.opacity = 0.5 * u;
    if (this.ghostLife <= 0) for (const im of this.ghosts.values()) im.visible = false;
  }

  /**
   * 放水：from（筒先）から to（相手の胸）へ、水の粒の線を走らせる。reach は 0〜1 の伸び（1 で届いた）、k は勢い。
   * 粒は時間とともに先へ流れ、先ほど太く広がる。少しだけ下へたわむ
   */
  showWater(from: THREE.Vector3, to: THREE.Vector3, reach: number, k: number, time: number) {
    const on = k > 0.01 && reach > 0;
    this.drops.visible = on;
    if (!on) return;
    const dir = this.dirV.subVectors(to, from);
    const len = dir.length();
    const flow = (time * 3.2) % 1;
    for (let i = 0; i < DROPS; i++) {
      const s = ((i + flow) / DROPS) * Math.min(1, reach);
      const p = this.v.copy(from).addScaledVector(dir, s);
      p.y -= 0.12 * s * s * len;
      // 先へ行くほどばらけて太くなる
      const r = (0.022 + 0.03 * s) * k;
      p.x += Math.sin(i * 12.9 + time * 9) * 0.02 * s;
      p.z += Math.cos(i * 7.3 + time * 8) * 0.02 * s;
      this.dropQ.setFromUnitVectors(Y_UP, this.v2.copy(dir).normalize());
      this.m4.compose(p, this.dropQ, this.dropS.set(r, r * 2.4, r));
      this.drops.setMatrixAt(i, this.m4);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }

  /**
   * 光るグラフを at に、カメラへ向けて出す。reveal は 0〜1 の描きかけ（左から描く）、dir = -1 で下向き、k は明るさ
   */
  showChart(at: THREE.Vector3, reveal: number, dir: 1 | -1, k: number, color: string) {
    this.chart.visible = k > 0.01 && reveal > 0;
    if (!this.chart.visible) return;
    const w = 0.52;
    const r = Math.min(1, reveal);
    this.chartTex.repeat.set(r, 1);
    this.chart.quaternion.copy(this.camera.quaternion);
    // 左の端をそろえたまま、右へ伸ばす
    const right = this.v.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.chart.position.copy(at).addScaledVector(right, -(1 - r) * w * 0.5);
    this.chart.scale.set(w * r, 0.32 * dir, 1);
    const m = this.chart.material as THREE.MeshBasicMaterial;
    m.color.set(color);
    m.opacity = k;
  }

  /** 光るレコード：at（手の下）に、少しカメラへ傾けて寝かせる。angle で回す */
  showVinyl(at: THREE.Vector3, angle: number, k: number, color: string) {
    this.vinyl.visible = k > 0.01;
    if (!this.vinyl.visible) return;
    this.vinyl.position.copy(at);
    // 床と平らな向きから、カメラのほうへ起こす
    const toCam = this.v.subVectors(this.camera.position, at).setY(0).normalize();
    this.vinyl.quaternion.setFromUnitVectors(Z_FRONT, this.v2.set(toCam.x * 0.75, 0.66, toCam.z * 0.75).normalize());
    this.vinyl.rotateZ(angle);
    this.vinyl.scale.setScalar(0.2 * Math.min(1, 0.4 + k));
    const m = this.vinyl.material as THREE.MeshBasicMaterial;
    m.color.set(color);
    m.opacity = k;
  }

  /** 足もとに静かに広がる光の輪（u は 0〜1 の進み） */
  showFloorRing(at: THREE.Vector3, u: number, k: number, color: string) {
    this.floorRing.visible = k > 0.01;
    if (!this.floorRing.visible) return;
    this.floorRing.position.set(at.x, 0.012, at.z);
    this.floorRing.scale.setScalar(0.3 + 0.6 * u);
    const m = this.floorRing.material as THREE.MeshBasicMaterial;
    m.color.set(color);
    m.opacity = k * (1 - 0.5 * u);
  }

  /** 光の枠を、at（胸の前）に出す。k は 0〜1 の明るさ */
  showFrame(at: THREE.Vector3, k: number, color: string) {
    this.frame.visible = k > 0.01;
    if (!this.frame.visible) return;
    this.frame.position.copy(at);
    this.frame.quaternion.copy(this.camera.quaternion);
    const m = this.frame.material as THREE.MeshBasicMaterial;
    m.color.set(color);
    m.opacity = k * (0.75 + 0.25 * Math.sin(performance.now() / 40));
    this.frame.scale.set(0.6 + 0.4 * Math.min(1, k * 1.5), 0.3 + 0.7 * Math.min(1, k * 1.5), 1);
  }

  /** 体のまわりを上へ走る光の輪（y は高さ、k は明るさ） */
  showRings(center: THREE.Vector3, ys: [number, number], k: number, color: string) {
    this.rings.forEach((r, i) => {
      r.visible = k > 0.01;
      if (!r.visible) return;
      r.position.set(center.x, ys[i]!, center.z);
      const m = r.material as THREE.MeshBasicMaterial;
      m.color.set(color);
      m.opacity = k;
    });
  }

  /** 体を包むやわらかい光 */
  showAura(at: THREE.Vector3, k: number, color: string) {
    this.aura.visible = k > 0.01;
    if (!this.aura.visible) return;
    this.aura.position.copy(at);
    this.aura.material.color.set(color);
    this.aura.material.opacity = 0.55 * k;
    // 立っているときは縦長に、寝ているときは丸く包む
    this.aura.scale.set(1.0, Math.min(1.7, Math.max(1.0, at.y * 1.5)), 1);
  }

  /** realDt はいつもの時間、exDt は攻防の時計（当たった瞬間に止まる）で進んだ時間 */
  update(realDt: number, exDt: number) {
    for (const s of this.specks) {
      if (s.life <= 0) continue;
      s.life -= realDt;
      if (s.life <= 0) {
        s.sprite.visible = false;
        continue;
      }
      const u = 1 - s.life / s.max;
      s.vel.y -= s.gravity * realDt;
      s.sprite.position.addScaledVector(s.vel, realDt);
      if (s.sway) s.sprite.position.y += Math.cos(u * 14) * s.sway * realDt;
      s.sprite.scale.setScalar(s.size * (1 + s.grow * u) * Math.min(1, u * 8));
      s.sprite.material.rotation += s.spin * realDt;
      s.sprite.material.opacity = s.alpha * Math.min(1, (1 - u) * 2.5);
    }
    this.stepShot(exDt);
    this.stepGhost(realDt);
  }

  private stepShot(dt: number) {
    const s = this.shot;
    if (!s) return;
    s.age += dt;
    const u = s.age / s.flight;
    const passes = s.result === "dodged" || s.result === "whiff";
    const stop = s.result === "blocked" ? 0.86 : 1;
    const dir = this.dirV.subVectors(s.to, s.from);
    if (s.kind === "rocket") {
      this.rocket.visible = true;
      const out = passes ? 1.25 : stop;
      let pos: THREE.Vector3;
      if (u <= out) pos = this.v.copy(s.from).addScaledVector(dir, u);
      else {
        // 戻ってくる
        const tip = this.v.copy(s.from).addScaledVector(dir, out);
        const home = s.home ? s.home() : s.from;
        const k = Math.min(1, (s.age - s.flight * out) / Math.max(0.05, s.back));
        pos = tip.lerp(home, k * k * (3 - 2 * k));
        if (k >= 1) {
          this.clearShot();
          return;
        }
      }
      this.rocket.position.copy(pos);
      this.rocket.lookAt(this.v3.copy(pos).add(dir));
      this.flame.visible = u <= out;
      this.flame.scale.setScalar(0.14 + 0.06 * Math.random());
      if (u <= out && Math.random() < 0.7) this.spawn("smoke", this.v3.copy(pos).addScaledVector(dir, -0.2 / Math.max(0.01, dir.length())), this.v2.set(0, 0.2, 0), { color: "#d9dce3", size: 0.08, life: 0.4, grow: 1.5, alpha: 0.7 });
      return;
    }
    if (s.kind === "orb") {
      const end = passes ? 1.7 : stop;
      if (u > end + 0.15) {
        this.clearShot();
        return;
      }
      const k = Math.min(u, end);
      this.orb.position.copy(s.from).addScaledVector(dir, k);
      this.orbCore.position.copy(this.orb.position);
      const fade = u > end ? 1 - (u - end) / 0.15 : 1;
      const grow = Math.min(1, u * 4 + 0.3);
      this.orb.visible = this.orbCore.visible = true;
      this.orb.scale.setScalar(0.42 * grow * fade * (1 + 0.1 * Math.sin(s.age * 60)));
      this.orbCore.scale.setScalar(0.2 * grow * fade);
      this.orb.material.opacity = 0.85 * fade;
      this.orbCore.material.opacity = fade;
      // 通ったあとに、光の粒を残す
      if (u < end && Math.random() < 0.8)
        this.spawn("star", this.orb.position, this.v2.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3), { color: this.orb.material.color.getStyle(), size: 0.07, life: 0.35, additive: false });
      return;
    }
    if (s.kind === "shuriken") {
      // 手裏剣：2 枚を少しずらして、水平に近い向きで速く回しながら飛ばす。防がれたら落ち、当たったら止まって消える
      for (let i = 0; i < SHURIKENS; i++) {
        const c = this.shurikens[i]!;
        const ui = u - i * 0.18;
        c.visible = ui > 0;
        if (!c.visible) continue;
        const end = passes ? 1.8 : stop;
        if (ui <= end) {
          c.position.copy(s.from).addScaledVector(dir, ui);
          c.position.y += (i - 0.5) * 0.08 * Math.min(1, ui * 2);
          // 刃の形が見えるよう、カメラのほうへ少し起こして回す
          c.quaternion.copy(this.camera.quaternion);
          c.rotateX(-0.6);
          c.rotateZ(-s.age * 40 - i);
          // 風を切る白い筋
          if (Math.random() < 0.6) this.spawn("star", c.position, this.v2.set(0, 0, 0), { color: "#ffffff", size: 0.06, life: 0.18, additive: false, alpha: 0.8 });
          s.fall[i] = (s.fall[i] ?? new THREE.Vector3()).set((Math.random() - 0.5) * 0.4, s.result === "blocked" ? 0.9 : 0, s.result === "blocked" ? -0.8 : 0);
        } else if (s.result === "blocked" || passes) {
          const v = s.fall[i]!;
          v.y -= 4 * dt;
          c.position.addScaledVector(v, dt);
          c.rotation.z += dt * 10;
          if (c.position.y < 0.02 || ui > end + 1.5) c.visible = false;
        } else c.visible = ui < end + 0.3;
      }
      if (u > 4) this.clearShot();
      return;
    }
    if (s.kind === "pearls" || s.kind === "ice" || s.kind === "coins") {
      // タピオカ（氷・コイン）：山なりに、ばらけて飛ぶ。届いたら（防がれたら）はねて床へ落ちる。氷とコインはくるくる回る
      const mesh = s.kind === "ice" ? this.ice : s.kind === "coins" ? this.coins : this.pearls;
      mesh.visible = true;
      const end = passes ? 1.6 : stop;
      let alive = false;
      for (let i = 0; i < PEARLS; i++) {
        const p = this.pearlPos[i]!;
        const ui = u - i * 0.05;
        if (ui <= 0) p.copy(s.from);
        else if (ui <= end) {
          p.copy(s.from).addScaledVector(dir, ui);
          // 山なり（真ん中で高く）と、粒ごとのばらつき
          p.y += 0.22 * Math.sin(Math.PI * Math.min(1, ui)) + ((i % 3) - 1) * 0.06 * ui;
          p.x += ((i % 2) - 0.5) * 0.12 * ui;
          p.z += ((i % 3) - 1) * 0.08 * ui;
        } else {
          const v = this.pearlVel[i]!;
          v.y -= 5 * dt;
          p.addScaledVector(v, dt);
          if (p.y < 0.024) {
            p.y = 0.024;
            v.set(v.x * 0.5, Math.abs(v.y) * 0.35, v.z * 0.5);
          }
        }
        if (ui < end + 1.4) alive = true;
        if (s.kind === "ice") this.m4.makeRotationFromEuler(this.euler.set(s.age * 9 + i, s.age * 7, i * 0.7)).setPosition(p);
        else if (s.kind === "coins") this.m4.makeRotationFromEuler(this.euler.set(s.age * 14 + i, i * 0.9, s.age * 5)).setPosition(p);
        else this.m4.makeTranslation(p.x, p.y, p.z);
        mesh.setMatrixAt(i, this.m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (s.kind !== "pearls" && u < end && Math.random() < 0.5)
        this.spawn("star", this.pearlPos[0]!, this.v2.set(0, 0.2, 0), { color: s.kind === "coins" ? "#fff1b8" : "#e6f6ff", size: 0.07, life: 0.25, additive: false });
      if (!alive) this.clearShot();
      return;
    }
    // トランプ（名刺）：少しずつずらして扇のように飛ばし、くるくる回す
    for (let i = 0; i < CARDS; i++) {
      const c = this.cards[i]!;
      const ui = u - i * 0.12;
      if (ui <= 0) {
        c.visible = false;
        continue;
      }
      c.visible = true;
      const spread = (i - (CARDS - 1) / 2) * 0.07;
      const end = passes ? 1.8 : stop;
      if (ui <= end) {
        c.position.copy(s.from).addScaledVector(dir, ui);
        c.position.y += spread * Math.sin(Math.PI * Math.min(1, ui)) + 0.05 * Math.sin(Math.PI * Math.min(1, ui));
        c.position.x += spread * 0.5 * ui;
        if (s.kind === "meishi") {
          // 名刺は白くて小さいので、表をカメラへ向け、ゆっくり回して見せる
          c.quaternion.copy(this.camera.quaternion);
          c.rotateX(-0.5);
          c.rotateZ(s.age * 14 + i);
        } else c.rotation.set(Math.PI / 2 - 0.3, 0, s.age * 30 + i);
        s.fall[i] = (s.fall[i] ?? new THREE.Vector3()).set((Math.random() - 0.5) * 0.6, s.result === "blocked" ? 0.8 : 0.3, s.result === "blocked" ? -0.9 : -0.2);
      } else {
        // 届いた（防がれた）あとは、ひらひら落ちる
        const v = s.fall[i]!;
        v.y -= 3.2 * dt;
        c.position.addScaledVector(v, dt);
        c.rotation.x += dt * 6;
        c.rotation.z += dt * 4;
        if (c.position.y < 0.03 || ui > end + 2.2) c.visible = false;
      }
    }
    if (u > 4) this.clearShot();
  }

  dispose() {
    for (const t of Object.values(this.tex)) t.dispose();
    this.cardTex.dispose();
    this.frameTex.dispose();
    for (const s of this.specks) s.sprite.material.dispose();
    this.orb.material.dispose();
    this.orbCore.material.dispose();
    this.flame.material.dispose();
    this.aura.material.dispose();
    this.frame.geometry.dispose();
    (this.frame.material as THREE.Material).dispose();
    this.rings.forEach((r) => (r.material as THREE.Material).dispose());
    this.disposables.forEach((d) => d.dispose());
    this.pearls.dispose();
    this.ice.dispose();
    this.coins.dispose();
    this.drops.dispose();
    this.chartTex.dispose();
    this.vinylTex.dispose();
    for (const m of [this.chart, this.vinyl, this.floorRing]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    (this.beam.material as THREE.Material).dispose();
    (this.beamCore.material as THREE.Material).dispose();
    this.beamEnds.forEach((s) => s.material.dispose());
    this.ghosts.forEach((im) => im.dispose());
    this.ghostMat.dispose();
  }
}
