import { formatCsv, parseCsv } from '@/lib/csv';

export interface TagEntry {
  readonly tag: string;
  readonly kind: string;
  readonly priority: number;
  readonly aliases: readonly string[];
}

export interface TagDictionary {
  readonly name: string;
  readonly entries: readonly TagEntry[];
}

export interface IndexedTag {
  readonly entry: TagEntry;
  readonly key: string;
  readonly aliasKeys: readonly string[];
  readonly source: string | null;
}

export interface TagSources {
  readonly pysssss: readonly TagEntry[] | null;
  readonly dictionaries: readonly TagDictionary[];
  readonly overrides: readonly TagEntry[];
}

const BOM = '﻿';
const A1111_COLUMNS = 4;
const DEFAULT_KIND = '0';
const NO_ALIAS = 'null';
export const DELETED_KIND = 'deleted';
export const DEFAULT_DICTIONARY = 'KisaraUI';

export function tagKey(text: string): string {
  return text.toLowerCase().replaceAll('_', ' ').trim();
}

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

export function parseTagRows(text: string): TagEntry[] {
  const rows = parseCsv(text.startsWith(BOM) ? text.slice(BOM.length) : text);
  return rows.map(entryOf).filter((entry) => entry !== null);
}

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

export function isDeletedOverride(entry: TagEntry): boolean {
  return entry.kind.trim().toLowerCase() === DELETED_KIND;
}

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

export function overrideMap(overrides: readonly TagEntry[]): Map<string, TagEntry> {
  const byKey = new Map<string, TagEntry>();
  for (const entry of overrides) {
    const key = tagKey(entry.tag);
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return byKey;
}

export function indexTags(entries: readonly TagEntry[], source: string | null): IndexedTag[] {
  return entries.map((entry) => ({
    entry,
    key: tagKey(entry.tag),
    aliasKeys: entry.aliases.map(tagKey),
    source,
  }));
}

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

export function dictionaryKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isDefaultDictionary(name: string): boolean {
  return dictionaryKey(name) === dictionaryKey(DEFAULT_DICTIONARY);
}

export function orderDictionaries(dictionaries: readonly TagDictionary[]): TagDictionary[] {
  const rank = (dictionary: TagDictionary): number =>
    isDefaultDictionary(dictionary.name) ? 0 : 1;
  return [...dictionaries].sort(
    (a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : Number(a.name > b.name)),
  );
}

export type DictionaryNameError = 'empty-name' | 'duplicate-name';

export function aliasesFromText(text: string): string[] {
  return aliasesOf(text);
}

export function findDuplicateTag(entries: readonly TagEntry[]): string | null {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = tagKey(entry.tag);
    if (seen.has(key)) return entry.tag;
    seen.add(key);
  }
  return null;
}

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
