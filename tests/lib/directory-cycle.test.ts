import { describe, expect, it } from 'vitest';

import { directoryCycle, directoryStateOf } from '@/lib/directory-cycle';

describe('directoryCycle', () => {
  it('隠している → 一時的に出す → ピン止め → やめる（隠す）と巡る', () => {
    expect(directoryCycle(false, false)).toEqual({ shown: true });
    expect(directoryCycle(false, true)).toEqual({ pin: true, shown: false });
    expect(directoryCycle(true, false)).toEqual({ pin: false, shown: false });
  });

  it('ピン止めはほかの形より先に見る', () => {
    expect(directoryStateOf(true, true)).toBe('pinned');
    expect(directoryStateOf(false, true)).toBe('shown');
    expect(directoryStateOf(false, false)).toBe('hidden');
  });
});
