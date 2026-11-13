// ─────────────────────────────
// 文言の表（JSON）の形と、引く・差し込む純関数。
// 検査の道具（scripts/check-i18n.ts）が Node からそのまま読むので、**何も import しない**。
// ─────────────────────────────

/** `Intl.PluralRules` の分類 */
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** 数で言い分ける分類の名前 */
type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** 数で言い分ける文言。`other` は必ず持つ */
type PluralForms = { other: string } & Partial<Record<PluralCategory, string>>;

/** 表の 1 項目 */
export type CatalogEntry = string | PluralForms;

/** 文言の表。入れ子の節と項目からなる */
export interface Catalog {
  [key: string]: CatalogEntry | Catalog;
}

const CATEGORY_SET: ReadonlySet<string> = new Set(PLURAL_CATEGORIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 数で言い分ける項目か。分類の名前だけを持ち、値がすべて文字列で、`other` があるもの */
export function isPluralForms(value: unknown): value is PluralForms {
  if (!isRecord(value) || typeof value.other !== 'string') return false;
  return Object.entries(value).every(
    ([key, text]) => CATEGORY_SET.has(key) && typeof text === 'string',
  );
}

/** 表を「道筋 → 項目」に平らにする。項目でも節でもないもの（数・配列など）は捨てる */
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

/** 道筋で項目を引く。無ければ undefined */
export function lookupEntry(catalog: unknown, path: string): CatalogEntry | undefined {
  let node: unknown = catalog;
  for (const key of path.split('.')) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return typeof node === 'string' || isPluralForms(node) ? node : undefined;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** 印を値に置き換える。値の無い印はそのまま残す（抜けを画面で見つけられるように） */
export function interpolate(
  text: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * 文を差し込みの印の所で分ける。偶数番目は文の切れ端、奇数番目は印の名前（文の中に部品を置くとき。
 * 語順は文言の側が持つ）
 */
export function splitPlaceholders(text: string): string[] {
  return text.split(PLACEHOLDER);
}

/** 言語ごとの書式の道具（`Intl` を毎回作らないよう、呼ぶ側で 1 回だけ作って渡す） */
export interface LocaleFormatters {
  readonly plural: Intl.PluralRules;
  readonly number: Intl.NumberFormat;
}

/**
 * 項目を文字にする。数で言い分ける項目は `params.count` で分類を選び（無ければ `other`）、
 * 差し込む数はその言語の書式（桁区切り）にする
 */
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
