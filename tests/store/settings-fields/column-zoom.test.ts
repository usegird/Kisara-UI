import { describe, expect, it } from 'vitest';

import {
  anchoredScrollTop,
  DEFAULT_COLUMN_ZOOMS,
  normalizeColumnZooms,
  stepZoom,
  unzoom,
  zoomedTransform,
} from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// 列の倍率の範囲と刻み
// ─────────────────────────────

describe('列の倍率', () => {
  it('20% ずつ動き、範囲の端で止まる', () => {
    expect(stepZoom(100, 1)).toBe(120);
    expect(stepZoom(100, -250)).toBe(80);
    expect(stepZoom(200, 1)).toBe(200);
    expect(stepZoom(40, -1)).toBe(40);
  });

  it('刻みから外れた保存値は近い刻みへ寄せ、壊れていれば既定', () => {
    expect(normalizeColumnZooms({ app: 133, cards: 999, variables: 'x' })).toEqual({
      app: 140,
      cards: 200,
      variables: 100,
    });
    expect(normalizeColumnZooms(null)).toBe(DEFAULT_COLUMN_ZOOMS);
  });

  it('倍率を変えても指していた所が同じ位置に残る', () => {
    // 中身の 300px の所を列の上端から 100px で指していた。倍にすると中身の 600px になる
    expect(anchoredScrollTop(200, 100, 100, 200)).toBe(500);
    // 上端より上へは送らない
    expect(anchoredScrollTop(0, 100, 100, 40)).toBe(0);
  });

  it('画面の px のずらし量を倍率で割り戻す', () => {
    expect(unzoom(60, 1.2)).toBeCloseTo(50);
    const transform = { x: 10, y: 40, scaleX: 1, scaleY: 1 };
    expect(zoomedTransform(transform, 2)).toMatchObject({ x: 5, y: 20, scaleX: 1 });
    expect(zoomedTransform(null, 2)).toBeNull();
  });
});
