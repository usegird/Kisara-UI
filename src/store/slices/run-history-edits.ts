import type { StateCreator } from 'zustand';

import { t } from '@/i18n';
import type { RunHistoryFile } from '@/port/run-history';
import { comfyPort } from '@/store/ports/comfy-port';
import {
  forgetOwn,
  keptOwn,
  queueWrite,
  rememberName,
  runHistoryLoading,
  saveOwn,
  sessionOfFileName,
} from '@/store/slices/run-history-kit';
import type { RunHistoryState } from '@/store/use-run-history-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';

type RunHistoryEditActions = Pick<RunHistoryState, 'renameSession' | 'removeSession'>;

export const createRunHistoryEditSlice: StateCreator<
  RunHistoryState,
  [],
  [],
  RunHistoryEditActions
> = (set, get) => ({
  renameSession: (baseUrl, fileName, name) => {
    if (baseUrl.length === 0) return Promise.resolve();
    const session = sessionOfFileName(fileName);
    const trimmed = name.trim();
    return queueWrite(set, async () => {
      const kept = keptOwn(baseUrl, session);
      const file = kept ?? (await readExisting(baseUrl, fileName));
      if ((file.name ?? '') === trimmed) return;
      const next: RunHistoryFile = { ...file, name: trimmed.length === 0 ? undefined : trimmed };
      if (kept === undefined) await comfyPort().runHistory.save(baseUrl, fileName, next);
      else await saveOwn(baseUrl, session, next);
      rememberName({ set, get }, session, trimmed);
      if (activeSession(useTabsStore.getState()) === session) set({ sessionName: trimmed });
      set((state) =>
        state.files.has(fileName) ? { files: new Map(state.files).set(fileName, next) } : {},
      );
    });
  },

  removeSession: (baseUrl, fileName) => {
    if (baseUrl.length === 0) return Promise.resolve();
    const session = sessionOfFileName(fileName);
    return queueWrite(set, async () => {
      await comfyPort().userFiles.remove(baseUrl, 'history', fileName);
      forgetOwn(baseUrl, session);
      runHistoryLoading.requested.delete(fileName);
      rememberName({ set, get }, session, '');
      if (activeSession(useTabsStore.getState()) === session) set({ sessionName: '' });
      set((state) => {
        const files = new Map(state.files);
        files.delete(fileName);
        return { entries: state.entries.filter((entry) => entry.name !== fileName), files };
      });
    });
  },
});

async function readExisting(baseUrl: string, fileName: string): Promise<RunHistoryFile> {
  const read = await comfyPort().runHistory.fetch(baseUrl, fileName);
  if (read.kind !== 'file') throw new Error(t('api.runHistory.unexpected'));
  return read.file;
}
