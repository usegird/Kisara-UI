import type { HistoryRunSource } from '@/port/run-history';

// ─────────────────────────────
// 実行の記録の材料（`/history` の 1 件から読んだもの）の組み立て。
// `HistoryRunSource` の形が変わったら**ここだけ**直す。
// ─────────────────────────────

/** 実行 1 件の材料。完了は開始の 500 ミリ秒後。セッションは既定で null */
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
