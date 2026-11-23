import { create } from 'zustand';

import { cardFields, cardLorebook, parseCharacterFields } from '@/chat/card';
import { parseLorebooks } from '@/chat/dictionary';
import {
  lorebookEntries,
  lorebookList,
  savedLorebooks,
  type LoreEntry,
  type OwnLorebook,
} from '@/chat/lore';
import type { CharacterFields, Preset } from '@/chat/types';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { useAvatarsStore } from '@/store/use-avatars-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { warnUnsaved } from '@/store/use-storage-warnings-store';

const presetTable = createLibraryTable('preset');

export function installPresetTable(next: ChatTable | null): void {
  presetTable.install(next);
}

export function parsePreset(raw: unknown): Preset | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const fields = parseCharacterFields(raw.fields);
  if (fields === null) return null;
  const at = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : fields.name,
    fields,
    imageId: typeof raw.imageId === 'string' ? raw.imageId : null,
    lorebooks: savedLorebooks(parseLorebooks(raw.lorebooks) ?? []),
    createdAt: at(raw.createdAt),
    updatedAt: at(raw.updatedAt),
  };
}

export function presetLorebook(preset: Preset | undefined): readonly LoreEntry[] {
  return lorebookEntries(preset?.lorebooks ?? []);
}

function sameContent(
  preset: Preset,
  fields: CharacterFields,
  lorebooks: readonly OwnLorebook[],
  imageId: string | null,
): boolean {
  return (
    JSON.stringify(preset.fields) === JSON.stringify(fields) &&
    JSON.stringify(preset.lorebooks) === JSON.stringify(lorebooks) &&
    preset.imageId === imageId
  );
}

interface PresetRefs {
  readonly imageId: string | null;
  readonly lorebooks: readonly OwnLorebook[];
}

interface PresetsState {
  readonly presets: Readonly<Record<string, Preset>>;
  readonly loaded: boolean;
  readonly load: () => Promise<void>;
  readonly addCard: (card: Record<string, unknown>, image: Blob | null) => Promise<Preset>;
  readonly add: (
    name: string,
    fields: CharacterFields,
    imageId: string | null,
    lorebooks: readonly OwnLorebook[],
  ) => Preset;
  readonly update: (id: string, name: string, fields: CharacterFields, refs: PresetRefs) => void;
  readonly remove: (id: string) => void;
  readonly setImage: (id: string, imageId: string | null) => void;
  readonly restore: (preset: Preset) => Promise<RestoreOutcome>;
}

function newPresetOf(
  name: string,
  fields: CharacterFields,
  imageId: string | null,
  lorebooks: Preset['lorebooks'],
): Preset {
  const now = Date.now();
  return { id: newShortId(), name, fields, imageId, lorebooks, createdAt: now, updatedAt: now };
}

export const usePresetsStore = create<PresetsState>()((set, get) => {
  const put = (preset: Preset): void => {
    const expected = get().presets[preset.id]?.updatedAt ?? null;
    set({ presets: { ...get().presets, [preset.id]: preset } });
    presetTable.write({
      id: preset.id,
      value: preset,
      expected,
      name: preset.name,
      latest: () => get().presets[preset.id],
    });
  };

  const putUnchecked = async (preset: Preset): Promise<void> => {
    set({ presets: { ...get().presets, [preset.id]: preset } });
    try {
      await presetTable.table().put(preset.id, preset);
    } catch {
      warnUnsaved('library');
    }
  };

  return {
    presets: {},
    loaded: false,

    load: async () => {
      await Promise.all([
        useAvatarsStore.getState().ensure(),
        useDictionariesStore.getState().loaded
          ? Promise.resolve()
          : useDictionariesStore.getState().load(),
      ]);
      const found = await presetTable.loadAll(parsePreset, (preset) => preset.id);
      set({ presets: { ...found, ...get().presets }, loaded: true });
    },

    addCard: async (card, image) => {
      const fields = cardFields(card);
      const lorebooks = lorebookList(cardLorebook(card));
      const imageId =
        image === null ? null : (await useAvatarsStore.getState().add(image, fields.name)).id;
      const same = Object.values(get().presets).find((item) =>
        sameContent(item, fields, lorebooks, imageId),
      );
      if (same !== undefined) return same;
      const preset = newPresetOf(fields.name, fields, imageId, lorebooks);
      await putUnchecked(preset);
      return preset;
    },

    add: (name, fields, imageId, lorebooks) => {
      const preset = newPresetOf(name, fields, imageId, savedLorebooks(lorebooks));
      put(preset);
      return preset;
    },

    update: (id, name, fields, refs) => {
      const preset = get().presets[id];
      if (preset === undefined) return;
      const lorebooks = savedLorebooks(refs.lorebooks);
      put({ ...preset, name, fields, ...refs, lorebooks, updatedAt: Date.now() });
    },

    setImage: (id, imageId) => {
      const preset = get().presets[id];
      if (preset !== undefined) put({ ...preset, imageId, updatedAt: Date.now() });
    },

    restore: async (preset) => {
      const outcome = restoreOutcomeOf(get().presets[preset.id], preset);
      if (outcome !== null) await putUnchecked(preset);
      return outcome;
    },

    remove: (id) => {
      set({ presets: omitKey(get().presets, id) });
      presetTable.remove(id);
    },
  };
});
