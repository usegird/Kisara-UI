import { finiteNumber } from '@/lib/guards';

export interface NumberRange {
  readonly initial: number;
  readonly min: number;
  readonly max: number;
}

interface InRangeOptions {
  readonly round?: boolean;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function normalizeInRange(
  value: unknown,
  range: NumberRange,
  options: InRangeOptions = {},
): number {
  const number = finiteNumber(value);
  if (number === null) return range.initial;
  const clamped = clamp(number, range.min, range.max);
  return options.round === true ? Math.round(clamped) : clamped;
}
