import { describe, expect, it } from 'vitest';

import { normalizeInRange } from '@/lib/clamp';
import { truncate } from '@/lib/text';

const RANGE = { initial: 5, min: 1, max: 10 } as const;

describe('normalizeInRange', () => {
  it('有限の数でなければ既定に落とす', () => {
    for (const value of [undefined, null, '3', Number.NaN, Infinity, -Infinity, {}, [3]]) {
      expect(normalizeInRange(value, RANGE)).toBe(5);
    }
  });

  it('範囲外は端に寄せ、範囲内はそのまま返す', () => {
    expect(normalizeInRange(-4, RANGE)).toBe(1);
    expect(normalizeInRange(42, RANGE)).toBe(10);
    expect(normalizeInRange(2.4, RANGE)).toBe(2.4);
  });

  it('round を付けると収めたあと整数に丸める', () => {
    expect(normalizeInRange(2.5, RANGE, { round: true })).toBe(3);
    expect(normalizeInRange(0.6, RANGE, { round: true })).toBe(1);
    expect(normalizeInRange(10.4, RANGE, { round: true })).toBe(10);
  });

  it('既定は丸めない（小数の範囲でも既定をそのまま返す）', () => {
    const ratio = { initial: 0.5, min: 0.2, max: 0.8 };
    expect(normalizeInRange('x', ratio, { round: true })).toBe(0.5);
    expect(normalizeInRange(0.1, ratio)).toBe(0.2);
  });
});

describe('truncate', () => {
  it('既定では空白を潰してから省略する', () => {
    expect(truncate('  a \n b  ', 10)).toBe('a b');
    expect(truncate('abcdef', 3)).toBe('abc…');
  });

  it('singleLine: false なら空白も改行もそのまま測って省略する', () => {
    expect(truncate(' a\nb ', 10, { singleLine: false })).toBe(' a\nb ');
    expect(truncate('a\n bcdef', 4, { singleLine: false })).toBe('a\n b…');
  });
});
