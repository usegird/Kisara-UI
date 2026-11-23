import { create } from 'zustand';

export interface ResponsePrice {
  readonly prompt: number | null;
  readonly completion: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

export interface ResponseStats {
  readonly sentAt: number;
  readonly firstAt: number | null;
  readonly endedAt: number | null;
  readonly price: ResponsePrice;
  readonly tooling: boolean;
  readonly serverTools: boolean;
}

export const TOOLING_GAP_MS = 1500;

const lastText = new Map<string, number>();

export function responseKey(chatId: string, messageId: string, candidate: number): string {
  return `${chatId}/${messageId}/${String(candidate)}`;
}

interface ResponseStatsState {
  readonly stats: Readonly<Record<string, ResponseStats>>;
  readonly start: (key: string, price: ResponsePrice, at: number, serverTools?: boolean) => void;
  readonly first: (key: string, at: number) => void;
  readonly end: (key: string, at: number) => void;
  readonly processing: (key: string, at: number) => void;
  readonly resume: (key: string, at: number) => void;
}

export const useResponseStatsStore = create<ResponseStatsState>()((set, get) => {
  const patch = (key: string, next: (stats: ResponseStats) => ResponseStats | null): void => {
    const current = get().stats[key];
    if (current === undefined) return;
    const changed = next(current);
    if (changed !== null) set({ stats: { ...get().stats, [key]: changed } });
  };
  return {
    stats: {},
    start: (key, price, at, serverTools = false) => {
      lastText.delete(key);
      set({
        stats: {
          ...get().stats,
          [key]: { sentAt: at, firstAt: null, endedAt: null, price, tooling: false, serverTools },
        },
      });
    },
    first: (key, at) =>
      patch(key, (stats) => (stats.firstAt === null ? { ...stats, firstAt: at } : null)),
    end: (key, at) => {
      lastText.delete(key);
      patch(key, (stats) => ({ ...stats, endedAt: at, tooling: false }));
    },
    processing: (key, at) =>
      patch(key, (stats) => {
        const since = lastText.get(key);
        if (!stats.serverTools || stats.tooling || since === undefined) return null;
        return at - since < TOOLING_GAP_MS ? null : { ...stats, tooling: true };
      }),
    resume: (key, at) => {
      lastText.set(key, at);
      patch(key, (stats) => (stats.tooling ? { ...stats, tooling: false } : null));
    },
  };
});
