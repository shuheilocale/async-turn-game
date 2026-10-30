import { Badminton, type Seat } from "@atg/core";

/**
 * バドミントンのコートを横から描く（canvas 2D）。座標は core と同じメートル単位で、ネットの真下が原点、y が上。
 * 見る人が左に来るよう、後手から見るときは左右を入れかえる
 */

const { HALF, SHORT_LINE, NET_H } = Badminton;

/** 見える範囲（左右はコートの外まで少し、下は床の厚み、上はクリアの高さくらいまで） */
export const VIEW_X = 7.3;
export const Y_MIN = -0.55;
export const Y_MAX = 6.9;
/** 横に対する高さの割合 */
export const ASPECT = (Y_MAX - Y_MIN) / (2 * VIEW_X);

/** 選手を本物の何倍で描くか */
const FIGURE = 1.2;

const SEAT_COLOR: Record<Seat, string> = { 0: "#2b59f0", 1: "#f27a12" };
const SEAT_DARK: Record<Seat, string> = { 0: "#1c3aa6", 1: "#b4540a" };

export interface PlayerPose {
  seat: Seat;
  px: number;
  /** 走っている足の動き（ラジアン。進んだ距離から決める） */
  stride: number;
  /** 振っている途中なら 0〜1、振っていなければ null */
  swing: number | null;
  /** サーブを待っている（シャトルを手に持つ） */
  holding?: boolean;
}

export interface Scene {
  /** 左に描く人 */
  left: Seat;
  players: PlayerPose[];
  shuttle: { x: number; y: number; vx: number; vy: number; glow: boolean } | null;
  /** シャトルの通った跡（新しい順ではなく、古い順） */
  trail: [number, number][];
  /** 落ちた所の印 */
  mark: { x: number; kind: "in" | "out" | "net" } | null;
  /** 指で選んでいる、走って行く先 */
  target: number | null;
}

export class CourtRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private k = 1;
  private dpr = 1;
  private flip = 1;
  private dark = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(width: number, dpr: number, dark: boolean) {
    this.w = width;
    this.h = Math.round(width * ASPECT);
    this.k = width / (2 * VIEW_X);
    this.dpr = dpr;
    this.dark = dark;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  get height() {
    return this.h;
  }

  /** 画面の点（CSS の px）を、コートの x（メートル）に */
  worldX(clientX: number): number {
    return ((clientX - this.w / 2) / this.k) * this.flip;
  }

  /** コートの点を画面の点（CSS の px）に */
  screen(x: number, y: number): [number, number] {
    return [this.w / 2 + x * this.k * this.flip, this.h - (y - Y_MIN) * this.k];
  }

  /** 1 画素がメートルでいくつか */
  get px() {
    return 1 / this.k;
  }

  draw(scene: Scene) {
    const { ctx, dpr } = this;
    this.flip = scene.left === 0 ? 1 : -1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHall();
    // ここからはメートル単位で、y が上
    ctx.setTransform(dpr * this.k * this.flip, 0, 0, -dpr * this.k, dpr * (this.w / 2), dpr * (this.h + Y_MIN * this.k));
    this.drawCourt();
    if (scene.target !== null) this.drawTarget(scene.target);
    if (scene.shuttle) this.drawShadow(scene.shuttle.x, scene.shuttle.y);
    this.drawNet();
    for (const p of scene.players) this.drawPlayer(p);
    if (scene.mark) this.drawMark(scene.mark);
    // シャトルは小さいので、画面の画素で大きさを決めて描く
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTrail(scene.trail);
    if (scene.shuttle) this.drawShuttle(scene.shuttle);
  }

  /** 体育館の壁と床 */
  private drawHall() {
    const { ctx, w, h, k } = this;
    const floorY = h + Y_MIN * k;
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    if (this.dark) {
      wall.addColorStop(0, "#1b2232");
      wall.addColorStop(1, "#273046");
    } else {
      wall.addColorStop(0, "#eef2f7");
      wall.addColorStop(1, "#d9e1eb");
    }
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, floorY);
    // 天井の明かり
    ctx.fillStyle = this.dark ? "rgb(255 244 214 / 0.16)" : "rgb(255 255 255 / 0.85)";
    for (const fx of [0.18, 0.5, 0.82]) {
      ctx.beginPath();
      ctx.roundRect(w * fx - w * 0.06, 4, w * 0.12, 4, 2);
      ctx.fill();
    }
    // 壁の下の、クッションの帯
    ctx.fillStyle = this.dark ? "#323c55" : "#c4cfdc";
    ctx.fillRect(0, floorY - 1.0 * k, w, 1.0 * k);
    ctx.fillStyle = this.dark ? "rgb(255 255 255 / 0.05)" : "rgb(255 255 255 / 0.45)";
    ctx.fillRect(0, floorY - 1.0 * k, w, 1.5);
    // 床（木）
    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, this.dark ? "#6e5236" : "#d8b07c");
    floor.addColorStop(1, this.dark ? "#4f3a26" : "#bf9361");
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, w, h - floorY);
  }

  /** コートのマットと線（横から見るので、床の上の帯に線の位置を刻む） */
  private drawCourt() {
    const { ctx } = this;
    const t = 0.16;
    ctx.fillStyle = this.dark ? "#1f5c45" : "#2e7d5b";
    ctx.fillRect(-HALF - 0.5, -t, 2 * HALF + 1, t);
    ctx.fillStyle = this.dark ? "#174634" : "#246349";
    ctx.fillRect(-HALF - 0.5, -t - 0.07, 2 * HALF + 1, 0.07);
    ctx.fillStyle = "rgb(255 255 255 / 0.9)";
    const lw = 2.2 * this.px;
    for (const x of [-HALF, -SHORT_LINE, 0, SHORT_LINE, HALF]) ctx.fillRect(x - lw / 2, -t, lw, t);
    ctx.fillRect(-HALF, -lw, 2 * HALF, lw);
  }

  private drawNet() {
    const { ctx, px } = this;
    // 支柱
    ctx.fillStyle = this.dark ? "#aab3c6" : "#59627a";
    ctx.fillRect(-0.035, 0, 0.07, NET_H + 0.04);
    // 網（横から見ると細い帯）
    const top = NET_H;
    const bottom = NET_H - 0.76;
    ctx.fillStyle = this.dark ? "rgb(220 226 238 / 0.22)" : "rgb(30 36 52 / 0.22)";
    ctx.fillRect(-0.11, bottom, 0.22, top - bottom);
    ctx.strokeStyle = this.dark ? "rgb(220 226 238 / 0.35)" : "rgb(30 36 52 / 0.35)";
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let y = bottom; y <= top; y += 0.1) {
      ctx.moveTo(-0.11, y);
      ctx.lineTo(0.11, y);
    }
    ctx.stroke();
    // 上の白い帯
    ctx.fillStyle = "#f7f8fb";
    ctx.fillRect(-0.13, top - 0.06, 0.26, 0.07);
  }

  private drawTarget(x: number) {
    const { ctx, px } = this;
    ctx.fillStyle = "rgb(255 255 255 / 0.75)";
    ctx.beginPath();
    ctx.moveTo(x, 0.02);
    ctx.lineTo(x - 7 * px, 0.02 + 9 * px);
    ctx.lineTo(x + 7 * px, 0.02 + 9 * px);
    ctx.closePath();
    ctx.fill();
  }

  private drawShadow(x: number, y: number) {
    const { ctx, px } = this;
    const r = Math.max(4 * px, 0.18 - y * 0.01);
    ctx.fillStyle = `rgb(0 0 0 / ${Math.max(0.08, 0.28 - y * 0.03)})`;
    ctx.beginPath();
    ctx.ellipse(x, -0.06, r, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 選手。足元が px、ネットの方を向く */
  private drawPlayer(p: PlayerPose) {
    const { ctx } = this;
    const dir = Badminton.dirOf(p.seat);
    const x = p.px;
    const color = SEAT_COLOR[p.seat];
    // 小さな画面でも見えるよう、本物より少し大きく描く（足元を中心に）
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(FIGURE, FIGURE);
    ctx.translate(-x, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 影
    ctx.fillStyle = "rgb(0 0 0 / 0.18)";
    ctx.beginPath();
    ctx.ellipse(x, -0.05, 0.42, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // 足：走ると前後に振れる
    const sway = Math.sin(p.stride) * 0.26;
    const hip = 0.88;
    ctx.strokeStyle = this.dark ? "#d9dde8" : "#2a3142";
    ctx.lineWidth = 0.12;
    for (const s of [sway, -sway]) {
      const foot = x + s * dir;
      ctx.beginPath();
      ctx.moveTo(x, hip);
      ctx.lineTo((x + foot) / 2 + 0.06 * dir, 0.45);
      ctx.lineTo(foot, 0.04);
      ctx.stroke();
    }
    // 靴
    ctx.fillStyle = "#f4f6fa";
    for (const s of [sway, -sway]) {
      ctx.beginPath();
      ctx.ellipse(x + s * dir + 0.05 * dir, 0.04, 0.12, 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 胴（シャツの色が席の色）
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.32;
    ctx.beginPath();
    ctx.moveTo(x, hip + 0.05);
    ctx.lineTo(x + 0.03 * dir, 1.38);
    ctx.stroke();
    ctx.strokeStyle = SEAT_DARK[p.seat];
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x - 0.01 * dir, hip - 0.02);
    ctx.lineTo(x + 0.01 * dir, hip + 0.1);
    ctx.stroke();

    // 頭
    ctx.fillStyle = "#f0c8a4";
    ctx.beginPath();
    ctx.arc(x + 0.05 * dir, 1.6, 0.14, 0, Math.PI * 2);
    ctx.fill();
    // 髪（y が上の座標なので、0〜π が上半分）。後ろ側は少し下まで
    ctx.fillStyle = "#2b2622";
    ctx.beginPath();
    ctx.arc(x + 0.04 * dir, 1.63, 0.15, 0, Math.PI);
    ctx.fill();
    ctx.fillRect(x + 0.04 * dir - (dir > 0 ? 0.15 : 0), 1.5, 0.15, 0.13);

    // ラケットを持つ腕：振る前は後ろに引き、振ると前へ回す
    const shoulder: [number, number] = [x + 0.04 * dir, 1.36];
    const a = p.holding ? -0.5 : p.swing === null ? 0.35 : -1.9 + p.swing * 3.6;
    const ax = Math.sin(a) * dir;
    const ay = Math.cos(a);
    const hand: [number, number] = [shoulder[0] + ax * 0.55, shoulder[1] + ay * 0.55];
    ctx.strokeStyle = "#f0c8a4";
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(...shoulder);
    ctx.lineTo(...hand);
    ctx.stroke();
    // ラケット
    const tip: [number, number] = [hand[0] + ax * 0.32, hand[1] + ay * 0.32];
    ctx.strokeStyle = this.dark ? "#e6e9f0" : "#3a4254";
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(...hand);
    ctx.lineTo(...tip);
    ctx.stroke();
    const head: [number, number] = [tip[0] + ax * 0.13, tip[1] + ay * 0.13];
    ctx.save();
    ctx.translate(...head);
    ctx.rotate(-Math.atan2(ax, ay));
    ctx.fillStyle = "rgb(255 255 255 / 0.25)";
    ctx.strokeStyle = SEAT_DARK[p.seat];
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.1, 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (p.holding) {
      // サーブの前は、もう片方の手でシャトルを持つ
      ctx.strokeStyle = "#f0c8a4";
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(...shoulder);
      ctx.lineTo(shoulder[0] + 0.42 * dir, 1.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMark(m: NonNullable<Scene["mark"]>) {
    const { ctx, px } = this;
    if (m.kind === "in") {
      ctx.strokeStyle = "#ffd84a";
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.ellipse(m.x, -0.05, 0.4, 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // アウト・ネットは赤い ×
    const y = m.kind === "net" ? Math.max(0.15, NET_H - 0.4) : 0.18;
    const r = 8 * px;
    ctx.strokeStyle = "#e5483c";
    ctx.lineWidth = 3.4 * px;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(m.x - r, y - r);
    ctx.lineTo(m.x + r, y + r);
    ctx.moveTo(m.x - r, y + r);
    ctx.lineTo(m.x + r, y - r);
    ctx.stroke();
  }

  private drawTrail(trail: [number, number][]) {
    const { ctx } = this;
    if (trail.length < 2) return;
    ctx.lineCap = "round";
    for (let i = 1; i < trail.length; i++) {
      const [x0, y0] = this.screen(...trail[i - 1]!);
      const [x1, y1] = this.screen(...trail[i]!);
      ctx.strokeStyle = this.dark ? `rgb(255 255 255 / ${(i / trail.length) * 0.35})` : `rgb(60 84 130 / ${(i / trail.length) * 0.3})`;
      ctx.lineWidth = 1 + (i / trail.length) * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /** シャトル：コルク（丸）が進む向きの先で、羽根が後ろに広がる */
  private drawShuttle(s: NonNullable<Scene["shuttle"]>) {
    const { ctx } = this;
    const [x, y] = this.screen(s.x, Math.min(s.y, Y_MAX - 0.15));
    const above = s.y > Y_MAX - 0.15;
    if (s.glow) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 18);
      g.addColorStop(0, "rgb(255 220 80 / 0.85)");
      g.addColorStop(1, "rgb(255 220 80 / 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    // 画面の上より高いときは、上の端に矢印を出す
    if (above) {
      ctx.fillStyle = "rgb(30 36 52 / 0.55)";
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x - 6, 10);
      ctx.lineTo(x + 6, 10);
      ctx.closePath();
      ctx.fill();
    }
    let dx = s.vx * this.flip;
    let dy = -s.vy;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    // 羽根（コルクの後ろ）
    const len = 13;
    const bx = x - dx * len;
    const by = y - dy * len;
    const nx = -dy;
    const ny = dx;
    ctx.fillStyle = "#fbfbf7";
    ctx.strokeStyle = "rgb(40 44 60 / 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + nx * 2.6, y + ny * 2.6);
    ctx.lineTo(bx + nx * 6, by + ny * 6);
    ctx.lineTo(bx - nx * 6, by - ny * 6);
    ctx.lineTo(x - nx * 2.6, y - ny * 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - dx * 6 + nx * 4, y - dy * 6 + ny * 4);
    ctx.lineTo(x - dx * 6 - nx * 4, y - dy * 6 - ny * 4);
    ctx.stroke();
    // コルク
    ctx.fillStyle = "#e9dcc4";
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
