import { DetailImageColumn } from '@/components/comfy/queue/DetailImageColumn';
import { DetailImageDivider } from '@/components/comfy/queue/DetailImageDivider';
import {
  ModelGroupsSection,
  OutputTextsSection,
  PromptsSection,
  SettingsSection,
} from '@/components/comfy/queue/task-detail-sections';
import { RunOutcome, TaskDetailHeader } from '@/components/comfy/queue/TaskDetailHeader';
import { TaskNotes } from '@/components/comfy/queue/TaskFailure';
import type { NodeDefinitionMap } from '@/graph/types';
import { useModelKindNames } from '@/hooks/run/use-model-kind-names';
import { useTaskResult, type TaskResult } from '@/hooks/run/use-task-result';
import { t } from '@/i18n';
import type { OutputFileRef, OutputText } from '@/port/files';
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

const NO_NOTES: readonly RunNote[] = [];

export interface TaskDetailPanelProps {
  readonly task: QueueTask | null;
  readonly onMove: (direction: number) => void;
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly cached: unknown;
  readonly onDetail: (promptId: string, raw: unknown) => void;
  readonly rejection?: SubmitFailure | null | undefined;
  readonly labels?: Readonly<Record<string, string>> | undefined;
  readonly notes?: readonly RunNote[] | undefined;
  readonly baseUrl: string;
  readonly definitions: NodeDefinitionMap;
  readonly timings: readonly NodeTiming[];
  readonly workflowName: string | null;
  readonly onOpenViewer: (promptId: string) => void;
  readonly follow: boolean;
  readonly onFollowChange: (follow: boolean) => void;
  readonly onClose: () => void;
}

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
  const images = imagesOf(outputsOf(current, task)).map((file) => ({
    key: `${file.subfolder}/${file.filename}`,
    file,
  }));
  const rows = mergeNodeRows(settings, nodeDurations(timings));

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
          <OutputTextsSection outputs={outputTextsOf(current, promptNodes)} label={label} />
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

function promptNodesOf(current: TaskResult | null): Map<string, PromptNode> {
  return current?.nodes
    ? comfyPort().queue.promptNodesOf(current.nodes)
    : new Map<string, PromptNode>();
}

function outputTextsOf(
  current: TaskResult | null,
  promptNodes: ReadonlyMap<string, PromptNode>,
): { readonly text: OutputText; readonly classType: string | null }[] {
  return (current?.texts ?? []).map((text) => ({
    text,
    classType: promptNodes.get(text.nodeId)?.classType ?? null,
  }));
}

function outputsOf(current: TaskResult | null, task: QueueTask | null): readonly OutputFileRef[] {
  return current?.outputs.length ? current.outputs : (task?.outputs ?? []);
}
