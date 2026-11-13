import { create } from 'zustand';

import { isString } from '@/lib/guards';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';

// ─────────────────────────────
// 履歴の詳細。**右の列とタブの中身の両方から触る**ので、
// どちらの部品にも属さない状態としてここに置く（タスクの詳細と同じ）。
// 重ねるものは 1 つだけなので、ほかの重ねを閉じるのは開く側が持つ。
// ─────────────────────────────

/** 実行の記録の詳細で開いているカードと、開く・閉じる操作 */
interface HistoryDetailState {
  /** 開いているカードの鍵（骨組みの鍵）。null なら閉じている */
  readonly key: string | null;
  readonly open: (key: string) => void;
  readonly close: () => void;
}

export const useHistoryDetailStore = create<HistoryDetailState>()((set) => ({
  key: null,
  open: (key) => set({ key }),
  close: () => set({ key: null }),
}));

// 開いている詳細はタブのもの
registerTabScopedValue('historyDetail', {
  current: () => useHistoryDetailStore.getState().key,
  isValue: isString,
  open: (key) => useHistoryDetailStore.getState().open(key),
  close: () => useHistoryDetailStore.getState().close(),
});
