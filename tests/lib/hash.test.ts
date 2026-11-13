import { describe, expect, it } from 'vitest';

import { hash53, stableStringify } from '@/lib/hash';

describe('hash53', () => {
  it('16 進 14 文字で、同じ文字列なら同じ値になる', () => {
    expect(hash53('abc')).toMatch(/^[0-9a-f]{14}$/);
    expect(hash53('abc')).toBe(hash53('abc'));
    expect(hash53('abc')).not.toBe(hash53('abd'));
  });
});

describe('stableStringify', () => {
  it('キーの順が違うだけなら同じ文字列にする（入れ子も）', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } })).toBe(
      stableStringify({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }),
    );
  });

  it('配列の順は保つ', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
