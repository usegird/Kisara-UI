// ─────────────────────────────
// 並びの 1 つ（カード・アプリ入力の枠と項目・チップ）の滑り込みと抜け出しの種類と、その見た目の対応表。
// ─────────────────────────────

/** カードと枠の動き（cva の variants に渡す） */
export const CARD_MOTION = {
  enter: 'kisara-card-enter',
  leave: 'kisara-card-leave',
  none: '',
} as const;

/** チップと枠の中の項目の動き。カードと同じ動きで距離だけ短い */
export const CHIP_MOTION = {
  enter: 'kisara-chip-enter',
  leave: 'kisara-chip-leave',
  none: '',
} as const;

/** 並びの 1 つの動き。足したばかりなら滑り込む、消すなら抜ける */
export type MotionKind = keyof typeof CARD_MOTION;

/** 抜けていくか・滑り込んでいるかから動きを選ぶ。抜けるほうを先に見る */
export function motionOf(isLeaving: boolean, isEntering: boolean): MotionKind {
  if (isLeaving) return 'leave';
  return isEntering ? 'enter' : 'none';
}
