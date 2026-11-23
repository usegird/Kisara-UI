import { useCallback, useState } from 'react';

import { useTabUiStore } from '@/store/use-tab-ui-store';

type SetTabState<T> = (next: T | ((previous: T) => T)) => void;

export function useTabState<T>(key: string, initial: T): [T, SetTabState<T>] {
  const [fallback] = useState(initial);
  const value = useTabUiStore((state) =>
    key in state.values ? (state.values[key] as T) : fallback,
  );
  const setValue = useCallback<SetTabState<T>>(
    (next) => {
      const { values, setValue: write } = useTabUiStore.getState();
      const previous = key in values ? (values[key] as T) : fallback;
      write(key, typeof next === 'function' ? (next as (previous: T) => T)(previous) : next);
    },
    [key, fallback],
  );
  return [value, setValue];
}
