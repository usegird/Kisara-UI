// ─────────────────────────────
// 言語一覧。判定・設定の選択肢・読み込む表はすべてここから作る。
// 言語を足すときは、ここに 1 行と `locales/<符号>.json` を 1 つ足す。
// ─────────────────────────────

/** 言語一覧の 1 行。符号・名前と、当てはめるブラウザの言語 */
interface LocaleInfo {
  /** BCP 47。表のファイル名と同じ */
  readonly code: string;
  /** その言語での名前（設定の選択肢に出す） */
  readonly nativeName: string;
  /** 当てはめるブラウザの言語（先頭の一致。区切りの `-` の手前で切れること） */
  readonly accepts: readonly string[];
  /** 当てはめないブラウザの言語。`accepts` より先に見る */
  readonly rejects?: readonly string[];
}

/** 正の言語。表は常に完全で、他の言語の抜けはここで出す */
export const SOURCE_LOCALE = 'en';

/** 並びは言語の符号の文字順（大文字小文字を区別しない）。設定の選択肢もこの順に出す */
export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', nativeName: 'English', accepts: ['en'] },
  { code: 'ja', nativeName: '日本語', accepts: ['ja'] },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    accepts: ['zh-Hans', 'zh-CN', 'zh-SG', 'zh'],
    rejects: ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO'],
  },
];

/** `tag` が `prefix` で始まり、その直後が区切りか終わりか（`en` は `en-US` に当たり `eng` に当たらない） */
function startsWithTag(tag: string, prefix: string): boolean {
  const lower = tag.toLowerCase();
  const head = prefix.toLowerCase();
  return lower === head || lower.startsWith(`${head}-`);
}

/** ブラウザの言語 1 つに当てはまる言語。無ければ undefined */
export function matchLocale(tag: string): LocaleInfo | undefined {
  return LOCALES.find(
    (locale) =>
      !(locale.rejects ?? []).some((prefix) => startsWithTag(tag, prefix)) &&
      locale.accepts.some((prefix) => startsWithTag(tag, prefix)),
  );
}

/** 言語一覧にある符号か */
export function isLocaleCode(code: unknown): code is string {
  return typeof code === 'string' && LOCALES.some((locale) => locale.code === code);
}

/**
 * 使う言語を決める。
 * 残した言語 → ブラウザの言語の並びで最初に当てはまるもの → 正の言語
 */
export function resolveLocale(saved: unknown, browserLanguages: readonly string[]): string {
  if (isLocaleCode(saved)) return saved;
  for (const tag of browserLanguages) {
    const found = matchLocale(tag);
    if (found) return found.code;
  }
  return SOURCE_LOCALE;
}
