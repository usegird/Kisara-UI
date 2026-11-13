import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import { registerTabScoped } from '@/store/kit/tab-scoped';

// ─────────────────────────────
// 部品が持っていたダイアログの開け閉てを、タブごとに分けて持つ。
// 部品は `useTabState`（hooks/）から名前を決めて使う。値は名前ごとに持ち、タブを切り替えると
// タブの控えへ移し、戻ると戻す。新しいタブは何も無い状態から始める。端末には残さない。
// ─────────────────────────────

/** タブごとに分ける部品の値（名前ごと）と、その操作 */
interface TabUiState {
  /** 名前 → 値。無い名前は部品の既定 */
  readonly values: Readonly<Record<string, unknown>>;
  readonly setValue: (key: string, value: unknown) => void;
}

const EMPTY: Readonly<Record<string, unknown>> = {};

export const useTabUiStore = create<TabUiState>()((set) => ({
  values: EMPTY,
  setValue: (key, value) =>
    set((state) =>
      Object.is(state.values[key], value) ? state : { values: { ...state.values, [key]: value } },
    ),
}));

registerTabScoped('tabUi', {
  capture: () => {
    const { values } = useTabUiStore.getState();
    return Object.keys(values).length === 0 ? undefined : values;
  },
  restore: (saved) => {
    const values = isRecord(saved) ? saved : EMPTY;
    if (useTabUiStore.getState().values !== values) useTabUiStore.setState({ values });
  },
});
