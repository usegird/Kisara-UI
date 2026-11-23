import { create } from 'zustand';

const KIBI = 1024;
const RECEIVED_KEEP_KIBI = 256;

export const RECEIVED_LIMIT = KIBI * KIBI;
export const RECEIVED_KEEP = RECEIVED_KEEP_KIBI * KIBI;

export interface ReceivedBody {
  readonly id: number;
  readonly at: number;
  readonly text: string;
  readonly truncated: boolean;
}

export function keptBody(text: string): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= RECEIVED_LIMIT) return { text, truncated: false };
  return {
    text: `${text.slice(0, RECEIVED_KEEP)}\n…\n${text.slice(-RECEIVED_KEEP)}`,
    truncated: true,
  };
}

interface ReceivedState {
  readonly byKey: Readonly<Record<string, ReceivedBody>>;
  readonly add: (key: string, text: string, at: number) => void;
}

let nextId = 0;

export const useReceivedStore = create<ReceivedState>()((set, get) => ({
  byKey: {},
  add: (key, text, at) => {
    nextId += 1;
    set({ byKey: { ...get().byKey, [key]: { ...keptBody(text), at, id: nextId } } });
  },
}));
