import { create } from 'zustand';

import type { HistoryEntry, QueueEntry } from '@/port/history';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { ownSessions, useTabsStore } from '@/store/use-tabs-store';
import { useTaskLogStore } from '@/store/use-task-log-store';

const POLL_TIMEOUT_MS = 5_000;

export const HISTORY_LIMIT = 20;

export function queueIds(entries: {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
}): string[] {
  return [...entries.running, ...entries.pending].map((entry) => entry.promptId);
}

export function queueChanged(
  before: { readonly running: readonly QueueEntry[]; readonly pending: readonly QueueEntry[] },
  after: { readonly running: readonly QueueEntry[]; readonly pending: readonly QueueEntry[] },
): boolean {
  const a = queueIds(before);
  const b = queueIds(after);

  return a.length !== b.length || a.some((id, index) => id !== b[index]);
}

interface QueueState {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
  readonly history: readonly HistoryEntry[];
  readonly error: string | null;
  readonly loading: boolean;
  readonly fetchedAt: number | null;
  readonly requestedAt: number | null;
  readonly refresh: (baseUrl: string, full?: boolean) => Promise<void>;
  readonly poll: (baseUrl: string) => Promise<boolean>;
  readonly clear: () => void;
}

const EMPTY = {
  running: [],
  pending: [],
  history: [],
  error: null,
  loading: false,
  fetchedAt: null,
  requestedAt: null,
};

export const useQueueStore = create<QueueState>()((set, get) => {
  let inFlight: Promise<void> | null = null;
  let queued: { readonly baseUrl: string; readonly full: boolean } | null = null;

  const load = async (baseUrl: string, full: boolean): Promise<void> => {
    set({ loading: true });
    const requestedAt = Date.now();
    const all = full || get().fetchedAt === null;
    try {
      const [queue, history] = await Promise.all([
        comfyPort().queue.fetchQueue(baseUrl),
        comfyPort().queue.fetchHistory(baseUrl, all ? undefined : HISTORY_LIMIT),
      ]);
      const own = ownSessions(useTabsStore.getState());
      useTaskLogStore.getState().record(
        history.entries.filter((entry) => entry.session !== null && own.includes(entry.session)),
        history.raw,
      );
      void useRunHistoryStore.getState().ingest(baseUrl, history.raw);
      set({
        running: queue.running,
        pending: queue.pending,
        history: history.entries,
        error: null,
        loading: false,
        fetchedAt: Date.now(),
        requestedAt,
      });
    } catch (error) {
      set({
        loading: false,
        error: formatComfyFailure(error),
      });
    }
  };

  return {
    ...EMPTY,

    refresh: (baseUrl, full = false) => {
      if (baseUrl.length === 0) return Promise.resolve();
      if (inFlight !== null) {
        queued = { baseUrl, full: full || (queued?.full ?? false) };
        return inFlight;
      }
      const run = async (): Promise<void> => {
        let job: { readonly baseUrl: string; readonly full: boolean } | null = { baseUrl, full };
        while (job !== null) {
          await load(job.baseUrl, job.full);
          job = queued;
          queued = null;
        }
      };
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    poll: async (baseUrl) => {
      if (baseUrl.length === 0) return true;

      try {
        const queue = await comfyPort().queue.fetchQueue(baseUrl, { timeoutMs: POLL_TIMEOUT_MS });
        if (queueChanged(get(), queue)) {
          await get().refresh(baseUrl);
          return true;
        }
        set({ error: null, fetchedAt: Date.now() });
        return true;
      } catch (error) {
        set({ error: formatComfyFailure(error) });
        return false;
      }
    },

    clear: () => set(EMPTY),
  };
});
