import type { LoreEntry } from '@/chat/lore';
import { DEFAULT_ORDER, readWorldInfo } from '@/chat/world-info';
import { MEGABYTE } from '@/lib/file-size';

// ─────────────────────────────
// 取り込む追加辞書のファイルの読み取り（World Info の JSON・用語と定義の表）。
// ─────────────────────────────

/** 取り込むファイルを読めなかった理由 */
export type DictionaryFileProblem = 'format' | 'empty' | 'size';

/** 取り込む追加辞書のファイルの大きさの上限（MB） */
const DICTIONARY_FILE_MAX_MEGABYTES = 32;

/** 取り込む追加辞書のファイルの大きさの上限 */
export const DICTIONARY_FILE_MAX_BYTES = DICTIONARY_FILE_MAX_MEGABYTES * MEGABYTE;

/** 取り込むファイルを読んだ結果。読めた名前と項目か、読めなかった理由 */
type DictionaryFile =
  | { readonly kind: 'ok'; readonly name: string; readonly entries: readonly LoreEntry[] }
  | { readonly kind: 'error'; readonly problem: DictionaryFileProblem };

/** 区切り文字の表を行と欄に分ける（`"` で囲んだ欄の中の区切り・改行・`""` を扱う） */
function splitTable(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// 表の 1 行目が見出しかを見分ける語（ファイルの中身と比べるだけで、画面には出さない）
// eslint-disable-next-line no-restricted-syntax -- 見出しの語。画面の文言ではない
const TERM_HEADERS = new Set(['用語', 'term', 'word', 'key']);

// eslint-disable-next-line no-restricted-syntax -- 見出しの語。画面の文言ではない
const DEFINITION_HEADERS = new Set(['定義', 'definition', 'description', 'content']);

function isHeader(row: readonly string[]): boolean {
  const [term = '', definition = ''] = row.map((cell) => cell.trim().toLowerCase());
  return TERM_HEADERS.has(term) && DEFINITION_HEADERS.has(definition);
}

/**
 * 用語と定義の表。1 列目が用語、2 列目が定義、3 列目が別名（「、」か「/」で区切る）。
 * 本文は「用語: 定義」（定義だけでは、どの用語の定義かが送る中身から読めないため）
 */
function readTermTable(source: string, delimiter: string): LoreEntry[] {
  const rows = splitTable(source, delimiter);
  const body = rows.length > 0 && isHeader(rows[0] ?? []) ? rows.slice(1) : rows;
  return body.flatMap((row): LoreEntry[] => {
    const term = (row[0] ?? '').trim();
    const definition = (row[1] ?? '').trim();
    if (term.length === 0 || definition.length === 0) return [];
    const aliases = (row[2] ?? '')
      .split(/[、/]/u)
      .map((alias) => alias.trim())
      .filter((alias) => alias.length > 0 && alias !== term);
    return [
      {
        keys: [term, ...aliases],
        secondaryKeys: [],
        logic: 'or',
        probability: 100,
        caseSensitive: false,
        content: `${term}: ${definition}`,
        enabled: true,
        constant: false,
        side: 'before',
        depth: null,
        historyStart: false,
        scanDepth: null,
        order: DEFAULT_ORDER,
        priority: DEFAULT_ORDER,
        comment: term,
      },
    ];
  });
}

/** バイト順マーク */
const BOM = 0xfeff;

function baseName(fileName: string): string {
  const name = fileName.replace(/^.*[\\/]/u, '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * 取り込むファイルを読む。形は拡張子で分け、`.json` は World Info、
 * `.csv`・`.tsv` は用語と定義の表。名前は World Info の `name`、無ければファイル名
 */
export function readDictionaryFile(fileName: string, content: string): DictionaryFile {
  // 先頭の BOM（表計算ソフトが書き出す CSV に付く）を除く
  const source = content.charCodeAt(0) === BOM ? content.slice(1) : content;
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  let name = baseName(fileName);
  let entries: LoreEntry[];
  if (extension === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return { kind: 'error', problem: 'format' };
    }
    const read = readWorldInfo(parsed);
    if (read === null) return { kind: 'error', problem: 'format' };
    if (read.name.length > 0) name = read.name;
    entries = read.entries;
  } else if (extension === 'csv' || extension === 'tsv') {
    entries = readTermTable(source, extension === 'csv' ? ',' : '\t');
  } else {
    return { kind: 'error', problem: 'format' };
  }
  const usable = entries.filter((entry) => entry.content.trim().length > 0);
  return usable.length === 0
    ? { kind: 'error', problem: 'empty' }
    : { kind: 'ok', name, entries: usable };
}
