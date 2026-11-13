import { describe, expect, it } from 'vitest';

import { mergeTaskEntries, TASK_LOG_LIMIT, type TaskLogEntry } from '@/queue/task-log';
import { useTaskLogStore } from '@/store/use-task-log-store';

import { historyEntry, taskLogEntry } from '../helpers/queue';

// ─────────────────────────────
// タスクの控え。ComfyUI の履歴は再起動で消えるので、**画面を開いている間だけ**覚えておく。
// 保存はしない（再読み込みで消えるのが仕様）。名前と応答は、あとから来た記録で消さない。
// ─────────────────────────────

function entry(
  promptId: string,
  startedAt: number,
  extra: Partial<TaskLogEntry> = {},
): TaskLogEntry {
  return taskLogEntry(promptId, { startedAt, ...extra });
}

describe('タスクの控え', () => {
  it('新しい順に並び、上限で打ち切る', () => {
    const many = Array.from({ length: TASK_LOG_LIMIT + 10 }, (_, index) =>
      entry(`p${String(index)}`, index),
    );

    const merged = mergeTaskEntries([], many);

    expect(merged).toHaveLength(TASK_LOG_LIMIT);
    expect(merged[0]?.promptId).toBe(`p${String(TASK_LOG_LIMIT + 9)}`);
  });

  it('応答は削らずに全件持つ', () => {
    const raw = { prompt: [1, 'p1', { '9': { class_type: 'KSampler', inputs: { seed: 1 } } }] };
    const merged = mergeTaskEntries([], [entry('p1', 1, { raw })]);

    expect(merged[0]?.raw).toEqual(raw);
  });

  it('あとから来た記録で、覚えた名前と応答を消さない', () => {
    const kept = mergeTaskEntries(
      [entry('p1', 1, { name: 'Krea2_T2I', raw: { prompt: [1, 'p1', {}] } })],
      [entry('p1', 2, { success: true })],
    );

    expect(kept[0]?.name).toBe('Krea2_T2I');
    expect(kept[0]?.raw).toEqual({ prompt: [1, 'p1', {}] });
    expect(kept[0]?.success).toBe(true);
  });

  it('履歴から控えるとき、失敗の 1 行も控える（キュー列が応答を読み直さない）', () => {
    useTaskLogStore.getState().clear();
    const error = { kind: 'error', line: 'boom' } as const;
    useTaskLogStore.getState().record([historyEntry('p1', 1, { success: false, error })]);

    expect(useTaskLogStore.getState().entries[0]?.error).toBe('boom');
  });

  it('同じ実行は1件にまとまる', () => {
    expect(mergeTaskEntries([entry('p1', 1)], [entry('p1', 2)])).toHaveLength(1);
  });
});

describe('断られた実行の控え', () => {
  it('1 回ごとに別の id で控え、上書きしない', () => {
    useTaskLogStore.getState().clear();
    const failure = { reason: 'Prompt outputs failed validation', nodes: [] };
    const run = { name: 'w', labels: {}, notes: [] };
    const a = useTaskLogStore.getState().recordRejected({ ...run, failure, prompt: null, at: 5 });
    const b = useTaskLogStore.getState().recordRejected({ ...run, failure, prompt: null, at: 5 });

    expect(a).not.toBe(b);
    expect(useTaskLogStore.getState().entries.filter((e) => e.rejection)).toHaveLength(2);
  });
});
