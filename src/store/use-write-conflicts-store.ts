import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import type { ChatTable } from '@/store/persist/chat-repo';
import { warnUnsaved } from '@/store/use-storage-warnings-store';

interface WriteConflict {
  readonly key: string;
  readonly name: string;
  readonly kind: 'changed' | 'removed';
}

interface WriteConflictsState {
  readonly conflicts: readonly WriteConflict[];
  readonly close: (key: string) => void;
  readonly overwrite: (key: string) => Promise<void>;
}

interface Pending {
  readonly table: ChatTable;
  readonly id: string;
  readonly latest: () => unknown;
}

const pending = new Map<string, Pending>();
const chains = new Map<string, Promise<void>>();

export const useWriteConflictsStore = create<WriteConflictsState>()((set, get) => ({
  conflicts: [],

  close: (key) => {
    pending.delete(key);
    set({ conflicts: get().conflicts.filter((item) => item.key !== key) });
  },

  overwrite: async (key) => {
    const target = pending.get(key);
    get().close(key);
    if (target === undefined) return;
    const value = target.latest();
    if (value === undefined) return;
    await enqueue(key, () => target.table.put(target.id, value));
  },
}));

function enqueue(key: string, task: () => Promise<void>): Promise<void> {
  const next = (chains.get(key) ?? Promise.resolve()).then(task).catch(() => {
    warnUnsaved('library');
  });
  chains.set(key, next);
  return next;
}

function conflictOf(current: unknown, expected: number): WriteConflict['kind'] | null {
  if (current === undefined) return 'removed';
  const at = isRecord(current) && typeof current.updatedAt === 'number' ? current.updatedAt : null;
  return at === expected ? null : 'changed';
}

export interface CheckedWrite {
  readonly table: ChatTable;
  readonly scope: string;
  readonly id: string;
  readonly value: unknown;
  readonly expected: number | null;
  readonly name: string;
  readonly latest: () => unknown;
}

export function writeChecked(write: CheckedWrite): Promise<void> {
  const key = `${write.scope}:${write.id}`;
  return enqueue(key, async () => {
    if (pending.has(key)) return;
    if (write.expected !== null) {
      const kind = conflictOf(await write.table.get(write.id), write.expected);
      if (kind !== null) {
        pending.set(key, { table: write.table, id: write.id, latest: write.latest });
        const { conflicts } = useWriteConflictsStore.getState();
        useWriteConflictsStore.setState({
          conflicts: [...conflicts, { key, name: write.name, kind }],
        });
        return;
      }
    }
    await write.table.put(write.id, write.value);
  });
}

export function deleteInOrder(table: ChatTable, scope: string, id: string): Promise<void> {
  const key = `${scope}:${id}`;
  useWriteConflictsStore.getState().close(key);
  return enqueue(key, () => table.delete(id));
}
