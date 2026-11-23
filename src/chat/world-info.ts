import type { Dictionary } from '@/chat/dictionary';
import type { LoreEntry, LoreLogic } from '@/chat/lore';
import { importedBookName } from '@/chat/reserved-book';
import type { PromptRole } from '@/chat/types';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';

export const DEFAULT_ORDER = 100;

const ST_POSITION_BEFORE = 0;

const ROLES: readonly PromptRole[] = ['system', 'user', 'assistant'];

const ST_LOGIC: readonly LoreLogic[] = ['or', 'nand', 'nor', 'and'];

const ST_POSITION_DEPTH = 4;

const ST_POSITION_AUTHOR_NOTE_BEFORE = 2;

const ST_POSITION_AUTHOR_NOTE_AFTER = 3;

const ST_POSITION_AUTHOR_NOTE: readonly number[] = [
  ST_POSITION_AUTHOR_NOTE_BEFORE,
  ST_POSITION_AUTHOR_NOTE_AFTER,
];

const MAX_PROBABILITY = 100;

const DEFAULT_INSERTION_ORDER = 100;

export const AUTHOR_NOTE_DEPTH = 4;

export const DEFAULT_ENTRY_DEPTH = 4;

export function loreLogicOf(value: unknown): LoreLogic {
  return (typeof value === 'number' ? ST_LOGIC[value] : undefined) ?? 'or';
}

export function loreProbabilityOf(value: unknown, use: unknown = true): number {
  const number = finiteNumber(value);
  if (use === false || number === null) return MAX_PROBABILITY;
  return Math.min(MAX_PROBABILITY, Math.max(0, Math.round(number)));
}

export function loreDepthOf(
  position: number | null,
  depth: unknown,
  role: unknown,
): LoreEntry['depth'] {
  if (position === ST_POSITION_DEPTH) {
    return {
      depth: Math.max(0, Math.trunc(finiteNumber(depth) ?? DEFAULT_ENTRY_DEPTH)),
      role: loreRole(role),
    };
  }
  if (position !== null && ST_POSITION_AUTHOR_NOTE.includes(position)) {
    return { depth: AUTHOR_NOTE_DEPTH, role: 'system' };
  }
  return null;
}

export function loreRole(value: unknown): PromptRole {
  const index = finiteNumber(value);
  if (index !== null) return ROLES[index] ?? 'system';
  return ROLES.find((role) => role === value) ?? 'system';
}

export function parseCardBook(book: Readonly<Record<string, unknown>> | null): LoreEntry[] {
  const entries = book !== null && isUnknownArray(book.entries) ? book.entries : [];
  return entries.flatMap((raw): LoreEntry[] => {
    if (!isRecord(raw)) return [];
    const extensions = isRecord(raw.extensions) ? raw.extensions : {};
    const stPosition = finiteNumber(extensions.position);
    const before = stPosition === null ? raw.position === 'before_char' : stPosition === 0;
    const depth = loreDepthOf(stPosition, extensions.depth, extensions.role);
    const order = finiteNumber(raw.insertion_order) ?? DEFAULT_INSERTION_ORDER;
    const scanDepth = finiteNumber(extensions.scan_depth);
    return [
      {
        keys: stringArray(raw.keys),
        secondaryKeys:
          raw.selective === true && extensions.vectorized !== true
            ? stringArray(raw.secondary_keys)
            : [],
        logic: extensions.vectorized === true ? 'rag' : loreLogicOf(extensions.selectiveLogic),
        probability: loreProbabilityOf(extensions.probability, extensions.useProbability),
        caseSensitive: raw.case_sensitive === true,
        content: stringOr(raw.content),
        enabled: raw.enabled !== false,
        constant: raw.constant === true,
        side: before ? 'before' : 'after',
        depth,
        historyStart: false,
        scanDepth: scanDepth === null ? null : Math.max(0, Math.trunc(scanDepth)),
        order,
        priority: finiteNumber(raw.priority) ?? order,
        comment: stringOr(raw.comment) || stringOr(raw.name),
      },
    ];
  });
}

function kisaraOf(raw: Readonly<Record<string, unknown>>): {
  readonly historyStart: boolean;
  readonly condition: string;
} {
  const own = isRecord(raw.kisara) ? raw.kisara : {};
  return { historyStart: own.historyStart === true, condition: stringOr(own.condition).trim() };
}

function worldInfoEntry(raw: unknown): LoreEntry | null {
  if (!isRecord(raw) || typeof raw.content !== 'string') return null;
  const own = kisaraOf(raw);
  const position = finiteNumber(raw.position);
  const depth = loreDepthOf(position, raw.depth, raw.role);
  const order = finiteNumber(raw.order) ?? DEFAULT_ORDER;
  const scanDepth = finiteNumber(raw.scanDepth);
  return {
    keys: stringArray(raw.key),
    secondaryKeys:
      raw.vectorized === true
        ? own.condition.length === 0
          ? []
          : [own.condition]
        : raw.selective === false
          ? []
          : stringArray(raw.keysecondary),
    logic: raw.vectorized === true ? 'rag' : loreLogicOf(raw.selectiveLogic),
    probability: loreProbabilityOf(raw.probability, raw.useProbability),
    caseSensitive: raw.caseSensitive === true,
    content: raw.content,
    enabled: raw.disable !== true,
    constant: raw.constant === true,
    side: position === ST_POSITION_BEFORE ? 'before' : 'after',
    depth: own.historyStart ? null : depth,
    historyStart: own.historyStart,
    scanDepth: scanDepth === null ? null : Math.max(0, Math.trunc(scanDepth)),
    order,
    priority: order,
    comment: stringOr(raw.comment),
  };
}

const ST_LOGIC_NUMBER: Readonly<Record<LoreLogic, number>> = {
  or: 0,
  nand: 1,
  nor: 2,
  and: 3,
  rag: 0,
};

const ST_ROLE_NUMBER: Readonly<Record<string, number>> = { system: 0, user: 1, assistant: 2 };

const ST_POSITION_AT_DEPTH = 4;

function worldInfoOf(entry: LoreEntry, uid: number): Record<string, unknown> {
  const rag = entry.logic === 'rag';
  const kisara = {
    ...(entry.historyStart ? { historyStart: true } : {}),
    ...(rag && entry.secondaryKeys.length > 0 ? { condition: entry.secondaryKeys.join('、') } : {}),
  };
  return {
    uid,
    key: entry.keys,
    keysecondary: rag ? [] : entry.secondaryKeys,
    selective: !rag && entry.secondaryKeys.length > 0,
    selectiveLogic: ST_LOGIC_NUMBER[entry.logic],
    vectorized: rag,
    constant: entry.constant,
    disable: !entry.enabled,
    content: entry.content,
    comment: entry.comment,
    order: entry.order,
    position:
      entry.depth !== null && !entry.historyStart
        ? ST_POSITION_AT_DEPTH
        : entry.side === 'before'
          ? ST_POSITION_BEFORE
          : 1,
    depth: entry.depth?.depth ?? DEFAULT_ENTRY_DEPTH,
    role: ST_ROLE_NUMBER[entry.depth?.role ?? 'system'] ?? 0,
    probability: entry.probability,
    useProbability: entry.probability < MAX_PROBABILITY,
    caseSensitive: entry.caseSensitive,
    scanDepth: entry.scanDepth,
    ...(Object.keys(kisara).length === 0 ? {} : { kisara }),
  };
}

export function worldInfoJson(dictionary: Pick<Dictionary, 'name' | 'entries'>): string {
  const entries = Object.fromEntries(
    dictionary.entries.map((entry, index) => [String(index), worldInfoOf(entry, index)]),
  );
  return `${JSON.stringify({ name: dictionary.name, entries }, null, 2)}\n`;
}

export function readWorldInfo(raw: unknown): { name: string; entries: LoreEntry[] } | null {
  if (!isRecord(raw)) return null;
  const list = isUnknownArray(raw.entries)
    ? raw.entries
    : isRecord(raw.entries)
      ? Object.values(raw.entries)
      : null;
  if (list === null) return null;
  const valid = list.filter((item) => isRecord(item) && 'key' in item && 'content' in item);
  if (list.length > 0 && valid.length === 0) return null;
  const entries = valid.flatMap((item) => worldInfoEntry(item) ?? []);
  return { name: importedBookName(stringOr(raw.name)), entries };
}
