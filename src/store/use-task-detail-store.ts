import { create } from 'zustand';

import { isString } from '@/lib/guards';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';

interface TaskDetailState {
  readonly promptId: string | null;
  readonly follow: boolean;
  readonly open: (promptId: string) => void;
  readonly close: () => void;
  readonly setFollow: (follow: boolean) => void;
}

export const useTaskDetailStore = create<TaskDetailState>()((set) => ({
  promptId: null,
  follow: true,
  open: (promptId) => set({ promptId }),
  close: () => set({ promptId: null }),
  setFollow: (follow) => set({ follow }),
}));

registerTabScopedValue('taskDetail', {
  current: () => useTaskDetailStore.getState().promptId,
  isValue: isString,
  open: (promptId) => useTaskDetailStore.getState().open(promptId),
  close: () => useTaskDetailStore.getState().close(),
});
