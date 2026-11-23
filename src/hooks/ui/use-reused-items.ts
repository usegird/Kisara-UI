import { useState } from 'react';

import { reuseEqualItems } from '@/lib/reuse-equal';

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
