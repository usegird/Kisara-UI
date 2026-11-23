import type { OutputFileRef } from '@/port/files';
import type { HistoryEntry, QueueEntry } from '@/port/history';
import type { QueueTask } from '@/queue/queue-tasks';
import type { TaskLogEntry } from '@/queue/task-log';

export const TEST_SESSION = 'sesstest';

export function queueEntry(
  promptId: string,
  number: number | null,
  createdAt: number | null = null,
  session: string | null = TEST_SESSION,
): QueueEntry {
  return { promptId, number, createdAt, session };
}

export function outputFile(filename: string, type = 'temp'): OutputFileRef {
  return { filename, subfolder: '', type };
}

export function queueTask(
  promptId: string,
  outputs: readonly OutputFileRef[],
  overrides: Partial<QueueTask> = {},
): QueueTask {
  return {
    promptId,
    state: 'done',
    number: null,
    outputs,
    progress: null,
    durationMs: null,
    message: null,
    startedAt: null,
    ...overrides,
  };
}

export function historyEntry(
  promptId: string,
  number: number | null,
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    promptId,
    number,
    outputs: [],
    success: true,
    startedAt: null,
    finishedAt: null,
    error: null,
    session: TEST_SESSION,
    ...overrides,
  };
}

export function taskLogEntry(
  promptId: string,
  overrides: Partial<TaskLogEntry> = {},
): TaskLogEntry {
  return {
    promptId,
    number: null,
    startedAt: null,
    finishedAt: null,
    success: null,
    outputs: [],
    name: null,
    ...overrides,
  };
}
