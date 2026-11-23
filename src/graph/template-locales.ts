export const DEFAULT_TEMPLATE_LOCALE = 'en';

export const TEMPLATE_LOCALES: ReadonlyArray<{ readonly code: string; readonly label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: DEFAULT_TEMPLATE_LOCALE, label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fa', label: 'فارسی' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ru', label: 'Русский' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
];

const TRADITIONAL_CHINESE = /^zh-(tw|hk|mo|hant)(-|$)/;

export function pickTemplateLocale(languages: readonly string[]): string {
  for (const language of languages) {
    const found = localeFor(language);
    if (found !== null) return found;
  }
  return DEFAULT_TEMPLATE_LOCALE;
}

function localeFor(language: string): string | null {
  const lower = language.toLowerCase();
  const exact = TEMPLATE_LOCALES.find((entry) => entry.code.toLowerCase() === lower);
  if (exact) return exact.code;
  if (lower.startsWith('zh')) return TRADITIONAL_CHINESE.test(lower) ? 'zh-TW' : 'zh';

  const base = lower.split('-')[0];
  return (
    TEMPLATE_LOCALES.find((entry) => entry.code.toLowerCase().split('-')[0] === base)?.code ?? null
  );
}
