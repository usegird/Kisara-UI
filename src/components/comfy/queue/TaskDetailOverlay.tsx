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

// ─────────────────────────────
// タスクの詳細をノードと変数の列に重ねて出す。置く場所は呼び出し側が決め、ここは中身の材料を集めるだけ。
// ─────────────────────────────

/**
 * 詳細の中身は開いたときに読む。枠（重ねる画面）だけ先に出す。
 * 受け取り物が同じなら描き直さない（実行中の進捗で、ほかのタスクの詳細を描き直さない）。
 * 使う側の `TaskDetailOverlay` は compiler が飛ばす（lint の規則を止めている）ので、手で memo する
 */
const TaskDetailPanel = memo(
  lazyPart<TaskDetailPanelProps>(
    'queue.detail.title',
    () => import('@/components/comfy/queue/TaskDetailPanel').then((m) => m.TaskDetailPanel),
    () => <PartLoading label={t('queue.detail.title')} />,
  ),
);

/** 時間を測っていないタスク（毎回同じものを渡す） */
const NO_TIMINGS: TaskDetailPanelProps['timings'] = [];

/**
 * 開いているタスクの詳細を、ダイアログの枠に入れて出す。
 * 追従を入れていると、タスクが終わった時点でそのタスクへ移る（走り出しでは移らない）
 */
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

  // 追従: 移る先が変わったら開き直す（キューの取り直しという外の変化に合わせる）。
  // **開いた時点の移る先では移らない**（閉じている間に終わったタスクへ、押したカードから引き戻さない）
  const seen = useRef({ target, follow });
  useEffect(() => {
    const changed = seen.current.target !== target || seen.current.follow !== follow;
    seen.current = { target, follow };
    if (!changed) return;
    if (follow && openedId !== null && target !== null && target !== openedId) open(target);
    // 開いているタスクが変わったときは追いかけない（手で移った直後に引き戻さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 移る先の変化だけを見る
  }, [target, follow]);

  // 詳細に渡す手続きは作り直さない（中身の memo を崩さない）。並びは押した時点の
  // ものを読む（進捗のたびに並びは新しくなるが、見ているタスクの中身は変わらない）
  const latest = useRef({ tasks, openedId });
  useLayoutEffect(() => {
    latest.current = { tasks, openedId };
  });
  // compiler はこの部品を飛ばすので、詳細へ渡す手続きは手で固定する（`moveTask` は詳細の effect の依存）
  const moveTask = useCallback(
    (direction: number): void => {
      const { tasks, openedId } = latest.current;
      if (openedId === null) return;
      const next = adjacentTask(tasks, openedId, direction);
      if (next !== null) open(next.promptId);
    },
    [open],
  );

  /**
   * そのタスクの画像から、同じ場所にビューワーを重ねる。**詳細は閉じる**
   * （自由移動で出していると枠の入れ替えでは閉じないので、ここで閉じる）
   */
  const openImages = useCallback(
    (promptId: string): void => {
      close();
      openViewer(firstSlideOf(buildSlides(latest.current.tasks), promptId));
    },
    [close, openViewer],
  );

  if (openedId === null) return null;

  const task: QueueTask | null = tasks.find((item) => item.promptId === openedId) ?? null;
  // 並びから消えたタスク（キューから外れた・控えを消した）は閉じる
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
        // ノードごとの時刻は、この画面が見ていた実行についてだけ持っている（実行ごとに別）
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
