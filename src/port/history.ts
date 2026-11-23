import type { OutputFileRef } from '@/port/files';

export interface QueueEntry {
  readonly promptId: string;
  readonly number: number | null;
  readonly createdAt: number | null;
  readonly session: string | null;
}

export interface QueueSnapshot {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
}

export interface HistoryFailureLine {
  readonly kind: 'error' | 'interrupted';
  readonly line: string | null;
  readonly nodeId: string | null;
}

export interface HistoryEntry {
  readonly promptId: string;
  readonly number: number | null;
  readonly outputs: readonly OutputFileRef[];
  readonly success: boolean | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly error: HistoryFailureLine | null;
  readonly session: string | null;
}

export interface HistoryDetail extends HistoryEntry {
  readonly nodes: Readonly<Record<string, unknown>>;
  readonly nodeOutputs: Readonly<Record<string, readonly OutputFileRef[]>>;
  readonly entry: unknown;
}

export interface HistoryResult {
  readonly entries: readonly HistoryEntry[];
  readonly raw: Readonly<Record<string, unknown>>;
}
