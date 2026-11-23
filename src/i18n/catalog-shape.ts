const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

type PluralForms = { other: string } & Partial<Record<PluralCategory, string>>;

export type CatalogEntry = string | PluralForms;

export interface Catalog {
  [key: string]: CatalogEntry | Catalog;
}

const CATEGORY_SET: ReadonlySet<string> = new Set(PLURAL_CATEGORIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPluralForms(value: unknown): value is PluralForms {
  if (!isRecord(value) || typeof value.other !== 'string') return false;
  return Object.entries(value).every(
    ([key, text]) => CATEGORY_SET.has(key) && typeof text === 'string',
  );
}

export function flattenCatalog(catalog: unknown, prefix = ''): Map<string, CatalogEntry> {
  const entries = new Map<string, CatalogEntry>();
  if (!isRecord(catalog)) return entries;

  for (const [key, value] of Object.entries(catalog)) {
    const path = `${prefix}${key}`;
    if (typeof value === 'string' || isPluralForms(value)) entries.set(path, value);
    else for (const [inner, entry] of flattenCatalog(value, `${path}.`)) entries.set(inner, entry);
  }
  return entries;
}

export function lookupEntry(catalog: unknown, path: string): CatalogEntry | undefined {
  let node: unknown = catalog;
  for (const key of path.split('.')) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return typeof node === 'string' || isPluralForms(node) ? node : undefined;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(
  text: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function splitPlaceholders(text: string): string[] {
  return text.split(PLACEHOLDER);
}

export interface LocaleFormatters {
  readonly plural: Intl.PluralRules;
  readonly number: Intl.NumberFormat;
}

export function formatEntry(
  entry: CatalogEntry,
  formatters: LocaleFormatters,
  params: Readonly<Record<string, string | number>>,
): string {
  let text: string;
  if (typeof entry === 'string') text = entry;
  else if (typeof params.count === 'number') {
    text = entry[formatters.plural.select(params.count)] ?? entry.other;
  } else text = entry.other;

  const formatted = Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === 'number' ? formatters.number.format(value) : value,
    ]),
  );
  return interpolate(text, formatted);
}
