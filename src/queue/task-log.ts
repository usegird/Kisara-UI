import type { ApiPrompt } from '@/graph/to-api-prompt';
import type { OutputFileRef } from '@/port/files';
import type { PromptNodeError } from '@/port/run';

export const TASK_LOG_LIMIT = 500;

export interface TaskLogEntry {
  readonly promptId: string;
  readonly number: number | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly success: boolean | null;
  readonly outputs: readonly OutputFileRef[];
  readonly name: string | null;
  readonly error?: string | null;
  readonly raw?: unknown;
  readonly rejection?: SubmitFailure;
  readonly labels?: Readonly<Record<string, string>> | undefined;
  readonly notes?: readonly RunNote[] | undefined;
}

export interface RunNote {
  readonly nodeId: string;
  readonly classType: string;
  readonly message: string;
}

export interface SubmittedRun {
  readonly name: string | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly notes: readonly RunNote[];
}

export interface SubmitFailure {
  readonly reason: string;
  readonly nodes: readonly PromptNodeError[];
  readonly forbidden?: boolean;
}

export interface RejectedRun extends SubmittedRun {
  readonly failure: SubmitFailure;
  readonly prompt: ApiPrompt | null;
  readonly at: number;
}

export function mergeTaskEntries(
  current: readonly TaskLogEntry[],
  incoming: readonly TaskLogEntry[],
): TaskLogEntry[] {
  const byId = new Map(current.map((entry) => [entry.promptId, entry]));

  for (const entry of incoming) {
    const previous = byId.get(entry.promptId);
    byId.set(entry.promptId, {
      ...previous,
      ...entry,
      name: entry.name ?? previous?.name ?? null,
      raw: entry.raw ?? previous?.raw,
      labels: entry.labels ?? previous?.labels,
      notes: entry.notes ?? previous?.notes,
    });
  }

  return [...byId.values()]
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    .slice(0, TASK_LOG_LIMIT);
}
