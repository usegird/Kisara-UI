import { finiteNumber } from '@/lib/guards';

// ─────────────────────────────
// 数を範囲に収める。端末に残した値の読み戻し（壊れていれば既定に落とす）もここを通す。
// ─────────────────────────────

/** 既定と上下限 */
export interface NumberRange {
  readonly initial: number;
  readonly min: number;
  readonly max: number;
}

/** `normalizeInRange` の収め方 */
interface InRangeOptions {
  /** 収めたあと整数に丸める（既定 false） */
  readonly round?: boolean;
}

/** `low` 〜 `high` に収める */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** 範囲に収める。有限の数でなければ `range.initial` */
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
