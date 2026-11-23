import type { OutputFileRef } from '@/port/files';
import type { ProgressNodeState } from '@/port/run';

export type ExecutionStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'unknown';

export interface ExecutionProgress {
  readonly value: number;
  readonly max: number;
}

export interface ExecutionError {
  readonly node: string | null;
  readonly message: string;
}

export interface NodeTiming {
  readonly nodeId: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export interface ExecutionSnapshot {
  readonly status: ExecutionStatus;
  readonly promptId: string | null;
  readonly queueRemaining: number | null;
  readonly runningNode: string | null;
  readonly progress: ExecutionProgress | null;
  readonly cachedNodes: readonly string[];
  readonly outputsById: Readonly<Record<string, RunOutputs>>;
  readonly nodeStates: Readonly<Record<string, ProgressNodeState>>;
  readonly interrupted: boolean;
  readonly error: ExecutionError | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly submittedAt: number | null;
  readonly observedPromptId: string | null;
  readonly nodeTimingsById: Readonly<Record<string, readonly NodeTiming[]>>;
  readonly submittedIds: readonly string[];
  readonly promptNodesById: Readonly<Record<string, readonly string[]>>;
  readonly absences: number;
}

export const INITIAL_EXECUTION: ExecutionSnapshot = {
  status: 'idle',
  promptId: null,
  queueRemaining: null,
  runningNode: null,
  progress: null,
  cachedNodes: [],
  outputsById: {},
  nodeStates: {},
  interrupted: false,
  error: null,
  startedAt: null,
  finishedAt: null,
  submittedAt: null,
  observedPromptId: null,
  nodeTimingsById: {},
  submittedIds: [],
  promptNodesById: {},
  absences: 0,
};

export function isSettled(status: ExecutionStatus): boolean {
  return status === 'done' || status === 'failed';
}

export function isPastRunning(status: ExecutionStatus): boolean {
  return isSettled(status) || status === 'unknown';
}

export function clearRun(state: ExecutionSnapshot): ExecutionSnapshot {
  return {
    ...INITIAL_EXECUTION,
    outputsById: state.outputsById,
    nodeTimingsById: state.nodeTimingsById,
    submittedIds: state.submittedIds,
    promptNodesById: state.promptNodesById,
  };
}

export type RunOutputs = Readonly<Record<string, readonly OutputFileRef[]>>;

export function hasRunInFlight(status: ExecutionStatus, queued: number): boolean {
  return status === 'running' || status === 'queued' || queued > 0;
}
