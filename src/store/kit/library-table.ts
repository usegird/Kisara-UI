import { setOwn } from '@/lib/own-key';
import type { AppStoreName } from '@/store/persist/app-db';
import { indexedDbTable, memoryTable, type ChatTable } from '@/store/persist/chat-repo';
import { deleteInOrder, writeChecked } from '@/store/use-write-conflicts-store';

export type RestoreOutcome = 'added' | 'updated' | null;

interface Versioned {
  readonly updatedAt: number;
}

interface LibraryWrite {
  readonly id: string;
  readonly value: unknown;
  readonly expected: number | null;
  readonly name: string;
  readonly latest: () => unknown;
}

export interface LibraryTable {
  readonly table: () => ChatTable;
  readonly install: (next: ChatTable | null) => void;
  readonly loadAll: <T>(
    parse: (raw: unknown) => T | null,
    idOf: (item: T) => string,
  ) => Promise<Record<string, T>>;
  readonly write: (write: LibraryWrite) => void;
  readonly remove: (id: string) => void;
}

export function createLibraryTable(name: AppStoreName, onInstall?: () => void): LibraryTable {
  let table: ChatTable | null = null;

  const open = (): ChatTable => {
    if (table !== null) return table;
    table = openTable(name);
    return table;
  };

  return {
    table: open,
    install: (next) => {
      table = next;
      onInstall?.();
    },
    loadAll: async <T>(parse: (raw: unknown) => T | null, idOf: (item: T) => string) => {
      const found: Record<string, T> = {};
      try {
        const store = open();
        for (const key of await store.keys()) {
          const item = parse(await store.get(key));
          if (item !== null) setOwn(found, idOf(item), item);
        }
      } catch {
      }
      return found;
    },
    write: (write) => void writeChecked({ table: open(), scope: name, ...write }),
    remove: (id) => void deleteInOrder(open(), name, id),
  };
}

export function restoreOutcomeOf(
  local: Versioned | undefined,
  incoming: Versioned,
): RestoreOutcome {
  if (local !== undefined && local.updatedAt >= incoming.updatedAt) return null;
  return local === undefined ? 'added' : 'updated';
}

function openTable(name: AppStoreName): ChatTable {
  try {
    if (typeof globalThis.indexedDB !== 'undefined')
      return indexedDbTable(globalThis.indexedDB, name);
  } catch {
  }
  return memoryTable();
}
