import { useState } from 'react';

import { reuseEqualItems } from '@/lib/reuse-equal';

// ─────────────────────────────
// 組み直した並びの中で、中身が前回と同じ要素は前回のものを返す。
// ─────────────────────────────

/**
 * 中身が前回と同じ要素を前回のものに差し替えた並びを返す。全要素が同じなら並びも前回のもの。
 * 並びを毎回組み直す部品（キュー列・変数の箱）は、そのままでは 1 か所変わるたびに全要素が
 * 新しくなり、受け取る側の memo が効かない。
 */
export function useReusedItems<T, K>(next: readonly T[], keyOf: (item: T) => K): readonly T[] {
  const [kept, setKept] = useState(next);
  if (kept === next) return kept;

  const reused = reuseEqualItems(kept, next, keyOf);
  if (reused.length === kept.length && reused.every((item, index) => item === kept[index])) {
    return kept;
  }
  setKept(reused);
  return reused;
}
