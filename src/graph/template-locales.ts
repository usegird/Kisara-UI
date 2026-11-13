// ─────────────────────────────
// 同梱のワークフローテンプレートの一覧の言語と、初めに選ぶ言語の決め方。
// ─────────────────────────────

/** 既定の言語。一覧は `index.json` */
export const DEFAULT_TEMPLATE_LOCALE = 'en';

/**
 * 一覧の言語。同梱の訳（`index.{code}.json`）がある言語と、既定の英語。
 * 名前はその言語の表記で出す（読めない言語の名前を日本語で書いても選べないため）。
 * 並びは言語の符号（BCP 47）の文字順（大文字小文字を区別しない）。
 */
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

/** 繁体字を使う地域・用字の指定 */
const TRADITIONAL_CHINESE = /^zh-(tw|hk|mo|hant)(-|$)/;

/**
 * 初めの言語。ブラウザの優先言語（`navigator.languages`）を上から見て、最初に合うもの。
 * どれも合わなければ英語。
 */
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

  // 地域違いは言語で合わせる（`ja-JP` → `ja`、`pt-PT` → `pt-BR`）
  const base = lower.split('-')[0];
  return (
    TEMPLATE_LOCALES.find((entry) => entry.code.toLowerCase().split('-')[0] === base)?.code ?? null
  );
}
