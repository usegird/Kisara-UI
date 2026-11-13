import { describe, expect, it } from 'vitest';

import { normalizeThemePreference, resolveColorScheme } from '@/lib/theme';

describe('配色', () => {
  it('知らない保存値は OS に従うに落とす', () => {
    expect(normalizeThemePreference('dark')).toBe('dark');
    expect(normalizeThemePreference('sepia')).toBe('system');
    expect(normalizeThemePreference(undefined)).toBe('system');
  });

  it('OS に従うときだけ OS の設定で組が決まる', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
    expect(resolveColorScheme('light', true)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
  });
});
