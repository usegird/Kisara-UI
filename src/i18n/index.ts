import {
  formatEntry,
  lookupEntry,
  splitPlaceholders,
  type Catalog,
  type LocaleFormatters,
} from '@/i18n/catalog-shape';
import { initLegal, legalText, type LegalDocument } from '@/i18n/legal';
import { isLocaleCode, resolveLocale, SOURCE_LOCALE } from '@/i18n/locales';
import en from '@/i18n/locales/en.json';
import { safeStorage } from '@/lib/safe-storage';

// ─────────────────────────────
// 画面の言語を決めて文言を引く。どの層からも `t()` で引ける（React に依存しない）。
// 読み込む前は正の言語（英語）で出る。
// ─────────────────────────────

/** 項目でない節の道筋を除いた、項目の道筋 */
type KeyPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | { other: string }
    ? `${P}${K}`
    : KeyPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** 英語の表にある項目の道筋。無い道筋を引くと型の検査で落ちる */
export type MessageKey = KeyPaths<typeof en>;

/** 文言の差し込みの印に入れる値。印の名前から値を引く */
type MessageParams = Readonly<Record<string, string | number>>;

const SOURCE: Catalog = en;

/** 正の言語以外の表。使う言語の分だけ読む */
const LOADERS = import.meta.glob<Catalog>(['./locales/*.json', '!./locales/en.json'], {
  import: 'default',
});

/**
 * 選んだ言語の置き場（小さい保存領域）
 */
export const LOCALE_KEY = 'kisaraui.locale';

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

// ── 読み込み ─────────────────────────────

/** 残した言語。読めない環境では無し */
function readSaved(): unknown {
  const value = safeStorage().getItem(LOCALE_KEY);
  return typeof value === 'string' ? value : null;
}

function browserLanguages(): readonly string[] {
  return globalThis.navigator?.languages ?? [];
}

/**
 * 言語を決めて表を読む。**描く前に 1 回だけ**呼ぶ。
 * 表が読めなければ正の言語で続ける（画面は英語で成り立つ）
 */
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
  // 規約・ポリシーの本文は表と別の置き場（legal/）から、同じ言語で読む
  await initLegal(active.code);
  if (typeof document !== 'undefined') document.documentElement.lang = active.code;
}

/**
 * 選んだ言語を残す。反映は読み込み直したとき
 */
export function saveLocale(code: string): void {
  if (isLocaleCode(code)) safeStorage().setItem(LOCALE_KEY, code);
}

/** 今の言語の符号（BCP 47） */
export function activeLocale(): string {
  return active.code;
}

// ── 引く ─────────────────────────────

/**
 * 文言を引く。今の言語に無ければ英語で出す。
 * 数で言い分ける項目は `params.count` で分類を選ぶ
 */
export function t(key: MessageKey, params: MessageParams = {}): string {
  const own = lookupEntry(active.catalog, key);
  if (own !== undefined) return formatEntry(own, active, params);

  const fallback = lookupEntry(SOURCE, key);
  return fallback === undefined ? key : formatEntry(fallback, SOURCE_ACTIVE, params);
}

/**
 * 道筋を組み立てて引く（組み込みのプレイブックのように、形の id から道筋を作るとき）。
 * 型の検査が効かないので、道筋が英語の表にあることはテストで確かめる。差し込みはしない
 */
export function tPath(path: string): string {
  const entry = lookupEntry(active.catalog, path) ?? lookupEntry(SOURCE, path);
  return typeof entry === 'string' ? entry : path;
}

/**
 * 文言を差し込みの印の所で分けて引く。偶数番目は文の切れ端、奇数番目は印の名前で、呼ぶ側が印の所に
 * 部品（リンクなど）を置く。語順は文言の側が持つので、言語で変わっても部品をつなぎ直さずに済む
 */
export function tParts(key: MessageKey): string[] {
  return splitPlaceholders(t(key));
}

/**
 * 利用規約・プライバシーポリシーの本文。今の言語に無ければ英語
 */
export function legal(document: LegalDocument): string {
  return legalText(document, active.code);
}
