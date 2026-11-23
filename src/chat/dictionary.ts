import type { Lorebook, LoreEntry, LoreLogic, OwnLorebook } from '@/chat/lore';
import { DEFAULT_ENTRY_DEPTH, DEFAULT_ORDER, loreProbabilityOf, loreRole } from '@/chat/world-info';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';

export interface Dictionary {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly LoreEntry[];
  readonly scanDepth?: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const DICTIONARY_VERSION = 1;

const LOGICS: readonly LoreLogic[] = ['or', 'and', 'nor', 'nand', 'rag'];

function storedLogic(value: unknown): LoreLogic {
  return LOGICS.find((logic) => logic === value) ?? 'or';
}

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

function parseStoredEntries(raw: unknown): LoreEntry[] {
  return isUnknownArray(raw) ? raw.flatMap((item) => parseStoredEntry(item) ?? []) : [];
}

function storedScanDepth(value: unknown): { scanDepth?: number } {
  const depth = finiteNumber(value);
  return depth === null ? {} : { scanDepth: Math.max(0, Math.trunc(depth)) };
}

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

export function dictionaryBody(dictionary: Dictionary): string {
  return JSON.stringify({ v: DICTIONARY_VERSION, ...dictionary });
}

function parseLorebook(raw: unknown): Lorebook | null {
  if (!isRecord(raw) || !isUnknownArray(raw.entries)) return null;
  return {
    name: stringOr(raw.name),
    entries: parseStoredEntries(raw.entries),
    ...storedScanDepth(raw.scanDepth),
  };
}

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

const CHAT_LOREBOOK_ID = ':lorebook';

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

export function sameEntries(a: readonly LoreEntry[], b: readonly LoreEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

export function parseKeyList(text: string): string[] {
  return text
    .split(/[,、]/u)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}
