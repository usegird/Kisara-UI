import { parseCsv } from '@/lib/csv';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// スタイルの規則（`styles.csv` の読み・`kisara/` の 1 件の形・合わせ方・名前の重なり）。純関数だけを置く。
// ─────────────────────────────

/**
 * スタイル 1 件。知らない列は読んだまま持ち、`kisara/` に書くときも持っていく（他の道具が書いた
 * 情報を落とさない）
 */
export interface Style {
  readonly name: string;
  readonly prompt: string;
  readonly negative: string;
  /** 決めた 3 列以外。見出し名のまま持つ */
  readonly other: Readonly<Record<string, string>>;
}

/** スタイルの一覧 */
export interface StyleTable {
  readonly styles: readonly Style[];
}

/** `kisara/` に置いた 1 件。消した印は名前だけを持つ */
export type SavedStyle =
  | { readonly deleted: false; readonly style: Style }
  | { readonly deleted: true; readonly name: string };

/** 空の一覧（読めなかったとき・読む前） */
export const EMPTY_STYLE_TABLE: StyleTable = { styles: [] };

/** 名前の空いた行に付ける名前 */
const UNTITLED_STYLE = 'untitled';

const BOM = '﻿';
const STYLE_FILE_VERSION = 1;

/** 名前を比べる鍵。大文字小文字を区別しない（区別しないファイルシステムでも 1 名前 1 ファイルにする） */
export function styleKey(name: string): string {
  return name.toLowerCase();
}

/** 見出しの引き当て用。表記は書き手ごとに揺れるので、記号と大文字小文字を落とす */
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

/** 重なっていればあいている枝番を付ける（`anime 2`）。付けた名前を `taken` に足す */
function claim(base: string, taken: Set<string>, key: (name: string) => string): string {
  let name = base;
  for (let branch = 2; taken.has(key(name)); branch++) name = `${base} ${String(branch)}`;
  taken.add(key(name));
  return name;
}

// ─────────────────────────────
// styles.csv
// ─────────────────────────────

/**
 * `styles.csv` を読む。名前が空・名前の列が無い行は `untitled`、大文字小文字を問わず重なる名前は
 * 後の行に枝番を付ける。中身がすべて空の行は読まない。見出しが重なる列は後の列に枝番を付け、
 * 見出しより多い欄は読まない
 */
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

// ─────────────────────────────
// kisara/ の 1 件
// ─────────────────────────────

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/** 1 件のファイルを読む。形が合わなければ null（無いものとして扱う） */
export function parseStyleFile(raw: unknown): SavedStyle | null {
  if (!isRecord(raw) || raw.v !== STYLE_FILE_VERSION) return null;
  const { name, prompt, negative, other } = raw;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (raw.deleted === true) return { deleted: true, name };

  if (typeof prompt !== 'string' || typeof negative !== 'string') return null;
  if (other !== undefined && !isStringRecord(other)) return null;
  return { deleted: false, style: { name, prompt, negative, other: other ?? {} } };
}

/** 書く形。それ以外の列が無ければ `other` を持たない */
export function serializeStyleFile(entry: SavedStyle): string {
  if (entry.deleted) {
    return JSON.stringify({ v: STYLE_FILE_VERSION, name: entry.name, deleted: true });
  }
  const { name, prompt, negative, other } = entry.style;
  const rest = Object.keys(other).length > 0 ? { other } : {};
  return JSON.stringify({ v: STYLE_FILE_VERSION, name, prompt, negative, ...rest });
}

/** 1 件の名前（消した印も含む） */
export function savedStyleName(entry: SavedStyle): string {
  return entry.deleted ? entry.name : entry.style.name;
}

/**
 * 表示する一覧。`styles.csv` の行の順で、同じ名前（大文字小文字を問わない）は `kisara/` の中身に
 * 置き換え、消した印なら外す。`kisara/` だけにある名前は後ろに名前順で並べる
 */
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

// ─────────────────────────────
// 一覧の操作
// ─────────────────────────────

/** 名前がちょうど同じスタイル。無ければ null */
export function findStyle(table: StyleTable, name: string | null): Style | null {
  if (name === null) return null;
  return table.styles.find((style) => style.name === name) ?? null;
}

/** 空のスタイル。新しく作るときの初期値 */
export function emptyStyle(): Style {
  return { name: '', prompt: '', negative: '', other: {} };
}

/** 書き入れを断る理由 */
export type StyleWriteError = 'empty-name' | 'duplicate-name';

/** 書き入れの結果。断ったら一覧と 1 件は null で、理由を持つ */
interface StyleWriteResult {
  readonly table: StyleTable | null;
  /** 書き入れた 1 件（名前の前後の空白を落としたもの） */
  readonly style: Style | null;
  readonly error: StyleWriteError | null;
}

/**
 * 1 件を書き入れる。`original` が名前なら差し替え、null なら追加。
 * **名前は大文字小文字を区別せずに重ねられない**（1 名前 1 ファイルのため）。
 */
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

/** 名前がちょうど同じスタイルを一覧から外す */
export function removeStyle(table: StyleTable, name: string): StyleTable {
  return { styles: table.styles.filter((style) => style.name !== name) };
}
