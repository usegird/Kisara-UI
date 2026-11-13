import { DetailImageColumn } from '@/components/comfy/queue/DetailImageColumn';
import { DetailImageDivider } from '@/components/comfy/queue/DetailImageDivider';
import {
  ModelGroupsSection,
  PromptsSection,
  SettingsSection,
} from '@/components/comfy/queue/task-detail-sections';
import { RunOutcome, TaskDetailHeader } from '@/components/comfy/queue/TaskDetailHeader';
import { TaskNotes } from '@/components/comfy/queue/TaskFailure';
import type { NodeDefinitionMap } from '@/graph/types';
import { useModelKindNames } from '@/hooks/run/use-model-kind-names';
import { useTaskResult, type TaskResult } from '@/hooks/run/use-task-result';
import { t } from '@/i18n';
import type { OutputFileRef } from '@/port/files';
import type { PromptNode } from '@/port/run';
import type { NodeTiming } from '@/queue/execution-state';
import { imagesOf } from '@/queue/outputs';
import { type QueueTask } from '@/queue/queue-tasks';
import {
  extractSettings,
  extractTaskSummary,
  groupModels,
  mergeNodeRows,
  nodeDurations,
} from '@/queue/task-detail';
import { nodeLabeler } from '@/queue/task-failure';
import type { RunNote, SubmitFailure } from '@/queue/task-log';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// タスクの詳細の中身（キュー列のカードを押すと開く）。置く場所は呼び出し側が決める。
// ─────────────────────────────

/** 注意を渡されなかったときの既定。毎回新しい配列だと、受け取る側の memo が効かない */
const NO_NOTES: readonly RunNote[] = [];

/** タスクの詳細の受け取り物 */
export interface TaskDetailPanelProps {
  readonly task: QueueTask | null;
  /** 隣のタスクへ移る。`-1` が新しい方 */
  readonly onMove: (direction: number) => void;
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  /** 端末に控えてある応答（`/history` の1件分。履歴が消えたあとでも出せるように） */
  readonly cached: unknown;
  /** 応答が読めたときに控える */
  readonly onDetail: (promptId: string, raw: unknown) => void;
  /** 投入を断られたタスクの理由。ComfyUI 側に残らないので、控えから渡す */
  readonly rejection?: SubmitFailure | null | undefined;
  /** 投げた時点のカードの表記（カード id → 「通し番号 名前」）。この画面から投げたときだけ */
  readonly labels?: Readonly<Record<string, string>> | undefined;
  /** 実行の形に変えたときの注意 */
  readonly notes?: readonly RunNote[] | undefined;
  readonly baseUrl: string;
  readonly definitions: NodeDefinitionMap;
  /** この画面が見ていた実行のノード時刻。別の実行なら空 */
  readonly timings: readonly NodeTiming[];
  /** 実行したワークフロー名（この画面から投げたときだけ分かる） */
  readonly workflowName: string | null;
  /** そのタスクの画像から、同じ場所にビューワーを重ねて開く（詳細と入れ替わる） */
  readonly onOpenViewer: (promptId: string) => void;
  /** 追従（終わったタスクへ自動で移る。移すのは呼び出し側）の入り切り */
  readonly follow: boolean;
  readonly onFollowChange: (follow: boolean) => void;
  readonly onClose: () => void;
}

/**
 * タスク 1 件の詳細。左に失敗の内容・モデル・プロンプト・実行順と設定、右に結果の画像を出す。
 * ← → で隣のタスクへ移る（ビューワーと同じ向き: ← が新しい方）
 */
export function TaskDetailPanel({
  task,
  onMove,
  hasNewer,
  hasOlder,
  cached,
  onDetail,
  rejection = null,
  labels,
  notes = NO_NOTES,
  baseUrl,
  definitions,
  timings,
  workflowName,
  onOpenViewer,
  follow,
  onFollowChange,
  onClose,
}: TaskDetailPanelProps): React.ReactElement {
  const current = useTaskResult(task, baseUrl, { cached, onDetail, rejected: rejection !== null });

  const label = nodeLabeler(labels);
  const kindNames = useModelKindNames();
  const error = current?.error ?? null;

  const promptNodes = promptNodesOf(current);
  const summary = extractTaskSummary(promptNodes, definitions);
  const models = groupModels(summary.models, kindNames);
  const settings = extractSettings(promptNodes, definitions);
  // 最後に出たものを上に出す（新しい結果から見たい）
  const images = imagesOf(outputsOf(current, task)).map((file) => ({
    key: `${file.subfolder}/${file.filename}`,
    file,
  }));
  // 設定と所要時間は1つの表にまとめる（時刻があるものは実行順に並ぶ）。
  // ノードごとの時刻は履歴に無いので、この画面が見ていた実行でだけ並ぶ
  const rows = mergeNodeRows(settings, nodeDurations(timings));

  // 画像の幅。左との境目（`DetailImageDivider`）を引いて変える
  const imageRatio = useSettingsStore((state) => state.taskDetailImageRatio);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="region"
      aria-label={t('queue.detail.title')}
      onKeyDown={(event) => {
        if (moveByKey(event.nativeEvent, onMove, onClose)) event.preventDefault();
      }}
    >
      <TaskDetailHeader
        task={task}
        workflowName={workflowName}
        hasNewer={hasNewer}
        hasOlder={hasOlder}
        onMove={onMove}
        follow={follow}
        onFollowChange={onFollowChange}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-xs">
          {error === null ? null : (
            <p className="text-destructive">{t('queue.detail.fetchFailed', { error })}</p>
          )}
          {current?.fromImage === true ? (
            <p className="text-muted-foreground">{t('queue.detail.fromImage')}</p>
          ) : null}
          <RunOutcome
            rejection={rejection}
            failure={current?.failure ?? null}
            message={task?.message ?? null}
            nodes={promptNodes}
            timings={timings}
            label={label}
          />

          {notes.length === 0 ? null : <TaskNotes notes={notes} label={label} />}

          <ModelGroupsSection models={models} />
          <PromptsSection prompts={summary.prompts} label={label} />
          <SettingsSection rows={rows} timed={timings.length > 0} label={label} />
        </div>

        <DetailImageDivider />

        <DetailImageColumn
          images={images}
          baseUrl={baseUrl}
          ratio={imageRatio}
          onOpenViewer={task ? () => onOpenViewer(task.promptId) : null}
        />
      </div>
    </div>
  );
}

/**
 * ← → で隣のタスクへ、Esc で閉じる。文字を打っている最中は取らない。取ったら true
 */
function moveByKey(
  event: KeyboardEvent,
  onMove: (direction: number) => void,
  onClose: () => void,
): boolean {
  if (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') return false;
  if (event.key === 'ArrowLeft') onMove(-1);
  else if (event.key === 'ArrowRight') onMove(1);
  else if (event.key === 'Escape') onClose();
  else return false;
  return true;
}

/** 読めた実行内容のノード。まだ読めていなければ空 */
function promptNodesOf(current: TaskResult | null): Map<string, PromptNode> {
  return current?.nodes
    ? comfyPort().queue.promptNodesOf(current.nodes)
    : new Map<string, PromptNode>();
}

/** 出す画像の元。読めた結果に画像が無ければ、キューのタスクが持つ画像 */
function outputsOf(current: TaskResult | null, task: QueueTask | null): readonly OutputFileRef[] {
  return current?.outputs.length ? current.outputs : (task?.outputs ?? []);
}
