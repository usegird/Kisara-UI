import { cva } from 'class-variance-authority';
import { Expand, Hourglass, ImageOff, Loader2, Square, X } from 'lucide-react';
import { memo, useLayoutEffect, useRef } from 'react';

import { THUMBNAIL_FRAME } from '@/components/comfy/queue/card-list';
import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { RenderProbe } from '@/components/ui/render-probe';
import { PERCENT } from '@/components/ui/units';
import { t } from '@/i18n';
import { formatDuration, formatTime } from '@/i18n/format';
import { guardPress } from '@/lib/press-guard';
import type { OutputFileRef } from '@/port/files';
import { pickImage } from '@/queue/outputs';
import { progressRatio, type QueueTask } from '@/queue/queue-tasks';
import type { NodeProgress, RunningNodeLabel } from '@/queue/running-node';

const MAX_EASED_STEP = 0.15;

const MATRIX_X_AT = 4;
const MATRIX3D_X_AT = 12;

const taskCard = cva(
  `border-border/70 bg-muted/30 has-[[data-detail]:hover]:bg-accent group/card relative flex
    w-full min-w-0 gap-2 rounded-md border p-1.5`,
  { variants: { failed: { true: 'border-destructive/40', false: '' } } },
);

const taskNumber = cva('shrink-0 font-semibold tabular-nums', {
  variants: { failed: { true: 'text-destructive', false: '' } },
});

const taskMessage = cva('truncate', {
  variants: { quiet: { true: 'text-muted-foreground', false: 'text-destructive/90' } },
});

function ThumbnailContent({
  task,
  file,
  baseUrl,
}: {
  readonly task: QueueTask;
  readonly file: OutputFileRef | null;
  readonly baseUrl: string;
}): React.ReactElement {
  if (file) {
    return (
      <OutputImage
        file={file}
        baseUrl={baseUrl}
        className="size-full object-cover"
        fallback={<ImageOff className="size-4" aria-hidden />}
        order={task.startedAt ?? undefined}
      />
    );
  }
  if (task.state === 'pending') return <Hourglass className="size-4" aria-hidden />;
  return task.state === 'running' ? (
    <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
  ) : (
    <ImageOff className="size-4" aria-hidden />
  );
}

function ThumbnailButton({
  task,
  file,
  baseUrl,
  label = t('queue.card.openImage'),
  hint = t('queue.card.openImageHint'),
  onOpen,
}: {
  readonly task: QueueTask;
  readonly file: OutputFileRef | null;
  readonly baseUrl: string;
  readonly label?: string;
  readonly hint?: string;
  readonly onOpen: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${THUMBNAIL_FRAME} group/thumb relative focus-visible:outline-2`}
      aria-label={label}
      title={hint}
      onClick={onOpen}
    >
      <ThumbnailContent task={task} file={file} baseUrl={baseUrl} />
      <span
        className="absolute inset-0 flex items-center justify-center text-foreground
          bg-background/60 opacity-0 transition-opacity group-hover/thumb:opacity-100
          group-focus-visible/thumb:opacity-100"
        aria-hidden
      >
        <Expand className="size-4" />
      </span>
    </button>
  );
}

export const TaskItem = memo(function TaskItem({
  task,
  baseUrl,
  workflowName,
  node,
  nodes,
  onOpen,
  onOpenImage,
  onOpenLatest,
  onInterrupt,
  onCancel,
}: {
  readonly task: QueueTask;
  readonly baseUrl: string;
  readonly workflowName: string | null;
  readonly node: RunningNodeLabel | null;
  readonly nodes: NodeProgress | null;
  readonly onOpen: (task: QueueTask) => void;
  readonly onOpenImage: (task: QueueTask) => void;
  readonly onOpenLatest?: (() => void) | undefined;
  readonly onInterrupt?: ((task: QueueTask) => void) | undefined;
  readonly onCancel?: ((task: QueueTask) => void) | undefined;
}): React.ReactElement {
  const failed = task.state === 'failed';
  const file = pickImage(task.outputs);
  const latest = file === null && task.state === 'running' ? onOpenLatest : undefined;
  const corner =
    onInterrupt !== undefined
      ? {
          run: onInterrupt,
          label: t('run.control.interrupt'),
          hint: t('run.control.interruptHint'),
          icon: <Square className="size-3" aria-hidden />,
        }
      : onCancel !== undefined
        ? {
            run: onCancel,
            label: t('queue.card.cancel'),
            hint: t('queue.card.cancelHint'),
            icon: <X className="size-3" aria-hidden />,
          }
        : null;

  return (
    <RenderProbe id="TaskItem">
      <li className={taskCard({ failed })}>
        {file ? (
          <ThumbnailButton
            task={task}
            file={file}
            baseUrl={baseUrl}
            onOpen={() => onOpenImage(task)}
          />
        ) : latest !== undefined ? (
          <ThumbnailButton
            task={task}
            file={null}
            baseUrl={baseUrl}
            label={t('queue.card.openLatest')}
            hint={t('queue.card.openLatestHint')}
            onOpen={latest}
          />
        ) : null}
        <button
          type="button"
          data-detail
          className="flex min-w-0 flex-1 gap-2 text-left"
          title={t('queue.card.openDetailHint')}
          onClick={() => onOpen(task)}
        >
          {file || latest !== undefined ? null : (
            <div className={THUMBNAIL_FRAME}>
              <ThumbnailContent task={task} file={null} baseUrl={baseUrl} />
            </div>
          )}
          <TaskSummary task={task} workflowName={workflowName} node={node} nodes={nodes} />
        </button>

        {corner === null ? null : (
          <button
            type="button"
            className="bg-card hover:bg-muted absolute top-1 right-1 inline-flex items-center
            rounded-md border p-1 opacity-0 transition-opacity group-hover/card:opacity-100
            focus-visible:opacity-100"
            aria-label={corner.label}
            title={corner.hint}
            onClick={guardPress(`queue-task:${task.promptId}`, () => corner.run(task))}
          >
            {corner.icon}
          </button>
        )}
      </li>
    </RenderProbe>
  );
});

interface TaskSummaryProps {
  readonly task: QueueTask;
  readonly workflowName: string | null;
  readonly node: RunningNodeLabel | null;
  readonly nodes: NodeProgress | null;
}

function TaskSummary({ task, workflowName, node, nodes }: TaskSummaryProps): React.ReactElement {
  const ratio = progressRatio(task);
  const duration = task.durationMs === null ? null : formatDuration(task.durationMs);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 text-2xs">
      <div className="flex items-baseline gap-1.5">
        {task.number === null ? null : (
          <span className={taskNumber({ failed: task.state === 'failed' })}>#{task.number}</span>
        )}
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {formatTime(task.startedAt)}
        </span>
        {duration === null ? null : (
          <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">{duration}</span>
        )}
      </div>

      {node !== null || nodes !== null ? (
        <RunningNode node={node} nodes={nodes} />
      ) : task.state !== 'running' && workflowName !== null ? (
        <span className="text-muted-foreground min-w-0 truncate" title={workflowName}>
          {workflowName}
        </span>
      ) : null}

      {ratio === null ? null : <ProgressBar ratio={ratio} />}

      <TaskMessage task={task} />
    </div>
  );
}

function ProgressBar({ ratio }: { readonly ratio: number }): React.ReactElement {
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = bar.current;
    if (element === null || element.offsetWidth === 0) return;
    const shift = translateXOf(getComputedStyle(element).transform);
    if (shift === null || Math.abs(ratio - (1 + shift / element.offsetWidth)) <= MAX_EASED_STEP) {
      return;
    }

    element.style.transition = 'none';
    void element.offsetWidth;
    element.style.transition = '';
  }, [ratio]);

  return (
    <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
      <div
        ref={bar}
        className="bg-slot-conditioning h-full w-full rounded-full transition-transform
          duration-1000 ease-linear motion-reduce:transition-none"
        style={{ transform: `translateX(${String((ratio - 1) * PERCENT)}%)` }}
      />
    </div>
  );
}

function RunningNode({
  node,
  nodes,
}: {
  readonly node: RunningNodeLabel | null;
  readonly nodes: NodeProgress | null;
}): React.ReactElement {
  return (
    <span className="flex min-w-0 items-baseline gap-1" title={node?.name}>
      {nodes === null ? null : (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {t('queue.card.nodeProgress', {
            finished: String(nodes.finished),
            total: String(nodes.total),
          })}
        </span>
      )}
      {node === null ? null : <RunningNodeName node={node} />}
    </span>
  );
}

function RunningNodeName({ node }: { readonly node: RunningNodeLabel }): React.ReactElement {
  return (
    <>
      {node.index === null ? null : (
        <span className="bg-muted shrink-0 rounded px-1 font-semibold tabular-nums">
          {node.index}
        </span>
      )}
      <span className="min-w-0 truncate">{node.name}</span>
    </>
  );
}

function TaskMessage({ task }: { readonly task: QueueTask }): React.ReactElement | null {
  if (task.message === null) return null;
  const quiet = task.state === 'unknown' || task.state === 'running';
  return (
    <span className={taskMessage({ quiet })} title={task.message}>
      {task.message}
    </span>
  );
}

function translateXOf(transform: string): number | null {
  const match = /^matrix(3d)?\(([^)]*)\)$/u.exec(transform);
  if (match === null) return null;
  const parts = (match[2] ?? '').split(',');
  const value = Number(parts[match[1] === undefined ? MATRIX_X_AT : MATRIX3D_X_AT]);
  return Number.isFinite(value) ? value : null;
}
