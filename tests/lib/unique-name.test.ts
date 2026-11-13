import { describe, expect, it } from 'vitest';

import { uniqueName } from '@/lib/unique-name';

describe('重ならない名前', () => {
  it('空いていればそのまま、重なれば 2・3… を付ける', () => {
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A'])).toBe('A 2');
    expect(uniqueName('A', ['A', 'A 2'])).toBe('A 3');
  });
});
