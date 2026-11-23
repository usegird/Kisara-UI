import { create } from 'zustand';

import { isString } from '@/lib/guards';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';

interface HistoryDetailState {
  readonly key: string | null;
  readonly open: (key: string) => void;
  readonly close: () => void;
}

export const useHistoryDetailStore = create<HistoryDetailState>()((set) => ({
  key: null,
  open: (key) => set({ key }),
  close: () => set({ key: null }),
}));

registerTabScopedValue('historyDetail', {
  current: () => useHistoryDetailStore.getState().key,
  isValue: isString,
  open: (key) => useHistoryDetailStore.getState().open(key),
  close: () => useHistoryDetailStore.getState().close(),
});
