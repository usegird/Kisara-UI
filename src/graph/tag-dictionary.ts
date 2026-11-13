import { formatCsv, parseCsv } from '@/lib/csv';

// ─────────────────────────────
// タグ辞書の規則（行の読みと書き・鍵・pysssss の上書き・出どころの合わせ方）。純関数だけを置く。
// ─────────────────────────────

/**
 * タグ 1 行。種別は補完に使わず、読んだまま持って書くときに戻す。
 * 優先度は候補の並びに使う数（a1111 と pysssss の表では投稿の件数が入っている）
 */
export interface TagEntry {
  readonly tag: string;
  readonly kind: string;
  readonly priority: number;
  /** 打ったときに当たる語を増やす。当たったときに入るのはタグ */
  readonly aliases: readonly string[];
}

/** `kisara/tags/` の辞書 1 つ。名前はファイル名から `.csv` を除いたもの */
export interface TagDictionary {
  readonly name: string;
  readonly entries: readonly TagEntry[];
}

/** 比べるための鍵を添えたタグ。`source` は辞書の名前で、pysssss の一覧なら null */
export interface IndexedTag {
  readonly entry: TagEntry;
  readonly key: string;
  readonly aliasKeys: readonly string[];
  readonly source: string | null;
}

/** 合わせる材料。pysssss の一覧が無ければ null */
export interface TagSources {
  readonly pysssss: readonly TagEntry[] | null;
  /** 優先の順（`orderDictionaries`）に並べたもの */
  readonly dictionaries: readonly TagDictionary[];
  /** pysssss の上書き（同じ鍵の行を置き換える。種別が `deleted` の行は消す） */
  readonly overrides: readonly TagEntry[];
}

const BOM = '﻿';
/** 4 列の形（a1111 の tagcomplete）の列の数 */
const A1111_COLUMNS = 4;
/** 種別の無い行を書くときの種別 */
const DEFAULT_KIND = '0';
/** 別名の欄の「無し」（書き手によって入る） */
const NO_ALIAS = 'null';
/**
 * 上書きの行で、pysssss のその行を消す印（種別の欄に書く。数の種別と見分けが付く）
 */
export const DELETED_KIND = 'deleted';
/**
 * 既定の辞書の名前（`kisara/tags/KisaraUI.csv`）
 */
export const DEFAULT_DICTIONARY = 'KisaraUI';

/** タグを比べる鍵。大小を区別せず、`_` と空白を同じとみなし、前後の空白を除く */
export function tagKey(text: string): string {
  return text.toLowerCase().replaceAll('_', ' ').trim();
}

/** 優先度の欄。数でなければ null */
function priorityOf(cell: string | undefined): number | null {
  const text = cell?.trim() ?? '';
  if (text.length === 0) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function aliasesOf(cell: string | undefined): string[] {
  const text = cell?.trim() ?? '';
  if (text.length === 0 || text === NO_ALIAS) return [];
  return text
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

/** 1 行を列の数で読む。タグが空なら null */
function entryOf(row: readonly string[]): TagEntry | null {
  const tag = (row[0] ?? '').trim();
  if (tag.length === 0) return null;

  if (row.length === 1) return { tag, kind: '', priority: 0, aliases: [] };
  if (row.length === 2) {
    const priority = priorityOf(row[1]);
    return priority === null
      ? { tag, kind: '', priority: 0, aliases: aliasesOf(row[1]) }
      : { tag, kind: '', priority, aliases: [] };
  }
  const priority = priorityOf(row[2]) ?? 0;
  if (row.length === A1111_COLUMNS) {
    return { tag, kind: row[1] ?? '', priority, aliases: aliasesOf(row[3]) };
  }
  return { tag, kind: '', priority, aliases: aliasesOf(row[1]) };
}

/** 辞書のファイル（CSV）を読む。空の行・タグの空の行は読まない */
export function parseTagRows(text: string): TagEntry[] {
  const rows = parseCsv(text.startsWith(BOM) ? text.slice(BOM.length) : text);
  return rows.map(entryOf).filter((entry) => entry !== null);
}

/** 辞書を 4 列の形で書く。種別が無ければ `0` */
export function serializeTagRows(entries: readonly TagEntry[]): string {
  return formatCsv(
    entries.map((entry) => [
      entry.tag,
      entry.kind.length > 0 ? entry.kind : DEFAULT_KIND,
      String(entry.priority),
      entry.aliases.join(','),
    ]),
  );
}

/** 上書きの行が、pysssss のその行を消す印か */
export function isDeletedOverride(entry: TagEntry): boolean {
  return entry.kind.trim().toLowerCase() === DELETED_KIND;
}

/**
 * pysssss の一覧に上書きを当てる。同じ鍵の上書きの行で置き換え（タグの文字は pysssss のまま）、
 * 消す印の行は外す。上書きの中で鍵が重なれば先の行を採る
 */
export function applyOverrides(
  pysssss: readonly TagEntry[],
  overrides: readonly TagEntry[],
): TagEntry[] {
  const byKey = overrideMap(overrides);
  return pysssss.flatMap((entry) => {
    const override = byKey.get(tagKey(entry.tag));
    if (override === undefined) return [entry];
    if (isDeletedOverride(override)) return [];
    return [{ ...override, tag: entry.tag }];
  });
}

/** 上書きを鍵で引けるようにする（重なれば先の行） */
export function overrideMap(overrides: readonly TagEntry[]): Map<string, TagEntry> {
  const byKey = new Map<string, TagEntry>();
  for (const entry of overrides) {
    const key = tagKey(entry.tag);
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return byKey;
}

/** 鍵を添える */
export function indexTags(entries: readonly TagEntry[], source: string | null): IndexedTag[] {
  return entries.map((entry) => ({
    entry,
    key: tagKey(entry.tag),
    aliasKeys: entry.aliases.map(tagKey),
    source,
  }));
}

/**
 * 出どころを合わせる。辞書を pysssss より、並びで先の辞書を後より、同じ辞書では先の行を採る。
 * 上書きは pysssss の行にだけ効かせる。別名が別のタグの鍵と同じならタグの方を採る（別名を外す）
 */
export function mergeTags(sources: TagSources): IndexedTag[] {
  const byKey = new Map<string, IndexedTag>();
  const lists = [
    ...sources.dictionaries.map((dictionary) => indexTags(dictionary.entries, dictionary.name)),
    indexTags(applyOverrides(sources.pysssss ?? [], sources.overrides), null),
  ];
  for (const list of lists) {
    for (const tag of list) {
      if (!byKey.has(tag.key)) byKey.set(tag.key, tag);
    }
  }
  return [...byKey.values()].map((tag) =>
    tag.aliasKeys.some((alias) => byKey.has(alias))
      ? { ...tag, aliasKeys: tag.aliasKeys.map((alias) => (byKey.has(alias) ? '' : alias)) }
      : tag,
  );
}

/** 辞書の名前を比べる鍵（大小を区別しない） */
export function dictionaryKey(name: string): string {
  return name.trim().toLowerCase();
}

/** 既定の辞書（ファイルが無くても辞書の一覧に出し、初めて書いたときに作る）か */
export function isDefaultDictionary(name: string): boolean {
  return dictionaryKey(name) === dictionaryKey(DEFAULT_DICTIONARY);
}

/** 合わせるときの優先の順に並べる。既定の辞書を先に、ほかは名前の順 */
export function orderDictionaries(dictionaries: readonly TagDictionary[]): TagDictionary[] {
  const rank = (dictionary: TagDictionary): number =>
    isDefaultDictionary(dictionary.name) ? 0 : 1;
  return [...dictionaries].sort(
    (a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : Number(a.name > b.name)),
  );
}

// ─────────────────────────────
// 直す操作（辞書の画面から）
// ─────────────────────────────

/** 辞書を作れない理由 */
export type DictionaryNameError = 'empty-name' | 'duplicate-name';

/** 別名の欄（`,` 区切り）を別名の並びにする */
export function aliasesFromText(text: string): string[] {
  return aliasesOf(text);
}

/** 同じ辞書の中で鍵が重なる最初のタグ。重ならなければ null（書く前に確かめる） */
export function findDuplicateTag(entries: readonly TagEntry[]): string | null {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = tagKey(entry.tag);
    if (seen.has(key)) return entry.tag;
    seen.add(key);
  }
  return null;
}

/**
 * pysssss の 1 行の上書きを決め直す。`next` が元の行と同じ（別名・優先度が同じで消していない）なら
 * 上書きを外し、違えば同じ鍵の上書きを置き換える（無ければ末尾に足す）
 */
export function setOverride(
  overrides: readonly TagEntry[],
  original: TagEntry,
  next: TagEntry,
): TagEntry[] {
  const key = tagKey(original.tag);
  const same =
    !isDeletedOverride(next) &&
    next.priority === original.priority &&
    next.aliases.join(',') === original.aliases.join(',');
  const rest = overrides.filter((entry) => tagKey(entry.tag) !== key);
  if (same) return rest;
  const at = overrides.findIndex((entry) => tagKey(entry.tag) === key);
  const written = { ...next, tag: original.tag };
  if (at === -1) return [...rest, written];
  return [...rest.slice(0, at), written, ...rest.slice(at)];
}

/** 新しい辞書の名前を確かめる。空・大小を問わず重なる名前（ファイルの無い既定の辞書を含む）は作れない */
export function checkDictionaryName(
  dictionaries: readonly TagDictionary[],
  name: string,
): DictionaryNameError | null {
  const key = dictionaryKey(name);
  if (key.length === 0) return 'empty-name';
  const taken =
    isDefaultDictionary(name) || dictionaries.some((item) => dictionaryKey(item.name) === key);
  return taken ? 'duplicate-name' : null;
}
