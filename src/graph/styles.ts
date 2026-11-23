import { parseCsv } from '@/lib/csv';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

export interface Style {
  readonly name: string;
  readonly prompt: string;
  readonly negative: string;
  readonly other: Readonly<Record<string, string>>;
}

export interface StyleTable {
  readonly styles: readonly Style[];
}

export type SavedStyle =
  | { readonly deleted: false; readonly style: Style }
  | { readonly deleted: true; readonly name: string };

export const EMPTY_STYLE_TABLE: StyleTable = { styles: [] };

const UNTITLED_STYLE = 'untitled';

const BOM = '﻿';
const STYLE_FILE_VERSION = 1;

export function styleKey(name: string): string {
  return name.toLowerCase();
}

function flatten(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

const NAME_KEYS = new Set(['name', 'stylename', 'title']);
const PROMPT_KEYS = new Set(['prompt', 'positive', 'positiveprompt']);
const NEGATIVE_KEYS = new Set(['negativeprompt', 'negative', 'negativetext']);

function columnOf(headers: readonly string[], keys: ReadonlySet<string>): number {
  return headers.findIndex((header) => keys.has(flatten(header)));
}

function claim(base: string, taken: Set<string>, key: (name: string) => string): string {
  let name = base;
  for (let branch = 2; taken.has(key(name)); branch++) name = `${base} ${String(branch)}`;
  taken.add(key(name));
  return name;
}

export function parseStyleTable(text: string): StyleTable {
  const rows = parseCsv(text.startsWith(BOM) ? text.slice(BOM.length) : text);
  const headers = rows[0];
  if (headers === undefined || headers.length === 0) return EMPTY_STYLE_TABLE;

  const headerTaken = new Set<string>();
  const keys = headers.map((header) => claim(header, headerTaken, (name) => name));
  const nameAt = columnOf(headers, NAME_KEYS);
  const promptAt = columnOf(headers, PROMPT_KEYS);
  const negativeAt = columnOf(headers, NEGATIVE_KEYS);

  const taken = new Set<string>();
  const styles: Style[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim().length === 0)) continue;

    const other: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (index === nameAt || index === promptAt || index === negativeAt) return;
      setOwn(other, key, row[index] ?? '');
    });
    const name = nameAt < 0 ? '' : (row[nameAt] ?? '').trim();
    styles.push({
      name: claim(name.length > 0 ? name : UNTITLED_STYLE, taken, styleKey),
      prompt: promptAt < 0 ? '' : (row[promptAt] ?? ''),
      negative: negativeAt < 0 ? '' : (row[negativeAt] ?? ''),
      other,
    });
  }
  return { styles };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

export function parseStyleFile(raw: unknown): SavedStyle | null {
  if (!isRecord(raw) || raw.v !== STYLE_FILE_VERSION) return null;
  const { name, prompt, negative, other } = raw;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (raw.deleted === true) return { deleted: true, name };

  if (typeof prompt !== 'string' || typeof negative !== 'string') return null;
  if (other !== undefined && !isStringRecord(other)) return null;
  return { deleted: false, style: { name, prompt, negative, other: other ?? {} } };
}

export function serializeStyleFile(entry: SavedStyle): string {
  if (entry.deleted) {
    return JSON.stringify({ v: STYLE_FILE_VERSION, name: entry.name, deleted: true });
  }
  const { name, prompt, negative, other } = entry.style;
  const rest = Object.keys(other).length > 0 ? { other } : {};
  return JSON.stringify({ v: STYLE_FILE_VERSION, name, prompt, negative, ...rest });
}

export function savedStyleName(entry: SavedStyle): string {
  return entry.deleted ? entry.name : entry.style.name;
}

export function mergeStyles(csv: StyleTable, saved: readonly SavedStyle[]): StyleTable {
  const byKey = new Map(saved.map((entry) => [styleKey(savedStyleName(entry)), entry]));
  const used = new Set<string>();

  const styles = csv.styles.flatMap((style) => {
    const key = styleKey(style.name);
    const entry = byKey.get(key);
    if (entry === undefined) return [style];
    used.add(key);
    return entry.deleted ? [] : [entry.style];
  });
  const extra = [...byKey.entries()]
    .flatMap(([key, entry]) => (used.has(key) || entry.deleted ? [] : [entry.style]))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { styles: [...styles, ...extra] };
}

export function findStyle(table: StyleTable, name: string | null): Style | null {
  if (name === null) return null;
  return table.styles.find((style) => style.name === name) ?? null;
}

export function emptyStyle(): Style {
  return { name: '', prompt: '', negative: '', other: {} };
}

export type StyleWriteError = 'empty-name' | 'duplicate-name';

interface StyleWriteResult {
  readonly table: StyleTable | null;
  readonly style: Style | null;
  readonly error: StyleWriteError | null;
}

export function upsertStyle(
  table: StyleTable,
  original: string | null,
  style: Style,
): StyleWriteResult {
  const name = style.name.trim();
  if (name.length === 0) return { table: null, style: null, error: 'empty-name' };

  const key = styleKey(name);
  const taken = table.styles.some(
    (entry) => styleKey(entry.name) === key && entry.name !== original,
  );
  if (taken) return { table: null, style: null, error: 'duplicate-name' };

  const next = { ...style, name };
  const at = original === null ? -1 : table.styles.findIndex((entry) => entry.name === original);
  const styles =
    at < 0
      ? [...table.styles, next]
      : table.styles.map((entry, index) => (index === at ? next : entry));

  return { table: { styles }, style: next, error: null };
}

export function removeStyle(table: StyleTable, name: string): StyleTable {
  return { styles: table.styles.filter((style) => style.name !== name) };
}
