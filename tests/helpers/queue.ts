import type { OutputFileRef } from '@/port/files';
import type { HistoryEntry, QueueEntry } from '@/port/history';
import type { QueueTask } from '@/queue/queue-tasks';
import type { TaskLogEntry } from '@/queue/task-log';

// ─────────────────────────────
// キューのタスクと結果ファイルの組み立て。
// `QueueTask` / `QueueEntry` / `HistoryEntry` / `TaskLogEntry` / `OutputFileRef` の形が
// 変わったら**ここだけ**直す。
// ─────────────────────────────

/**
 * 組み立てたキュー・履歴の 1 件のセッションの既定。画面のテストはこれを自分のものにする
 */
export const TEST_SESSION = 'sesstest';

/** `GET /queue` の 1 件。`createdAt` は投入時刻（既定は取れなかった場合の null） */
export function queueEntry(
  promptId: string,
  number: number | null,
  createdAt: number | null = null,
  session: string | null = TEST_SESSION,
): QueueEntry {
  return { promptId, number, createdAt, session };
}

/** 結果ファイル 1 件。種別の既定は `temp`（プレビュー） */
export function outputFile(filename: string, type = 'temp'): OutputFileRef {
  return { filename, subfolder: '', type };
}

/** 終わったタスク。要る項目だけ `overrides` で足す */
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

/** `GET /history` の 1 件。成功して画像の無いもの。要る項目だけ `overrides` で足す */
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

/** 手元の控えの 1 件。何も分かっていないもの。要る項目だけ `overrides` で足す */
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
