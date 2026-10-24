import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./sensors.css";

/**
 * 端末のセンサー（振る = 加速度、傾ける = 向き）を盤から使うための小さな部品。
 * iOS は DeviceMotionEvent.requestPermission() / DeviceOrientationEvent.requestPermission() を、
 * ボタンを押したとき（ユーザー操作の中）に呼ばないと許可を求められない。
 * 許可されなかった・使えない（PC、LINE の中で許可が出ない など）ときは、盤が指の操作で代わりに遊べるようにする
 */

export type SensorKind = "motion" | "orientation";

/**
 * - checking: 許可の要らない端末（Android など）で、値が届くか確かめている
 * - ask: 許可を求めるボタンを押してもらう（iOS）
 * - asking: 許可を求めている
 * - probing: 許可されたので、値が届くか確かめている
 * - on: 使える
 * - denied: 許可されなかった
 * - unavailable: センサーがない・値が届かない（PC など）
 */
export type SensorStatus = "checking" | "ask" | "asking" | "probing" | "on" | "denied" | "unavailable";

/** 値が届くのを待つ時間（ミリ秒）。届かなければ使えないとみなす */
const PROBE_MS = 1500;

interface PermissionApi {
  requestPermission?: () => Promise<string>;
}

const eventClass = (kind: SensorKind): PermissionApi | undefined =>
  typeof window === "undefined"
    ? undefined
    : ((kind === "motion" ? window.DeviceMotionEvent : window.DeviceOrientationEvent) as PermissionApi | undefined);

const eventName = (kind: SensorKind) => (kind === "motion" ? "devicemotion" : "deviceorientation");

function initialStatus(kind: SensorKind): SensorStatus {
  const C = eventClass(kind);
  if (!C) return "unavailable";
  return typeof C.requestPermission === "function" ? "ask" : "checking";
}

/** 中身のある値か（PC の Chrome などは、値が空のイベントを送ってくることがある） */
function hasData(kind: SensorKind, e: Event): boolean {
  if (kind === "orientation") {
    const o = e as DeviceOrientationEvent;
    return typeof o.beta === "number" && typeof o.gamma === "number";
  }
  const m = e as DeviceMotionEvent;
  const a = m.acceleration ?? m.accelerationIncludingGravity;
  return !!a && typeof a.x === "number" && typeof a.y === "number" && typeof a.z === "number";
}

/**
 * センサーの状態と、許可を求める関数。使えるようになったら、届いた値を onEvent に渡し続ける。
 * enable はボタンの onClick の中でそのまま呼ぶ（iOS は await のあとでは許可を求められない）
 */
export function useSensor<E extends Event>(kind: SensorKind, onEvent: (e: E) => void) {
  const [status, setStatus] = useState<SensorStatus>(() => initialStatus(kind));
  const handler = useRef(onEvent);
  handler.current = onEvent;

  const listening = status === "checking" || status === "probing" || status === "on";
  useEffect(() => {
    if (!listening) return;
    let got = false;
    const listener = (e: Event) => {
      if (!hasData(kind, e)) return;
      if (!got) {
        got = true;
        setStatus("on");
      }
      handler.current(e as E);
    };
    window.addEventListener(eventName(kind), listener);
    // 決まった時間のうちに値が届かなければ、使えないとみなす（使えるようになっていればそのまま）
    const timer = setTimeout(() => setStatus((s) => (s === "on" ? s : "unavailable")), PROBE_MS);
    return () => {
      window.removeEventListener(eventName(kind), listener);
      clearTimeout(timer);
    };
  }, [kind, listening]);

  const enable = useCallback(() => {
    const C = eventClass(kind);
    if (!C) return setStatus("unavailable");
    if (typeof C.requestPermission !== "function") return setStatus("probing");
    setStatus("asking");
    let asked: Promise<string>;
    try {
      asked = C.requestPermission();
    } catch {
      return setStatus("denied");
    }
    // LINE の中などでは、聞かれずに断られる（エラーになる）ことがある
    asked.then(
      (r) => setStatus(r === "granted" ? "probing" : "denied"),
      () => setStatus("denied"),
    );
  }, [kind]);

  return { status, enable };
}

/** 画面の回転（0・90・180・270 度）。端末を左に回すと 90。横向きになったときに盤を逆に回して、端末に対して動かないようにする */
export function screenAngle(): number {
  if (typeof window === "undefined") return 0;
  const legacy = (window as { orientation?: unknown }).orientation;
  const a = typeof legacy === "number" ? legacy : (screen.orientation?.angle ?? 0);
  return ((a % 360) + 360) % 360;
}

export function useScreenAngle(): number {
  const [angle, setAngle] = useState(screenAngle);
  useEffect(() => {
    const update = () => setAngle(screenAngle());
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    screen.orientation?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
      screen.orientation?.removeEventListener?.("change", update);
    };
  }, []);
  return angle;
}

/**
 * active の間、ページのスクロール・引っぱって更新・拡大を止める。縦向きに固定できる端末（Android の全画面など）では固定する
 * （iOS は固定できないので、PortraitStage が逆に回して見た目を保つ）
 */
export function useHoldStill(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const before = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior, bodyOverflow: document.body.style.overflow };
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    const stop = (e: Event) => e.cancelable && e.preventDefault();
    // iOS の拡大（ピンチ）と、指を動かしたときのスクロール
    document.addEventListener("touchmove", stop, { passive: false });
    document.addEventListener("gesturestart", stop);
    document.addEventListener("dblclick", stop);
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation?.lock?.("portrait").catch(() => {});
    return () => {
      html.style.overflow = before.overflow;
      html.style.overscrollBehavior = before.overscroll;
      document.body.style.overflow = before.bodyOverflow;
      document.removeEventListener("touchmove", stop);
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("dblclick", stop);
      try {
        orientation?.unlock?.();
      } catch {
        // 固定していなければ何もしない
      }
    };
  }, [active]);
}

/** 指を離すまで、その指の動きを受け取り続ける（画面の外に出ても）。受け取れない指（すでに離れた など）なら何もしない */
export function capture(e: { currentTarget: Element; pointerId: number }) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // 受け取れなくても、要素の上で動かしている間は数えられる
  }
}

/** 画面上の向き（dx, dy）を、PortraitStage の中の向きに直す（逆に回した分を戻す） */
export function toStage(dx: number, dy: number, angle: number): [number, number] {
  const a = (angle * Math.PI) / 180;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

/**
 * センサーで遊んでいる間に重ねる全画面の舞台。スクロールと拡大を止め、端末を回して画面が横向きになっても、
 * 中身を逆に回して端末に対して縦のままに見せる
 */
export function PortraitStage({ className = "", angle, children }: { className?: string; angle: number; children: ReactNode }) {
  useHoldStill(true);
  const side = angle === 90 || angle === 270;
  return createPortal(
    <div className="sensor-stage" role="dialog" aria-modal="true">
      <div className={`sensor-stage-inner ${side ? "side" : ""} ${className}`} style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg)` }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * はじめから指で遊ぶか。指で触る画面のない端末（PC）は、センサーがあることはほとんどないので指（マウス）にしておく
 * （PC の Chrome も requestPermission を持っているので、聞いてみるまで分からない）。「センサーを使う」で切り替えられる
 */
export const touchByDefault = () => typeof window !== "undefined" && !window.matchMedia?.("(pointer: coarse)").matches;

/**
 * 指で遊ぶか（センサーを使わないか）。選んだ方をこの端末に覚えておき、開き直しても同じにする。
 * まだ選んでいなければ touchByDefault
 */
export function usePreferTouch(kind: SensorKind): [boolean, (touch: boolean) => void] {
  const key = `atg:touch:${kind}`;
  const [touch, setTouch] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === "1" || saved === "0") return saved === "1";
    } catch {
      // 保存できない環境では毎回決め直す
    }
    return touchByDefault();
  });
  const choose = useCallback(
    (next: boolean) => {
      setTouch(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // 保存できなくても切り替え自体はできる
      }
    },
    [key],
  );
  return [touch, choose];
}

/** SensorBar に出す文の種類。ゲームごとの文言（game.<ID>.sensor.<種類>）から渡す */
export type SensorText = "ask" | "checking" | "motion" | "touch" | "denied" | "unavailable" | "useTouch" | "useSensor" | "tagMotion" | "tagTouch";

/**
 * センサーの使い方を決める。許可を求める前（iOS）・確かめている間は、まだ遊び方が決まっていない。
 * 指で遊ぶと決めた（preferTouch）か、センサーが使えなければ指（touch）
 */
export function inputOf(status: SensorStatus, preferTouch: boolean) {
  const needAsk = !preferTouch && status === "ask";
  const deciding = !preferTouch && (status === "checking" || status === "asking" || status === "probing");
  const input: "motion" | "touch" = !preferTouch && status === "on" ? "motion" : "touch";
  return { needAsk, deciding, input };
}

/** センサーの状態と、「指で遊ぶ」「センサーを使う」の切り替え */
export function SensorBar({
  status,
  preferTouch,
  onPreferTouch,
  say,
}: {
  status: SensorStatus;
  preferTouch: boolean;
  onPreferTouch(touch: boolean): void;
  say(key: SensorText): string;
}) {
  const { needAsk, deciding, input } = inputOf(status, preferTouch);
  const canSensor = status !== "denied" && status !== "unavailable";
  let note: string;
  if (needAsk) note = say("ask");
  else if (deciding) note = say("checking");
  else if (input === "motion") note = say("motion");
  else if (preferTouch && canSensor) note = say("touch");
  else note = say(status === "denied" ? "denied" : "unavailable");
  return (
    <div className="sensor-bar" aria-live="polite">
      {!needAsk && !deciding && <InputTag input={input} label={say(input === "motion" ? "tagMotion" : "tagTouch")} />}
      <span className="sensor-note">{note}</span>
      {(needAsk || input === "motion") && (
        <button type="button" className="ghost-button" onClick={() => onPreferTouch(true)}>
          {say("useTouch")}
        </button>
      )}
      {preferTouch && canSensor && (
        <button type="button" className="ghost-button" onClick={() => onPreferTouch(false)}>
          {say("useSensor")}
        </button>
      )}
    </div>
  );
}

/** どちらで遊んでいるか（いたか）の小さな印 */
export function InputTag({ input, label }: { input: "motion" | "touch"; label: string }) {
  return (
    <span className={`input-tag ${input}`}>
      <svg viewBox="0 0 16 16" aria-hidden>
        {input === "motion" ? (
          <>
            <rect x="5" y="2" width="6" height="12" rx="1.6" />
            <path d="M2.5 5.5c-.8 1.5-.8 3.5 0 5M13.5 5.5c.8 1.5.8 3.5 0 5" />
          </>
        ) : (
          <path d="M6.5 8.5V3.6a1.2 1.2 0 0 1 2.4 0v4l2.9.7a1.4 1.4 0 0 1 1 1.6l-.6 3.1H6.6L4.2 10a1.1 1.1 0 0 1 1.6-1.5z" />
        )}
      </svg>
      {label}
    </span>
  );
}
