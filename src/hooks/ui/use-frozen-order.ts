import { useState } from 'react';

import { keepImageOrder, sortImageItems, type ImageItem } from '@/graph/image-options';

interface FrozenOrder {
  readonly ascending: boolean;
  readonly order: readonly string[];
}

export function useFrozenOrder(
  items: readonly ImageItem[],
  ascending: boolean,
  enabled: boolean,
): { readonly order: readonly string[] | null; readonly reset: () => void } {
  const [frozen, setFrozen] = useState<FrozenOrder | null>(null);
  const reset = (): void => setFrozen(null);
  if (!enabled) return { order: null, reset };
  if (frozen === null || frozen.ascending !== ascending) {
    const order = sortImageItems(items, ascending).map((item) => item.value);
    setFrozen({ ascending, order });
    return { order, reset };
  }
  return { order: frozen.order, reset };
}

export function orderedImageItems(
  items: readonly ImageItem[],
  ascending: boolean,
  order: readonly string[] | null,
): ImageItem[] {
  return order === null ? sortImageItems(items, ascending) : keepImageOrder(items, order);
}
