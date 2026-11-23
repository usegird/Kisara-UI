import { cardList } from '@/components/comfy/queue/card-list';
import { RepeatCards } from '@/components/comfy/queue/RepeatCards';
import { SessionBar } from '@/components/comfy/queue/SessionBar';
import { TaskItem } from '@/components/comfy/queue/TaskItem';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { useOtherRuns, useQueueTasks } from '@/hooks/run/use-queue-tasks';
import { useRunWorkflow } from '@/hooks/run/use-run-workflow';
import { t } from '@/i18n';
import { retryCount } from '@/queue/connection-status';
import { LOCAL_TASK_ID, type QueueTask } from '@/queue/queue-tasks';
import { nodeProgress, runningNodeLabel } from '@/queue/running-node';
import { buildSlides, firstSlideOf } from '@/queue/viewer-slides';
import { useConnectionStore } from '@/store/use-connection-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useHistoryDetailStore } from '@/store/use-history-detail-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useRepeatStore } from '@/store/use-repeat-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useTaskLogStore } from '@/store/use-task-log-store';
import { useViewerStore } from '@/store/use-viewer-store';

export interface QueuePanelProps {
  readonly wrap?: boolean | undefined;
}

export function QueuePanel({ wrap = false }: QueuePanelProps): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');

  const queueError = useQueueStore((state) => state.error);
  const retrying = useConnectionStore(
    (state) => retryCount(state.socketStatus, state.socketRetry) !== null,
  );

  const promptId = useExecutionStore((state) => state.promptId);
  const runningNode = useExecutionStore((state) => state.runningNode);
  const nodeStates = useExecutionStore((state) => state.nodeStates);
  const cachedNodes = useExecutionStore((state) => state.cachedNodes);
  const totalNodes = useExecutionStore((state) =>
    state.promptId === null ? null : (state.promptNodesById[state.promptId]?.length ?? null),
  );
  const views = useNodeViews();
  const openDetail = useTaskDetailStore((state) => state.open);
  const closeHistory = useHistoryDetailStore((state) => state.close);

  const viewerMode = useViewerStore((state) => state.mode);
  const openOverlay = useViewerStore((state) => state.openOverlay);
  const closeViewer = useViewerStore((state) => state.close);

  const tasks = useQueueTasks();
  const repeating = useRepeatStore((state) => state.jobs.length > 0);
  const others = useOtherRuns();
  const logged = useTaskLogStore((state) => state.entries);
  const names = new Map(logged.map((entry) => [entry.promptId, entry.name]));
  const latest = buildSlides(tasks)[0]?.key ?? null;
  const { interrupt, cancelQueued } = useRunWorkflow();

  const openTaskDetail = (task: QueueTask): void => {
    closeHistory();
    openDetail(task.promptId);
  };

  const toggleOverlay = (key: string | null): void => {
    if (viewerMode === 'overlay') {
      closeViewer();
      return;
    }
    openOverlay(key);
  };
  const openViewer = (task: QueueTask): void =>
    toggleOverlay(firstSlideOf(buildSlides([task]), task.promptId));
  const openLatest = (): void => toggleOverlay(latest);
  const interruptRun = (task: QueueTask): void => void interrupt(task.promptId);
  const cancelTask = (task: QueueTask): void => void cancelQueued(task.promptId);

  return (
    <div className="flex flex-col gap-1.5">
      <div className={cardList({ wrap })}>
        <SessionBar />
        {others.running + others.pending > 0 ? (
          <p className="text-muted-foreground self-center px-1 text-2xs">
            {t('queue.panel.others', {
              running: String(others.running),
              pending: String(others.pending),
            })}
          </p>
        ) : null}
      </div>

      {queueError && connected ? (
        <p className="text-destructive truncate px-1 text-2xs" title={queueError}>
          {t('queue.panel.fetchFailed', { error: queueError })}
        </p>
      ) : null}

      {tasks.length === 0 && !repeating ? (
        <p className="text-muted-foreground px-1 text-2xs">
          {connected ? t('queue.panel.empty') : t('queue.panel.connectToShow')}
        </p>
      ) : (
        <ul className={cardList({ wrap })}>
          <RepeatCards />
          {tasks.map((task) => (
            <TaskItem
              key={task.promptId}
              task={task}
              baseUrl={baseUrl}
              workflowName={names.get(task.promptId) ?? null}
              node={
                task.state === 'running' && task.promptId === promptId && !retrying
                  ? runningNodeLabel(views, runningNode)
                  : null
              }
              nodes={
                task.state === 'running' && task.promptId === promptId && !retrying
                  ? nodeProgress(nodeStates, cachedNodes, totalNodes)
                  : null
              }
              onOpen={openTaskDetail}
              onOpenImage={openViewer}
              onOpenLatest={task.state === 'running' && latest !== null ? openLatest : undefined}
              onInterrupt={task.state === 'running' ? interruptRun : undefined}
              onCancel={
                task.state === 'pending' && task.promptId !== LOCAL_TASK_ID ? cancelTask : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
