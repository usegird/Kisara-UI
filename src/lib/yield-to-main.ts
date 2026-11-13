import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 長い処理の合間にブラウザへ処理を返す。待っている描画と入力を先に通す。
// ─────────────────────────────

interface YieldingScheduler {
  readonly yield: () => Promise<void>;
}

function schedulerOf(scope: unknown): YieldingScheduler | null {
  const found: unknown = (scope as { scheduler?: unknown }).scheduler;
  if (!isRecord(found)) return null;
  return typeof found.yield === 'function' ? (found as unknown as YieldingScheduler) : null;
}

/**
 * ブラウザへ処理を返し、待っている描画と入力が済んでから解決する。
 * `scheduler.yield` があればそれを使い（続きを後回しにしない）、無ければ次の task まで待つ
 */
export function yieldToMain(): Promise<void> {
  const scheduler = schedulerOf(globalThis);
  if (scheduler !== null) return scheduler.yield();
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}
