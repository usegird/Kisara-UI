import { describe, expect, it } from 'vitest';

import { EDGE_SCROLL_MAX, edgeScrollStep } from '@/lib/edge-scroll';

const rect = { top: 100, bottom: 500 };

describe('端での送り', () => {
  it('下端の帯では下へ、上端の帯では上へ送る。端に近いほど速い', () => {
    expect(edgeScrollStep(rect, 499)).toBeGreaterThan(edgeScrollStep(rect, 470));
    expect(edgeScrollStep(rect, 470)).toBeGreaterThan(0);
    expect(edgeScrollStep(rect, 101)).toBeLessThan(0);
    expect(edgeScrollStep(rect, 500)).toBe(EDGE_SCROLL_MAX);
  });

  it('帯より内側では送らない', () => {
    expect(edgeScrollStep(rect, 300)).toBe(0);
  });

  it('列の上下の外へ出たら最も速く送り続ける', () => {
    expect(edgeScrollStep(rect, 600)).toBe(EDGE_SCROLL_MAX);
    expect(edgeScrollStep(rect, 50)).toBe(-EDGE_SCROLL_MAX);
  });
});
