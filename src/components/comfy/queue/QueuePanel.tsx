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

// ─────────────────────────────
// 右の列のキュータブ。タスクのカードを並べて描くだけで、取り直しと立て直しは側の枠が持つ
// （見ていない間も続ける必要があるため、タブの中身であるここには置かない）。
// ─────────────────────────────

/** キュータブの受け取り物 */
export interface QueuePanelProps {
  /** 折り返して並べるか（右の列を下に置いたとき）。既定は縦に積む */
  readonly wrap?: boolean | undefined;
}

/** セッションの帯・ほかの実行の数と、繰り返しとタスクのカードの並び */
export function QueuePanel({ wrap = false }: QueuePanelProps): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');

  // 切れているときは接続の表示で分かるので、取れなかった理由を重ねて出さない
  const queueError = useQueueStore((state) => state.error);
  // 張り直している間は、処理中のノードも何ノード目かも出さない（通知が来ないので進まない）
  const retrying = useConnectionStore(
    (state) => retryCount(state.socketStatus, state.socketRetry) !== null,
  );

  // ストア全体は購読しない。必要な値だけを個別のセレクタで取る
  const promptId = useExecutionStore((state) => state.promptId);
  const runningNode = useExecutionStore((state) => state.runningNode);
  const nodeStates = useExecutionStore((state) => state.nodeStates);
  const cachedNodes = useExecutionStore((state) => state.cachedNodes);
  const totalNodes = useExecutionStore((state) =>
    state.promptId === null ? null : (state.totalNodesById[state.promptId] ?? null),
  );
  const views = useNodeViews();
  const openDetail = useTaskDetailStore((state) => state.open);
  const closeHistory = useHistoryDetailStore((state) => state.close);

  // ビューワーは重ねても別窓でも同じ状態を見る。別窓の出し先は画面に 1 つ（ViewerWindowHost）
  const viewerMode = useViewerStore((state) => state.mode);
  const openOverlay = useViewerStore((state) => state.openOverlay);
  const closeViewer = useViewerStore((state) => state.close);

  const tasks = useQueueTasks();
  const repeating = useRepeatStore((state) => state.jobs.length > 0);
  // ほかのタブ・画面の実行はカードにせず、数だけ添える
  const others = useOtherRuns();
  // ワークフロー名は手元の控えにだけある（この画面から投げたもの）
  const logged = useTaskLogStore((state) => state.entries);
  const names = new Map(logged.map((entry) => [entry.promptId, entry.name]));
  const latest = buildSlides(tasks)[0]?.key ?? null;
  const { interrupt, cancelQueued } = useRunWorkflow();

  /**
   * 詳細はノードと変数の列に重ねて出す（ほかの埋め込みはダイアログの枠が閉じる）
   */
  const openTaskDetail = (task: QueueTask): void => {
    // 重ねるものは 1 つだけ
    closeHistory();
    openDetail(task.promptId);
  };

  /**
   * 縮小画像から開く。**重ねて出す**（別ウィンドウへは重ねた先から移す）。
   * 既に重ねて出していれば、押し直しで閉じる（別ウィンドウで見ているときは開き直す）
   */
  const toggleOverlay = (key: string | null): void => {
    if (viewerMode === 'overlay') {
      closeViewer();
      return;
    }
    openOverlay(key);
  };
  // そのタスクの最初の 1 枚（＝最後に出た画像）に合わせて開く。鍵はそのタスクの画像だけで決まる
  const openViewer = (task: QueueTask): void =>
    toggleOverlay(firstSlideOf(buildSlides([task]), task.promptId));
  const openLatest = (): void => toggleOverlay(latest);
  const interruptRun = (task: QueueTask): void => void interrupt(task.promptId);
  const cancelTask = (task: QueueTask): void => void cancelQueued(task.promptId);

  return (
    <div className="flex flex-col gap-1.5">
      {/* セッションの帯とほかの実行の数も、カードと同じ升目に置く */}
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

      {/* 取れなかったときも並びは消さず、最後に取れたものの上に理由を添える */}
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
              // 読み込み中の絵から開くのは実行中のカードだけ（ほかのカードに渡すと、画像が出るたびに描き直す）
              onOpenLatest={task.state === 'running' && latest !== null ? openLatest : undefined}
              onInterrupt={task.state === 'running' ? interruptRun : undefined}
              // 受理される前（id がまだ無い）の待機は外せない
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
