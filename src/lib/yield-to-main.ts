import { isRecord } from '@/lib/guards';

interface YieldingScheduler {
  readonly yield: () => Promise<void>;
}

function schedulerOf(scope: unknown): YieldingScheduler | null {
  const found: unknown = (scope as { scheduler?: unknown }).scheduler;
  if (!isRecord(found)) return null;
  return typeof found.yield === 'function' ? (found as unknown as YieldingScheduler) : null;
}

export function yieldToMain(): Promise<void> {
  const scheduler = schedulerOf(globalThis);
  if (scheduler !== null) return scheduler.yield();
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}
