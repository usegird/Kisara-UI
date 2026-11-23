export type ThemePreference = 'system' | 'light' | 'dark';

type ColorScheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const THEME_DEFAULT: ThemePreference = 'system';

export function normalizeThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? THEME_DEFAULT;
}

export function resolveColorScheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ColorScheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
