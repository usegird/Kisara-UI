import { normalizeInRange } from '@/lib/clamp';

export const DEFAULT_SPLIT_RATIO = 0.5;
const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.8;

export function normalizeSplitRatio(value: unknown): number {
  return normalizeInRange(value, { initial: DEFAULT_SPLIT_RATIO, min: SPLIT_MIN, max: SPLIT_MAX });
}

export function dragSplitRatio(from: number, dx: number, total: number): number {
  if (total <= 0) return normalizeSplitRatio(from);
  return normalizeSplitRatio(from - dx / total);
}
