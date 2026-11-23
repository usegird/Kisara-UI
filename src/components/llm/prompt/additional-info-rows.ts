import type { Dictionary } from '@/chat/dictionary';
import type { LoreEntry } from '@/chat/lore';
import { loreInsertion } from '@/chat/lore';
import type { PromptRole } from '@/chat/types';
import { LATIN1_LAST } from '@/components/ui/units';

export type AdditionalInfoRow =
  | {
      readonly kind: 'entry';
      readonly key: string;
      readonly dictionary: string;
      readonly entry: LoreEntry;
      readonly role: PromptRole;
    }
  | { readonly kind: 'history'; readonly key: string; readonly count: number }
  | { readonly kind: 'message'; readonly key: string };

export interface AdditionalInfoInput {
  readonly own: readonly Dictionary[];
  readonly dictionaries: Readonly<Record<string, Dictionary>>;
  readonly enabledIds: readonly string[];
  readonly hits: ReadonlyMap<string, ReadonlySet<number>>;
  readonly historyCount: number;
}

interface Placed {
  readonly dictionary: Dictionary;
  readonly entry: LoreEntry;
  readonly index: number;
  readonly source: number;
}

function placedEntries(input: AdditionalInfoInput): Placed[] {
  const placed: Placed[] = [];
  const add = (dictionary: Dictionary, source: number): void => {
    const hits = input.hits.get(dictionary.id);
    dictionary.entries.forEach((entry, index) => {
      if (hits?.has(index) === true) placed.push({ dictionary, entry, index, source });
    });
  };
  input.enabledIds.forEach((id, order) => {
    const dictionary = input.dictionaries[id];
    if (dictionary !== undefined) add(dictionary, order);
  });
  input.own.forEach((dictionary, order) => add(dictionary, input.enabledIds.length + order));
  return placed;
}

const sideRank = (entry: LoreEntry): number => (entry.side === 'before' ? 0 : 1);

function entryRow(item: Placed): AdditionalInfoRow {
  return {
    kind: 'entry',
    key: `${item.dictionary.id}:${item.index}`,
    dictionary: item.dictionary.name,
    entry: item.entry,
    role: item.entry.depth?.role ?? 'system',
  };
}

interface LoreRows {
  readonly additional: readonly AdditionalInfoRow[];
  readonly history: readonly AdditionalInfoRow[];
}

export function loreRows(input: AdditionalInfoInput): LoreRows {
  const additional: AdditionalInfoRow[] = [];
  const placed = placedEntries(input);
  const total = input.historyCount;
  const insertion = (item: Placed) => loreInsertion(item.entry, total);
  const anchored = placed
    .filter((item) => insertion(item) === null)
    .sort(
      (a, b) =>
        a.source - b.source ||
        sideRank(a.entry) - sideRank(b.entry) ||
        a.entry.order - b.entry.order ||
        a.index - b.index,
    );
  additional.push(...anchored.map(entryRow));

  const depthOf = (item: Placed): number => Math.min(insertion(item)?.depth ?? 0, total);
  const inserted = placed
    .filter((item) => insertion(item) !== null)
    .sort(
      (a, b) =>
        depthOf(b) - depthOf(a) ||
        a.source - b.source ||
        a.entry.order - b.entry.order ||
        a.index - b.index,
    );
  const history: AdditionalInfoRow[] = [];
  const span = (from: number, to: number, followed: boolean): void => {
    const withMessage = to === 0 && from > 0;
    const count = from - to - (withMessage ? 1 : 0);
    if (count > 0) history.push({ kind: 'history', key: `:history:${from}`, count });
    if (withMessage && followed) history.push({ kind: 'message', key: ':message' });
  };
  let remaining = total;
  for (const item of inserted) {
    span(remaining, depthOf(item), true);
    remaining = depthOf(item);
    history.push(entryRow(item));
  }
  span(remaining, 0, false);
  return { additional, history };
}

const NAME_WIDTH = 10;

export function clipWidth(text: string, width: number = NAME_WIDTH): string {
  const chars = [...text];
  const widthOf = (char: string): number => ((char.codePointAt(0) ?? 0) > LATIN1_LAST ? 2 : 1);
  const total = chars.reduce((sum, char) => sum + widthOf(char), 0);
  if (total <= width) return text;
  let used = 0;
  let out = '';
  for (const char of chars) {
    if (used + widthOf(char) > width - 1) break;
    used += widthOf(char);
    out += char;
  }
  return `${out}…`;
}
