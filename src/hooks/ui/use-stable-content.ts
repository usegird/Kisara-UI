import { useState } from 'react';

import { sameContent } from '@/lib/reuse-equal';

export function useStableContent<T>(value: T, equal: (a: T, b: T) => boolean = sameContent): T {
  const [kept, setKept] = useState(value);
  if (kept === value || equal(kept, value)) return kept;
  setKept(value);
  return value;
}
