import { create } from 'zustand';

import { MODEL_FOLDERS, modelFileIndex, type ModelFile } from '@/graph/model-files';
import { compositeKey } from '@/lib/own-key';
import type { RequestFailure } from '@/port/connection';
import type { ModelsPort } from '@/port/models';
import { fallbackRequestFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';

export type ModelFolderStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelFolder {
  readonly status: ModelFolderStatus;
  readonly files: readonly ModelFile[];
  readonly index: ReadonlyMap<string, ModelFile>;
  readonly error: RequestFailure | null;
}

export function modelIndexes(
  folders: ReadonlyMap<string, ModelFolder>,
): Map<string, ReadonlyMap<string, ModelFile>> {
  const map = new Map<string, ReadonlyMap<string, ModelFile>>();
  for (const folder of MODEL_FOLDERS) {
    const entry = folders.get(folder);
    if (entry !== undefined && entry.index.size > 0) map.set(folder, entry.index);
  }
  return map;
}

export const EMPTY_MODEL_FOLDER: ModelFolder = {
  status: 'idle',
  files: [],
  index: new Map<string, ModelFile>(),
  error: null,
};

interface ModelFilesState {
  readonly folders: ReadonlyMap<string, ModelFolder>;
  readonly ensure: (baseUrl: string, folder: string) => Promise<void>;
  readonly refresh: (baseUrl: string, folder: string) => Promise<void>;
  readonly retryFailed: (baseUrl: string) => Promise<void>;
  readonly invalidate: () => void;
  readonly clear: () => void;
}

interface ModelFilesDeps {
  readonly fetchFiles: ModelsPort['fetchFiles'];
}

function toFailure(error: unknown, url: string): RequestFailure {
  return comfyPort().connection.failureOf(error) ?? fallbackRequestFailure(error, url);
}

export function createModelFilesStore(deps: ModelFilesDeps) {
  const inFlight = new Set<string>();

  return create<ModelFilesState>()((set, get) => {
    function put(folder: string, next: ModelFolder): void {
      const folders = new Map(get().folders);
      folders.set(folder, next);
      set({ folders });
    }

    async function load(baseUrl: string, folder: string): Promise<void> {
      const key = compositeKey(baseUrl, folder);
      if (inFlight.has(key)) return;
      inFlight.add(key);

      const current = get().folders.get(folder) ?? EMPTY_MODEL_FOLDER;
      put(folder, { ...current, status: 'loading', error: null });

      try {
        const files = await deps.fetchFiles(baseUrl, folder, {});
        put(folder, { status: 'ready', files, index: modelFileIndex(files), error: null });
      } catch (error) {
        const failure = toFailure(error, baseUrl);
        put(folder, { status: 'error', files: [], index: new Map(), error: failure });
      } finally {
        inFlight.delete(key);
      }
    }

    return {
      folders: new Map<string, ModelFolder>(),

      async ensure(baseUrl, folder) {
        if (baseUrl.length === 0) return;

        const current = get().folders.get(folder);
        if (current !== undefined && current.status !== 'idle') return;

        await load(baseUrl, folder);
      },

      refresh: (baseUrl, folder) =>
        baseUrl.length === 0 ? Promise.resolve() : load(baseUrl, folder),

      async retryFailed(baseUrl) {
        if (baseUrl.length === 0) return;
        const failed = [...get().folders].filter(([, entry]) => entry.status === 'error');
        await Promise.all(failed.map(([folder]) => load(baseUrl, folder)));
      },

      invalidate: () => {
        const folders = new Map<string, ModelFolder>();
        for (const [folder, entry] of get().folders) {
          folders.set(folder, entry.status === 'loading' ? entry : { ...entry, status: 'idle' });
        }
        set({ folders });
      },

      clear: () => set({ folders: new Map<string, ModelFolder>() }),
    };
  });
}

export const useModelFilesStore = createModelFilesStore({
  fetchFiles: (baseUrl, folder, options) => comfyPort().models.fetchFiles(baseUrl, folder, options),
});
