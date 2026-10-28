import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type * as Scene3D from "./scene3d.ts";
import type { Camera, Shown, Sweep } from "./playback.ts";

/** three と 3D の場面は、この盤を開いたときに初めて読み込む（ほかの画面を重くしない） */
let three: Promise<typeof Scene3D> | null = null;
export const loadScene = () =>
  (three ??= import("./scene3d.ts").catch((e) => {
    three = null;
    throw e;
  }));

let webgl: boolean | null = null;
/** WebGL が使えるか。調べるのに作った WebGL はすぐに手放す（iOS は同時に持てる数が少ない） */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    webgl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

const dark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** 画面の色（CSS の変数）から、3D に使う色を読む */
function paletteOf(el: Element): Scene3D.Palette {
  const css = getComputedStyle(el);
  return {
    p0: css.getPropertyValue("--p0").trim() || "#2b59f0",
    p1: css.getPropertyValue("--p1").trim() || "#f27a12",
    dark: dark(),
  };
}

/**
 * 3D で描くシート。石・ねらい・カメラは props で渡し、場面（scene3d.ts）に伝える。
 * 作れなかったら（WebGL が使えない・読み込めない）onFail を呼ぶ
 */
export function View3D({
  stones,
  aim,
  sweep,
  camera,
  onFail,
}: {
  stones: Shown[];
  aim: Scene3D.AimView | null;
  /** こすっているブラシ（seat はこする人の色） */
  sweep: (Sweep & { seat: Scene3D.SweepView["seat"] }) | null;
  camera: Camera;
  onFail(): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene3D.CurlingScene | null>(null);
  const [ready, setReady] = useState(false);
  const placed = useRef(false);

  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    const el = canvas.current!;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onScheme = () => scene.current?.setPalette(paletteOf(el));
    loadScene().then(
      (m) => {
        if (!alive) return;
        let sc: Scene3D.CurlingScene;
        try {
          sc = m.createScene(el, paletteOf(el));
        } catch (e) {
          console.warn("WebGL を使えませんでした", e);
          onFail();
          return;
        }
        scene.current = sc;
        const box = el.parentElement!;
        sc.resize(box.clientWidth, box.clientHeight);
        ro = new ResizeObserver(() => sc.resize(box.clientWidth, box.clientHeight));
        ro.observe(box);
        media?.addEventListener("change", onScheme);
        setReady(true);
      },
      () => alive && onFail(),
    );
    return () => {
      alive = false;
      ro?.disconnect();
      media?.removeEventListener("change", onScheme);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    scene.current?.setStones(stones);
  }, [stones, ready]);

  useLayoutEffect(() => {
    scene.current?.setSweep(sweep);
  }, [sweep, ready]);

  useLayoutEffect(() => {
    scene.current?.setAim(aim);
  }, [aim?.aim, aim?.power, aim?.spin, aim?.seat, !aim, ready]);

  useLayoutEffect(() => {
    if (!scene.current) return;
    // 最初の 1 回は動かさずにその場所から見せる
    scene.current.setView(camera.mode, camera.focus, !placed.current);
    placed.current = true;
  }, [camera.mode, camera.focus?.x, camera.focus?.y, ready]);

  return <canvas ref={canvas} className="curling-canvas" />;
}
