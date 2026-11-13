import { cva } from 'class-variance-authority';
import { Expand, Hourglass, ImageOff, Loader2, Square, X } from 'lucide-react';
import { memo } from 'react';

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

// ─────────────────────────────
// キューのタスクのカード 1 枚（サムネイル・要約・進み具合）
// ─────────────────────────────

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

/** 縮小画像の中身。画像があればそれ、無ければ状態の絵（待っている・実行中・それ以外） */
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

/**
 * 画像がある縮小画像。指し示すと白っぽくして開くアイコンを出し、押すとビューワーへ。
 * ボタンの中にボタンを入れられないので、詳細を開くカード本体とは別のボタンにして横に並べる
 */
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

/**
 * 受け取り物が同じなら描き直さない（進捗で動くのは実行中のカードだけ）。
 * 並びが変わると compiler は全部のカードの要素を作り直すので、手で memo する
 */
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
  /** 実行したワークフロー名（この画面から投げたときだけ分かる） */
  readonly workflowName: string | null;
  /** 実行中のノード（このタスクが自分の実行のときだけ） */
  readonly node: RunningNodeLabel | null;
  /** ノードの進み具合（同上） */
  readonly nodes: NodeProgress | null;
  readonly onOpen: (task: QueueTask) => void;
  /** 縮小画像を押したとき。そのタスクの画像からビューワーを開く */
  readonly onOpenImage: (task: QueueTask) => void;
  /** 読み込み中の絵を押したとき。一番新しい画像から開く。画像が無ければ undefined */
  readonly onOpenLatest?: (() => void) | undefined;
  /** 実行中のカードの右上に出す中断（そのタスクだけを止める）。実行中でなければ undefined */
  readonly onInterrupt?: ((task: QueueTask) => void) | undefined;
  /** 待機中のカードの右上に出す取り消し（キューから外す）。待機中でなければ undefined */
  readonly onCancel?: ((task: QueueTask) => void) | undefined;
}): React.ReactElement {
  const failed = task.state === 'failed';
  const file = pickImage(task.outputs);
  // まだ画像の無い実行中の絵は、一番新しい画像から開く入口にする
  const latest = file === null && task.state === 'running' ? onOpenLatest : undefined;
  // 右上の止める操作。実行中は中断、待機中はキューから外す
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

  // 全カードで 1 つの名前に数える（回数がそのまま描き直したカードの枚数になる）
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

        {/* 実行中と待機中だけ、指し示すと右上に止める操作を出す（そのタスクだけ） */}
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

/**
 * カードの文字の列（番号と開始時刻・所要時間とノード数・進捗・処理中のカード・伝える文）。
 * 処理中のカードの行は、終わったらワークフロー名を残す
 */
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
      </div>

      {/* どちらも無ければ行ごと出さない（断られた実行でカードが縦に伸びないように） */}
      {duration === null && nodes === null ? null : (
        <TaskTiming duration={duration} nodes={nodes} />
      )}

      {/* 進捗バー。割合が分からないときは出さない */}
      {ratio === null ? null : (
        <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
          <div
            className="bg-slot-conditioning h-full rounded-full"
            style={{ width: `${String(Math.round(ratio * PERCENT))}%` }}
          />
        </div>
      )}

      {/* 処理中のカード（通番 + コメント/ノード名） */}
      {node ? (
        <RunningNode node={node} />
      ) : task.state !== 'running' && workflowName !== null ? (
        <span className="text-muted-foreground min-w-0 truncate" title={workflowName}>
          {workflowName}
        </span>
      ) : null}

      <TaskMessage task={task} />
    </div>
  );
}

/** 所要時間と何ノード目か。片方だけでも出す */
function TaskTiming({
  duration,
  nodes,
}: {
  readonly duration: string | null;
  readonly nodes: NodeProgress | null;
}): React.ReactElement {
  return (
    <div className="text-muted-foreground flex items-baseline gap-1.5 tabular-nums">
      {duration === null ? null : <span className="shrink-0">{duration}</span>}
      {nodes === null ? null : (
        <span className="shrink-0">
          {t('queue.card.nodeProgress', {
            finished: String(nodes.finished),
            total: String(nodes.total),
          })}
        </span>
      )}
    </div>
  );
}

/** 処理中のカード。通番があれば前に付ける */
function RunningNode({ node }: { readonly node: RunningNodeLabel }): React.ReactElement {
  return (
    <span className="flex min-w-0 items-baseline gap-1" title={node.name}>
      {node.index === null ? null : (
        <span className="bg-muted shrink-0 rounded px-1 font-semibold tabular-nums">
          {node.index}
        </span>
      )}
      <span className="min-w-0 truncate">{node.name}</span>
    </span>
  );
}

/**
 * 伝える文は 1 行で省略する（カードを縦に伸ばさない）。全文は指したときと詳細で出す。
 * 不明のもの・実行中は失敗と分けて薄く出す（落ちたとは限らない）
 */
function TaskMessage({ task }: { readonly task: QueueTask }): React.ReactElement | null {
  if (task.message === null) return null;
  const quiet = task.state === 'unknown' || task.state === 'running';
  return (
    <span className={taskMessage({ quiet })} title={task.message}>
      {task.message}
    </span>
  );
}
