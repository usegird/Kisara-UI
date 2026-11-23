import type { OutputFileRef } from '@/port/files';
import type { HistoryEntry, QueueEntry } from '@/port/history';
import { formatHistoryFailure } from '@/queue/comfy-failure-text';
import type { ExecutionProgress, ExecutionStatus, RunOutputs } from '@/queue/execution-state';
import { nodeLabeler, PLAIN_LABELER, type NodeLabeler } from '@/queue/task-failure';
import type { SubmitFailure, TaskLogEntry } from '@/queue/task-log';

type QueueTaskState = 'running' | 'pending' | 'done' | 'failed' | 'unknown';

export interface QueueTask {
  readonly promptId: string;
  readonly state: QueueTaskState;
  readonly number: number | null;
  readonly outputs: readonly OutputFileRef[];
  readonly progress: { readonly value: number; readonly max: number } | null;
  readonly durationMs: number | null;
  readonly message: string | null;
  readonly startedAt: number | null;
  readonly recordedEnd?: number | undefined;
}

export interface CurrentRun {
  readonly promptId: string | null;
  readonly status: ExecutionStatus;
  readonly progress: ExecutionProgress | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly error: string | null;
  readonly outputsById: Readonly<Record<string, RunOutputs>>;
}

export const LOCAL_TASK_ID = 'local';

interface BuildQueueTasksInput {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
  readonly history: readonly HistoryEntry[];
  readonly logged?: readonly TaskLogEntry[];
  readonly current: CurrentRun;
  readonly now: number;
  readonly stall?: TaskStall | null;
  readonly sessions?: readonly string[] | undefined;
}

function sentBy(
  entry: { readonly session: string | null },
  sessions: readonly string[] | undefined,
): boolean {
  return sessions === undefined || (entry.session !== null && sessions.includes(entry.session));
}

export interface OtherRuns {
  readonly running: number;
  readonly pending: number;
}

export function otherRuns(
  running: readonly QueueEntry[],
  pending: readonly QueueEntry[],
  sessions: readonly string[],
): OtherRuns {
  return {
    running: running.filter((entry) => !sentBy(entry, sessions)).length,
    pending: pending.filter((entry) => !sentBy(entry, sessions)).length,
  };
}

export interface TaskStall {
  readonly message: string;
  readonly unknown: boolean;
}

function partialOutputs(current: CurrentRun, promptId: string): OutputFileRef[] {
  const outputs = current.outputsById[promptId];
  return outputs === undefined ? [] : Object.values(outputs).flat();
}

function finishedRuns(current: CurrentRun): string[] {
  return Object.keys(current.outputsById)
    .reverse()
    .filter((id) => id !== current.promptId || current.status === 'done');
}

function knownLog(entry: TaskLogEntry): boolean {
  return entry.outputs.length > 0 || entry.finishedAt !== null;
}

function durationOf(
  startedAt: number | null,
  finishedAt: number | null,
  settled: boolean,
  now: number,
): number | null {
  if (startedAt === null) return null;

  const end = settled && finishedAt !== null ? finishedAt : now;
  return end - startedAt;
}

interface BuildState {
  readonly current: CurrentRun;
  readonly now: number;
  readonly stall: TaskStall | null;
  readonly gone: boolean;
  readonly seen: Set<string>;
}

export function buildQueueTasks(input: BuildQueueTasksInput): QueueTask[] {
  const { logged = [], current, now, stall = null, sessions } = input;
  const running = input.running.filter((entry) => sentBy(entry, sessions));
  const pending = input.pending.filter((entry) => sentBy(entry, sessions));
  const history = input.history.filter((entry) => sentBy(entry, sessions));
  const state: BuildState = { current, now, stall, gone: stall?.unknown === true, seen: new Set() };

  const local = localTask(state, [...running, ...pending]);
  const tasks: QueueTask[] = local === null ? [] : [local];

  for (const entry of [...pending].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))) {
    if (!claim(state, entry.promptId)) continue;
    tasks.push(pendingTask(state, entry));
  }
  for (const entry of running) {
    if (!claim(state, entry.promptId)) continue;
    tasks.push(runningTask(state, entry));
  }

  const later = new Set([...history, ...logged.filter(knownLog)].map((entry) => entry.promptId));
  for (const promptId of finishedRuns(current)) {
    if (later.has(promptId) || !claim(state, promptId)) continue;
    tasks.push(finishedTask(current, promptId));
  }

  for (const entry of history) {
    if (!claim(state, entry.promptId)) continue;
    tasks.push(historyTask(entry));
  }

  addLoggedTasks(state, logged, tasks);
  return tasks;
}

function addLoggedTasks(
  state: BuildState,
  logged: readonly TaskLogEntry[],
  tasks: QueueTask[],
): void {
  const rejected: QueueTask[] = [];
  for (const entry of logged) {
    if (state.seen.has(entry.promptId)) continue;
    if (!knownLog(entry)) continue;
    state.seen.add(entry.promptId);

    if (entry.rejection === undefined) tasks.push(loggedTask(entry));
    else rejected.push(rejectedTask(entry, entry.rejection));
  }
  for (const task of rejected) insertByTime(tasks, task);
}

function claim(state: BuildState, promptId: string): boolean {
  if (state.seen.has(promptId)) return false;
  state.seen.add(promptId);
  return true;
}

function localTask(state: BuildState, queued: readonly QueueEntry[]): QueueTask | null {
  const { current } = state;
  const onServer =
    current.promptId !== null && queued.some((entry) => entry.promptId === current.promptId);

  const local =
    (current.status === 'failed' && current.promptId !== null) ||
    current.status === 'queued' ||
    current.status === 'unknown';
  if (onServer || !local) return null;

  const id = current.promptId ?? LOCAL_TASK_ID;
  state.seen.add(id);
  return {
    promptId: id,
    state: localState(current.status),
    number: null,
    outputs: [],
    progress: null,
    durationMs: spanMs(current.startedAt, current.finishedAt),
    message: current.error,
    startedAt: current.startedAt,
  };
}

function localState(status: ExecutionStatus): QueueTaskState {
  if (status === 'failed') return 'failed';
  if (status === 'unknown') return 'unknown';
  return 'pending';
}

function pendingTask(state: BuildState, entry: QueueEntry): QueueTask {
  return {
    promptId: entry.promptId,
    state: state.gone ? 'unknown' : 'pending',
    number: entry.number,
    outputs: [],
    progress: null,
    durationMs: null,
    message: state.gone ? (state.stall?.message ?? null) : null,
    startedAt: null,
  };
}

function runningTask(state: BuildState, entry: QueueEntry): QueueTask {
  const { current, stall } = state;
  const mine = current.promptId === entry.promptId;
  const settled = settledState(state, mine);

  const startedAt = (mine ? current.startedAt : null) ?? entry.createdAt;

  return {
    promptId: entry.promptId,
    state: settled ?? 'running',
    number: entry.number,
    outputs: partialOutputs(current, entry.promptId),
    progress: settled === null && mine ? current.progress : null,
    durationMs:
      (state.gone && !mine) || (stall !== null && settled === null)
        ? null
        : durationOf(startedAt, mine ? current.finishedAt : null, settled !== null, state.now),
    message: mine && settled !== null ? current.error : (stall?.message ?? null),
    startedAt,
  };
}

function settledState(state: BuildState, mine: boolean): 'failed' | 'unknown' | null {
  const { status } = state.current;
  if (mine && (status === 'failed' || status === 'unknown')) return status;
  return state.gone ? 'unknown' : null;
}

function finishedTask(current: CurrentRun, promptId: string): QueueTask {
  const isCurrent = promptId === current.promptId;
  return {
    promptId,
    state: 'done',
    number: null,
    outputs: partialOutputs(current, promptId),
    progress: null,
    durationMs: isCurrent ? spanMs(current.startedAt, current.finishedAt) : null,
    message: null,
    startedAt: isCurrent ? current.startedAt : null,
  };
}

function historyTask(entry: HistoryEntry): QueueTask {
  return {
    promptId: entry.promptId,
    state: entry.success === false ? 'failed' : 'done',
    number: entry.number,
    outputs: entry.outputs,
    progress: null,
    durationMs: spanMs(entry.startedAt, entry.finishedAt),
    message: formatHistoryFailure(entry.error),
    startedAt: entry.startedAt,
  };
}

function rejectedTask(entry: TaskLogEntry, rejection: SubmitFailure): QueueTask {
  return {
    promptId: entry.promptId,
    state: 'failed',
    number: null,
    outputs: [],
    progress: null,
    durationMs: null,
    message: formatSubmitRejection(rejection, nodeLabeler(entry.labels)),
    startedAt: entry.startedAt,
  };
}

function loggedTask(entry: TaskLogEntry): QueueTask {
  return {
    promptId: entry.promptId,
    state: entry.success === false ? 'failed' : 'done',
    number: entry.number,
    outputs: entry.outputs,
    progress: null,
    durationMs: spanMs(entry.startedAt, entry.finishedAt),
    message: entry.error ?? null,
    startedAt: entry.startedAt,
  };
}

function spanMs(startedAt: number | null, finishedAt: number | null): number | null {
  return startedAt !== null && finishedAt !== null ? finishedAt - startedAt : null;
}

const SETTLED: ReadonlySet<QueueTaskState> = new Set(['done', 'failed', 'unknown']);

function insertByTime(tasks: QueueTask[], task: QueueTask): void {
  const at = tasks.findIndex(
    (other) => SETTLED.has(other.state) && (other.startedAt ?? 0) < (task.startedAt ?? 0),
  );
  if (at < 0) tasks.push(task);
  else tasks.splice(at, 0, task);
}

function formatSubmitRejection(failure: SubmitFailure, label: NodeLabeler = PLAIN_LABELER): string {
  const [node] = failure.nodes;
  const first = node?.messages[0];
  if (node === undefined || first === undefined) return failure.reason;
  return `${label(node.nodeId, node.classType)}: ${first}`;
}

export function followTarget(tasks: readonly QueueTask[]): string | null {
  return tasks.find((task) => SETTLED.has(task.state))?.promptId ?? null;
}

export function adjacentTask(
  tasks: readonly QueueTask[],
  promptId: string | null,
  direction: number,
): QueueTask | null {
  if (promptId === null) return null;

  const at = tasks.findIndex((task) => task.promptId === promptId);
  if (at < 0) return null;

  return tasks[at + direction] ?? null;
}

export function progressRatio(task: QueueTask): number | null {
  if (!task.progress || task.progress.max <= 0) return null;

  return Math.min(1, Math.max(0, task.progress.value / task.progress.max));
}
