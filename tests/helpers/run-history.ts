import type { HistoryRunSource } from '@/port/run-history';

export function runSource(
  promptId: string,
  startedAt: number | null,
  paths: readonly string[],
  workflow: unknown,
  overrides: Partial<HistoryRunSource> = {},
): HistoryRunSource {
  return {
    promptId,
    startedAt,
    finishedAt: startedAt === null ? null : startedAt + 500,
    paths,
    workflow,
    session: null,
    ...overrides,
  };
}
