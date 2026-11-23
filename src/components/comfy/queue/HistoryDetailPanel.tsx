import { Workflow } from 'lucide-react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { DetailImageColumn, type DetailImage } from '@/components/comfy/queue/DetailImageColumn';
import { DetailImageDivider } from '@/components/comfy/queue/DetailImageDivider';
import { DetailRunPager } from '@/components/comfy/queue/DetailRunPager';
import {
  MoveButtons,
  RunList,
  RunSummary,
  SeedsSection,
} from '@/components/comfy/queue/HistoryRunParts';
import { ModelGroupsSection, PromptsSection } from '@/components/comfy/queue/task-detail-sections';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogChromeContext } from '@/components/ui/dialog-chrome';
import { DialogCloseButton, DialogHeader } from '@/components/ui/dialog-header';
import { t } from '@/i18n';
import { formatDateTimeSeconds } from '@/i18n/format';
import { imagesOf, pngOutputsOf } from '@/queue/outputs';
import {
  formatHistorySession,
  historySessionTitle,
  runDetail,
  type HistoryCard,
  type HistoryRun,
} from '@/queue/run-history-view';
import { PLAIN_LABELER } from '@/queue/task-failure';
import {
  outputSrc,
  outputViewUrl,
  useOutputImagesStore,
  type OutputImageEntry,
} from '@/store/use-output-images-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';

const IMAGE_STEP = 8;

export interface HistoryDetailPanelProps {
  readonly card: HistoryCard;
  readonly baseUrl: string;
  readonly onMove: (direction: number) => void;
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly onOpenViewer: (card: HistoryCard, run: number) => void;
  readonly onOpenWorkflow: (run: HistoryRun) => void;
  readonly opening: boolean;
  readonly openError: string | null;
  readonly onClose: () => void;
}

export function HistoryDetailPanel({
  card,
  baseUrl,
  onMove,
  hasNewer,
  hasOlder,
  onOpenViewer,
  onOpenWorkflow,
  opening,
  openError,
  onClose,
}: HistoryDetailPanelProps): React.ReactElement {
  const [selected, setSelected] = useState(0);
  const { run, runIndex } = selectedRunOf(card, selected);
  const runList = useRef<HTMLUListElement>(null);

  const shown = useContext(DialogChromeContext)?.visible !== false;
  useEffect(() => {
    if (shown) runList.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.target !== document.body) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      onMove(event.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onMove]);
  const imageRatio = useSettingsStore((state) => state.taskDetailImageRatio);
  const renameSession = useRunHistoryStore((state) => state.renameSession);

  const detail = useMemo(() => (run === undefined ? null : runDetail(run)), [run]);
  const label = detail?.label ?? PLAIN_LABELER;
  const images = useMemo(() => (run === undefined ? [] : detailImagesOf(run)), [run]);
  const pages = useMemo(
    () => card.runs.map((item) => ({ key: String(item.startedAt), images: detailImagesOf(item) })),
    [card],
  );

  return (
    <div
      className="@container flex h-full min-h-0 flex-col"
      role="region"
      aria-label={t('history.detail.title')}
      onKeyDown={(event) => {
        if (moveByKey(event.nativeEvent, onMove, onClose)) event.preventDefault();
      }}
    >
      <DialogHeader
        leading={<MoveButtons hasNewer={hasNewer} hasOlder={hasOlder} onMove={onMove} />}
        heading={
          <h2 className="truncate text-sm font-semibold" title={historySessionTitle(card)}>
            {historySessionTitle(card)}
          </h2>
        }
        subtitle={
          <span className="tabular-nums">
            {card.workflowName ?? t('history.card.unnamed')}{' '}
            {formatDateTimeSeconds(latestStartOf(card))} /{' '}
            {t('history.detail.runCount', { count: String(card.runs.length) })}
          </span>
        }
        close={<DialogCloseButton onClose={onClose} title={t('queue.dialog.closeEsc')} />}
      />

      <div className="flex min-h-0 flex-1 flex-col [container-type:size] @xl:flex-row">
        <DetailRunPager
          pages={pages}
          selected={runIndex}
          onSelect={setSelected}
          baseUrl={baseUrl}
          onOpenViewer={() => onOpenViewer(card, runIndex)}
          className="shrink-0 @xl:hidden"
        />
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <OpenWorkflowButton
            run={run}
            baseUrl={baseUrl}
            opening={opening}
            onOpenWorkflow={onOpenWorkflow}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-xs">
            {openError === null ? null : (
              <p className="text-destructive" role="alert">
                {openError}
              </p>
            )}
            {detail === null ? (
              <p className="text-muted-foreground">{t('history.detail.notRestored')}</p>
            ) : null}
            <div className="flex min-w-0 flex-col pr-8">
              <RunSummary
                session={formatHistorySession(card)}
                name={card.name ?? ''}
                onRename={(name) => void renameSession(baseUrl, card.key, name)}
                files={images.map(({ file }) => file)}
              />
              <div className="mt-4">
                <ModelGroupsSection models={detail?.models ?? null} compact />
              </div>
            </div>
            <PromptsSection prompts={detail?.prompts ?? []} label={label} copyable />
            <SeedsSection seeds={detail?.seeds ?? []} />
            <RunList card={card} selected={selected} onSelect={setSelected} list={runList} />
          </div>
        </div>

        <div className="hidden @xl:contents">
          <DetailImageDivider />
          <DetailImageColumn
            images={images}
            baseUrl={baseUrl}
            ratio={imageRatio}
            onOpenViewer={() => onOpenViewer(card, runIndex)}
            step={IMAGE_STEP}
            resetKey={`${card.key}:${String(runIndex)}`}
          />
        </div>
      </div>
    </div>
  );
}

function OpenWorkflowButton({
  run,
  baseUrl,
  opening,
  onOpenWorkflow,
}: {
  readonly run: HistoryRun | undefined;
  readonly baseUrl: string;
  readonly opening: boolean;
  readonly onOpenWorkflow: (run: HistoryRun) => void;
}): React.ReactElement | null {
  const allGone = useOutputImagesStore((state) =>
    run === undefined ? false : allPngsGone(state.images, baseUrl, run),
  );
  if (run === undefined || pngOutputsOf(run.outputs).length === 0 || allGone) return null;
  return (
    <button
      type="button"
      className={`${DIALOG_ICON_CLASS} absolute top-2 right-3 z-10`}
      aria-label={t('history.detail.openWorkflow')}
      title={t('history.detail.openWorkflowHint')}
      disabled={opening}
      onClick={() => onOpenWorkflow(run)}
    >
      <Workflow className="size-4" aria-hidden />
    </button>
  );
}

function allPngsGone(
  images: ReadonlyMap<string, OutputImageEntry>,
  baseUrl: string,
  run: HistoryRun,
): boolean {
  const pngs = pngOutputsOf(run.outputs);
  return (
    pngs.length > 0 &&
    pngs.every((file) => {
      const url = outputViewUrl(baseUrl, file);
      return url !== null && outputSrc(images, url, run.finishedAt ?? undefined) === false;
    })
  );
}

function detailImagesOf(run: HistoryRun): DetailImage[] {
  return imagesOf(run.outputs).map((file) => ({
    key: `${file.type}:${file.subfolder}/${file.filename}`,
    file,
    until: run.finishedAt ?? undefined,
  }));
}

function moveByKey(
  event: KeyboardEvent,
  onMove: (direction: number) => void,
  onClose: () => void,
): boolean {
  if (event.target instanceof HTMLInputElement) return false;
  if (event.key === 'ArrowLeft') onMove(-1);
  else if (event.key === 'ArrowRight') onMove(1);
  else if (event.key === 'Escape') onClose();
  else return false;
  return true;
}

function selectedRunOf(
  card: HistoryCard,
  selected: number,
): { readonly run: HistoryRun | undefined; readonly runIndex: number } {
  const run = card.runs[selected] ?? card.runs[0];
  return { run, runIndex: run === undefined ? 0 : card.runs.indexOf(run) };
}

function latestStartOf(card: HistoryCard): number | null {
  return card.runs[0]?.startedAt ?? null;
}
