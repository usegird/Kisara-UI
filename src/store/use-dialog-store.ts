import { create } from 'zustand';

import type { DialogMode } from '@/lib/dialog-rect';

interface OpenDialog {
  readonly id: string;
  readonly mode: DialogMode;
  readonly close: (() => void) | null;
}

interface DialogState {
  readonly embedHost: HTMLElement | null;
  readonly order: readonly OpenDialog[];
  readonly setEmbedHost: (host: HTMLElement | null) => void;
  readonly raise: (id: string, mode: DialogMode, close?: (() => void) | null) => void;
  readonly reclaim: (id: string) => void;
  readonly remove: (id: string) => void;
}

export const useDialogStore = create<DialogState>()((set, get) => ({
  embedHost: null,
  order: [],
  setEmbedHost: (embedHost) => set({ embedHost }),
  raise: (id, mode, close) => {
    let closing: readonly OpenDialog[] = [];
    set((state) => {
      const known = state.order.find((entry) => entry.id === id);
      const entry: OpenDialog = {
        id,
        mode,
        close: close === undefined ? (known?.close ?? null) : close,
      };
      const others = state.order.filter((item) => item.id !== id);
      if (entry.mode === 'embedded' && entry.close !== null) {
        closing = others.filter((item) => item.mode === 'embedded' && item.close !== null);
      }
      const top = state.order.at(-1);
      const unchanged = top === known && top?.mode === mode && top.close === entry.close;
      if (unchanged && closing.length === 0) return state;
      return { order: [...others, entry] };
    });
    for (const item of closing) item.close?.();
  },
  reclaim: (id) => {
    const known = get().order.find((entry) => entry.id === id);
    if (known !== undefined) get().raise(id, known.mode);
  },
  remove: (id) =>
    set((state) =>
      state.order.some((entry) => entry.id === id)
        ? { order: state.order.filter((entry) => entry.id !== id) }
        : state,
    ),
}));

export function topEmbedded(order: readonly OpenDialog[]): string | null {
  return order.findLast((entry) => entry.mode === 'embedded')?.id ?? null;
}
