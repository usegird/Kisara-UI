import type { LoreEntry } from '@/chat/lore';
import { PERCENT } from '@/components/ui/units';
import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';

export const ALWAYS = '*';

export type Place = 'dictionary' | 'historyStart' | 'historyEnd';

const DEFAULT_DEPTH = { depth: 4, role: 'system' } as const;

export function placeOf(entry: LoreEntry): Place {
  if (entry.historyStart) return 'historyStart';
  return entry.depth === null ? 'dictionary' : 'historyEnd';
}

export function withPlace(entry: LoreEntry, place: Place): LoreEntry {
  if (place === 'historyEnd') {
    return { ...entry, historyStart: false, depth: entry.depth ?? DEFAULT_DEPTH };
  }
  return { ...entry, historyStart: place === 'historyStart', depth: null };
}

export function isPlace(value: string): value is Place {
  return value === 'dictionary' || value === 'historyStart' || value === 'historyEnd';
}

export function formatPosition(depth: number): string {
  return depth === 0 ? '0' : `-${depth}`;
}

export function depthOf(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

export function probabilityOf(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? Math.min(PERCENT, Math.max(0, value)) : PERCENT;
}

export function formatTriggers(entry: LoreEntry): string {
  return (entry.constant ? [ALWAYS, ...entry.keys] : entry.keys).join(', ');
}

export function entryName(entry: LoreEntry): string {
  const text = formatTriggers(entry);
  return text.length === 0 ? t('llm.dictionary.noKeys') : text;
}

export function lineKeys(
  commit: () => void,
  reset: () => void,
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent): void => {
    const key = entryKeyOf(event);
    if (key === 'commit') commit();
    if (key === 'cancel') {
      event.stopPropagation();
      reset();
    }
  };
}

export function sentenceList(sentence: string): string[] {
  return sentence.length === 0 ? [] : [sentence];
}
