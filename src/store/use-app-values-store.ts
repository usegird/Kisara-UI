import { create } from 'zustand';

import { setOwn } from '@/lib/own-key';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// App Mode（アプリ入力）で入れた値。カードの値（`widgets_values`）とは別に持ち、実行のときだけ優先する。
// 作業中はここが正本で、保存・書き出しのときだけ `extra.kisara.values` に書く。
// ─────────────────────────────

/**
 * 上書きの入れ物。キーは**平坦化後の prompt のノード id**（subgraph 内なら `59:70`）。
 * `${id}:${widget}` のような1本の文字列にすると、id 側のコロンと区別できなくなる。
 */
export type AppValues = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

/**
 * アプリ入力の値と、その戻す・やり直す手。値は保存で書くので、変えたらタブに未保存の印を付ける
 * （載せ直しでは付けない）
 */
interface AppValuesState {
  readonly values: AppValues;
  /** 直前までの値（Ctrl+Z 用）。新しいものが末尾 */
  readonly history: readonly AppValues[];
  /** 空文字・undefined は「未入力」として扱い、上書きを取り消す */
  readonly setValue: (promptNodeId: string, widgetName: string, value: unknown) => void;
  /** 戻した手（Ctrl+Y 用）。新しいものが末尾。値を入れ直すと捨てる */
  readonly future: readonly AppValues[];
  /** 1手戻す。戻せるものが無ければ false */
  readonly undo: () => boolean;
  /** 戻した手をやり直す。やり直せるものが無ければ false */
  readonly redo: () => boolean;
  readonly canUndo: () => boolean;
  readonly clear: () => void;
  /** 控えから載せ直す（タブの切り替え）。戻せる手数は引き継がない */
  readonly restore: (values: AppValues) => void;
}

/** 取っておく手数。増やしても値は小さいが、際限なく持たない */
const HISTORY_LIMIT = 50;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** アプリ入力の値のストア */
export const useAppValuesStore = create<AppValuesState>()((set, get) => ({
  values: new Map<string, Record<string, unknown>>(),
  history: [],
  future: [],

  setValue: (promptNodeId, widgetName, value) => {
    set((state) => {
      const next = new Map(state.values);
      const fields = { ...(next.get(promptNodeId) ?? {}) };

      if (isEmpty(value)) delete fields[widgetName];
      else setOwn(fields, widgetName, value);

      if (Object.keys(fields).length === 0) next.delete(promptNodeId);
      else next.set(promptNodeId, fields);

      return {
        values: next,
        history: [...state.history, state.values].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
    useGraphStore.getState().markDirty();
  },

  undo: () => {
    const { history, future, values } = get();
    const previous = history.at(-1);
    if (previous === undefined) return false;

    set({ values: previous, history: history.slice(0, -1), future: [...future, values] });
    useGraphStore.getState().markDirty();
    return true;
  },

  redo: () => {
    const { history, future, values } = get();
    const next = future.at(-1);
    if (next === undefined) return false;

    set({ values: next, history: [...history, values], future: future.slice(0, -1) });
    useGraphStore.getState().markDirty();
    return true;
  },

  canUndo: () => get().history.length > 0,

  clear: () => set({ values: new Map<string, Record<string, unknown>>(), history: [], future: [] }),

  restore: (values) => set({ values, history: [], future: [] }),
}));
