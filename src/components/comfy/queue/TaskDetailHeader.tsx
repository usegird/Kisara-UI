import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

import { TaskFailure, TaskRejection } from '@/components/comfy/queue/TaskFailure';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import {
  DIALOG_TOGGLE_ON_CLASS,
  DialogCloseButton,
  DialogHeader,
} from '@/components/ui/dialog-header';
import { t } from '@/i18n';
import { formatDuration, formatTime } from '@/i18n/format';
import { cn } from '@/lib/utils';
import type { RunFailure } from '@/port/run';
import type { NodeTiming } from '@/queue/execution-state';
import type { QueueTask } from '@/queue/queue-tasks';
import type { NodeLabeler } from '@/queue/task-failure';
import type { SubmitFailure } from '@/queue/task-log';

interface TaskDetailHeaderProps {
  readonly task: QueueTask | null;
  readonly workflowName: string | null;
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly onMove: (direction: number) => void;
  readonly follow: boolean;
  readonly onFollowChange: (follow: boolean) => void;
  readonly onClose: () => void;
}

export function TaskDetailHeader({
  task,
  workflowName,
  hasNewer,
  hasOlder,
  onMove,
  follow,
  onFollowChange,
  onClose,
}: TaskDetailHeaderProps): React.ReactElement {
  return (
    <DialogHeader
      leading={
        <>
          <button
            type="button"
            className={cn(DIALOG_ICON_CLASS, 'p-1')}
            aria-label={t('queue.detail.newer')}
            title={t('queue.detail.newerHint')}
            disabled={!hasNewer}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={cn(DIALOG_ICON_CLASS, 'p-1')}
            aria-label={t('queue.detail.older')}
            title={t('queue.detail.olderHint')}
            disabled={!hasOlder}
            onClick={() => onMove(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </>
      }
      heading={
        <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
          {task === null || task.number === null ? null : (
            <span className="bg-muted rounded px-1.5 tabular-nums">#{task.number}</span>
          )}
          <span className="truncate">{workflowName ?? t('queue.detail.unknownWorkflow')}</span>
        </h2>
      }
      subtitle={
        <span className="shrink-0 tabular-nums">
          {formatTime(task?.startedAt ?? null)} / {formatDuration(task?.durationMs ?? null)}
        </span>
      }
      actions={
        <button
          type="button"
          className={cn(DIALOG_ICON_CLASS, DIALOG_TOGGLE_ON_CLASS)}
          aria-label={t('queue.detail.follow')}
          aria-pressed={follow}
          title={follow ? t('queue.detail.following') : t('queue.dialog.notFollowing')}
          onClick={() => onFollowChange(!follow)}
        >
          <Sparkles className="size-4" aria-hidden />
        </button>
      }
      close={<DialogCloseButton onClose={onClose} title={t('queue.dialog.closeEsc')} />}
    />
  );
}

interface RunOutcomeProps {
  readonly rejection: SubmitFailure | null;
  readonly failure: RunFailure | null;
  readonly message: string | null;
  readonly nodes: React.ComponentProps<typeof TaskFailure>['nodes'];
  readonly timings: readonly NodeTiming[];
  readonly label: NodeLabeler;
}

export function RunOutcome({
  rejection,
  failure,
  message,
  nodes,
  timings,
  label,
}: RunOutcomeProps): React.ReactElement | null {
  if (rejection !== null) return <TaskRejection rejection={rejection} label={label} />;
  if (failure) {
    return <TaskFailure failure={failure} nodes={nodes} timings={timings} label={label} />;
  }
  return message === null ? null : <p className="text-destructive">{message}</p>;
}
