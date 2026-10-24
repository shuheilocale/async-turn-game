import Phaser from "phaser";
import { Artillery, type Seat } from "@atg/core";
import {
  BARREL_H,
  BARREL_W,
  BODY_H,
  BODY_W,
  DAY,
  H,
  NIGHT,
  paintBarrel,
  paintBody,
  paintChunk,
  paintCloud,
  paintFire,
  paintGlow,
  paintOrb,
  paintRange,
  paintRing,
  paintShell,
  paintSky,
  paintSmoke,
  paintSoil,
  paintStars,
  paintTerrain,
  paintWarm,
  S,
  toX,
  toY,
  W,
  type Palette,
} from "./paint.ts";

/*
 * たまうちバトルの盤を Phaser で描く。盤（ArtilleryBoard）から dynamic import で読み込むので、
 * ほかの画面の読み込みは重くならない。操作（動く・指で引く・長押し）は盤の React 側で受け、
 * ここは見せるだけ（Phaser の入力は使わず、ページのスクロールをじゃましない）。
 * 動く道のりと弾の軌跡は @atg/core の drivePath・fly で、サーバと同じ計算をしたものを受け取る
 */

type Field = Artillery.Field;
type Point = readonly [number, number];

/** 止まっているときに見せるもの */
export interface Display {
  field: Field;
  ground: number[];
  /** これまでの爆発の跡（すすを描く） */
  soots: Point[];
  wind: number;
  /** 撃つ番の大砲（目印を出す）。だれも撃てないときは null */
  active: Seat | null;
  /** 砲身の向き（それぞれ最後に撃った向き） */
  angles: [number, number];
}

/** 再生する 1 発 */
export interface ShotPlay {
  seat: Seat;
  /** 撃つ前に動いた道のり（1 本ごとの位置。最初は動く前）。動かなかったら 1 つだけ（か空） */
  route: Artillery.Cannon[];
  angle: number;
  /** STEP 秒ごとの弾の位置 */
  path: [number, number][];
  impact: [number, number] | null;
  damage: [number, number];
  before: Display;
  after: Display;
}

export interface Labels {
  direct: string;
  out: string;
}

export interface ArtilleryView {
  /** 止まっている場を見せる。大砲が柱 1〜2 本だけ動いたときは、地形にそって滑らせる */
  show(d: Display): void;
  /** 狙いを見せる。preview は向きだけが分かる短い線。dragging は盤の上を指で引いているか */
  aim(seat: Seat, angle: number, preview: Point[], dragging: boolean): void;
  clearAim(): void;
  /** 1 発を再生する。爆発したときに onImpact を呼ぶ。終わったら（取り消されても）resolve */
  play(shot: ShotPlay, onImpact?: () => void): Promise<void>;
  cancel(): void;
  setDark(dark: boolean): void;
  setLabels(labels: Labels): void;
  /** 盤が画面の外にあるときは止めて、電池を使わないようにする */
  setAwake(awake: boolean): void;
  destroy(): void;
}

const FONT = '"Unbounded", "Zen Kaku Gothic New", system-ui, sans-serif';
/** 弾が上へ飛んだとき、画面が上へついていく上限（px） */
const RISE = 90;
/** 飛んでいる間のズーム */
const FLIGHT_ZOOM = 1.08;
/** 背景の奥行き（画面が動いたときの動き方。0 なら動かない、1 なら地形と同じ） */
const DEPTH = { stars: 0.03, orb: 0.06, far: 0.18, cloudFar: 0.28, near: 0.45, cloudNear: 0.65 };
/** 旗の布を何本の線で折るか */
const FLAG_SEGMENTS = 8;
/** 再生で、大砲が柱 1 本進むのにかける時間（ms） */
const DRIVE_MS = 75;
/** 自分で動かしているとき、柱 1 本ぶん滑らせる時間（ms）。押し続けたときの 1 本の間より少し短く */
const GLIDE_MS = 70;

const rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - (1 - t) * (1 - t);

interface CannonView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  barrel: Phaser.GameObjects.Image;
  angle: number;
  dead: boolean;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 滑らせている動き（自分で動かしているとき） */
  glide: Phaser.Tweens.Tween | null;
}

interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/** 再生中の 1 発 */
interface Running {
  shot: ShotPlay;
  onImpact?: () => void;
  resolve(): void;
  /** 弾を撃ち出した時刻（ms）。それまでは砲身を回している */
  start: number;
  /** 1 きざみを何 ms で見せるか */
  stepMs: number;
  /** 撃ち出したか */
  fired: boolean;
  /** 爆発した時刻。まだなら null */
  boom: number | null;
  /** 地形をけずり終えたか */
  dug: boolean;
  timers: Phaser.Time.TimerEvent[];
  tweens: Phaser.Tweens.Tween[];
}

class ArtilleryScene extends Phaser.Scene {
  pal: Palette = DAY;
  labels: Labels = { direct: "", out: "" };
  ready = false;
  onReady: (() => void) | null = null;

  private display: Display | null = null;
  /** 今描いている地形（掘れていく途中の形も） */
  private terrainNow: number[] = [];
  /** 描いてあるすすの数 */
  private paintedSoots = -1;
  private soilCanvas = document.createElement("canvas");
  private terrainTex!: Phaser.Textures.CanvasTexture;
  private clouds: Cloud[] = [];
  private cannons: CannonView[] = [];
  private marker!: Phaser.GameObjects.Triangle;
  /** 目印を出している大砲と位置（同じなら揺れの動きを作り直さない） */
  private markerAt = "";
  private flag!: Phaser.GameObjects.Graphics;
  private flagX = 0;
  private flagColors: [number, number] = [0, 0];
  /** 旗の布の頂点（毎コマ作り直さないよう使い回す） */
  private flagPts = {
    cloth: Array.from({ length: FLAG_SEGMENTS * 2 + 2 }, () => new Phaser.Math.Vector2()),
    stripe: Array.from({ length: FLAG_SEGMENTS * 2 + 2 }, () => new Phaser.Math.Vector2()),
  };
  private aimGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private edgeGfx!: Phaser.GameObjects.Graphics;
  private shell!: Phaser.GameObjects.Image;
  private shellGlow!: Phaser.GameObjects.Image;
  private trail: { x: number; y: number }[] = [];
  private fx!: {
    fire: Phaser.GameObjects.Particles.ParticleEmitter;
    sparks: Phaser.GameObjects.Particles.ParticleEmitter;
    smoke: Phaser.GameObjects.Particles.ParticleEmitter;
    debris: Phaser.GameObjects.Particles.ParticleEmitter;
    dust: Phaser.GameObjects.Particles.ParticleEmitter;
    tail: Phaser.GameObjects.Particles.ParticleEmitter;
  };
  private flash!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Image;
  private twinkles: Phaser.GameObjects.Image[] = [];
  private running: Running | null = null;
  private wind = 0;
  private seed = 0;
  /** 盤が止まっていた間は進まない時計（ms）。弾の位置はこれで決める */
  private clock = 0;

  constructor() {
    super({ key: "artillery" });
  }

  create() {
    // ---------- テクスチャ（Canvas 2D で描いて Phaser に渡す） ----------
    const canvas = (key: string, w: number, h: number) => this.textures.createCanvas(key, w, h)!;
    canvas("sky", 4, H);
    canvas("stars", W, H);
    canvas("orb", 220, 220);
    canvas("far", Math.round(W * 1.3), 300);
    canvas("near", Math.round(W * 1.3), 260);
    for (let i = 0; i < 3; i++) canvas(`cloud${i}`, 260, 110);
    this.terrainTex = canvas("terrain", W, H);
    for (const seat of [0, 1]) {
      // 末尾の x は壊れた大砲
      for (const end of ["", "x"]) {
        canvas(`body${seat}${end}`, BODY_W, BODY_H);
        canvas(`barrel${seat}${end}`, BARREL_W, BARREL_H);
      }
    }
    canvas("glow", 64, 64);
    canvas("fire", 64, 64);
    canvas("warm", 32, 32);
    canvas("smoke", 64, 64);
    canvas("dust", 48, 48);
    canvas("chunk", 12, 12);
    canvas("ring", 128, 128);
    canvas("shell", 14, 14);
    this.soilCanvas.width = W;
    this.soilCanvas.height = H;
    this.paintAll();

    // ---------- 奥から順に並べる ----------
    this.add.image(0, 0, "sky").setOrigin(0).setDisplaySize(W, H + RISE * 2).setScrollFactor(0);
    this.add.image(0, 0, "stars").setOrigin(0).setScrollFactor(DEPTH.stars);
    // 夜はいくつかの星がまたたく
    for (let i = 0; i < 7; i++) {
      const star = this.add
        .image(40 + ((i * 113) % (W - 80)), 30 + ((i * 71) % 220), "glow")
        .setScale(0.16)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScrollFactor(DEPTH.stars);
      this.tweens.add({ targets: star, alpha: 0.15, duration: 900 + i * 260, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.twinkles.push(star);
    }
    this.add.image(W * 0.86, H * 0.34, "orb").setScrollFactor(DEPTH.orb);
    this.add.image(W / 2, H * 0.72, "far").setOrigin(0.5, 0.5).setScrollFactor(DEPTH.far);
    this.clouds = [];
    this.addCloud(0, 140, 70, 0.55, DEPTH.cloudFar, 0.7);
    this.addCloud(1, 520, 110, 0.5, DEPTH.cloudFar, 0.7);
    this.add.image(W / 2, H * 0.8, "near").setOrigin(0.5, 0.5).setScrollFactor(DEPTH.near);
    this.addCloud(2, 330, 40, 0.85, DEPTH.cloudNear, 1);
    this.addCloud(0, 700, 150, 0.75, DEPTH.cloudNear, 1);

    this.add.image(0, 0, "terrain").setOrigin(0);
    this.flag = this.add.graphics();
    this.aimGfx = this.add.graphics();
    this.cannons = [0, 1].map((seat) => this.makeCannon(seat as Seat));
    this.marker = this.add.triangle(0, 0, 0, 0, 16, 0, 8, 11, 0xffffff).setOrigin(0.5, 0.5).setVisible(false);

    // ---------- 弾と爆発 ----------
    this.trailGfx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.fx = {
      tail: this.add.particles(0, 0, "warm", {
        emitting: false,
        frequency: 18,
        lifespan: 320,
        speed: { min: 0, max: 18 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.8, end: 0 },
        blendMode: "ADD",
      }),
      smoke: this.add.particles(0, 0, "smoke", {
        emitting: false,
        lifespan: { min: 1300, max: 2400 },
        speed: { min: 12, max: 70 },
        scale: { start: 0.55, end: 1.7 },
        alpha: { start: 0.7, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: -28,
      }),
      fire: this.add.particles(0, 0, "fire", {
        emitting: false,
        lifespan: { min: 300, max: 700 },
        speed: { min: 30, max: 230 },
        scale: { start: 1.7, end: 0.2 },
        alpha: { start: 1, end: 0 },
        blendMode: "ADD",
      }),
      sparks: this.add.particles(0, 0, "warm", {
        emitting: false,
        lifespan: { min: 380, max: 900 },
        speed: { min: 160, max: 470 },
        scale: { start: 0.45, end: 0 },
        gravityY: 560,
        blendMode: "ADD",
      }),
      debris: this.add.particles(0, 0, "chunk", {
        emitting: false,
        lifespan: { min: 900, max: 1400 },
        speed: { min: 110, max: 360 },
        angle: { min: 200, max: 340 },
        scale: { min: 0.5, max: 1.3 },
        rotate: { start: 0, end: 540 },
        gravityY: 920,
      }),
      dust: this.add.particles(0, 0, "dust", {
        emitting: false,
        lifespan: { min: 500, max: 900 },
        speed: { min: 20, max: 70 },
        angle: { min: 180, max: 360 },
        scale: { start: 0.25, end: 0.6 },
        alpha: { start: 0.5, end: 0 },
      }),
    };
    this.shellGlow = this.add.image(0, 0, "warm").setScale(1.1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.shell = this.add.image(0, 0, "shell").setVisible(false);
    this.flash = this.add.image(0, 0, "fire").setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.ring = this.add.image(0, 0, "ring").setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.edgeGfx = this.add.graphics();
    this.applyPalette();

    this.ready = true;
    this.onReady?.();
  }

  // ---------- 絵の具合 ----------

  /** テクスチャを今の配色で描き直す（ダークモードの切り替えでも呼ぶ） */
  paintAll() {
    const p = this.pal;
    const draw = (key: string, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
      const tex = this.textures.get(key) as Phaser.Textures.CanvasTexture;
      fn(tex.context, tex.width, tex.height);
      tex.refresh();
    };
    draw("sky", (ctx, w, h) => paintSky(ctx, w, h, p));
    draw("stars", (ctx, w, h) => paintStars(ctx, w, h, p, 3));
    draw("orb", (ctx, w) => paintOrb(ctx, w, p));
    this.paintRanges();
    for (let i = 0; i < 3; i++) draw(`cloud${i}`, (ctx, w, h) => paintCloud(ctx, w, h, p, 11 + i * 5));
    for (const seat of [0, 1] as const) {
      for (const dead of [false, true]) {
        const end = dead ? "x" : "";
        draw(`body${seat}${end}`, (ctx) => paintBody(ctx, seat, p, dead));
        draw(`barrel${seat}${end}`, (ctx) => paintBarrel(ctx, seat, p, dead));
      }
    }
    draw("glow", (ctx, w) => paintGlow(ctx, w));
    draw("fire", (ctx, w) => paintFire(ctx, w));
    draw("warm", (ctx, w) => paintWarm(ctx, w));
    draw("smoke", (ctx, w) => paintSmoke(ctx, w, p.smoke));
    draw("dust", (ctx, w) => paintSmoke(ctx, w, p.debris[0]));
    draw("chunk", (ctx, w) => paintChunk(ctx, w, p.debris));
    draw("ring", (ctx, w) => paintRing(ctx, w));
    draw("shell", (ctx, w) => paintShell(ctx, w));
    paintSoil(this.soilCanvas.getContext("2d")!, p);
    if (this.display) this.paintGround(this.terrainNow, this.display.ground, this.display.soots);
  }

  /** 遠くの山と手前の丘 */
  private paintRanges() {
    for (const [key, colors, seed, rough] of [
      ["far", this.pal.far, this.seed, 1.2],
      ["near", this.pal.near, this.seed + 7, 0.8],
    ] as const) {
      const tex = this.textures.get(key) as Phaser.Textures.CanvasTexture;
      paintRange(tex.context, tex.width, tex.height, colors, seed, rough);
      tex.refresh();
    }
  }

  setPalette(p: Palette) {
    this.pal = p;
    if (!this.ready) return;
    this.paintAll();
    this.applyPalette();
  }

  private applyPalette() {
    const p = this.pal;
    this.flagColors = [Phaser.Display.Color.HexStringToColor(p.flag[0]).color, Phaser.Display.Color.HexStringToColor(p.flag[1]).color];
    for (const s of this.twinkles) s.setVisible(p.dark);
    for (const c of this.clouds) c.img.setAlpha(p.cloudAlpha * (c.img.scrollFactorX < 0.5 ? 0.7 : 1));
  }

  private paintGround(terrain: readonly number[], ground: readonly number[], soots: readonly Point[]) {
    this.paintedSoots = soots.length;
    paintTerrain(this.terrainTex.context, this.soilCanvas, terrain, ground, soots, this.pal);
    this.terrainTex.refresh();
  }

  private addCloud(variant: number, x: number, y: number, scale: number, depth: number, speed: number) {
    const img = this.add.image(x, y, `cloud${variant}`).setScale(scale).setScrollFactor(depth);
    this.clouds.push({ img, speed });
  }

  private makeCannon(seat: Seat): CannonView {
    const barrel = this.add.image(0, -Artillery.PIVOT_H * S, `barrel${seat}`).setOrigin(0, 0.5);
    const body = this.add.image(0, 0, `body${seat}`).setOrigin(0.5, 1);
    const root = this.add.container(0, 0, [barrel, body]);
    const smoke = this.add.particles(0, 0, "smoke", {
      emitting: false,
      frequency: 160,
      lifespan: { min: 1600, max: 2400 },
      speed: { min: 8, max: 26 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.3, end: 1.1 },
      alpha: { start: 0.5, end: 0 },
      gravityY: -20,
    });
    return { root, body, barrel, angle: seat === 0 ? 45 : 135, dead: false, smoke, glide: null };
  }

  // ---------- 止まっている場 ----------

  show(d: Display) {
    if (this.running) return;
    this.display = d;
    this.wind = d.wind;
    // 遠くの山の形は、対局ごとの地形から決める（開き直しても同じ）
    const seed = Math.round(d.ground.reduce((a, b) => a + b, 0) * 100) || 1;
    if (seed !== this.seed) {
      this.seed = seed;
      this.paintRanges();
    }
    // 地形が変わっていなければ描き直さない（相手の手を待つ間、5 秒ごとに同じ場が届く）
    const same =
      d.soots.length === this.paintedSoots &&
      d.field.terrain.length === this.terrainNow.length &&
      d.field.terrain.every((h, c) => h === this.terrainNow[c]);
    this.terrainNow = d.field.terrain.slice();
    if (!same) this.paintGround(this.terrainNow, d.ground, d.soots);
    d.field.cannons.forEach((c, seat) => {
      this.cannons[seat]!.angle = d.angles[seat]!;
      this.placeCannon(seat as Seat, c, d.field.hp[seat]! <= 0);
    });
    this.placeFlag(d.field);
    this.setMarker(d.active, d.active === null ? undefined : d.field.cannons[d.active]);
    this.trailGfx.clear();
    this.shell.setVisible(false);
    this.shellGlow.setVisible(false);
    this.edgeGfx.clear();
  }

  /** 大砲を置く。柱 1〜2 本だけ横に動いたときは、少しの時間で滑らせて、車輪の下に土ぼこりを立てる */
  private placeCannon(seat: Seat, c: Artillery.Cannon, dead: boolean) {
    const v = this.cannons[seat]!;
    const x = toX(c.x);
    const y = toY(c.y);
    const dx = Math.abs(x - v.root.x);
    v.glide?.stop();
    v.glide = null;
    if (dx > 0.5 && dx <= 2.5 * S && this.ready) {
      v.glide = this.tweens.add({ targets: v.root, x, y, duration: GLIDE_MS, ease: "Linear" });
      this.fx.dust.explode(2, v.root.x, v.root.y);
    } else {
      v.root.setPosition(x, y);
    }
    this.setBarrel(seat, v.angle);
    this.setDead(seat, dead);
  }

  private setBarrel(seat: Seat, angle: number) {
    const v = this.cannons[seat]!;
    v.angle = angle;
    // 壊れた大砲の砲身は、向いていた側へうなだれる
    const shown = v.dead ? (angle <= 90 ? -18 : 198) : angle;
    v.barrel.setRotation(-rad(shown));
  }

  private setDead(seat: Seat, dead: boolean) {
    const v = this.cannons[seat]!;
    if (v.dead === dead) return;
    v.dead = dead;
    // 壊れた大砲は灰色の絵にかえて、煙を出し続ける
    const end = dead ? "x" : "";
    v.body.setTexture(`body${seat}${end}`);
    v.barrel.setTexture(`barrel${seat}${end}`);
    if (dead) {
      v.smoke.startFollow(v.root, 0, -22);
      v.smoke.start();
    } else {
      v.smoke.stop();
    }
    this.setBarrel(seat, v.angle);
  }

  /** 撃つ番の大砲の上の目印。大砲が動いたら、ついていく */
  private setMarker(active: Seat | null, c?: Artillery.Cannon) {
    const v = active === null ? null : this.cannons[active]!;
    const x = c ? toX(c.x) : (v?.root.x ?? 0);
    const y = c ? toY(c.y) : (v?.root.y ?? 0);
    const at = v ? `${active}:${x}:${y}:${this.pal.dark}` : "";
    if (at === this.markerAt) return;
    const moving = v !== null && this.markerAt.startsWith(`${active}:`) && this.marker.visible;
    this.markerAt = at;
    this.tweens.killTweensOf(this.marker);
    if (!v || active === null) {
      this.marker.setVisible(false);
      return;
    }
    this.marker.setVisible(true);
    this.marker.setFillStyle(Phaser.Display.Color.HexStringToColor(this.pal.seat[active][1]).color);
    // 動いている間は揺らさずについていく。止まったら上下にゆっくり揺らす
    if (moving) {
      this.tweens.add({ targets: this.marker, x, y: y - 60, duration: GLIDE_MS, ease: "Linear" });
      this.tweens.add({ targets: this.marker, y: "+=6", delay: GLIDE_MS + 240, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      return;
    }
    this.marker.setPosition(x, y - 60);
    this.tweens.add({ targets: this.marker, y: "+=6", duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /** 風の旗は、2 台の間でいちばん高い所に立てる */
  private placeFlag(field: Field) {
    const from = Math.floor(field.cannons[0].x) + 8;
    const to = Math.floor(field.cannons[1].x) - 8;
    let best = Math.round(Artillery.COLS / 2);
    for (let c = from; c < to; c++) if (field.terrain[c]! > field.terrain[best]!) best = c;
    this.flagX = best;
  }

  private drawFlag(time: number) {
    const g = this.flag;
    g.clear();
    if (!this.display) return;
    const x = toX(this.flagX + 0.5);
    const base = toY(this.terrainNow[this.flagX] ?? 0);
    const top = base - 46;
    const pole = this.pal.dark ? 0xc7cbd6 : 0x5d6677;
    g.lineStyle(3, pole, 1);
    g.lineBetween(x, base, x, top);
    g.fillStyle(pole, 1);
    g.fillCircle(x, top, 2.5);

    // 布：風が強いほど横になびき、速くはためく。無風なら垂れ下がる
    const strength = Math.min(1, Math.abs(this.wind) / Artillery.WIND_MAX);
    const dir = this.wind < 0 ? -1 : 1;
    const droop = (1 - strength) * 1.25 + 0.08;
    // u は竿から先へのびる向き、v は布の幅の向き（下向き）
    const ux = Math.cos(droop) * dir;
    const uy = Math.sin(droop);
    const vx = -uy * dir;
    const vy = Math.cos(droop);
    const len = 30 + strength * 6;
    const wide = 16;
    const t = time / 1000;
    const n = FLAG_SEGMENTS;
    const pts = this.flagPts;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const w = Math.sin(t * (3 + strength * 9) - k * 5) * (1.5 + strength * 2.5) * k;
      const ox = x + ux * len * k + vx * w;
      const oy = top + 2 + uy * len * k + vy * w;
      const h = wide * (1 - k * 0.25);
      // 0..n が上のふち、n+1..2n+1 が下のふち（逆向き）。帯は 4 本の線の間を塗る
      pts.cloth[i]!.set(ox, oy);
      pts.cloth[2 * n + 1 - i]!.set(ox + vx * h, oy + vy * h);
      pts.stripe[i]!.set(ox + vx * h * 0.38, oy + vy * h * 0.38);
      pts.stripe[2 * n + 1 - i]!.set(ox + vx * h * 0.62, oy + vy * h * 0.62);
    }
    g.fillStyle(this.flagColors[0], 1);
    g.fillPoints(pts.cloth, true);
    g.fillStyle(this.flagColors[1], 0.9);
    g.fillPoints(pts.stripe, true);
  }

  // ---------- 狙う ----------

  aim(seat: Seat, angle: number, preview: readonly Point[], dragging: boolean) {
    if (this.running) return;
    this.setBarrel(seat, angle);
    const g = this.aimGfx;
    g.clear();
    const color = Phaser.Display.Color.HexStringToColor(this.pal.seat[seat][1]).color;
    // 向きの線：砲口からまっすぐ少しだけ、だんだん薄く（強さは撃つまで決まらないので、落ちる先は見せない）
    preview.forEach(([x, y], i) => {
      const k = 1 - i / preview.length;
      g.fillStyle(0xffffff, 0.85 * k);
      g.fillCircle(toX(x), toY(y), 3.6);
      g.fillStyle(color, 0.9 * k);
      g.fillCircle(toX(x), toY(y), 2.2);
    });
    // 指で引いている間は、大砲の後ろへのびるゴムひも（長さは向きの目印だけで、強さには関係ない）
    if (dragging) {
      const v = this.cannons[seat]!;
      const px = v.root.x;
      const py = v.root.y - Artillery.PIVOT_H * S;
      const back = 52;
      const ex = px - Math.cos(rad(angle)) * back;
      const ey = py + Math.sin(rad(angle)) * back;
      g.lineStyle(3, color, 0.55);
      g.lineBetween(px, py, ex, ey);
      g.fillStyle(color, 0.35);
      g.fillCircle(ex, ey, 11);
      g.lineStyle(2.5, 0xffffff, 0.9);
      g.strokeCircle(ex, ey, 11);
    }
  }

  clearAim() {
    this.aimGfx.clear();
  }

  // ---------- 1 発の再生 ----------

  play(shot: ShotPlay, onImpact?: () => void): Promise<void> {
    this.finish();
    this.show(shot.before);
    // 再生は撃つ前の場から始める（滑らせている途中なら、そこで止めて置き直す）
    shot.before.field.cannons.forEach((c, seat) => {
      const v = this.cannons[seat]!;
      v.glide?.stop();
      v.glide = null;
      v.root.setPosition(toX(c.x), toY(c.y));
    });
    this.aimGfx.clear();
    this.setMarker(null);
    return new Promise((resolve) => {
      const v = this.cannons[shot.seat]!;
      // まず動いた道のりを進み（自分で撃ったときはもう動いている）、砲身を撃つ向きへ回してから撃つ
      const steps = Math.max(0, shot.route.length - 1);
      const driveMs = steps * DRIVE_MS;
      const turn = Math.abs(v.angle - shot.angle);
      const turnMs = turn < 1 ? 0 : Math.min(650, 250 + turn * 6);
      const run: Running = {
        shot,
        onImpact,
        resolve,
        start: this.clock + driveMs + (steps > 0 ? 160 : 0) + turnMs + 120,
        // 長く飛ぶ弾は少し速めて、待ち時間を 3.5 秒ほどまでにする
        stepMs: (Artillery.STEP * 1000) / Math.max(1, shot.path.length / 420),
        fired: false,
        boom: null,
        dug: false,
        timers: [],
        tweens: [],
      };
      this.running = run;
      if (steps > 0) {
        // 柱 1 本ずつ、地形にそって進む。進んでいる間は車輪の下に土ぼこりを立てる
        const at = { k: 0 };
        let dusted = 0;
        run.tweens.push(
          this.tweens.add({
            targets: at,
            k: steps,
            duration: driveMs,
            ease: "Linear",
            onUpdate: () => {
              const i = Math.min(steps - 1, Math.floor(at.k));
              const a = shot.route[i]!;
              const b = shot.route[i + 1]!;
              const t = at.k - i;
              v.root.setPosition(toX(lerp(a.x, b.x, t)), toY(lerp(a.y, b.y, t)));
              if (at.k >= dusted) {
                dusted += 2;
                this.fx.dust.explode(2, v.root.x, v.root.y);
              }
            },
          }),
        );
      }
      if (turnMs > 0) {
        const from = { a: v.angle };
        run.tweens.push(
          this.tweens.add({
            targets: from,
            a: shot.angle,
            delay: driveMs + (steps > 0 ? 160 : 0),
            duration: turnMs,
            ease: "Sine.easeInOut",
            onUpdate: () => this.setBarrel(shot.seat, from.a),
          }),
        );
      }
    });
  }

  /** 撃ち出す：砲口の光と煙、砲身の反動 */
  private fire(run: Running) {
    const { shot } = run;
    const end = shot.route[shot.route.length - 1];
    if (end) this.cannons[shot.seat]!.root.setPosition(toX(end.x), toY(end.y));
    this.setBarrel(shot.seat, shot.angle);
    const [mx, my] = shot.path[0]!;
    const x = toX(mx);
    const y = toY(my);
    this.flash.setPosition(x, y).setScale(0.4).setAlpha(1).setVisible(true);
    run.tweens.push(this.tweens.add({ targets: this.flash, scale: 1.2, alpha: 0, duration: 180, onComplete: () => this.flash.setVisible(false) }));
    this.fx.smoke.explode(4, x, y);
    const barrel = this.cannons[shot.seat]!.barrel;
    const kick = { k: 0 };
    run.tweens.push(
      this.tweens.add({
        targets: kick,
        k: 1,
        duration: 260,
        onUpdate: () => {
          const back = Math.sin(kick.k * Math.PI) * 4;
          barrel.setPosition(-Math.cos(rad(shot.angle)) * back, -Artillery.PIVOT_H * S + Math.sin(rad(shot.angle)) * back);
        },
      }),
    );
    this.trail = [];
    this.shell.setPosition(x, y).setVisible(true);
    this.shellGlow.setPosition(x, y).setVisible(true);
    this.fx.tail.startFollow(this.shell);
    this.fx.tail.start();
  }

  update(time: number, delta: number) {
    // 長く止まっていたあと（画面の外から戻ったときなど）に一気に進まないようにする
    const dt = Math.min(delta, 50) / 1000;
    this.clock += dt * 1000;
    // 雲は風下へ流れる（遠い雲ほどゆっくり）
    for (const c of this.clouds) {
      const v = (6 + this.wind * 5) * c.speed;
      c.img.x += v * dt;
      const half = c.img.displayWidth / 2;
      if (c.img.x > W + half + 60) c.img.x = -half - 60;
      if (c.img.x < -half - 60) c.img.x = W + half + 60;
    }
    this.drawFlag(time);
    const run = this.running;
    if (run) this.stepShot(run, this.clock, dt);
  }

  private stepShot(run: Running, time: number, dt: number) {
    const cam = this.cameras.main;
    const { path } = run.shot;
    if (run.boom === null && time >= run.start) {
      if (!run.fired) {
        run.fired = true;
        this.fire(run);
      }
      const f = (time - run.start) / run.stepMs;
      const i = Math.min(path.length - 1, Math.floor(f));
      const j = Math.min(path.length - 1, i + 1);
      const k = f - i;
      const x = toX(lerp(path[i]![0], path[j]![0], k));
      const y = toY(lerp(path[i]![1], path[j]![1], k));
      this.shell.setPosition(x, y);
      this.shellGlow.setPosition(x, y);
      this.trail.push({ x, y });
      if (this.trail.length > 28) this.trail.shift();
      this.drawTrail();
      this.drawEdgeMarker(x, y);
      // 画面は弾を少しズームして追いかける（背景は奥ほどゆっくり動く）
      const z = lerp(cam.zoom, FLIGHT_ZOOM, 1 - Math.exp(-dt * 3));
      cam.setZoom(z);
      const hw = W / (2 * z);
      const hh = H / (2 * z);
      const tx = Phaser.Math.Clamp(x, hw, W - hw);
      const ty = Phaser.Math.Clamp(y, -RISE + hh, H - hh);
      const cx = lerp(cam.midPoint.x, tx, 1 - Math.exp(-dt * 4));
      const cy = lerp(cam.midPoint.y, ty, 1 - Math.exp(-dt * 4));
      cam.centerOn(cx, cy);
      if (i >= path.length - 1) this.boom(run, time);
    } else if (run.boom !== null && this.trail.length > 0) {
      // 爆発のあと、尾が消えていく
      this.trail.shift();
      this.drawTrail();
    }
    if (run.boom !== null && run.shot.impact && !run.dug) {
      // 地形がけずれていく（最初の 0.25 秒）
      const t = Math.min(1, (time - run.boom) / 250);
      const from = run.shot.before.field.terrain;
      const to = run.shot.after.field.terrain;
      const e = ease(t);
      this.terrainNow = t >= 1 ? to.slice() : from.map((h, c) => lerp(h, to[c]!, e));
      this.paintGround(this.terrainNow, run.shot.after.ground, run.shot.after.soots);
      run.dug = t >= 1;
    }
  }

  private drawTrail() {
    const g = this.trailGfx;
    g.clear();
    const n = this.trail.length;
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      const k = i / n;
      g.lineStyle(2 + 8 * k, this.pal.trail, 0.18 * k);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(1 + 2.5 * k, 0xffffff, 0.75 * k);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  /** 弾が画面の上の外にあるとき、上の端に矢印を出す */
  private drawEdgeMarker(x: number, y: number) {
    const g = this.edgeGfx;
    g.clear();
    const view = this.cameras.main.worldView;
    if (y >= view.y) return;
    const ex = Phaser.Math.Clamp(x, view.x + 12, view.right - 12);
    const ey = view.y + 10;
    g.fillStyle(0xffffff, 0.9);
    g.fillTriangle(ex, ey - 6, ex - 7, ey + 6, ex + 7, ey + 6);
  }

  /** 爆発：光・火の玉・火花・煙・土のかけら・爆風の輪、画面の揺れ。地形がけずれ、ダメージの数字が浮かぶ */
  private boom(run: Running, time: number) {
    run.boom = time;
    this.shell.setVisible(false);
    this.shellGlow.setVisible(false);
    this.fx.tail.stop();
    this.edgeGfx.clear();
    const { shot } = run;
    run.onImpact?.();
    if (!shot.impact) {
      // 左右の端から外へ出た
      const last = shot.path[shot.path.length - 1]!;
      const x = Phaser.Math.Clamp(toX(last[0]), 40, W - 40);
      const y = Phaser.Math.Clamp(toY(last[1]), 60, H - 60);
      this.floatText(x, y, this.labels.out, "#ffffff", 26);
      run.timers.push(this.time.delayedCall(900, () => this.settle(run)));
      return;
    }
    const x = toX(shot.impact[0]);
    const y = toY(shot.impact[1]);
    const power = Math.max(shot.damage[0], shot.damage[1]);
    this.flash.setPosition(x, y).setScale(0.6).setAlpha(1).setVisible(true);
    run.tweens.push(this.tweens.add({ targets: this.flash, scale: 3.6, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => this.flash.setVisible(false) }));
    this.ring.setPosition(x, y).setScale(0.2).setAlpha(0.9).setVisible(true);
    run.tweens.push(this.tweens.add({ targets: this.ring, scale: 1.6, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => this.ring.setVisible(false) }));
    this.fx.fire.explode(26, x, y);
    this.fx.sparks.explode(26, x, y);
    this.fx.debris.explode(16, x, y);
    this.fx.smoke.accelerationX = this.wind * 6;
    this.fx.smoke.explode(9, x, y);
    this.cameras.main.shake(320, 0.006 + 0.012 * Math.min(1, power / Artillery.MAX_DAMAGE + 0.3));

    // ダメージの数字
    run.timers.push(
      this.time.delayedCall(80, () => {
        shot.damage.forEach((d, seat) => {
          if (d <= 0) return;
          const c = this.cannons[seat]!;
          const direct = d >= Artillery.MAX_DAMAGE * (1 - Artillery.CANNON_R / Artillery.BLAST_R) - 0.5;
          this.floatText(c.root.x, c.root.y - 40, `-${d}`, this.pal.damage, 34);
          if (direct) this.floatText(c.root.x, c.root.y - 74, this.labels.direct, "#ffffff", 20);
        });
      }),
    );
    // 足もとがけずれた大砲は下に落ちる
    run.timers.push(
      this.time.delayedCall(260, () => {
        shot.after.field.cannons.forEach((c, seat) => {
          const v = this.cannons[seat]!;
          const to = toY(c.y);
          if (Math.abs(v.root.y - to) < 0.5) return;
          run.tweens.push(
            this.tweens.add({
              targets: v.root,
              y: to,
              duration: 140 + Math.sqrt(Math.abs(to - v.root.y)) * 40,
              ease: "Quad.easeIn",
              onComplete: () => this.fx.dust.explode(8, v.root.x, v.root.y),
            }),
          );
        });
        shot.after.field.hp.forEach((hp, seat) => hp <= 0 && this.setDead(seat as Seat, true));
      }),
    );
    run.timers.push(this.time.delayedCall(1150, () => this.settle(run)));
  }

  /** 画面を元の大きさへ戻して、再生を終える */
  private settle(run: Running) {
    const cam = this.cameras.main;
    const from = { z: cam.zoom, x: cam.midPoint.x, y: cam.midPoint.y };
    const o = { t: 0 };
    run.tweens.push(
      this.tweens.add({
        targets: o,
        t: 1,
        duration: 520,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          cam.setZoom(lerp(from.z, 1, o.t));
          cam.centerOn(lerp(from.x, W / 2, o.t), lerp(from.y, H / 2, o.t));
        },
        onComplete: () => this.finish(),
      }),
    );
  }

  private floatText(x: number, y: number, text: string, color: string, size: number) {
    if (!text) return;
    const label = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#1a1d26", strokeThickness: Math.round(size / 5) })
      .setOrigin(0.5, 1)
      .setScale(0.6);
    this.tweens.add({ targets: label, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.tweens.add({ targets: label, y: y - 44, alpha: 0, delay: 650, duration: 900, ease: "Sine.easeIn", onComplete: () => label.destroy() });
  }

  /** 再生を終える（取り消しも）。最後の場を見せる */
  finish() {
    const run = this.running;
    if (!run) return;
    this.running = null;
    for (const t of run.timers) t.remove(false);
    for (const t of run.tweens) t.stop();
    this.fx.tail.stop();
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.centerOn(W / 2, H / 2);
    this.cannons[run.shot.seat]!.barrel.setPosition(0, -Artillery.PIVOT_H * S);
    this.show(run.shot.after);
    run.resolve();
  }

  /** 取り消し（送れなかったとき）：撃つ前の場に戻す */
  cancel() {
    const run = this.running;
    if (!run) return;
    run.shot = { ...run.shot, after: run.shot.before };
    this.finish();
  }
}

/** parent の中に盤を作る。Phaser.AUTO なので、WebGL が使えなければ Canvas で描く */
export function mount(parent: HTMLElement, options: { dark: boolean; labels: Labels }): ArtilleryView {
  const scene = new ArtilleryScene();
  scene.pal = options.dark ? NIGHT : DAY;
  scene.labels = options.labels;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: options.dark ? NIGHT.sky[1] : DAY.sky[1],
    banner: false,
    // 盤の操作は React 側で受ける（Phaser がタッチを取ってページのスクロールを止めないように）
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    autoFocus: false,
    disableContextMenu: false,
    render: { antialias: true, powerPreference: "low-power" },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER, expandParent: false },
    fps: { target: 60 },
    scene,
  });

  // シーンの準備ができるまでの呼び出しは、最後のものだけ覚えておく
  let pendingShow: Display | null = null;
  let pendingAim: Parameters<ArtilleryView["aim"]> | null = null;
  const whenReady = new Promise<void>((resolve) => {
    scene.onReady = () => {
      if (pendingShow) scene.show(pendingShow);
      if (pendingAim) scene.aim(...pendingAim);
      resolve();
    };
  });

  return {
    show(d) {
      if (scene.ready) scene.show(d);
      else pendingShow = d;
    },
    aim(...args) {
      if (scene.ready) scene.aim(...args);
      else pendingAim = args;
    },
    clearAim() {
      pendingAim = null;
      if (scene.ready) scene.clearAim();
    },
    async play(shot, onImpact) {
      await whenReady;
      return scene.play(shot, onImpact);
    },
    cancel() {
      if (scene.ready) scene.cancel();
    },
    setDark(dark) {
      scene.setPalette(dark ? NIGHT : DAY);
    },
    setLabels(labels) {
      scene.labels = labels;
    },
    setAwake(awake) {
      if (awake) game.loop.wake();
      else game.loop.sleep();
    },
    destroy() {
      scene.finish();
      game.destroy(true);
    },
  };
}
