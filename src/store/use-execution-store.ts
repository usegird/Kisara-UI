import { create } from 'zustand';

import type { ComfyEvent } from '@/port/run';
import { reconcileExecution, reduceExecution, type QueuePresence } from '@/queue/execution';
import {
  clearRun,
  INITIAL_EXECUTION,
  type ExecutionError,
  type ExecutionSnapshot,
} from '@/queue/execution-state';

export interface ExecutionState extends ExecutionSnapshot {
  readonly start: (promptId: string, nodeIds?: readonly string[]) => void;
  readonly applyEvent: (event: ComfyEvent) => void;
  readonly reconcile: (presence: QueuePresence) => void;
  readonly fail: (error: ExecutionError) => void;
  readonly markUnknown: (message: string) => void;
  readonly stop: () => void;
  readonly clearForSubmit: () => void;
  readonly reset: () => void;
}

const QUEUE_MEMORY = 50;

export const useExecutionStore = create<ExecutionState>()((set) => ({
  ...INITIAL_EXECUTION,

  start: (promptId, nodeIds) =>
    set((state) => {
      const submittedIds = [...state.submittedIds, promptId].slice(-QUEUE_MEMORY);
      const promptNodesById =
        nodeIds === undefined ? state.promptNodesById : withPromptNodes(state, promptId, nodeIds);

      const submittedAt = Date.now();

      if (state.observedPromptId === promptId) {
        return { ...state, promptId, submittedIds, promptNodesById, submittedAt };
      }

      const busy = state.status === 'running' || state.status === 'queued';
      if (busy) return { ...state, submittedIds, promptNodesById };

      return {
        ...clearRun(state),
        status: 'queued',
        promptId,
        submittedIds,
        promptNodesById,
        submittedAt,
      };
    }),

  applyEvent: (event) =>
    set((state) => {
      const next = reduceExecution(state, event);
      if (next === state) return next;

      const started = next.status === 'running' && state.status !== 'running';
      const finished =
        (next.status === 'done' || next.status === 'failed') && next.status !== state.status;

      return {
        ...next,
        startedAt: started ? Date.now() : next.startedAt,
        finishedAt: finished ? Date.now() : next.finishedAt,
      };
    }),

  reconcile: (presence) => set((state) => reconcileExecution(state, presence)),

  markUnknown: (message) =>
    set((state) =>
      state.status === 'running' || state.status === 'queued'
        ? {
            ...state,
            status: 'unknown',
            runningNode: null,
            progress: null,
            finishedAt: Date.now(),
            error: { node: null, message },
          }
        : state,
    ),

  fail: (error) =>
    set({
      status: 'failed',
      error,
      runningNode: null,
      progress: null,
      finishedAt: Date.now(),
    }),

  stop: () =>
    set((state) =>
      state.status === 'running' || state.status === 'queued'
        ? {
            ...state,
            status: 'done',
            runningNode: null,
            progress: null,
            interrupted: true,
            finishedAt: Date.now(),
          }
        : state,
    ),

  clearForSubmit: () => set(clearRun),

  reset: () => set(INITIAL_EXECUTION),
}));

function withPromptNodes(
  state: ExecutionSnapshot,
  promptId: string,
  nodeIds: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  const entries = Object.entries({ ...state.promptNodesById, [promptId]: nodeIds });
  return Object.fromEntries(entries.slice(-QUEUE_MEMORY));
}
