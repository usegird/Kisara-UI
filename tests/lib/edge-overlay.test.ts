import { describe, expect, it } from 'vitest';

import { edgeOverlayCovers } from '@/lib/edge-overlay';

// ─────────────────────────────
// モデルの情報の待ちの条件で、端に重ねる欄が点を覆うか
// ─────────────────────────────

const AREA = { right: 1000, bottom: 800 };

describe('端に重ねる欄', () => {
  it('右なら右端から幅の内側を覆う', () => {
    expect(edgeOverlayCovers(AREA, 'right', 300, { x: 700, y: 0 })).toBe(true);
    expect(edgeOverlayCovers(AREA, 'right', 300, { x: 699, y: 790 })).toBe(false);
  });

  it('下なら下端から高さの内側を覆う', () => {
    expect(edgeOverlayCovers(AREA, 'bottom', 200, { x: 990, y: 600 })).toBe(true);
    expect(edgeOverlayCovers(AREA, 'bottom', 200, { x: 990, y: 599 })).toBe(false);
  });
});
