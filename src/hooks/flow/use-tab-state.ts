import { useCallback, useState } from 'react';

import { useTabUiStore } from '@/store/use-tab-ui-store';

// ─────────────────────────────
// `useState` と同じ形で、値をタブごとに分けて持つ。ダイアログの開け閉てと対象に使う。
// ─────────────────────────────

type SetTabState<T> = (next: T | ((previous: T) => T)) => void;

/**
 * 今のタブの値とその書き換えを返す。
 * @param key - 値の名前。部品ごとに重ならないよう付ける
 */
export function useTabState<T>(key: string, initial: T): [T, SetTabState<T>] {
  // 既定は最初の値を使い続ける（描画のたびに作り直す値で手続きを作り直さない）
  const [fallback] = useState(initial);
  // 値を書くのはこの名前を使う部品だけなので、読んだ値は T として扱える
  const value = useTabUiStore((state) =>
    key in state.values ? (state.values[key] as T) : fallback,
  );
  // useState の setter と同じく変わらない物として渡す（effect の依存に置かれる）ので、手で固定する
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
