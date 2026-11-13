import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 実行の記録の上限。1 つのセッションのファイルに残す実行の数。超えたら古い順に外す。
// ─────────────────────────────

export const RUN_HISTORY_LIMIT_DEFAULT = 100;
export const RUN_HISTORY_LIMIT_MIN = 1;
export const RUN_HISTORY_LIMIT_MAX = 10_000;

/** 整数にして範囲に収める。数でなければ既定 */
export function normalizeRunHistoryLimit(value: unknown): number {
  // 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
  return normalizeInRange(
    value,
    { initial: RUN_HISTORY_LIMIT_DEFAULT, min: RUN_HISTORY_LIMIT_MIN, max: RUN_HISTORY_LIMIT_MAX },
    { round: true },
  );
}
