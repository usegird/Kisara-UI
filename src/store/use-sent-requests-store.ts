import { create } from 'zustand';

export interface SentRequest {
  readonly id: number;
  readonly at: number;
  readonly model: string;
  readonly body: string;
}

export function callRequestKey(chatId: string, callId: string): string {
  return `${chatId}/${callId}/call`;
}

interface SentRequestsState {
  readonly byKey: Readonly<Record<string, SentRequest>>;
  readonly add: (key: string, request: Omit<SentRequest, 'id'>) => void;
  readonly move: (from: string, to: readonly string[]) => void;
}

let nextId = 0;

export const useSentRequestsStore = create<SentRequestsState>()((set, get) => ({
  byKey: {},
  add: (key, request) => {
    nextId += 1;
    set({ byKey: { ...get().byKey, [key]: { ...request, id: nextId } } });
  },
  move: (from, to) => {
    const { [from]: entry, ...rest } = get().byKey;
    if (entry === undefined) return;
    set({ byKey: { ...rest, ...Object.fromEntries(to.map((key) => [key, entry])) } });
  },
}));
