import type { StateCreator } from 'zustand';

import type { RunHistoryFile } from '@/port/run-history';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { runHistoryLoading } from '@/store/slices/run-history-kit';
import type { RunHistoryState } from '@/store/use-run-history-store';

const FAILURE_SEPARATOR = ' / ';

type RunHistoryFileActions = Pick<RunHistoryState, 'load' | 'fetchFiles' | 'clear'>;

interface ReadFiles {
  readonly read: Map<string, RunHistoryFile>;
  readonly failures: readonly string[];
}

export const createRunHistoryFileSlice: StateCreator<
  RunHistoryState,
  [],
  [],
  RunHistoryFileActions
> = (set, get) => ({
  load: async (baseUrl) => {
    const generation = ++runHistoryLoading.generation;
    runHistoryLoading.requested.clear();
    if (baseUrl.length === 0) {
      set({ entries: [], files: new Map(), status: 'idle', error: null });
      return;
    }
    set({ status: 'loading', error: null });

    try {
      const entries = await comfyPort().runHistory.list(baseUrl);
      if (generation !== runHistoryLoading.generation) return;
      set({ entries, files: new Map(), status: 'ready', error: null });
    } catch (error) {
      if (generation !== runHistoryLoading.generation) return;
      set({ status: 'error', error: formatComfyFailure(error) });
    }
  },

  fetchFiles: async (baseUrl, names) => {
    const { requested } = runHistoryLoading;
    const generation = runHistoryLoading.generation;
    const loaded = get().files;
    const wanted = names.filter((name) => !requested.has(name) && !loaded.has(name));
    if (baseUrl.length === 0 || wanted.length === 0) return;
    for (const name of wanted) requested.add(name);

    const { read, failures } = await readFiles(baseUrl, wanted);
    if (generation !== runHistoryLoading.generation) return;
    set((state) => ({
      files: read.size === 0 ? state.files : new Map([...state.files, ...read]),
      error: failures.length > 0 ? failures.join(FAILURE_SEPARATOR) : state.error,
    }));
  },

  clear: () => {
    runHistoryLoading.generation++;
    runHistoryLoading.owned.clear();
    runHistoryLoading.sent.clear();
    runHistoryLoading.requested.clear();
    set({
      entries: [],
      files: new Map(),
      status: 'idle',
      error: null,
      upTo: null,
      sessionName: '',
    });
  },
});

async function readFiles(baseUrl: string, wanted: readonly string[]): Promise<ReadFiles> {
  const read = new Map<string, RunHistoryFile>();
  const failures: string[] = [];
  await Promise.all(
    wanted.map(async (name) => {
      try {
        const result = await comfyPort().runHistory.fetch(baseUrl, name);
        if (result.kind === 'file') read.set(name, result.file);
      } catch (error) {
        runHistoryLoading.requested.delete(name);
        failures.push(`${name}: ${formatComfyFailure(error)}`);
      }
    }),
  );
  return { read, failures };
}
