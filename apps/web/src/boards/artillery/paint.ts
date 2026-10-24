import { Artillery } from "@atg/core";

/*
 * たまうちバトルの絵（テクスチャ）を、画像ファイルを使わずに Canvas 2D で描く。
 * Phaser の WebGL でも Canvas の描画でも同じに見えるよう、グラデーションはここで焼き込む。
 * 座標は px で、y は下向き。盤の内部の大きさは W × H（CSS で盤の幅に縮めて見せる）
 */

export const W = 800;
export const H = 640;
/** 柱 1 本（1 単位）の px */
export const S = W / Artillery.COLS;
export const toX = (x: number) => x * S;
export const toY = (y: number) => H - y * S;

export interface Palette {
  dark: boolean;
  /** 空の上・中・地平線のあたり */
  sky: [string, string, string];
  /** 太陽（夜は月） */
  orb: string;
  orbGlow: string;
  /** 遠くの山・手前の丘（上の色と、もやで薄くなる下の色） */
  far: [string, string];
  near: [string, string];
  cloud: string;
  cloudShade: string;
  cloudAlpha: number;
  soil: [string, string];
  strata: [string, string, string];
  pebble: [string, string];
  /** 地面のすぐ下の、少し濃い土 */
  topsoil: string;
  rock: [string, string];
  grass: [string, string, string];
  /** けずれて土がむき出しになったふち */
  scar: string;
  soot: string;
  /** 席の色（明るい・ふつう・暗い） */
  seat: [[string, string, string], [string, string, string]];
  tread: string;
  wheel: string;
  steel: [string, string, string];
  flag: [string, string];
  /**
   * 煙・土のかけら（明るい・暗い）の色。粒子の色は Phaser の tint を使わず、テクスチャに塗っておく
   * （tint は WebGL でしか効かないので、Canvas で描くときも同じに見えるように）
   */
  smoke: string;
  debris: [string, string];
  /** 弾の尾の線の色 */
  trail: number;
  damage: string;
}

export const DAY: Palette = {
  dark: false,
  sky: ["#3d8bd9", "#8cc4ee", "#e8f3fb"],
  orb: "#fff8de",
  orbGlow: "rgba(255, 233, 160, 0.55)",
  far: ["#9db9da", "#c9dcee"],
  near: ["#7ea98f", "#a9c8b4"],
  cloud: "#ffffff",
  cloudShade: "#d3e3f2",
  cloudAlpha: 0.95,
  soil: ["#b47d4d", "#5c3920"],
  strata: ["#9a683f", "#c4935f", "#86562f"],
  pebble: ["#e0bf96", "#6a4528"],
  topsoil: "rgba(72, 40, 18, 0.32)",
  rock: ["#6f6a65", "#47433f"],
  grass: ["#2f7d2d", "#4ea83c", "#8fd862"],
  scar: "#d6a676",
  soot: "rgba(34, 22, 12, 0.55)",
  seat: [
    ["#6b8dff", "#2b59f0", "#1a3aa8"],
    ["#ffab5c", "#f27a12", "#a9500a"],
  ],
  tread: "#2b303b",
  wheel: "#6b7486",
  steel: ["#a9b3c4", "#5d6677", "#2f3542"],
  flag: ["#e5484d", "#ffffff"],
  smoke: "#77716c",
  debris: ["#b47d4d", "#6a4428"],
  trail: 0xfff0b0,
  damage: "#ff4545",
};

export const NIGHT: Palette = {
  dark: true,
  sky: ["#060b20", "#142049", "#363a6e"],
  orb: "#f3f0e2",
  orbGlow: "rgba(190, 205, 255, 0.32)",
  far: ["#27325c", "#363d6c"],
  near: ["#1c3045", "#2a3a58"],
  cloud: "#5b6593",
  cloudShade: "#3c4570",
  cloudAlpha: 0.6,
  soil: ["#7a5436", "#2a1a10"],
  strata: ["#634229", "#8a603e", "#4f3420"],
  pebble: ["#a88763", "#3a2617"],
  topsoil: "rgba(0, 0, 0, 0.3)",
  rock: ["#4c4845", "#2b2826"],
  grass: ["#1c5530", "#2f8044", "#5cb868"],
  scar: "#9a7652",
  soot: "rgba(0, 0, 0, 0.5)",
  seat: [
    ["#9db2ff", "#6d8cff", "#3d55c4"],
    ["#ffc08a", "#ff9b3d", "#b8651b"],
  ],
  tread: "#1d2029",
  wheel: "#59617a",
  steel: ["#b4bdcf", "#69728a", "#363c4c"],
  flag: ["#ff6b6f", "#f2f2f2"],
  smoke: "#8a8f9e",
  debris: ["#8a603e", "#4a3020"],
  trail: 0xfff0b0,
  damage: "#ff6b6b",
};

/** 種から同じ並びを返す乱数（見た目の飾り用） */
export function rand(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/** "#rrggbb" に透明度を付ける */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** まるい光。stops は [位置, 色] */
function radial(ctx: Ctx, size: number, stops: [number, string][]) {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** 爆発の火の玉（白っぽい芯から黄色・オレンジへ） */
export function paintFire(ctx: Ctx, size: number) {
  radial(ctx, size, [
    [0, "rgba(255,255,236,1)"],
    [0.22, "rgba(255,226,130,0.95)"],
    [0.5, "rgba(255,140,40,0.6)"],
    [0.78, "rgba(230,70,20,0.18)"],
    [1, "rgba(200,40,10,0)"],
  ]);
}

/** 火花・弾のまわりの光（あたたかい白） */
export function paintWarm(ctx: Ctx, size: number) {
  radial(ctx, size, [
    [0, "rgba(255,255,250,1)"],
    [0.3, "rgba(255,240,180,0.85)"],
    [0.65, "rgba(255,200,90,0.25)"],
    [1, "rgba(255,180,60,0)"],
  ]);
}

export function paintSky(ctx: Ctx, w: number, h: number, p: Palette) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.sky[0]);
  g.addColorStop(0.58, p.sky[1]);
  g.addColorStop(1, p.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** 夜空の星（昼は何も描かない） */
export function paintStars(ctx: Ctx, w: number, h: number, p: Palette, seed: number) {
  ctx.clearRect(0, 0, w, h);
  if (!p.dark) return;
  const r = rand(seed);
  for (let i = 0; i < 150; i++) {
    const x = r() * w;
    const y = r() ** 1.6 * h * 0.8;
    const size = 0.5 + r() * 1.4;
    ctx.globalAlpha = (0.35 + r() * 0.6) * (1 - y / h);
    ctx.fillStyle = r() < 0.15 ? "#ffe9c4" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 小さく光る点（夜空でまたたく星・粒子） */
export function paintGlow(ctx: Ctx, size: number) {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.6, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** 太陽（夜は月）と、そのまわりの光 */
export function paintOrb(ctx: Ctx, size: number, p: Palette) {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, p.orbGlow);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const r = size * 0.17;
  ctx.fillStyle = p.orb;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  if (p.dark) {
    // 月の模様
    ctx.fillStyle = "rgba(160, 165, 190, 0.35)";
    for (const [dx, dy, rr] of [
      [-0.3, -0.2, 0.22],
      [0.25, 0.15, 0.3],
      [-0.05, 0.45, 0.14],
    ] as const) {
      ctx.beginPath();
      ctx.arc(c + dx * r, c + dy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 遠くの山なみ（丘）。尾根の線を波を重ねて作り、下へ行くほどもやで薄くする。
 * 下の端は盤の下までのばしておく（画面が上下に動いても、すき間が見えないように）
 */
export function paintRange(ctx: Ctx, w: number, h: number, colors: [string, string], seed: number, rough: number) {
  const r = rand(seed);
  const waves = Array.from({ length: 4 }, (_, i) => ({
    amp: (h * 0.16 * rough) / (i + 1),
    len: (w / (1.2 + r() * 1.5)) / (i * 1.6 + 1),
    phase: r() * Math.PI * 2,
  }));
  const ridge = (x: number) => h * 0.42 + waves.reduce((sum, wv) => sum + wv.amp * Math.sin((x / wv.len) * Math.PI * 2 + wv.phase), 0);
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, h * 0.1, 0, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, ridge(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // 尾根の明るいふち
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 6) (x === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, ridge(x) + 1);
  ctx.stroke();
}

/** ふんわりした雲。丸いかたまりをいくつか重ね、下の方を少し影の色にする */
export function paintCloud(ctx: Ctx, w: number, h: number, p: Palette, seed: number) {
  const r = rand(seed);
  ctx.clearRect(0, 0, w, h);
  const puffs = 6 + Math.floor(r() * 3);
  for (let i = 0; i < puffs; i++) {
    const t = (i + 0.5) / puffs;
    const x = w * (0.14 + 0.72 * t) + (r() - 0.5) * w * 0.06;
    const rad = h * (0.24 + 0.2 * Math.sin(t * Math.PI) + r() * 0.08);
    const y = h * 0.62 - rad * 0.35;
    const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    // ふちは同じ色のまま透明にする（白へ向かって薄くすると、夜の雲に明るい輪が出る）
    g.addColorStop(0, p.cloud);
    g.addColorStop(0.7, p.cloud);
    g.addColorStop(1, rgba(p.cloud, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // 下の方に影
  ctx.globalCompositeOperation = "source-atop";
  const shade = ctx.createLinearGradient(0, h * 0.35, 0, h);
  shade.addColorStop(0, rgba(p.cloudShade, 0));
  shade.addColorStop(1, p.cloudShade);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

/** 土の断面（地形の形で切り抜く前の、盤いっぱいの絵）。地層の帯・小石・岩盤 */
export function paintSoil(ctx: Ctx, p: Palette) {
  const r = rand(17);
  const g = ctx.createLinearGradient(0, toY(90), 0, H);
  g.addColorStop(0, p.soil[0]);
  g.addColorStop(1, p.soil[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 地層：ゆるく波打つ横の帯
  let i = 0;
  for (let level = 10; level < 100; level += 5 + r() * 7, i++) {
    const thick = 4 + r() * 12;
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    const phase = r() * Math.PI * 2;
    ctx.globalAlpha = 0.22 + r() * 0.2;
    ctx.fillStyle = p.strata[i % 3]!;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, toY(level) + Math.sin(x * freq + phase) * amp);
    for (let x = W; x >= 0; x -= 10) ctx.lineTo(x, toY(level) + Math.sin(x * freq + phase) * amp + thick);
    ctx.closePath();
    ctx.fill();
  }
  // 小石
  for (let k = 0; k < 340; k++) {
    const x = r() * W;
    const y = toY(100) + r() * (H - toY(100));
    ctx.globalAlpha = 0.3 + r() * 0.35;
    ctx.fillStyle = p.pebble[k % 3 === 0 ? 1 : 0];
    ctx.beginPath();
    ctx.ellipse(x, y, 1.4 + r() * 3.4, 1 + r() * 2.2, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // 細かいざらつき
  for (let k = 0; k < 2200; k++) {
    ctx.globalAlpha = 0.08 + r() * 0.12;
    ctx.fillStyle = k % 2 ? "#000" : "#fff";
    ctx.fillRect(r() * W, r() * H, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // 岩盤（これより下はけずれない）
  const top = toY(Artillery.MIN_GROUND) - 3;
  const rock = ctx.createLinearGradient(0, top, 0, H);
  rock.addColorStop(0, p.rock[0]);
  rock.addColorStop(1, p.rock[1]);
  ctx.fillStyle = rock;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) ctx.lineTo(x, top + (r() - 0.5) * 6);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

const surface = (terrain: readonly number[], c: number) => toY(terrain[Math.max(0, Math.min(Artillery.COLS - 1, c))]!);

/** 地形の表面の線（柱のまん中を結ぶ）。左右の端までのばす */
function surfacePath(ctx: Ctx, terrain: readonly number[]) {
  ctx.moveTo(0, surface(terrain, 0));
  for (let c = 0; c < Artillery.COLS; c++) ctx.lineTo(toX(c + 0.5), surface(terrain, c));
  ctx.lineTo(W, surface(terrain, Artillery.COLS - 1));
}

/**
 * 地形を描く。土の断面を地形の形で切り抜き、表面の下に濃い土の帯、爆発の跡にすす、
 * 表面には草（けずれた所は土がむき出しのふち）。草は最初の地形のままの柱にだけ生やす
 */
export function paintTerrain(
  ctx: Ctx,
  soil: CanvasImageSource,
  terrain: readonly number[],
  ground: readonly number[],
  soots: readonly (readonly [number, number])[],
  p: Palette,
) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  surfacePath(ctx, terrain);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(soil, 0, 0);

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = p.topsoil;
  ctx.lineWidth = 30;
  ctx.beginPath();
  surfacePath(ctx, terrain);
  ctx.stroke();
  ctx.lineWidth = 12;
  ctx.stroke();

  for (const [x, y] of soots) {
    const cx = toX(x);
    const cy = toY(y);
    const rad = Artillery.CRATER_R * S * 1.45;
    const g = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    g.addColorStop(0, p.soot);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  ctx.restore();

  // 表面のふち。草のある柱とない柱で、ひと続きずつ線を引く
  const grassy = (c: number) => terrain[c]! >= ground[c]! - 0.05;
  const runs: { grass: boolean; from: number; to: number }[] = [];
  for (let c = 0; c < Artillery.COLS; c++) {
    const g = grassy(c);
    const last = runs[runs.length - 1];
    if (last && last.grass === g) last.to = c;
    else runs.push({ grass: g, from: c, to: c });
  }
  const runPath = (from: number, to: number, dy = 0) => {
    ctx.beginPath();
    const x0 = from === 0 ? 0 : toX(from);
    ctx.moveTo(x0, (from === 0 ? surface(terrain, 0) : (surface(terrain, from - 1) + surface(terrain, from)) / 2) + dy);
    for (let c = from; c <= to; c++) ctx.lineTo(toX(c + 0.5), surface(terrain, c) + dy);
    const x1 = to === Artillery.COLS - 1 ? W : toX(to + 1);
    ctx.lineTo(x1, (to === Artillery.COLS - 1 ? surface(terrain, to) : (surface(terrain, to) + surface(terrain, to + 1)) / 2) + dy);
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const run of runs) {
    if (run.grass) {
      runPath(run.from, run.to, 2);
      ctx.strokeStyle = p.grass[0];
      ctx.lineWidth = 9;
      ctx.stroke();
      runPath(run.from, run.to, 0.5);
      ctx.strokeStyle = p.grass[1];
      ctx.lineWidth = 6;
      ctx.stroke();
      runPath(run.from, run.to, -1.5);
      ctx.strokeStyle = p.grass[2];
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      runPath(run.from, run.to, 1);
      ctx.strokeStyle = p.scar;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  // 草の葉。柱ごとに長さを少し変える
  ctx.strokeStyle = p.grass[2];
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let c = 0; c < Artillery.COLS; c++) {
    if (!grassy(c)) continue;
    const base = surface(terrain, c);
    for (const k of [0.2, 0.7]) {
      const len = 3 + (((c * 7919 + k * 13) % 11) / 11) * 5;
      const x = toX(c + k);
      ctx.moveTo(x, base - 1);
      ctx.lineTo(x + 1.5, base - 1 - len);
    }
  }
  ctx.stroke();
}

/** 大砲の大きさ（52 × 30 px の絵を何倍にして描くか） */
const CANNON_K = 1.2;
/** 大砲の車体（下のまん中が足もと）。キャタピラ・車輪・丸い砲塔 */
export const BODY_W = Math.round(52 * CANNON_K);
export const BODY_H = Math.round(30 * CANNON_K);
/** 壊れた大砲の色 */
const WRECK: [string, string, string] = ["#8d9099", "#5d6069", "#3a3c43"];

export function paintBody(ctx: Ctx, seat: 0 | 1, p: Palette, dead = false) {
  const [light, base, dark] = dead ? WRECK : p.seat[seat];
  ctx.clearRect(0, 0, BODY_W, BODY_H);
  ctx.save();
  ctx.scale(CANNON_K, CANNON_K);
  // 砲塔
  const g = ctx.createLinearGradient(0, 4, 0, 23);
  g.addColorStop(0, light);
  g.addColorStop(0.55, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, 23);
  ctx.lineTo(8, 16);
  ctx.quadraticCurveTo(26, -3, 44, 16);
  ctx.lineTo(46, 23);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // ふたと帯
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(26, 8.5, 5.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(9, 19);
  ctx.lineTo(43, 19);
  ctx.stroke();
  // つや
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 14);
  ctx.quadraticCurveTo(17, 7.5, 24, 6);
  ctx.stroke();
  // キャタピラと車輪
  ctx.fillStyle = p.tread;
  ctx.beginPath();
  ctx.roundRect(2, 20.5, 48, 9.5, 4.75);
  ctx.fill();
  for (const x of [9, 19.5, 32.5, 43]) {
    ctx.fillStyle = p.wheel;
    ctx.beginPath();
    ctx.arc(x, 25.25, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.tread;
    ctx.beginPath();
    ctx.arc(x, 25.25, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 砲身（左のまん中が付け根。長さは BARREL 単位） */
export const BARREL_W = Math.round(Artillery.BARREL * S) + 2;
export const BARREL_H = 13;
export function paintBarrel(ctx: Ctx, seat: 0 | 1, p: Palette, dead = false) {
  const len = Artillery.BARREL * S;
  const mid = BARREL_H / 2;
  ctx.clearRect(0, 0, BARREL_W, BARREL_H);
  const g = ctx.createLinearGradient(0, mid - 4.5, 0, mid + 4.5);
  g.addColorStop(0, p.steel[0]);
  g.addColorStop(0.45, p.steel[1]);
  g.addColorStop(1, p.steel[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, mid - 4, len - 3, 8, 2.4);
  ctx.fill();
  // 砲口のふち
  ctx.beginPath();
  ctx.roundRect(len - 6, mid - 5.5, 7.5, 11, 2);
  ctx.fill();
  ctx.strokeStyle = p.steel[2];
  ctx.lineWidth = 1;
  ctx.stroke();
  // 席の色の帯
  ctx.fillStyle = dead ? WRECK[1] : p.seat[seat][1];
  ctx.fillRect(len * 0.5, mid - 4, 4, 8);
}

/** 弾。黒い玉につや */
export function paintShell(ctx: Ctx, size: number) {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c - size * 0.15, c - size * 0.15, 1, c, c, c);
  g.addColorStop(0, "#9aa0ab");
  g.addColorStop(0.35, "#3a3f49");
  g.addColorStop(1, "#14171d");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c - 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** 煙のかたまり（ふちのぼやけた丸を少しずらして重ねる） */
export function paintSmoke(ctx: Ctx, size: number, color: string) {
  const r = rand(5);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 5; i++) {
    const x = size * (0.35 + r() * 0.3);
    const y = size * (0.35 + r() * 0.3);
    const rad = size * (0.22 + r() * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(color, 0.6));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}

/** 飛び散る土のかけら（上が明るい土、下が暗い土） */
export function paintChunk(ctx: Ctx, size: number, [light, dark]: [string, string]) {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(size * 0.1, size * 0.45);
  ctx.lineTo(size * 0.45, size * 0.08);
  ctx.lineTo(size * 0.92, size * 0.35);
  ctx.lineTo(size * 0.75, size * 0.9);
  ctx.lineTo(size * 0.25, size * 0.85);
  ctx.closePath();
  ctx.fill();
}

/** 爆風の輪 */
export function paintRing(ctx: Ctx, size: number) {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, c * 0.6, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.8, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}
