import type { Lorebook, LoreEntry, LoreLogic, OwnLorebook } from '@/chat/lore';
import { DEFAULT_ENTRY_DEPTH, DEFAULT_ORDER, loreProbabilityOf, loreRole } from '@/chat/world-info';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';

// ─────────────────────────────
// 追加辞書の形の読み書き（置き場と一覧は store が持つ）。取り込むファイルは dictionary-file.ts。
// ─────────────────────────────

/** 追加辞書 1 冊 */
export interface Dictionary {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly LoreEntry[];
  /**
   * トリガー検索範囲（会話履歴の末尾から見る発言の件数）。無ければ既定
   */
  readonly scanDepth?: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 控え・表に書く形の版 */
const DICTIONARY_VERSION = 1;

const LOGICS: readonly LoreLogic[] = ['or', 'and', 'nor', 'nand', 'rag'];

/** 置き場に書いた当て方。知らない値は OR */
function storedLogic(value: unknown): LoreLogic {
  return LOGICS.find((logic) => logic === value) ?? 'or';
}

/** 置き場に書いた 1 項目を読む。形が合わなければ null */
function parseStoredEntry(raw: unknown): LoreEntry | null {
  if (!isRecord(raw) || typeof raw.content !== 'string') return null;
  const depth = isRecord(raw.depth)
    ? {
        depth: Math.max(0, Math.trunc(finiteNumber(raw.depth.depth) ?? DEFAULT_ENTRY_DEPTH)),
        role: loreRole(raw.depth.role),
      }
    : null;
  const scanDepth = finiteNumber(raw.scanDepth);
  const order = finiteNumber(raw.order) ?? DEFAULT_ORDER;
  return {
    keys: stringArray(raw.keys),
    secondaryKeys: stringArray(raw.secondaryKeys),
    logic: storedLogic(raw.logic),
    probability: loreProbabilityOf(raw.probability),
    caseSensitive: raw.caseSensitive === true,
    content: raw.content,
    enabled: raw.enabled !== false,
    constant: raw.constant === true,
    side: raw.side === 'after' ? 'after' : 'before',
    depth,
    historyStart: raw.historyStart === true,
    scanDepth: scanDepth === null ? null : Math.max(0, Math.trunc(scanDepth)),
    order,
    priority: finiteNumber(raw.priority) ?? order,
    comment: stringOr(raw.comment),
  };
}

/** 置き場に書いた項目の列を読む。読めない項目は落とす */
function parseStoredEntries(raw: unknown): LoreEntry[] {
  return isUnknownArray(raw) ? raw.flatMap((item) => parseStoredEntry(item) ?? []) : [];
}

/** 置き場に書いた辞書のトリガー検索範囲。0 以上の整数でなければ持たない（既定を使う） */
function storedScanDepth(value: unknown): { scanDepth?: number } {
  const depth = finiteNumber(value);
  return depth === null ? {} : { scanDepth: Math.max(0, Math.trunc(depth)) };
}

/** 表の 1 件か控えの 1 件を読む。形が合わなければ null */
export function parseDictionary(raw: unknown): Dictionary | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isUnknownArray(raw.entries)) return null;
  return {
    id: raw.id,
    name: stringOr(raw.name),
    entries: parseStoredEntries(raw.entries),
    ...storedScanDepth(raw.scanDepth),
    createdAt: finiteNumber(raw.createdAt) ?? 0,
    updatedAt: finiteNumber(raw.updatedAt) ?? 0,
  };
}

/**
 * 控えに書く本文を作る
 */
export function dictionaryBody(dictionary: Dictionary): string {
  return JSON.stringify({ v: DICTIONARY_VERSION, ...dictionary });
}

/**
 * 置き場に書いた個別追加辞書を読む（会話・プリセットの中）。読めなければ null
 */
function parseLorebook(raw: unknown): Lorebook | null {
  if (!isRecord(raw) || !isUnknownArray(raw.entries)) return null;
  return {
    name: stringOr(raw.name),
    entries: parseStoredEntries(raw.entries),
    ...storedScanDepth(raw.scanDepth),
  };
}

/**
 * 置き場に書いた個別追加辞書の並びを読む。並びでなければ null。
 * 読めない冊は落とし、id が無いか重なれば番号の id を振る
 */
export function parseLorebooks(raw: unknown): OwnLorebook[] | null {
  if (!isUnknownArray(raw)) return null;
  const used = new Set<string>();
  return raw.flatMap((item, index) => {
    const book = parseLorebook(item);
    if (book === null || !isRecord(item)) return [];
    let id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `lorebook-${index + 1}`;
    while (used.has(id)) id = `${id}_`;
    used.add(id);
    return [{ id, ...book, ...(item.off === true ? { off: true as const } : {}) }];
  });
}

/**
 * 会話の個別追加辞書を、当てる出どころと辞書のダイアログに渡すときの id の頭（表の辞書の id と
 * 重ならない）。冊ごとに `:lorebook:<冊の id>`
 */
const CHAT_LOREBOOK_ID = ':lorebook';

/** 会話の個別追加辞書の 1 冊を、辞書と同じ形で扱う（当てる・一覧に出す・ダイアログで直す） */
export function lorebookDictionary(book: OwnLorebook): Dictionary {
  return {
    id: `${CHAT_LOREBOOK_ID}:${book.id}`,
    name: book.name,
    entries: book.entries,
    ...(book.scanDepth === undefined ? {} : { scanDepth: book.scanDepth }),
    createdAt: 0,
    updatedAt: 0,
  };
}

/** 項目の列が同じか（同じ中身の辞書を二重に足さない。名前は比べない） */
export function sameEntries(a: readonly LoreEntry[], b: readonly LoreEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 画面で足す空の項目を作る（置き場は追加辞書の印の前・有効）
 */
export function blankDictionaryEntry(): LoreEntry {
  return {
    keys: [],
    secondaryKeys: [],
    logic: 'or',
    probability: 100,
    caseSensitive: false,
    content: '',
    enabled: true,
    constant: false,
    side: 'before',
    depth: null,
    historyStart: false,
    scanDepth: null,
    order: DEFAULT_ORDER,
    priority: DEFAULT_ORDER,
    comment: '',
  };
}

/** 画面で打ったキーの並び。「,」か「、」で区切り、空を捨てる */
export function parseKeyList(text: string): string[] {
  return text
    .split(/[,、]/u)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}
