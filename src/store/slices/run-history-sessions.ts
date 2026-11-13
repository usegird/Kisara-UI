import type { StateCreator } from 'zustand';

import {
  ownFile,
  queueWrite,
  rememberName,
  rememberSentWorkflow,
  saveOwn,
  writeRuns,
} from '@/store/slices/run-history-kit';
import type { RunHistoryState } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 実行の記録のストアの、送った実行を記録に足す・セッションの名前を読む・書く操作。
// ─────────────────────────────

/** この slice が持つ操作 */
type RunHistorySessionActions = Pick<
  RunHistoryState,
  'setUpTo' | 'rememberSent' | 'ingest' | 'loadSession' | 'setSessionName'
>;

/** 送った実行を記録に足す・セッションの名前の操作を作る */
export const createRunHistorySessionSlice: StateCreator<
  RunHistoryState,
  [],
  [],
  RunHistorySessionActions
> = (set, get) => ({
  setUpTo: (upTo) => set({ upTo }),

  rememberSent: (promptId, workflow) => {
    if (!useSettingsStore.getState().recordRunHistory) return;
    rememberSentWorkflow(promptId, workflow);
  },

  ingest: (baseUrl, raw) => {
    if (baseUrl.length === 0 || !useSettingsStore.getState().recordRunHistory) {
      return Promise.resolve();
    }
    return queueWrite(set, () => writeRuns(baseUrl, raw));
  },

  loadSession: (baseUrl) => {
    set({ sessionName: '' });
    const session = activeSession(useTabsStore.getState());
    if (baseUrl.length === 0 || session === null) return Promise.resolve();
    return queueWrite(set, async () => {
      const file = await ownFile(baseUrl, session);
      rememberName({ set, get }, session, file.name ?? '');
      // 読んでいる間に別のタブへ移っていたら出さない
      if (activeSession(useTabsStore.getState()) === session) {
        set({ sessionName: file.name ?? '' });
      }
    });
  },

  setSessionName: (baseUrl, name) => {
    const session = activeSession(useTabsStore.getState());
    if (baseUrl.length === 0 || session === null) return Promise.resolve();
    if (!useSettingsStore.getState().recordRunHistory) return Promise.resolve();
    const trimmed = name.trim();
    return queueWrite(set, async () => {
      const file = await ownFile(baseUrl, session);
      if ((file.name ?? '') === trimmed) return;
      await saveOwn(baseUrl, session, {
        ...file,
        name: trimmed.length === 0 ? undefined : trimmed,
      });
      rememberName({ set, get }, session, trimmed);
      if (activeSession(useTabsStore.getState()) === session) set({ sessionName: trimmed });
    });
  },
});
