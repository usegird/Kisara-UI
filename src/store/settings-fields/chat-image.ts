import { normalizeInRange } from '@/lib/clamp';

export type ChatImagePlace = 'left' | 'right' | 'top' | 'aboveInput' | 'background';

export const CHAT_IMAGE_PLACES: readonly ChatImagePlace[] = [
  'left',
  'right',
  'top',
  'aboveInput',
  'background',
];

export const CHAT_IMAGE_SIZE = { min: 48, max: 1600, width: 320, height: 480 } as const;

export const CHAT_MIN_WIDTH = 360;

const MAX_IMAGE_FOCUS = 100;
const FOCUS_STEPS_PER_PERCENT = 10;

export const CHAT_MIN_HEIGHT = 360;

export const CHAT_IMAGE_FOCUS = 50;

export function normalizeChatImageFocus(value: unknown): number {
  const focus = normalizeInRange(value, {
    initial: CHAT_IMAGE_FOCUS,
    min: 0,
    max: MAX_IMAGE_FOCUS,
  });
  return Math.round(focus * FOCUS_STEPS_PER_PERCENT) / FOCUS_STEPS_PER_PERCENT;
}

export function normalizeChatImagePlace(value: unknown): ChatImagePlace {
  return CHAT_IMAGE_PLACES.find((place) => place === value) ?? 'right';
}

export function normalizeChatImageSize(value: unknown, fallback: number): number {
  return normalizeInRange(
    value,
    { initial: fallback, min: CHAT_IMAGE_SIZE.min, max: CHAT_IMAGE_SIZE.max },
    { round: true },
  );
}

function axisOf(place: ChatImagePlace): 'side' | 'band' | null {
  if (place === 'left' || place === 'right') return 'side';
  return place === 'background' ? null : 'band';
}

export function chatImageSizeAfterMove(
  from: ChatImagePlace,
  to: ChatImagePlace,
  size: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  const before = axisOf(from);
  const after = axisOf(to);
  const { width, height } = size;
  if (after === null || before === after) return size;
  if (before !== null) return { width: height, height: width };
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return after === 'side' ? { width: short, height: long } : { width: long, height: short };
}
