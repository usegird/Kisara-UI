import { create } from 'zustand';

import { setOwn } from '@/lib/own-key';
import { useGraphStore } from '@/store/use-graph-store';

export type AppValues = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

interface AppValuesState {
  readonly values: AppValues;
  readonly history: readonly AppValues[];
  readonly setValue: (promptNodeId: string, widgetName: string, value: unknown) => void;
  readonly future: readonly AppValues[];
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly canUndo: () => boolean;
  readonly clear: () => void;
  readonly restore: (values: AppValues) => void;
}

const HISTORY_LIMIT = 50;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

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
