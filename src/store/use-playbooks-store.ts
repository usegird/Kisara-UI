import { create } from 'zustand';

import type { Playbook } from '@/chat/playbook';
import { parsePlaybook } from '@/chat/playbook-parse';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { useSettingsStore } from '@/store/use-settings-store';

export interface OwnPlaybook {
  readonly id: string;
  readonly playbook: Playbook;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const playbookTable = createLibraryTable('playbook');

export function installPlaybookTable(next: ChatTable | null): void {
  playbookTable.install(next);
}

export function parseOwnPlaybook(raw: unknown): OwnPlaybook | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const playbook = parsePlaybook(raw.playbook);
  if (playbook === null) return null;
  const at = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    id: raw.id,
    playbook: { ...playbook, id: raw.id, origin: 'own' },
    createdAt: at(raw.createdAt),
    updatedAt: at(raw.updatedAt),
  };
}

function write(item: OwnPlaybook, expected: number | null): void {
  playbookTable.write({
    id: item.id,
    value: item,
    expected,
    name: item.playbook.name,
    latest: () => usePlaybooksStore.getState().playbooks[item.id],
  });
}

interface PlaybooksState {
  readonly playbooks: Readonly<Record<string, OwnPlaybook>>;
  readonly loaded: boolean;
  readonly load: () => Promise<void>;
  readonly add: (playbook: Playbook) => OwnPlaybook;
  readonly update: (id: string, playbook: Playbook) => void;
  readonly remove: (id: string) => void;
  readonly restore: (item: OwnPlaybook) => RestoreOutcome;
}

export const usePlaybooksStore = create<PlaybooksState>()((set, get) => ({
  playbooks: {},
  loaded: false,

  load: async () => {
    const found = await playbookTable.loadAll(parseOwnPlaybook, (item) => item.id);
    const playbooks = { ...found, ...get().playbooks };
    set({ playbooks, loaded: true });
    useSettingsStore.getState().keepOwnPlaybookIds(new Set(Object.keys(playbooks)));
  },

  add: (playbook) => {
    const now = Date.now();
    const id = newShortId();
    const item: OwnPlaybook = {
      id,
      playbook: { ...playbook, id, origin: 'own' },
      createdAt: now,
      updatedAt: now,
    };
    set({ playbooks: { ...get().playbooks, [id]: item } });
    write(item, null);
    return item;
  },

  update: (id, playbook) => {
    const item = get().playbooks[id];
    if (item === undefined) return;
    const next = {
      ...item,
      playbook: { ...playbook, id, origin: 'own' as const },
      updatedAt: Date.now(),
    };
    set({ playbooks: { ...get().playbooks, [id]: next } });
    write(next, item.updatedAt);
  },

  restore: (item) => {
    const outcome = restoreOutcomeOf(get().playbooks[item.id], item);
    if (outcome === null) return null;
    set({ playbooks: { ...get().playbooks, [item.id]: item } });
    write(item, null);
    return outcome;
  },

  remove: (id) => {
    set({ playbooks: omitKey(get().playbooks, id) });
    playbookTable.remove(id);
  },
}));
