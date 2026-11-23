import { create } from 'zustand';

import { jsonEditsFilePath, notesFilePath } from '@/graph/kisara-files';
import type { ModelJsonEdits, ModelJsonSource } from '@/graph/model-json-edits';
import { createBaseUrlActions } from '@/store/kit/base-url-resource';
import { comfyPort } from '@/store/ports/comfy-port';

type ModelNotesRouteStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelNotesStoreState {
  readonly status: ModelNotesRouteStatus;
  readonly baseUrl: string;
  readonly error: string | null;
  readonly pysssss: boolean;
  readonly saved: ReadonlySet<string>;
  readonly ensure: (baseUrl: string) => Promise<void>;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly invalidate: () => void;
  readonly read: (baseUrl: string, folder: string, filename: string) => Promise<string | null>;
  readonly save: (baseUrl: string, folder: string, filename: string, text: string) => Promise<void>;
  readonly readJson: (
    baseUrl: string,
    folder: string,
    filename: string,
  ) => Promise<ModelJsonSource>;
  readonly saveJsonEdits: (
    baseUrl: string,
    folder: string,
    filename: string,
    edits: ModelJsonEdits,
  ) => Promise<void>;
}

const NO_EDITS: ModelJsonEdits = new Map();

const NO_NOTES: ReadonlySet<string> = new Set();

export const useModelNotesStore = create<ModelNotesStoreState>()((set, get) => {
  async function fetchRoutes(baseUrl: string): Promise<Partial<ModelNotesStoreState>> {
    const { models } = comfyPort();
    const [pysssss, saved] = await Promise.all([
      models.hasNotesRoute(baseUrl, {}),
      models.listNotes(baseUrl, {}),
    ]);
    return { status: 'ready', pysssss, saved };
  }

  return {
    status: 'idle',
    baseUrl: '',
    error: null,
    pysssss: false,
    saved: NO_NOTES,
    ...createBaseUrlActions(set, get, fetchRoutes),
    read: async (baseUrl, folder, filename) => {
      const { models } = comfyPort();
      const state = get();
      if (state.saved.has(notesFilePath(folder, filename))) {
        const saved = await models.fetchNotes(baseUrl, folder, filename);
        if (saved !== null && saved.trim().length > 0) return saved;
      }
      if (state.pysssss) return models.fetchPysssssNotes(baseUrl, folder, filename);
      return null;
    },
    save: async (baseUrl, folder, filename, text) => {
      await comfyPort().models.saveNotes(baseUrl, { folder, filename, text });
      if (get().baseUrl !== baseUrl) return;
      set((state) => ({ saved: new Set(state.saved).add(notesFilePath(folder, filename)) }));
    },
    readJson: async (baseUrl, folder, filename) => {
      const { models } = comfyPort();
      const state = get();
      const [original, edits] = await Promise.all([
        state.pysssss ? models.fetchModelJson(baseUrl, folder, filename) : null,
        state.saved.has(jsonEditsFilePath(folder, filename))
          ? models.fetchJsonEdits(baseUrl, folder, filename)
          : NO_EDITS,
      ]);
      return { original, edits };
    },
    saveJsonEdits: async (baseUrl, folder, filename, edits) => {
      await comfyPort().models.saveJsonEdits(baseUrl, { folder, filename, edits });
      if (get().baseUrl !== baseUrl) return;
      set((state) => ({ saved: new Set(state.saved).add(jsonEditsFilePath(folder, filename)) }));
    },
  };
});
