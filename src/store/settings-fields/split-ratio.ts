import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 左右に分けた枠の、右側が占める割合（タスクの詳細の画像の幅など）。
// 端末に残す値なので、壊れた保存値は既定に落とす。
// ─────────────────────────────

export const DEFAULT_SPLIT_RATIO = 0.5;
// どちらの側も潰れきらないよう、端に寄せすぎない
const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.8;

/** 割合の保存値を範囲に収める。数でなければ既定 */
export function normalizeSplitRatio(value: unknown): number {
  return normalizeInRange(value, { initial: DEFAULT_SPLIT_RATIO, min: SPLIT_MIN, max: SPLIT_MAX });
}

/**
 * 境目を動かした量から、右側の新しい割合を出す。境目を左へ動かす（`dx` が負）と右側が広がる
 */
export function dragSplitRatio(from: number, dx: number, total: number): number {
  if (total <= 0) return normalizeSplitRatio(from);
  return normalizeSplitRatio(from - dx / total);
}
