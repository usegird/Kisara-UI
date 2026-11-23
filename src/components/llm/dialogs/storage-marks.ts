import { allBackupsOf, backupsOf, type Entry } from '@/components/llm/dialogs/storage-entries';
import { isStaleBackup, orphanBackups } from '@/store/persist/storage-backups';
import type { StorageItem } from '@/store/persist/storage-usage';

export interface Mark {
  readonly entryId: string;
  readonly side: 'browser' | 'backup' | 'restore';
  readonly key: string;
}

export type Marks = ReadonlyMap<string, Mark>;

export const markKey = (mark: Mark): string => JSON.stringify([mark.entryId, mark.side, mark.key]);

export function toggleMarks(current: Marks, targets: readonly Mark[]): Marks {
  const next = new Map(current);
  const all = targets.every((mark) => current.has(markKey(mark)));
  for (const mark of targets) {
    if (all) {
      next.delete(markKey(mark));
      continue;
    }
    next.set(markKey(mark), mark);
    const rival = rivalOf(mark);
    if (rival !== null) next.delete(markKey(rival));
  }
  return next;
}

export function withoutReferenceMarks(current: Marks, entryId: string): Marks {
  const kept = [...current].filter(
    ([, mark]) => mark.entryId !== entryId || mark.side === 'browser',
  );
  return new Map(kept);
}

export function markCounts(
  entry: Entry,
  marks: Marks,
): { readonly plus: number; readonly minus: number } {
  const present = new Set(entry.items.map((item) => item.key));
  let plus = 0;
  let minus = 0;
  for (const mark of marks.values()) {
    if (mark.entryId !== entry.id) continue;
    if (mark.side !== 'restore') {
      minus += 1;
      continue;
    }
    plus += 1;
    if (present.has(mark.key)) minus += 1;
  }
  return { plus, minus };
}

export interface StaleBackup {
  readonly entry: Entry;
  readonly item: StorageItem;
}

export function staleBackupsOf(
  entries: readonly Entry[],
  connected: boolean,
  now: number,
): StaleBackup[] | null {
  if (!connected || allBackupsOf(entries) === null) return null;
  return entries
    .filter((entry) => entry.backup !== null)
    .flatMap((entry) =>
      orphanBackups(backupsOf(entry) ?? [], entry.items)
        .filter((item) => isStaleBackup(item, now))
        .map((item) => ({ entry, item })),
    );
}

export function staleMarkOf({ entry, item }: StaleBackup): Mark {
  return { entryId: entry.id, side: 'backup', key: item.key };
}

function rivalOf(mark: Mark): Mark | null {
  if (mark.side === 'backup') return null;
  return { ...mark, side: mark.side === 'browser' ? 'restore' : 'browser' };
}
