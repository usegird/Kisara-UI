import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import { registerTabScoped } from '@/store/kit/tab-scoped';

interface TabUiState {
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
