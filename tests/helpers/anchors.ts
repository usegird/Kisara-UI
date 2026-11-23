import { createStore } from 'zustand';

import type {
  AnchorPositions,
  AnchorRect,
  AnchorRegistry,
  Rects,
} from '@/hooks/ui/use-anchor-registry';

export function anchorRect(top: number, bottom: number, left = 0, right = 100): AnchorRect {
  return { left, right, top, bottom, centerY: (top + bottom) / 2 };
}

export function fixedAnchors(rects: Rects): AnchorRegistry {
  return {
    attachContainer: () => {},
    register: () => () => {},
    positions: createStore<AnchorPositions>(() => ({ rects })),
    remeasure: () => {},
    localPoint: (x, y) => ({ x, y }),
  };
}
