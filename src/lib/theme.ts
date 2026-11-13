// ─────────────────────────────
// 画面の配色。設定で選ぶのは 3 つ、実際に塗る組は 2 つ。
// ─────────────────────────────

/** 設定で選ぶ配色。`system` は OS の設定（prefers-color-scheme）に従う */
export type ThemePreference = 'system' | 'light' | 'dark';

/** 実際に塗る組 */
type ColorScheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const THEME_DEFAULT: ThemePreference = 'system';

/** 保存値の読み戻し。知らない値は既定（OS に従う）に落とす */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? THEME_DEFAULT;
}

/** 設定と OS の設定から、実際に塗る組を決める */
export function resolveColorScheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ColorScheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
