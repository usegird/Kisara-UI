export const CARD_MOTION = {
  enter: 'kisara-card-enter',
  leave: 'kisara-card-leave',
  none: '',
} as const;

export const CHIP_MOTION = {
  enter: 'kisara-chip-enter',
  leave: 'kisara-chip-leave',
  none: '',
} as const;

export type MotionKind = keyof typeof CARD_MOTION;

export function motionOf(isLeaving: boolean, isEntering: boolean): MotionKind {
  if (isLeaving) return 'leave';
  return isEntering ? 'enter' : 'none';
}
