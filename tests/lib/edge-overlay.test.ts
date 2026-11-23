import { describe, expect, it } from 'vitest';

import { edgeOverlayCovers, edgeOverlayOverlaps } from '@/lib/edge-overlay';

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

describe('端に重ねる欄とカードの重なり', () => {
  it('右なら、カードの右端が欄の内側へ入れば重なる', () => {
    expect(edgeOverlayOverlaps(AREA, 'right', 300, { right: 701, bottom: 100 })).toBe(true);
    expect(edgeOverlayOverlaps(AREA, 'right', 300, { right: 700, bottom: 800 })).toBe(false);
  });

  it('下なら、カードの下端が欄の内側へ入れば重なる', () => {
    expect(edgeOverlayOverlaps(AREA, 'bottom', 200, { right: 1000, bottom: 601 })).toBe(true);
    expect(edgeOverlayOverlaps(AREA, 'bottom', 200, { right: 1000, bottom: 600 })).toBe(false);
  });
});
