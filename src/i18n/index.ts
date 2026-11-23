import {
  formatEntry,
  lookupEntry,
  splitPlaceholders,
  type Catalog,
  type LocaleFormatters,
} from '@/i18n/catalog-shape';
import { initLegal, legalText, type LegalDocument } from '@/i18n/legal';
import { isLocaleCode, LOCALE_KEY, resolveLocale, SOURCE_LOCALE } from '@/i18n/locales';
import en from '@/i18n/locales/en.json';
import { safeStorage } from '@/lib/safe-storage';

type KeyPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | { other: string }
    ? `${P}${K}`
    : KeyPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = KeyPaths<typeof en>;

type MessageParams = Readonly<Record<string, string | number>>;

const SOURCE: Catalog = en;

const LOADERS = import.meta.glob<Catalog>(['./locales/*.json', '!./locales/en.json'], {
  import: 'default',
});

export { LOCALE_KEY } from '@/i18n/locales';

interface ActiveLocale extends LocaleFormatters {
  readonly code: string;
  readonly catalog: Catalog;
}

function createActive(code: string, catalog: Catalog): ActiveLocale {
  return {
    code,
    catalog,
    plural: new Intl.PluralRules(code),
    number: new Intl.NumberFormat(code),
  };
}

const SOURCE_ACTIVE = createActive(SOURCE_LOCALE, SOURCE);
let active: ActiveLocale = SOURCE_ACTIVE;

function readSaved(): unknown {
  const value = safeStorage().getItem(LOCALE_KEY);
  return typeof value === 'string' ? value : null;
}

function browserLanguages(): readonly string[] {
  return globalThis.navigator?.languages ?? [];
}

export async function initLocale(
  code: string = resolveLocale(readSaved(), browserLanguages()),
): Promise<void> {
  active = SOURCE_ACTIVE;
  const load = LOADERS[`./locales/${code}.json`];
  if (code !== SOURCE_LOCALE && load) {
    try {
      active = createActive(code, await load());
    } catch (error) {
      console.error('[言語の表の読み込み]', error);
    }
  }
  await initLegal(active.code);
  if (typeof document !== 'undefined') document.documentElement.lang = active.code;
}

export function saveLocale(code: string): void {
  if (isLocaleCode(code)) safeStorage().setItem(LOCALE_KEY, code);
}

export function activeLocale(): string {
  return active.code;
}

export function t(key: MessageKey, params: MessageParams = {}): string {
  const own = lookupEntry(active.catalog, key);
  if (own !== undefined) return formatEntry(own, active, params);

  const fallback = lookupEntry(SOURCE, key);
  return fallback === undefined ? key : formatEntry(fallback, SOURCE_ACTIVE, params);
}

export function tPath(path: string): string {
  const entry = lookupEntry(active.catalog, path) ?? lookupEntry(SOURCE, path);
  return typeof entry === 'string' ? entry : path;
}

export function tParts(key: MessageKey): string[] {
  return splitPlaceholders(t(key));
}

export function legal(document: LegalDocument): string {
  return legalText(document, active.code);
}
