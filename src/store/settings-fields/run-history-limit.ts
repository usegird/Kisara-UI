import { normalizeInRange } from '@/lib/clamp';

export const RUN_HISTORY_LIMIT_DEFAULT = 100;
export const RUN_HISTORY_LIMIT_MIN = 1;
export const RUN_HISTORY_LIMIT_MAX = 10_000;

export function normalizeRunHistoryLimit(value: unknown): number {
  return normalizeInRange(
    value,
    { initial: RUN_HISTORY_LIMIT_DEFAULT, min: RUN_HISTORY_LIMIT_MIN, max: RUN_HISTORY_LIMIT_MAX },
    { round: true },
  );
}
