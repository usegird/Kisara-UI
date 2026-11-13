import { createStore } from 'zustand';

import type {
  AnchorPositions,
  AnchorRect,
  AnchorRegistry,
  Rects,
} from '@/hooks/ui/use-anchor-registry';

// ─────────────────────────────
// 測った位置を決め打ちにした座標レジストリ（`AnchorRegistry`）。
// 登録・測り直しは何もしない。位置を与えて、描き方だけを確かめるのに使う。
// ─────────────────────────────

/** 上下の位置から測った位置を作る。横は既定で 0〜100 */
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
