import { t } from '@/i18n';
import { setOwn } from '@/lib/own-key';
import type { SocketGiveUp } from '@/port/connection';
import type { OutputFileRef } from '@/port/files';
import type { ComfyEvent } from '@/port/run';
import { formatRunError } from '@/queue/comfy-failure-text';
import {
  isPastRunning,
  isSettled,
  type ExecutionSnapshot,
  type NodeTiming,
  type RunOutputs,
} from '@/queue/execution-state';
import { RECONNECT_ATTEMPTS, RUN_DROP_LIMIT } from '@/queue/reconnect-policy';

function isOtherPrompt(state: ExecutionSnapshot, promptId: string | null): boolean {
  if (promptId === null) return false;
  if (state.submittedIds.length > 0) return !state.submittedIds.includes(promptId);

  return state.promptId !== null && promptId !== state.promptId;
}

function nodeErrorMessage(): string {
  return t('run.execution.nodeError');
}

function switchTo(state: ExecutionSnapshot, promptId: string, now: number): ExecutionSnapshot {
  return {
    ...state,
    promptId,
    status: 'running',
    runningNode: null,
    progress: null,
    cachedNodes: [],
    nodeStates: {},
    interrupted: false,
    error: null,
    startedAt: now,
    finishedAt: null,
    absences: 0,
  };
}

function withOutput(
  state: ExecutionSnapshot,
  promptId: string,
  node: string,
  files: readonly OutputFileRef[],
): Readonly<Record<string, RunOutputs>> {
  const run = { ...state.outputsById[promptId], [node]: files };
  const entries = Object.entries({ ...state.outputsById, [promptId]: run });
  return Object.fromEntries(entries.slice(-TIMING_MEMORY));
}

function observe(state: ExecutionSnapshot, event: ComfyEvent): ExecutionSnapshot {
  if (state.promptId !== null || !hasPromptId(event)) return state;
  if (event.promptId === null || event.promptId === state.observedPromptId) return state;

  return { ...state, observedPromptId: event.promptId };
}

const TIMING_MEMORY = 20;

function trackNode(
  timings: readonly NodeTiming[],
  nodeId: string | null,
  now: number,
): readonly NodeTiming[] {
  const open = timings.at(-1);
  if (open && open.endedAt === null) {
    if (open.nodeId === nodeId) return timings;

    const closed = [...timings.slice(0, -1), { ...open, endedAt: now }];
    return nodeId === null ? closed : [...closed, { nodeId, startedAt: now, endedAt: null }];
  }
  return nodeId === null ? timings : [...timings, { nodeId, startedAt: now, endedAt: null }];
}

function withTiming(
  state: ExecutionSnapshot,
  nodeId: string | null,
  now: number,
): Readonly<Record<string, readonly NodeTiming[]>> {
  const key = state.promptId;
  if (key === null) return state.nodeTimingsById;

  const next = trackNode(state.nodeTimingsById[key] ?? [], nodeId, now);
  const entries = Object.entries({ ...state.nodeTimingsById, [key]: next });

  return Object.fromEntries(entries.slice(-TIMING_MEMORY));
}

export function reduceExecution(
  input: ExecutionSnapshot,
  event: ComfyEvent,
  now: number = Date.now(),
): ExecutionSnapshot {
  const state = observe(input, event);
  if (event.type === 'status') return onStatus(state, event);
  if (!hasPromptId(event)) return state;
  if (isOtherPrompt(state, event.promptId)) return state;

  switch (event.type) {
    case 'execution_start':
      return onExecutionStart(state, event, now);

    case 'execution_cached':
      return { ...state, cachedNodes: event.nodes };

    case 'executing':
      return onExecuting(state, event, now);

    case 'execution_success':
      return finished(state, now);

    case 'execution_interrupted':
      return {
        ...state,
        status: 'done',
        interrupted: true,
        runningNode: null,
        progress: null,
      };

    case 'progress_state':
      return onProgressState(state, event, now);

    case 'progress':
      return onProgress(state, event);

    case 'executed':
      return onExecuted(state, event);

    case 'execution_error':
      return {
        ...state,
        status: 'failed',
        runningNode: null,
        progress: null,
        error: { node: event.node, message: formatRunError(event.message) },
        nodeTimingsById: withTiming(state, null, now),
      };
  }
}

type EventOf<T extends ComfyEvent['type']> = Extract<ComfyEvent, { readonly type: T }>;

function onStatus(state: ExecutionSnapshot, event: EventOf<'status'>): ExecutionSnapshot {
  const idle =
    event.queueRemaining === 0 &&
    state.runningNode === null &&
    (state.status === 'running' || state.status === 'queued');

  return {
    ...state,
    queueRemaining: event.queueRemaining,
    status: idle ? 'done' : state.status,
    progress: idle ? null : state.progress,
  };
}

function onExecutionStart(
  state: ExecutionSnapshot,
  event: EventOf<'execution_start'>,
  now: number,
): ExecutionSnapshot {
  if (event.promptId !== null && event.promptId !== state.promptId) {
    return switchTo(state, event.promptId, now);
  }
  if (isPastRunning(state.status)) return state;
  return { ...state, status: 'running', error: null };
}

function onExecuting(
  state: ExecutionSnapshot,
  event: EventOf<'executing'>,
  now: number,
): ExecutionSnapshot {
  if (event.node === null) return finished(state, now);
  if (isPastRunning(state.status)) return state;
  return {
    ...state,
    status: 'running',
    runningNode: event.node,
    progress: event.node === state.runningNode ? state.progress : null,
    nodeTimingsById: withTiming(state, event.node, now),
  };
}

function finished(state: ExecutionSnapshot, now: number): ExecutionSnapshot {
  return {
    ...state,
    status: state.status === 'failed' ? 'failed' : 'done',
    runningNode: null,
    progress: null,
    nodeTimingsById: withTiming(state, null, now),
  };
}

function onProgress(state: ExecutionSnapshot, event: EventOf<'progress'>): ExecutionSnapshot {
  if (isPastRunning(state.status)) return state;
  return {
    ...state,
    status: 'running',
    progress: { value: event.value, max: event.max },
    runningNode: event.node ?? state.runningNode,
  };
}

function onExecuted(state: ExecutionSnapshot, event: EventOf<'executed'>): ExecutionSnapshot {
  const id = event.promptId ?? state.promptId;
  if (event.node === null || id === null) return state;
  return { ...state, outputsById: withOutput(state, id, event.node, event.files) };
}

function onProgressState(
  state: ExecutionSnapshot,
  event: EventOf<'progress_state'>,
  now: number,
): ExecutionSnapshot {
  const nodeStates = { ...state.nodeStates };
  for (const node of event.nodes) setOwn(nodeStates, node.displayNodeId, node.state);

  if (isSettled(state.status)) return { ...state, nodeStates };

  const failedNode = event.nodes.find((node) => node.state === 'error');
  if (failedNode) {
    return {
      ...state,
      status: 'failed',
      nodeStates,
      runningNode: null,
      progress: null,
      error: state.error ?? { node: failedNode.displayNodeId, message: nodeErrorMessage() },
      nodeTimingsById: withTiming(state, null, now),
    };
  }

  if (state.status === 'unknown') return { ...state, nodeStates };

  const running = event.nodes.find((node) => node.state === 'running');
  const current = running?.displayNodeId ?? state.runningNode;
  return {
    ...state,
    status: 'running',
    nodeStates,
    runningNode: current,
    progress: running ? { value: running.value, max: running.max } : state.progress,
    nodeTimingsById: withTiming(state, current, now),
  };
}

export interface QueuePresence {
  readonly active: readonly string[];
  readonly finished: readonly { readonly promptId: string; readonly success: boolean | null }[];
  readonly requestedAt: number;
}

export const RECONCILE_GRACE_MS = 10_000;

const UNKNOWN_AFTER = 2;

function unknownMessage(): string {
  return t('run.execution.unknown');
}

export function timeoutMessage(reason: SocketGiveUp = 'retries'): string {
  return reason === 'drops'
    ? t('run.execution.dropped', { count: String(RUN_DROP_LIMIT) })
    : t('run.execution.timeout', { count: String(RECONNECT_ATTEMPTS) });
}

export function reconcileExecution(
  state: ExecutionSnapshot,
  presence: QueuePresence,
  now: number = Date.now(),
): ExecutionSnapshot {
  if (state.status === 'unknown') return settleUnknown(state, presence);
  if (state.status !== 'running' && state.status !== 'queued') return state;

  const id = state.promptId;
  if (id === null) return state;
  if (presence.active.includes(id)) return state.absences === 0 ? state : { ...state, absences: 0 };

  if (!canConclude(state, presence, now)) return state;

  const settled = { ...state, runningNode: null, progress: null, finishedAt: now, absences: 0 };
  const entry = presence.finished.find((item) => item.promptId === id);

  if (entry === undefined) {
    const absences = state.absences + 1;
    if (absences < UNKNOWN_AFTER) return { ...state, absences };
    return { ...settled, status: 'unknown', error: { node: null, message: unknownMessage() } };
  }
  return entry.success === false
    ? { ...settled, status: 'failed' }
    : { ...settled, status: 'done' };
}

function canConclude(state: ExecutionSnapshot, presence: QueuePresence, now: number): boolean {
  const submitted = state.submittedAt ?? state.startedAt;
  if (submitted !== null && presence.requestedAt < submitted) return false;
  const since = state.startedAt ?? state.submittedAt;
  return since !== null && now - since >= RECONCILE_GRACE_MS;
}

function settleUnknown(state: ExecutionSnapshot, presence: QueuePresence): ExecutionSnapshot {
  const entry = presence.finished.find((item) => item.promptId === state.promptId);
  if (entry === undefined) return state;

  return entry.success === false
    ? { ...state, status: 'failed' }
    : { ...state, status: 'done', error: null };
}

function hasPromptId(
  event: ComfyEvent,
): event is Exclude<ComfyEvent, { readonly type: 'status' | 'unknown' | 'manager_queue' }> {
  return event.type !== 'status' && event.type !== 'unknown' && event.type !== 'manager_queue';
}
