import { useEffect, useRef, useState } from "react";
import { FallbackStage } from "./FallbackStage.tsx";
import type * as Scene from "./scene.ts";
import type { FighterStageProps } from "./types.ts";
import "./FighterStage.css";

/**
 * 格闘ゲーム「バックボーン・ファイト」の 3D の舞台。
 * three（scene.ts）はこの舞台を初めて出すときに読み込む（ほかの画面の読み込みを重くしない）。
 * 読み込むまでと、WebGL が使えないときは、2D（SVG）の舞台を出す
 */

let scene: Promise<typeof Scene> | null = null;
const loadScene = () =>
  (scene ??= import("./scene.ts").catch((e) => {
    // 読み込めなかったら、次に出すときに読み込み直す
    scene = null;
    throw e;
  }));

let webgl: boolean | null = null;
/** WebGL が使えるか（1 回だけ調べ、調べるのに使った描画先はすぐに手放す） */
function canUseWebGL(): boolean {
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

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function FighterStage(props: FighterStageProps) {
  const { className = "" } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const handle = useRef<Scene.StageHandle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">(() => (canUseWebGL() ? "loading" : "fallback"));
  const propsRef = useRef(props);
  propsRef.current = props;
  // 同じ攻防の「終わった」を 2 回知らせない（3D と 2D の切り替えのときなど）
  const finished = useRef(new Set<number>());
  const withDone = (p: FighterStageProps): FighterStageProps => ({
    ...p,
    onEventDone(id) {
      if (finished.current.has(id)) return;
      finished.current.add(id);
      propsRef.current.onEventDone?.(id);
    },
  });

  useEffect(() => {
    if (state === "fallback") return;
    let cancelled = false;
    let h: Scene.StageHandle | null = null;
    let io: IntersectionObserver | null = null;
    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      io?.disconnect();
      h?.dispose();
      h = null;
      handle.current = null;
      setState("fallback");
    };
    loadScene()
      .then((mod) => {
        const host = hostRef.current;
        const overlay = overlayRef.current;
        if (cancelled || !host || !overlay) return;
        try {
          h = mod.createStage(host, overlay, { reduceMotion: prefersReducedMotion(), onLost: fail });
        } catch {
          fail();
          return;
        }
        handle.current = h;
        h.update(withDone(propsRef.current));
        // 画面から外れているあいだは描かない
        io = new IntersectionObserver(([e]) => h?.setActive(!!e?.isIntersecting), { rootMargin: "60px" });
        io.observe(host);
        setState("ready");
      })
      .catch(fail);
    return () => {
      cancelled = true;
      io?.disconnect();
      h?.dispose();
      handle.current = null;
    };
    // 3D は 1 回だけ作る（props は下の effect で毎回渡す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state === "fallback"]);

  useEffect(() => {
    handle.current?.update(withDone(props));
  });

  return (
    <div ref={hostRef} className={`fighter-stage ${state} ${className}`}>
      {state !== "ready" && <FallbackStage {...withDone(props)} active={state === "fallback"} />}
      <div ref={overlayRef} className="fs-overlay" aria-hidden="true" />
    </div>
  );
}
