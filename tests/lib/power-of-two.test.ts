import { describe, expect, it } from 'vitest';

import { stepPowerOfTwo } from '@/lib/power-of-two';

// ─────────────────────────────
// max_tokens の上下は 2 の累乗へ繰り上げ・繰り下げる。
// ─────────────────────────────

describe('2 の累乗への上下', () => {
  it('上は次の 2 の累乗、下は手前の 2 の累乗。1 より下げない', () => {
    expect([1000, 1024, 1].map((value) => stepPowerOfTwo(value, 1))).toEqual([1024, 2048, 2]);
    expect([1000, 1024, 2, 1].map((value) => stepPowerOfTwo(value, -1))).toEqual([512, 512, 1, 1]);
  });
});
