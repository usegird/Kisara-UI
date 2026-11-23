import { create } from 'zustand';

import type { HistoryEntry } from '@/port/history';
import { formatHistoryFailure } from '@/queue/comfy-failure-text';
import {
  mergeTaskEntries,
  type RejectedRun,
  type SubmittedRun,
  type TaskLogEntry,
} from '@/queue/task-log';
import { registerHolder, trimHeld } from '@/store/kit/memory-budget';

const REJECTED_ID_PREFIX = 'rejected:';

let rejectedCount = 0;

interface TaskLogState {
  readonly entries: readonly TaskLogEntry[];
  readonly record: (
    entries: readonly HistoryEntry[],
    raw?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly recordSubmitted: (promptId: string, run: SubmittedRun) => void;
  readonly setDetail: (promptId: string, raw: unknown) => void;
  readonly recordRejected: (run: RejectedRun) => string;
  readonly clear: () => void;
}

export const useTaskLogStore = create<TaskLogState>()((set) => ({
  entries: [],

  record: (entries, raw = {}) =>
    set((state) => ({
      entries: mergeTaskEntries(
        state.entries,
        entries.map((entry) => ({
          promptId: entry.promptId,
          number: entry.number,
          startedAt: entry.startedAt,
          finishedAt: entry.finishedAt,
          success: entry.success,
          outputs: entry.outputs,
          error: formatHistoryFailure(entry.error),
          name: null,
          raw: raw[entry.promptId],
        })),
      ),
    })),

  setDetail: (promptId, raw) =>
    set((state) => {
      const previous = state.entries.find((entry) => entry.promptId === promptId);
      if (!previous) return state;

      return { entries: mergeTaskEntries(state.entries, [{ ...previous, raw }]) };
    }),

  recordRejected: ({ name, labels, notes, failure, prompt, at }) => {
    rejectedCount += 1;
    const promptId = `${REJECTED_ID_PREFIX}${String(at)}:${String(rejectedCount)}`;
    set((state) => ({
      entries: mergeTaskEntries(state.entries, [
        {
          promptId,
          number: null,
          startedAt: at,
          finishedAt: at,
          success: false,
          outputs: [],
          name,
          raw: prompt === null ? undefined : { prompt: [null, promptId, prompt, {}, []] },
          rejection: failure,
          labels,
          notes,
        },
      ]),
    }));
    return promptId;
  },

  recordSubmitted: (promptId, { name, labels, notes }) =>
    set((state) => ({
      entries: mergeTaskEntries(state.entries, [
        {
          promptId,
          number: null,
          startedAt: Date.now(),
          finishedAt: null,
          success: null,
          outputs: [],
          name,
          labels,
          notes,
        },
      ]),
    })),

  clear: () => set({ entries: [] }),
}));

const rawBytes = new WeakMap<object, number>();

function bytesOf(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 0;
  const known = rawBytes.get(raw);
  if (known !== undefined) return known;
  let bytes = 0;
  try {
    bytes = JSON.stringify(raw).length;
  } catch {
  }
  rawBytes.set(raw, bytes);
  return bytes;
}

registerHolder('task-log', {
  held: () =>
    useTaskLogStore.getState().entries.flatMap((entry) =>
      entry.raw === undefined || entry.rejection !== undefined
        ? []
        : [
            {
              key: entry.promptId,
              bytes: bytesOf(entry.raw),
              order: entry.startedAt ?? entry.finishedAt ?? 0,
            },
          ],
    ),
  release: (keys) =>
    useTaskLogStore.setState((state) => ({
      entries: state.entries.map((entry) =>
        keys.has(entry.promptId) ? { ...entry, raw: undefined } : entry,
      ),
    })),
});

useTaskLogStore.subscribe((state, previous) => {
  if (state.entries !== previous.entries) trimHeld();
});
