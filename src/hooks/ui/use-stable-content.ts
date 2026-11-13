import { useState } from 'react';

import { sameContent } from '@/lib/reuse-equal';

// ─────────────────────────────
// 中身が同じなら前回の値を返す。
// ─────────────────────────────

/**
 * 中身が変わったときだけ新しい値を返す。派生値はワークフローが変わるたびに作り直されるので、
 * そのまま渡すと中身が同じでも受け取る部品が描き直しになる。前回の値は state に持ち、
 * 変わったときだけ描画中に差し替える（React の推奨する形）。
 */
export function useStableContent<T>(value: T, equal: (a: T, b: T) => boolean = sameContent): T {
  const [kept, setKept] = useState(value);
  if (kept === value || equal(kept, value)) return kept;
  setKept(value);
  return value;
}
