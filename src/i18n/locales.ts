interface LocaleInfo {
  readonly code: string;
  readonly nativeName: string;
  readonly accepts: readonly string[];
  readonly rejects?: readonly string[];
  readonly ogLocale: string;
}

export const SOURCE_LOCALE = 'en';

export const LOCALE_KEY = 'kisaraui.locale';

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', nativeName: 'English', accepts: ['en'], ogLocale: 'en_US' },
  { code: 'ja', nativeName: '日本語', accepts: ['ja'], ogLocale: 'ja_JP' },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    accepts: ['zh-Hans', 'zh-CN', 'zh-SG', 'zh'],
    rejects: ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO'],
    ogLocale: 'zh_CN',
  },
];

function startsWithTag(tag: string, prefix: string): boolean {
  const lower = tag.toLowerCase();
  const head = prefix.toLowerCase();
  return lower === head || lower.startsWith(`${head}-`);
}

export function matchLocale(tag: string): LocaleInfo | undefined {
  return LOCALES.find(
    (locale) =>
      !(locale.rejects ?? []).some((prefix) => startsWithTag(tag, prefix)) &&
      locale.accepts.some((prefix) => startsWithTag(tag, prefix)),
  );
}

export function isLocaleCode(code: unknown): code is string {
  return typeof code === 'string' && LOCALES.some((locale) => locale.code === code);
}

export function resolveLocale(saved: unknown, browserLanguages: readonly string[]): string {
  if (isLocaleCode(saved)) return saved;
  for (const tag of browserLanguages) {
    const found = matchLocale(tag);
    if (found) return found.code;
  }
  return SOURCE_LOCALE;
}
