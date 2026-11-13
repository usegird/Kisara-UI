import { create } from 'zustand';

import { isString } from '@/lib/guards';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';

// ─────────────────────────────
// タスクの詳細。**キュー列とタブの中身の両方から触る**ので、どちらの部品にも属さない状態としてここに置く。
// 重ねるものは 1 つだけなので、画像を重ねたら詳細は閉じる（閉じるのは呼び出し側）。
// ─────────────────────────────

/** 開いているタスクの詳細と、開く・閉じる操作 */
interface TaskDetailState {
  /** 開いているタスク。null なら閉じている */
  readonly promptId: string | null;
  /** 新しく走り出したタスクへ自動で移るか。遡って見たいときは外す */
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

// 開いている詳細はタブのもの。追従は画面全体の好みなので分けない
registerTabScopedValue('taskDetail', {
  current: () => useTaskDetailStore.getState().promptId,
  isValue: isString,
  open: (promptId) => useTaskDetailStore.getState().open(promptId),
  close: () => useTaskDetailStore.getState().close(),
});
