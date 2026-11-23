import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import type { TaskDetailPanelProps } from '@/components/comfy/queue/TaskDetailPanel';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { useQueueTasks } from '@/hooks/run/use-queue-tasks';
import { t } from '@/i18n';
import { adjacentTask, followTarget, type QueueTask } from '@/queue/queue-tasks';
import { buildSlides, firstSlideOf } from '@/queue/viewer-slides';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useTaskLogStore } from '@/store/use-task-log-store';
import { useViewerStore } from '@/store/use-viewer-store';

const TaskDetailPanel = memo(
  lazyPart<TaskDetailPanelProps>(
    'queue.detail.title',
    () => import('@/components/comfy/queue/TaskDetailPanel').then((m) => m.TaskDetailPanel),
    () => <PartLoading label={t('queue.detail.title')} />,
  ),
);

const NO_TIMINGS: TaskDetailPanelProps['timings'] = [];

export function TaskDetailOverlay(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const openedId = useTaskDetailStore((state) => state.promptId);
  const follow = useTaskDetailStore((state) => state.follow);
  const open = useTaskDetailStore((state) => state.open);
  const close = useTaskDetailStore((state) => state.close);
  const setFollow = useTaskDetailStore((state) => state.setFollow);

  const runningId = useExecutionStore((state) => state.promptId);
  const nodeTimingsById = useExecutionStore((state) => state.nodeTimingsById);
  const definitions = useDefinitionsStore((state) => state.definitions);
  const workflowName = useGraphStore((state) => state.name);
  const logged = useTaskLogStore((state) => state.entries);
  const setDetail = useTaskLogStore((state) => state.setDetail);
  const openViewer = useViewerStore((state) => state.openOverlay);

  const tasks = useQueueTasks();
  const target = followTarget(tasks);

  const seen = useRef({ target, follow });
  useEffect(() => {
    const changed = seen.current.target !== target || seen.current.follow !== follow;
    seen.current = { target, follow };
    if (!changed) return;
    if (follow && openedId !== null && target !== null && target !== openedId) open(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 移る先の変化だけを見る
  }, [target, follow]);

  const latest = useRef({ tasks, openedId });
  useLayoutEffect(() => {
    latest.current = { tasks, openedId };
  });
  const moveTask = useCallback(
    (direction: number): void => {
      const { tasks, openedId } = latest.current;
      if (openedId === null) return;
      const next = adjacentTask(tasks, openedId, direction);
      if (next !== null) open(next.promptId);
    },
    [open],
  );

  const openImages = useCallback(
    (promptId: string): void => {
      close();
      openViewer(firstSlideOf(buildSlides(latest.current.tasks), promptId));
    },
    [close, openViewer],
  );

  if (openedId === null) return null;

  const task: QueueTask | null = tasks.find((item) => item.promptId === openedId) ?? null;
  if (task === null) return null;

  const openedLog = logged.find((entry) => entry.promptId === openedId);

  return (
    <DialogWindow
      id="task-detail"
      label={t('queue.detail.title')}
      defaultMode="embedded"
      onClose={close}
    >
      <TaskDetailPanel
        task={task}
        onMove={moveTask}
        hasNewer={adjacentTask(tasks, openedId, -1) !== null}
        hasOlder={adjacentTask(tasks, openedId, 1) !== null}
        cached={openedLog?.raw ?? null}
        onDetail={setDetail}
        rejection={openedLog?.rejection ?? null}
        labels={openedLog?.labels}
        notes={openedLog?.notes}
        baseUrl={baseUrl}
        definitions={definitions}
        timings={nodeTimingsById[openedId] ?? NO_TIMINGS}
        workflowName={openedId === runningId ? workflowName : (openedLog?.name ?? null)}
        onOpenViewer={openImages}
        follow={follow}
        onFollowChange={setFollow}
        onClose={close}
      />
    </DialogWindow>
  );
}
