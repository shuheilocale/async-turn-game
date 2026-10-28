/**
 * 選んだ写真を、送る前に端末の中で縮める。canvas に描きなおして JPEG にするので、元のファイルの位置情報などの EXIF は残らない
 * （元のファイルはそのまま送らない）。向きは描く前に直す（createImageBitmap の imageOrientation、なければ img の自動の向き）。
 * JPEG にするのは、LINE のカードの画像が JPEG か PNG しか使えないため
 */

/** 長い辺の大きさ（px）。LINE のカードの画像の上限（1024px）にそろえる */
export const MAX_SIDE = 1024;
/** だいたいこの大きさ（バイト）以下にする */
export const TARGET_BYTES = 300 * 1024;
/** これを超えたら送らない（サーバの上限 512KB より少し小さく） */
export const HARD_BYTES = 500 * 1024;

const QUALITIES = [0.82, 0.74, 0.66, 0.58];

export class PhotoReadError extends Error {
  constructor(public code: "read" | "too_large") {
    super(code);
  }
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close(): void };

/** 画像を読み込む。読めなければ（HEIC を読めないブラウザなど）PhotoReadError("read") */
async function load(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // 下の img で読み直す
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoReadError("read");
  }
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/** 縮めた JPEG と大きさ */
export interface Shrunk {
  blob: Blob;
  width: number;
  height: number;
}

/** 長い辺を MAX_SIDE までに縮めて、TARGET_BYTES くらいまでの JPEG にする。それでも大きければ、もう少し小さく描きなおす */
export async function shrinkPhoto(file: Blob): Promise<Shrunk> {
  const image = await load(file);
  try {
    let scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    let best: Shrunk | null = null;
    for (let tries = 0; tries < 3; tries++, scale *= 0.8) {
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new PhotoReadError("read");
      // 透明なところ（PNG など）は白にする
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.source, 0, 0, width, height);
      for (const q of QUALITIES) {
        const blob = await toBlob(canvas, q);
        if (!blob) throw new PhotoReadError("read");
        best = { blob, width, height };
        if (blob.size <= TARGET_BYTES) return best;
      }
    }
    if (best && best.blob.size <= HARD_BYTES) return best;
    throw new PhotoReadError("too_large");
  } finally {
    image.close();
  }
}

/**
 * お試し用の見本の絵（写真の代わり）。空と地面と丸を、色を変えて描く。写真を持っていなくても流れを試せるように
 */
export async function samplePhoto(seed: number): Promise<Shrunk> {
  const width = 768;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const hue = Math.floor(seed * 360);
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  sky.addColorStop(0, `hsl(${hue} 70% 72%)`);
  sky.addColorStop(1, `hsl(${(hue + 40) % 360} 75% 88%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `hsl(${(hue + 180) % 360} 35% 62%)`;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.72);
  ctx.quadraticCurveTo(width * 0.4, height * 0.6, width, height * 0.7);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fill();
  ctx.fillStyle = `hsl(${(hue + 30) % 360} 90% 60%)`;
  ctx.beginPath();
  ctx.arc(width * (0.25 + seed * 0.5), height * 0.3, 90, 0, Math.PI * 2);
  ctx.fill();
  const blob = await toBlob(canvas, 0.8);
  if (!blob) throw new PhotoReadError("read");
  return { blob, width, height };
}
