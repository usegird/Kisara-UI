import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 画像ビューワーのスライドショーの送りの間隔。秒の整数で持つ。
// ─────────────────────────────

export const SLIDESHOW_SECONDS_DEFAULT = 5;
export const SLIDESHOW_SECONDS_MIN = 1;
export const SLIDESHOW_SECONDS_MAX = 99;

/** 秒の整数にして範囲に収める。数でなければ既定 */
export function normalizeSlideshowSeconds(value: unknown): number {
  // 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
  return normalizeInRange(
    value,
    { initial: SLIDESHOW_SECONDS_DEFAULT, min: SLIDESHOW_SECONDS_MIN, max: SLIDESHOW_SECONDS_MAX },
    { round: true },
  );
}
