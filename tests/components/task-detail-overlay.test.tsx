// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskDetailOverlay } from '@/components/comfy/queue/TaskDetailOverlay';
import type { QueueTask } from '@/queue/queue-tasks';
import { useTaskDetailStore } from '@/store/use-task-detail-store';

import { queueTask } from '../helpers/queue';

// 並びはここで決める（キューの取り直しを作り物にする）
const queue = vi.hoisted(() => ({ tasks: [] as QueueTask[] }));
vi.mock('@/hooks/run/use-queue-tasks', () => ({ useQueueTasks: () => queue.tasks }));

// ─────────────────────────────
// タスクの詳細の追従。終わった時点で移り、開いた時点では移らない
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useTaskDetailStore.setState({ promptId: null, follow: true });
});

describe('詳細の追従', () => {
  it('閉じた後に別のカードから開くと、押したタスクを出す（最後に終わったタスクへ戻さない）', () => {
    queue.tasks = [queueTask('newest', []), queueTask('older', [])];
    useTaskDetailStore.getState().open('older');
    render(<TaskDetailOverlay />);

    expect(useTaskDetailStore.getState().promptId).toBe('older');
  });

  it('開いている間にタスクが終わると、そのタスクへ移る', () => {
    queue.tasks = [queueTask('older', [])];
    useTaskDetailStore.getState().open('older');
    const { rerender } = render(<TaskDetailOverlay />);

    queue.tasks = [queueTask('newest', []), queueTask('older', [])];
    act(() => rerender(<TaskDetailOverlay />));

    expect(useTaskDetailStore.getState().promptId).toBe('newest');
  });
});
