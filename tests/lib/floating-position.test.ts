import { describe, expect, it } from 'vitest';

import { moveFloating, normalizeFloatingPosition } from '@/lib/floating-position';

describe('浮かせた枠の置き場所', () => {
  it('右と下へ動かすと、左端からは離れ、下端には近づく', () => {
    expect(moveFloating({ left: 10, bottom: 50 }, 20, 30)).toEqual({ left: 30, bottom: 20 });
  });

  it('枠の外（負の距離）には出さない', () => {
    expect(moveFloating({ left: 10, bottom: 10 }, -50, 50)).toEqual({ left: 0, bottom: 0 });
  });

  it('壊れた保存値は指定なしに落とす', () => {
    expect(normalizeFloatingPosition({ left: 'x', bottom: 1 })).toBeNull();
    expect(normalizeFloatingPosition(null)).toBeNull();
    expect(normalizeFloatingPosition({ left: 12.4, bottom: -3 })).toEqual({ left: 12, bottom: 0 });
  });
});
