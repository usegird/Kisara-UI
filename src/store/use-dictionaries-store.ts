import { create } from 'zustand';

import { parseDictionary, sameEntries, type Dictionary } from '@/chat/dictionary';
import {
  DICTIONARY_FILE_MAX_BYTES,
  readDictionaryFile,
  type DictionaryFileProblem,
} from '@/chat/dictionary-file';
import type { LoreEntry } from '@/chat/lore';
import { isTooLarge } from '@/lib/file-size';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { useSettingsStore } from '@/store/use-settings-store';

const dictionaryTable = createLibraryTable('dictionary');

export function installDictionaryTable(next: ChatTable | null): void {
  dictionaryTable.install(next);
}

interface AdoptResult {
  readonly dictionary: Dictionary;
  readonly added: boolean;
}

interface DictionariesState {
  readonly dictionaries: Readonly<Record<string, Dictionary>>;
  readonly loaded: boolean;
  readonly load: () => Promise<void>;
  readonly adopt: (name: string, entries: readonly LoreEntry[]) => AdoptResult;
  readonly add: (name: string) => Dictionary;
  readonly update: (
    id: string,
    patch: Partial<Pick<Dictionary, 'name' | 'entries' | 'scanDepth'>>,
  ) => void;
  readonly remove: (id: string) => void;
  readonly restore: (dictionary: Dictionary) => RestoreOutcome;
}

export const useDictionariesStore = create<DictionariesState>()((set, get) => {
  const put = (dictionary: Dictionary, checked = true): void => {
    const expected = checked ? (get().dictionaries[dictionary.id]?.updatedAt ?? null) : null;
    set({ dictionaries: { ...get().dictionaries, [dictionary.id]: dictionary } });
    dictionaryTable.write({
      id: dictionary.id,
      value: dictionary,
      expected,
      name: dictionary.name,
      latest: () => get().dictionaries[dictionary.id],
    });
  };

  return {
    dictionaries: {},
    loaded: false,

    load: async () => {
      const found = await dictionaryTable.loadAll(parseDictionary, (item) => item.id);
      const dictionaries = { ...found, ...get().dictionaries };
      set({ dictionaries, loaded: true });
      useSettingsStore.getState().keepLoreDictionaryIds(new Set(Object.keys(dictionaries)));
    },

    adopt: (name, entries) => {
      const same = Object.values(get().dictionaries).find((item) =>
        sameEntries(item.entries, entries),
      );
      if (same !== undefined) return { dictionary: same, added: false };
      const now = Date.now();
      const dictionary: Dictionary = {
        id: newShortId(),
        name,
        entries,
        createdAt: now,
        updatedAt: now,
      };
      put(dictionary);
      return { dictionary, added: true };
    },

    add: (name) => {
      const now = Date.now();
      const dictionary: Dictionary = {
        id: newShortId(),
        name,
        entries: [],
        createdAt: now,
        updatedAt: now,
      };
      put(dictionary);
      useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, true);
      return dictionary;
    },

    update: (id, patch) => {
      const dictionary = get().dictionaries[id];
      if (dictionary !== undefined) put({ ...dictionary, ...patch, updatedAt: Date.now() });
    },

    remove: (id) => {
      set({ dictionaries: omitKey(get().dictionaries, id) });
      useSettingsStore.getState().setLoreDictionaryEnabled(id, false);
      dictionaryTable.remove(id);
    },

    restore: (dictionary) => {
      const outcome = restoreOutcomeOf(get().dictionaries[dictionary.id], dictionary);
      if (outcome !== null) put(dictionary, false);
      return outcome;
    },
  };
});

export type DictionaryImport =
  | { readonly kind: 'added' | 'existing'; readonly name: string; readonly count: number }
  | { readonly kind: 'error'; readonly fileName: string; readonly problem: DictionaryFileProblem };

export async function importDictionaryFile(file: File): Promise<DictionaryImport> {
  if (isTooLarge(file, DICTIONARY_FILE_MAX_BYTES)) {
    return { kind: 'error', fileName: file.name, problem: 'size' };
  }
  let content: string;
  try {
    content = await file.text();
  } catch {
    return { kind: 'error', fileName: file.name, problem: 'format' };
  }
  const read = readDictionaryFile(file.name, content);
  if (read.kind === 'error') return { kind: 'error', fileName: file.name, problem: read.problem };
  const { dictionary, added } = useDictionariesStore.getState().adopt(read.name, read.entries);
  useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, true);
  return {
    kind: added ? 'added' : 'existing',
    name: dictionary.name,
    count: dictionary.entries.length,
  };
}
