import { normalizeInRange } from '@/lib/clamp';

const CARD_WIDTH_RATIO = 0.7;

export const CARD_HEIGHT_MIN = 120;
export const CARD_HEIGHT_MAX = 600;
export const CARD_HEIGHT_STEP = 30;
export const CARD_HEIGHT_DEFAULT = 240;

export const CARD_LIST_STEP = 40;

export function normalizeCardHeight(value: unknown): number {
  return normalizeInRange(
    value,
    { initial: CARD_HEIGHT_DEFAULT, min: CARD_HEIGHT_MIN, max: CARD_HEIGHT_MAX },
    { round: true },
  );
}

export function parseCardHeight(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= CARD_HEIGHT_MIN && value <= CARD_HEIGHT_MAX ? value : null;
}

export function cardMinWidth(height: number): number {
  return Math.round(height * CARD_WIDTH_RATIO);
}
