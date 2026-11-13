import type { Dictionary } from '@/chat/dictionary';
import type { LoreEntry, LoreLogic } from '@/chat/lore';
import { importedBookName } from '@/chat/reserved-book';
import type { PromptRole } from '@/chat/types';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';

// ─────────────────────────────
// SillyTavern の形（World Info とカードのロアブック）の読み書きと、数値の読み方。
// ─────────────────────────────

/**
 * 項目の順の既定（用語と定義の表から取り込んだ項目）
 */
export const DEFAULT_ORDER = 100;

/** SillyTavern の位置の数値で「前」を表すもの。深さの扱いは loreDepthOf */
const ST_POSITION_BEFORE = 0;

const ROLES: readonly PromptRole[] = ['system', 'user', 'assistant'];

/** SillyTavern の `selectiveLogic` の数値（0 AND ANY・1 NOT ALL・2 NOT ANY・3 AND ALL）の並び */
const ST_LOGIC: readonly LoreLogic[] = ['or', 'nand', 'nor', 'and'];

/** SillyTavern の位置の数値で「深さ」を表すもの（`extensions.position`） */
const ST_POSITION_DEPTH = 4;

/** SillyTavern の位置の数値で、作者のメモの前を表すもの */
const ST_POSITION_AUTHOR_NOTE_BEFORE = 2;

/** SillyTavern の位置の数値で、作者のメモの後を表すもの */
const ST_POSITION_AUTHOR_NOTE_AFTER = 3;

/** SillyTavern の位置の数値で、作者のメモの前後を表すもの */
const ST_POSITION_AUTHOR_NOTE: readonly number[] = [
  ST_POSITION_AUTHOR_NOTE_BEFORE,
  ST_POSITION_AUTHOR_NOTE_AFTER,
];

/** 発動率の上限（百分率。いつも送る） */
const MAX_PROBABILITY = 100;

/** 項目の順番が書かれていないときの順番（SillyTavern の既定） */
const DEFAULT_INSERTION_ORDER = 100;

/** 作者のメモの既定の深さ（SillyTavern の既定） */
export const AUTHOR_NOTE_DEPTH = 4;

/** 深さの項目で深さが書かれていないときの深さ（SillyTavern の項目の既定） */
export const DEFAULT_ENTRY_DEPTH = 4;

/** SillyTavern の `selectiveLogic` の数値を当て方に直す。無い・知らない値は OR */
export function loreLogicOf(value: unknown): LoreLogic {
  return (typeof value === 'number' ? ST_LOGIC[value] : undefined) ?? 'or';
}

/** 発動率を 0〜100 の整数に直す。`use` が偽か値が無ければ 100（いつも送る） */
export function loreProbabilityOf(value: unknown, use: unknown = true): number {
  const number = finiteNumber(value);
  if (use === false || number === null) return MAX_PROBABILITY;
  return Math.min(MAX_PROBABILITY, Math.max(0, Math.round(number)));
}

/**
 * SillyTavern の位置の数値を、会話の履歴への差し込みに直す。4 は項目の深さと role、
 * 2・3（作者のメモの前後）は深さ 4・`system`。ほかは追加辞書の印に置くので null
 */
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

/** SillyTavern の role の数値（0 が system・1 が user・2 が assistant）か role の名前 */
export function loreRole(value: unknown): PromptRole {
  const index = finiteNumber(value);
  if (index !== null) return ROLES[index] ?? 'system';
  return ROLES.find((role) => role === value) ?? 'system';
}

/**
 * カードのロアブック（`character_book.entries`）。位置は SillyTavern の拡張の数値
 * （`extensions.position`）があればそれを、無ければ `position` の `before_char` を前とする。
 * 深さ・作者のメモの前後は会話の履歴への差し込みにし、ほかは追加辞書の印の中の前・後の順にだけ使う
 */
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
        // RAG の項目は第 2 のキーを使わない（追加内容と比べる）
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

/**
 * 書き出した JSON の KisaraUI だけの持ち物。無ければ空
 */
function kisaraOf(raw: Readonly<Record<string, unknown>>): {
  readonly historyStart: boolean;
  readonly condition: string;
} {
  const own = isRecord(raw.kisara) ? raw.kisara : {};
  return { historyStart: own.historyStart === true, condition: stringOr(own.condition).trim() };
}

/**
 * World Info の JSON の 1 項目を読む。持たない欄は読み捨てる
 */
function worldInfoEntry(raw: unknown): LoreEntry | null {
  if (!isRecord(raw) || typeof raw.content !== 'string') return null;
  const own = kisaraOf(raw);
  const position = finiteNumber(raw.position);
  const depth = loreDepthOf(position, raw.depth, raw.role);
  const order = finiteNumber(raw.order) ?? DEFAULT_ORDER;
  const scanDepth = finiteNumber(raw.scanDepth);
  return {
    keys: stringArray(raw.key),
    // RAG の項目は第 2 のキーを使わない。書き出した追加条件の文があれば戻す
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

/** 追加条件の論理を SillyTavern の `selectiveLogic` の数値に（RAG は 0 にして `vectorized` で表す） */
const ST_LOGIC_NUMBER: Readonly<Record<LoreLogic, number>> = {
  or: 0,
  nand: 1,
  nor: 2,
  and: 3,
  rag: 0,
};

const ST_ROLE_NUMBER: Readonly<Record<string, number>> = { system: 0, user: 1, assistant: 2 };

/** SillyTavern の位置の数値で、深さを表すもの */
const ST_POSITION_AT_DEPTH = 4;

/**
 * 1 項目を World Info の JSON の項目にする
 */
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

/**
 * 辞書を SillyTavern の World Info の JSON の本文にする
 */
export function worldInfoJson(dictionary: Pick<Dictionary, 'name' | 'entries'>): string {
  const entries = Object.fromEntries(
    dictionary.entries.map((entry, index) => [String(index), worldInfoOf(entry, index)]),
  );
  return `${JSON.stringify({ name: dictionary.name, entries }, null, 2)}\n`;
}

/** World Info の JSON（`entries` は id を鍵にした表か配列）。World Info でなければ null */
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
