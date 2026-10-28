import { Billiards } from "@atg/core";
import { CUSHIONS, CUSHION_D, KNUCKLE_R, POCKETS, RAIL_W } from "./table.ts";
import { qMatrix, type Quat, type Shown } from "./playback.ts";
import type { Guide } from "./aim.ts";
import { BALL_WHITE, ballColor } from "./colors.ts";

/**
 * ビリヤードの台を canvas 2D に描く。台（レール・ラシャ・ポケット・クッション）は大きさが変わったときだけ
 * 裏の canvas に描いておき、毎コマはそれを写して、上に球とねらいの線を描く。
 *
 * 球は 1 個ずつ小さな画像を、画素ごとに計算して作る（上から見た球の面の点を、球の向きで回して、
 * 帯・番号の丸・番号の字のどこに当たるかを決め、光の当たり方で明るさを付ける）。転がると帯と番号が回る。
 * 向きが変わらない球は作り直さない
 */

const { HALF_L, HALF_W, BALL_R, HEAD_X, FOOT_X, CUE, TABLE_L, TABLE_W } = Billiards;

/** 台の外側（レールの外の端）の大きさ */
const OUT_L = HALF_L + CUSHION_D + RAIL_W;
const OUT_W = HALF_W + CUSHION_D + RAIL_W;
/** 台の外側の縦横比（長い辺 / 短い辺） */
export const TABLE_ASPECT = OUT_L / OUT_W;

const WHITE = BALL_WHITE;
const INK: [number, number, number] = [26, 26, 30];

export interface Layout {
  /** 台を縦に置く（ブレイクする側が下） */
  vertical: boolean;
  /** 1 m が何 px か（CSS の px） */
  scale: number;
  width: number;
  height: number;
}

/** 画面の上の向きを台の座標で */
export const upOf = (layout: Pick<Layout, "vertical">): [number, number] => (layout.vertical ? [1, 0] : [0, 1]);

/** 幅 width・高さの上限 maxHeight に収まる台の大きさ */
export function layoutFor(width: number, maxHeight: number, vertical: boolean): Layout {
  const [w, h] = vertical ? [2 * OUT_W, 2 * OUT_L] : [2 * OUT_L, 2 * OUT_W];
  const scale = Math.max(40, Math.min(width / w, maxHeight / h));
  return { vertical, scale, width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** 台の座標 → 画面（CSS px） */
export function toScreen(l: Layout, x: number, y: number): [number, number] {
  const cx = l.width / 2;
  const cy = l.height / 2;
  return l.vertical ? [cx - y * l.scale, cy - x * l.scale] : [cx + x * l.scale, cy - y * l.scale];
}

/** 画面（CSS px） → 台の座標 */
export function toTable(l: Layout, sx: number, sy: number): [number, number] {
  const cx = l.width / 2;
  const cy = l.height / 2;
  return l.vertical ? [-(sy - cy) / l.scale, -(sx - cx) / l.scale] : [(sx - cx) / l.scale, -(sy - cy) / l.scale];
}

/** 台の座標の向き（ラジアン）→ 画面の向き */
export const screenAngle = (l: Layout, a: number) => (l.vertical ? -a - Math.PI / 2 : -a);

export interface Scene {
  balls: Shown[];
  /** ねらいのガイド（打てるときだけ）。bad なら、最初に当たるのが当ててはいけない球（線を赤く） */
  guide?: { cue: { x: number; y: number }; angle: number; power: number; guide: Guide; bad?: boolean } | null;
  /** 光らせる球（ねらってよい球）。pulse は光り方の強さ（0〜1） */
  targets?: { ids: ReadonlySet<number>; pulse: number } | null;
  /** 手球を置ける（フリーボール・ブレイク）。dragging なら動かしている途中 */
  placing?: { dragging: boolean } | null;
}

/** 番号の字の形（0〜1 の濃さ）。字の大きさは MASK × MASK */
const MASK = 40;

export class TableRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private layout: Layout | null = null;
  private dpr = 1;
  private sprites = new Map<number, { canvas: HTMLCanvasElement; key: string; data: ImageData }>();
  private masks = new Map<number, Float32Array>();
  private shadow: HTMLCanvasElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /** 大きさを決める。dpr は 2 まで（なめらかさを優先） */
  resize(layout: Layout, dpr: number) {
    const d = Math.min(2, Math.max(1, dpr));
    const same = this.layout && this.layout.width === layout.width && this.layout.height === layout.height && this.layout.vertical === layout.vertical && this.dpr === d;
    this.layout = layout;
    this.dpr = d;
    if (same) return;
    this.canvas.width = Math.round(layout.width * d);
    this.canvas.height = Math.round(layout.height * d);
    this.canvas.style.width = `${layout.width}px`;
    this.canvas.style.height = `${layout.height}px`;
    this.bg = this.drawTable();
    this.sprites.clear();
    this.shadow = null;
  }

  /** 台の座標をそのまま使って描けるように、canvas の変換を決める */
  private tableTransform(ctx: CanvasRenderingContext2D) {
    const l = this.layout!;
    const s = l.scale * this.dpr;
    const cx = (l.width / 2) * this.dpr;
    const cy = (l.height / 2) * this.dpr;
    if (l.vertical) ctx.setTransform(0, -s, -s, 0, cx, cy);
    else ctx.setTransform(s, 0, 0, -s, cx, cy);
  }

  private drawTable(): HTMLCanvasElement {
    const bg = document.createElement("canvas");
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const ctx = bg.getContext("2d")!;
    this.tableTransform(ctx);
    const ix = HALF_L + CUSHION_D;
    const iy = HALF_W + CUSHION_D;

    // レール（木の枠）。外の角は丸く、内へ向かって少し明るく
    const wood = ctx.createLinearGradient(0, -OUT_W, 0, OUT_W);
    wood.addColorStop(0, "#3a2419");
    wood.addColorStop(0.5, "#4b2f21");
    wood.addColorStop(1, "#3a2419");
    ctx.fillStyle = wood;
    roundRect(ctx, -OUT_L, -OUT_W, 2 * OUT_L, 2 * OUT_W, 0.05);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.004;
    roundRect(ctx, -OUT_L + 0.008, -OUT_W + 0.008, 2 * OUT_L - 0.016, 2 * OUT_W - 0.016, 0.044);
    ctx.stroke();

    // ラシャ（クッションの外の端まで）。まん中が少し明るい
    const felt = ctx.createRadialGradient(0, 0, 0.05, 0, 0, HALF_L * 1.15);
    felt.addColorStop(0, "#2f8a6a");
    felt.addColorStop(1, "#1f644c");
    ctx.fillStyle = felt;
    ctx.fillRect(-ix, -iy, 2 * ix, 2 * iy);
    // 木の枠の内側の影
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.006;
    ctx.strokeRect(-ix, -iy, 2 * ix, 2 * iy);

    // 目印（ダイヤモンド）：長い辺に 7 つずつ、短い辺に 3 つずつ
    ctx.fillStyle = "rgba(240,232,214,0.85)";
    const railMid = RAIL_W / 2 + CUSHION_D;
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      const x = -HALF_L + (i * TABLE_L) / 8;
      for (const sy of [-1, 1]) diamond(ctx, x, sy * (HALF_W + railMid), 0.009);
    }
    for (let i = 1; i < 4; i++) {
      const y = -HALF_W + (i * TABLE_W) / 4;
      for (const sx of [-1, 1]) diamond(ctx, sx * (HALF_L + railMid), y, 0.009);
    }

    // ヘッドストリングと、ヘッドスポット・フットスポット
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 0.003;
    ctx.beginPath();
    ctx.moveTo(HEAD_X, -HALF_W);
    ctx.lineTo(HEAD_X, HALF_W);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    for (const x of [HEAD_X, FOOT_X]) {
      ctx.beginPath();
      ctx.arc(x, 0, 0.006, 0, Math.PI * 2);
      ctx.fill();
    }

    // ポケットの穴
    for (const p of POCKETS) {
      const g = ctx.createRadialGradient(p.hole[0], p.hole[1], p.holeR * 0.2, p.hole[0], p.hole[1], p.holeR);
      g.addColorStop(0, "#050607");
      g.addColorStop(0.75, "#0d0f12");
      g.addColorStop(1, "#1d1a17");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.hole[0], p.hole[1], p.holeR, 0, Math.PI * 2);
      ctx.fill();
    }

    // クッション。先（球が当たる所）に細い明るい線
    for (const c of CUSHIONS) {
      ctx.fillStyle = "#226d53";
      ctx.beginPath();
      c.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
      for (const [x, y] of c.knuckles) {
        ctx.beginPath();
        ctx.arc(x, y, KNUCKLE_R, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 0.003;
      ctx.beginPath();
      ctx.moveTo(c.nose[0][0], c.nose[0][1]);
      ctx.lineTo(c.nose[1][0], c.nose[1][1]);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 0.004;
      ctx.beginPath();
      const [a, b] = c.nose;
      const n: [number, number] = [b[1] - a[1], a[0] - b[0]];
      const l = Math.hypot(n[0], n[1]);
      // クッションの先の、台の内側に落ちる薄い影
      const off = 0.004;
      ctx.moveTo(a[0] - (n[0] / l) * off, a[1] - (n[1] / l) * off);
      ctx.lineTo(b[0] - (n[0] / l) * off, b[1] - (n[1] / l) * off);
      ctx.stroke();
    }
    return bg;
  }

  /** 画素の大きさ（device px）での球の半径 */
  private ballPx() {
    return BALL_R * this.layout!.scale * this.dpr;
  }

  private maskOf(id: number): Float32Array {
    let m = this.masks.get(id);
    if (m) return m;
    const c = document.createElement("canvas");
    c.width = c.height = MASK;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = String(id);
    ctx.font = `700 ${text.length > 1 ? 23 : 27}px "Unbounded", system-ui, sans-serif`;
    ctx.fillText(text, MASK / 2, MASK / 2 + 1.5, MASK * 0.86);
    const img = ctx.getImageData(0, 0, MASK, MASK).data;
    m = new Float32Array(MASK * MASK);
    for (let i = 0; i < m.length; i++) m[i] = img[i * 4 + 3]! / 255;
    this.masks.set(id, m);
    return m;
  }

  /** 球の画像（向き q で）。向きが同じなら前に作ったものを使う */
  private spriteOf(id: number, q: Quat): HTMLCanvasElement {
    const r = this.ballPx();
    const size = Math.ceil(r * 2) + 2;
    const key = `${size}|${q.map((v) => v.toFixed(3)).join(",")}`;
    let s = this.sprites.get(id);
    if (s && s.key === key) return s.canvas;
    if (!s || s.canvas.width !== size) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      s = { canvas, key: "", data: canvas.getContext("2d")!.createImageData(size, size) };
      this.sprites.set(id, s);
    }
    s.key = key;
    paintBall(s.data, size, r, id, q, upOf(this.layout!), id === CUE ? null : this.maskOf(id));
    s.canvas.getContext("2d")!.putImageData(s.data, 0, 0);
    return s.canvas;
  }

  private shadowSprite(): HTMLCanvasElement {
    if (this.shadow) return this.shadow;
    const r = this.ballPx();
    const size = Math.ceil(r * 3.2);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, r * 0.3, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(0.55, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    this.shadow = c;
    return c;
  }

  draw(scene: Scene) {
    const l = this.layout;
    if (!l || !this.bg) return;
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);

    const r = this.ballPx();
    const guide = scene.guide;
    if (guide) this.drawGuide(guide);

    // ねらってよい球の下に、ぼんやりした光
    const lit = scene.targets ? scene.balls.filter((b) => scene.targets!.ids.has(b.id)) : [];
    const pulse = scene.targets?.pulse ?? 0;
    for (const b of lit) {
      const [sx, sy] = toScreen(l, b.x, b.y);
      const g = ctx.createRadialGradient(sx * d, sy * d, r * 0.9, sx * d, sy * d, r * 2.3);
      g.addColorStop(0, `rgba(255,224,110,${0.5 + 0.3 * pulse})`);
      g.addColorStop(1, "rgba(255,224,110,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx * d, sy * d, r * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 影（光は画面の左上から）
    const sh = this.shadowSprite();
    for (const b of scene.balls) {
      const [sx, sy] = toScreen(l, b.x, b.y);
      ctx.globalAlpha = b.opacity * 0.9;
      const w = sh.width * b.scale;
      ctx.drawImage(sh, sx * d + r * 0.28 - w / 2, sy * d + r * 0.38 - w / 2, w, w);
    }
    ctx.globalAlpha = 1;

    for (const b of scene.balls) {
      const [sx, sy] = toScreen(l, b.x, b.y);
      const sprite = this.spriteOf(b.id, b.q);
      const w = sprite.width * b.scale;
      ctx.globalAlpha = b.opacity;
      ctx.drawImage(sprite, sx * d - w / 2, sy * d - w / 2, w, w);
    }
    ctx.globalAlpha = 1;

    // ねらってよい球のまわりの輪（ゆっくり明るくなったり暗くなったり）
    if (lit.length > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,232,140,${0.55 + 0.4 * pulse})`;
      ctx.lineWidth = Math.max(1.5 * d, r * 0.22);
      for (const b of lit) {
        const [sx, sy] = toScreen(l, b.x, b.y);
        ctx.beginPath();
        ctx.arc(sx * d, sy * d, r * (1.32 + 0.1 * pulse), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 手球を置けるときは、手球のまわりに点線の輪
    const cue = scene.balls.find((b) => b.id === CUE);
    if (scene.placing && cue) {
      const [sx, sy] = toScreen(l, cue.x, cue.y);
      ctx.save();
      ctx.strokeStyle = scene.placing.dragging ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.6 * d;
      ctx.setLineDash([3 * d, 3.5 * d]);
      ctx.beginPath();
      ctx.arc(sx * d, sy * d, r * (scene.placing.dragging ? 2.1 : 1.7), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 虫めがね：台の (x, y) のまわりを zoom 倍にして、out（正方形の canvas）に写す。いま描いた台の画をそのまま使う
   */
  drawLoupe(out: HTMLCanvasElement, x: number, y: number, zoom: number) {
    const l = this.layout;
    if (!l) return;
    const d = this.dpr;
    const size = out.clientWidth;
    if (out.width !== Math.round(size * d)) out.width = out.height = Math.round(size * d);
    const ctx = out.getContext("2d")!;
    const [sx, sy] = toScreen(l, x, y);
    const src = (size / zoom) * d;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1f644c";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(this.canvas, sx * d - src / 2, sy * d - src / 2, src, src, 0, 0, out.width, out.height);
  }

  private drawGuide(g: NonNullable<Scene["guide"]>) {
    const l = this.layout!;
    const ctx = this.ctx;
    const d = this.dpr;
    const r = this.ballPx();
    const px = (x: number, y: number): [number, number] => {
      const [sx, sy] = toScreen(l, x, y);
      return [sx * d, sy * d];
    };
    const [cx, cy] = px(g.cue.x, g.cue.y);
    const [ex, ey] = px(g.guide.end[0], g.guide.end[1]);
    const ang = screenAngle(l, g.angle);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);

    ctx.save();
    ctx.lineCap = "round";
    // キュー（手球の後ろ。強いほど大きく引く）
    const pull = r * (1.6 + g.power * 5.5);
    const len = Math.max(l.width, l.height) * d * 0.7;
    const bx = cx - ux * pull;
    const by = cy - uy * pull;
    const stick = ctx.createLinearGradient(bx, by, bx - ux * len, by - uy * len);
    // 先から順に：チョークの付いた先・白い先角・明るい木・黒い握り
    stick.addColorStop(0, "#4f78a8");
    stick.addColorStop(0.008, "#4f78a8");
    stick.addColorStop(0.009, "#f1ece0");
    stick.addColorStop(0.03, "#f1ece0");
    stick.addColorStop(0.031, "#d9b989");
    stick.addColorStop(0.6, "#b88a55");
    stick.addColorStop(0.61, "#2a1c14");
    stick.addColorStop(1, "#2a1c14");
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = r * 0.62;
    ctx.beginPath();
    ctx.moveTo(bx + r * 0.25, by + r * 0.35);
    ctx.lineTo(bx - ux * len + r * 0.25, by - uy * len + r * 0.35);
    ctx.stroke();
    ctx.strokeStyle = stick;
    ctx.lineWidth = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * len, by - uy * len);
    ctx.stroke();

    // 手球から当たる所までの線。当ててはいけない球に当たるなら赤く
    const line = g.bad ? "rgba(255,92,80,0.95)" : "rgba(255,255,255,0.82)";
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.4 * d;
    ctx.beginPath();
    ctx.moveTo(cx + ux * r, cy + uy * r);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // ゴーストの球
    ctx.strokeStyle = g.bad ? "rgba(255,92,80,1)" : "rgba(255,255,255,0.9)";
    ctx.lineWidth = (g.bad ? 1.8 : 1.3) * d;
    ctx.fillStyle = g.bad ? "rgba(255,92,80,0.22)" : "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const short = 0.16 * l.scale * d;
    if (g.guide.target !== null && g.guide.targetDir) {
      // 当たった球の進む向き
      const t = g.guide.targetDir;
      const [tx, ty] = px(g.guide.end[0] + t[0] * 2 * BALL_R, g.guide.end[1] + t[1] * 2 * BALL_R);
      const tdx = l.vertical ? -t[1] : t[0];
      const tdy = l.vertical ? -t[0] : -t[1];
      ctx.strokeStyle = "rgba(255,236,170,0.95)";
      ctx.lineWidth = 2 * d;
      ctx.beginPath();
      ctx.moveTo(tx + tdx * r, ty + tdy * r);
      ctx.lineTo(tx + tdx * (r + short), ty + tdy * (r + short));
      ctx.stroke();
      // 手球の進む向き（うすく）
      const c = g.guide.cueDir;
      if (c) {
        const cdx = l.vertical ? -c[1] : c[0];
        const cdy = l.vertical ? -c[0] : -c[1];
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.2 * d;
        ctx.setLineDash([2.5 * d, 3 * d]);
        ctx.beginPath();
        ctx.moveTo(ex + cdx * r, ey + cdy * r);
        ctx.lineTo(ex + cdx * (r + short * 0.8), ey + cdy * (r + short * 0.8));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (g.guide.bounceDir) {
      const b = g.guide.bounceDir;
      const bdx = l.vertical ? -b[1] : b[0];
      const bdy = l.vertical ? -b[0] : -b[1];
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.2 * d;
      ctx.setLineDash([2.5 * d, 3 * d]);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + bdx * short, ey + bdy * short);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x, y + s * 0.6);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y - s * 0.6);
  ctx.closePath();
  ctx.fill();
}

/** 光（画面の左上の手前から）と、てかり */
const LIGHT = (() => {
  const v = [-0.42, 0.52, 0.74];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();
const HALF_VEC = (() => {
  const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();
/** 番号の丸の大きさ（球の中心から見た角度の半径の cos と sin） */
const DISC_COS = 0.86;
const DISC_SIN = Math.sqrt(1 - DISC_COS * DISC_COS);
/** ストライプの帯の半分の幅（球の中の z の大きさ） */
const BAND = 0.56;

/**
 * 球を 1 個、画素ごとに描く。画面の上から見た球の面の点 (sx, sy, z) を、画面 → 台 → 球の中の向きに直して、
 * 球の模様（帯・番号の丸・字）を決める。up は画面の上の向き（台の座標）
 */
export function paintBall(
  img: ImageData,
  size: number,
  r: number,
  id: number,
  q: Quat,
  up: [number, number],
  mask: Float32Array | null,
) {
  const data = img.data;
  const m = qMatrix(q);
  // 画面の右・上・手前を台の座標で
  const right = [up[1], -up[0], 0];
  const upv = [up[0], up[1], 0];
  // 台 → 球の中：回転行列の転置。画面 → 球の中 = Mᵀ · [right | up | z]
  const col = (v: number[]) => [
    m[0]![0]! * v[0]! + m[1]![0]! * v[1]! + m[2]![0]! * v[2]!,
    m[0]![1]! * v[0]! + m[1]![1]! * v[1]! + m[2]![1]! * v[2]!,
    m[0]![2]! * v[0]! + m[1]![2]! * v[1]! + m[2]![2]! * v[2]!,
  ];
  const a = col(right);
  const b = col(upv);
  const c = col([0, 0, 1]);
  const stripe = id >= 9;
  const base = ballColor(id);
  const isCue = id === CUE;
  const center = size / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = (py * size + px) * 4;
      const sx = (px + 0.5 - center) / r;
      const sy = -(py + 0.5 - center) / r;
      const r2 = sx * sx + sy * sy;
      if (r2 >= 1.04) {
        data[o + 3] = 0;
        continue;
      }
      const rr = Math.sqrt(r2);
      const z = r2 < 1 ? Math.sqrt(1 - r2) : 0;
      // 球の中の向き
      const bx = a[0]! * sx + b[0]! * sy + c[0]! * z;
      const by = a[1]! * sx + b[1]! * sy + c[1]! * z;
      const bz = a[2]! * sx + b[2]! * sy + c[2]! * z;
      let col3 = base;
      if (isCue) {
        // 手球：転がっているのが分かるよう、両側に小さな点
        if (Math.abs(bx) > 0.965) col3 = [196, 70, 70];
      } else {
        if (stripe && Math.abs(bz) > BAND) col3 = WHITE;
        if (Math.abs(bx) > DISC_COS) {
          col3 = WHITE;
          if (mask) {
            // 番号の丸の中の位置（-1〜1）。裏側の丸も字が左右反対にならないように
            const u = ((bx > 0 ? by : -by) / DISC_SIN) * 0.98;
            const v = bz / DISC_SIN;
            const mx = Math.floor(((u + 1) / 2) * MASK);
            const my = Math.floor(((1 - v) / 2) * MASK);
            if (mx >= 0 && my >= 0 && mx < MASK && my < MASK) {
              const ink = mask[my * MASK + mx]!;
              if (ink > 0) col3 = mix(WHITE, INK, ink);
            }
          }
        }
      }
      // 明るさ：やわらかい光と、てかり
      const diff = Math.max(0, sx * LIGHT[0] + sy * LIGHT[1] + z * LIGHT[2]);
      const shade = 0.42 + 0.66 * diff;
      let h = Math.max(0, sx * HALF_VEC[0] + sy * HALF_VEC[1] + z * HALF_VEC[2]);
      h *= h;
      h *= h;
      h *= h;
      h *= h; // 16 乗
      const spec = h * h * 0.75 * 255; // 32 乗
      // ふちは少し暗く
      const rim = 1 - 0.18 * r2 * r2;
      data[o] = Math.min(255, col3[0] * shade * rim + spec);
      data[o + 1] = Math.min(255, col3[1] * shade * rim + spec);
      data[o + 2] = Math.min(255, col3[2] * shade * rim + spec);
      // ふちをなめらかに
      data[o + 3] = Math.round(255 * Math.max(0, Math.min(1, (1 - rr) * r + 0.5)));
    }
  }
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
