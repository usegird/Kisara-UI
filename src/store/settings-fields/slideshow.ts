import { normalizeInRange } from '@/lib/clamp';

export const SLIDESHOW_SECONDS_DEFAULT = 5;
export const SLIDESHOW_SECONDS_MIN = 1;
export const SLIDESHOW_SECONDS_MAX = 99;

export function normalizeSlideshowSeconds(value: unknown): number {
  return normalizeInRange(
    value,
    { initial: SLIDESHOW_SECONDS_DEFAULT, min: SLIDESHOW_SECONDS_MIN, max: SLIDESHOW_SECONDS_MAX },
    { round: true },
  );
}
