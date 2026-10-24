/**
 * いしつみの狙い（落とす x）のドラッグの計算。画面のイベントから切り離して、テストできるようにしている。
 *
 * LINE の中のブラウザ（iOS）では、指を離した知らせ（pointerup）が届かないことがあり、そのまま
 * 次の操作（「落とす」ボタンを押す指）の動きがドラッグの続きとして届いて、狙いが一気に右へ飛んだ。
 * そのため、1 回の動きで大きく飛んだときは別の操作の動きとみなし、石は動かさずに起点を置き直す
 */

export interface AimDrag {
  id: number;
  /** 直前に受け取った指の位置（px） */
  lastClientX: number;
  /** 4px を超えて動いたか（動いていなければ、離したときにタップとして扱う） */
  moved: boolean;
  /** 押し始めてからの動きの合計（px）。4px を超えたら moved にする */
  travel: number;
}

/** これ以上動いたら、ドラッグとして扱う（px） */
const TAP_SLOP = 4;
/** 1 回の動きで盤の幅のこの割合を超えて飛んだら、別の操作の動きとみなす */
const MAX_JUMP = 0.25;

export const startDrag = (id: number, clientX: number): AimDrag => ({
  id,
  lastClientX: clientX,
  moved: false,
  travel: 0,
});

/** 指が clientX まで動いたときの、新しいドラッグの状態と狙い。width は盤の幅（px）、viewW は見える範囲の幅 */
export function dragMove(d: AimDrag, clientX: number, aim: number, width: number, viewW: number) {
  const step = clientX - d.lastClientX;
  if (Math.abs(step) > width * MAX_JUMP) {
    return { drag: { ...d, lastClientX: clientX }, aim };
  }
  const travel = d.travel + Math.abs(step);
  const moved = d.moved || travel > TAP_SLOP;
  const next = moved ? aim + (moved && !d.moved ? travel * Math.sign(step) : step) * (viewW / width) : aim;
  return { drag: { ...d, lastClientX: clientX, travel, moved }, aim: next };
}
