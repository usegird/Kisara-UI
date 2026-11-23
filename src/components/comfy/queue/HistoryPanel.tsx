import { Expand, ImageOff, RefreshCw, Trash2 } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

import { cardList, THUMBNAIL_FRAME } from '@/components/comfy/queue/card-list';
import { HistoryRangeSlider } from '@/components/comfy/queue/HistoryRangeSlider';
import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { useHistoryCards } from '@/hooks/run/use-history-cards';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { guardPress } from '@/lib/press-guard';
import { pickImage } from '@/queue/outputs';
import { historySessionTitle, historyTasks, type HistoryCard } from '@/queue/run-history-view';
import { buildSlides } from '@/queue/viewer-slides';
import { useConnectionStore } from '@/store/use-connection-store';
import { useHistoryDetailStore } from '@/store/use-history-detail-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useViewerStore } from '@/store/use-viewer-store';

const CARD_CLASS = `group/card border-border/70 bg-muted/30 has-[[data-detail]:hover]:bg-accent
  relative flex w-full min-w-0 gap-2 rounded-md border p-1.5`;

const REMOVE_CLASS = `text-muted-foreground hover:text-destructive absolute top-1/2 right-1.5
  -translate-y-1/2 rounded-md p-1 opacity-0 transition-opacity
  group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:outline-2`;

const CARD_STEP = 8;
const CARD_MARGIN = '120px';

const HistoryItem = memo(function HistoryItem({
  card,
  baseUrl,
  onOpenImage,
  onOpenDetail,
  onRemove,
}: {
  readonly card: HistoryCard;
  readonly baseUrl: string;
  readonly onOpenImage: (card: HistoryCard) => void;
  readonly onOpenDetail: (card: HistoryCard) => void;
  readonly onRemove: (card: HistoryCard) => void;
}): React.ReactElement {
  const latest = card.runs[0];
  const file = latest === undefined ? null : pickImage(latest.outputs);
  const name = historySessionTitle(card);
  const when = formatDateTime(latest?.startedAt ?? null);
  const summary = t('history.card.runsWorkflow', {
    runs: t('history.detail.runCount', { count: String(card.runs.length) }),
    workflow: card.workflowName ?? t('history.card.unnamed'),
  });

  return (
    <li className={CARD_CLASS}>
      {file === null ? (
        <div className={THUMBNAIL_FRAME}>
          <ImageOff className="size-4" aria-hidden />
        </div>
      ) : (
        <button
          type="button"
          className={`${THUMBNAIL_FRAME} group/thumb relative focus-visible:outline-2`}
          aria-label={t('history.card.openImages', { name })}
          title={t('history.card.openImagesHint')}
          onClick={() => onOpenImage(card)}
        >
          <OutputImage
            file={file}
            baseUrl={baseUrl}
            className="size-full object-cover"
            fallback={<ImageOff className="size-4" aria-hidden />}
            order={latest?.startedAt ?? undefined}
            until={latest?.finishedAt ?? undefined}
          />
          <span
            className="absolute inset-0 flex items-center justify-center bg-background/60
              text-foreground opacity-0 transition-opacity group-hover/thumb:opacity-100
              group-focus-visible/thumb:opacity-100"
            aria-hidden
          >
            <Expand className="size-4" />
          </span>
        </button>
      )}
      <button
        type="button"
        data-detail
        className="flex min-w-0 flex-1 flex-col justify-center gap-1 text-left text-2xs"
        title={t('history.card.openDetailHint')}
        onClick={() => onOpenDetail(card)}
      >
        <span className="text-muted-foreground min-w-0 truncate tabular-nums" title={when}>
          {when}
        </span>
        <span className="min-w-0 truncate" title={name}>
          {name}
        </span>
        <span className="text-muted-foreground min-w-0 truncate tabular-nums" title={summary}>
          {summary}
        </span>
      </button>
      <button
        type="button"
        className={REMOVE_CLASS}
        aria-label={t('history.card.remove', { name })}
        title={t('history.card.removeHint')}
        onClick={() => onRemove(card)}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </li>
  );
});

function emptyMessage(connected: boolean, loading: boolean): string {
  if (!connected) return t('history.panel.connectToShow');
  return loading ? t('history.panel.loading') : t('history.panel.empty');
}

export interface HistoryPanelProps {
  readonly wrap?: boolean | undefined;
}

export function HistoryPanel({ wrap = false }: HistoryPanelProps): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const recording = useSettingsStore((state) => state.recordRunHistory);
  const setRecording = useSettingsStore((state) => state.setRecordRunHistory);
  const connected = useConnectionStore((state) => state.status === 'connected');

  const status = useRunHistoryStore((state) => state.status);
  const error = useRunHistoryStore((state) => state.error);
  const load = useRunHistoryStore((state) => state.load);
  const setUpTo = useRunHistoryStore((state) => state.setUpTo);

  const viewerMode = useViewerStore((state) => state.mode);
  const openOverlay = useViewerStore((state) => state.openOverlay);
  const closeViewer = useViewerStore((state) => state.close);
  const openHistoryDetail = useHistoryDetailStore((state) => state.open);
  const closeHistoryDetail = useHistoryDetailStore((state) => state.close);
  const closeTaskDetail = useTaskDetailStore((state) => state.close);
  const removeSession = useRunHistoryStore((state) => state.removeSession);
  const [removing, setRemoving] = useState<HistoryCard | null>(null);

  const { cards, names, labels, range, rangeNames } = useHistoryCards();
  const fetchFiles = useRunHistoryStore((state) => state.fetchFiles);
  const entries = useRunHistoryStore((state) => state.entries);
  const { count, done, sentinelRef } = useIncrementalList(
    rangeNames.length,
    CARD_STEP,
    range ?? '',
    CARD_MARGIN,
  );
  const shownKey = rangeNames.slice(0, count).join('\n');
  useEffect(() => {
    if (shownKey.length > 0) void fetchFiles(baseUrl, shownKey.split('\n'));
  }, [baseUrl, shownKey, fetchFiles, entries]);

  const openImages = (card: HistoryCard): void => {
    if (viewerMode === 'overlay') {
      closeViewer();
      return;
    }
    closeHistoryDetail();
    const tasks = historyTasks(card);
    openOverlay(buildSlides(tasks)[0]?.key ?? null, tasks);
  };
  const openDetail = (card: HistoryCard): void => {
    closeTaskDetail();
    closeViewer();
    openHistoryDetail(card.key);
  };
  const onConfirmRemove = guardPress('history-remove', () => {
    if (removing === null) return;
    setRemoving(null);
    if (useHistoryDetailStore.getState().key === removing.key) closeHistoryDetail();
    void removeSession(baseUrl, removing.key);
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative z-10 flex items-center justify-end gap-2 px-1">
        {names.length < 2 ? null : (
          <HistoryRangeSlider names={names} labels={labels} upTo={range} onChange={setUpTo} />
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1
            focus-visible:outline-2 disabled:opacity-50"
          aria-label={t('history.panel.refresh')}
          title={t('history.panel.refresh')}
          disabled={!connected || status === 'loading'}
          onClick={guardPress('history-load', () => void load(baseUrl))}
        >
          <RefreshCw
            className={refreshIcon({ size: 'sm', loading: status === 'loading' })}
            aria-hidden
          />
        </button>
      </div>
      {recording ? null : (
        <p className="text-muted-foreground px-1 text-2xs">
          {t('history.panel.notRecording')}{' '}
          <button
            type="button"
            className="text-foreground underline underline-offset-2 hover:no-underline
              focus-visible:outline-2"
            onClick={() => setRecording(true)}
          >
            {t('history.panel.enableRecording')}
          </button>
        </p>
      )}
      {error !== null && connected ? (
        <p className="text-destructive truncate px-1 text-2xs" title={error}>
          {t('history.panel.fetchFailed', { error })}
        </p>
      ) : null}

      {rangeNames.length === 0 ? (
        <p className="text-muted-foreground px-1 text-2xs">
          {emptyMessage(connected, status === 'loading')}
        </p>
      ) : (
        <ul className={cardList({ wrap })}>
          {cards.map((card) => (
            <HistoryItem
              key={card.key}
              card={card}
              baseUrl={baseUrl}
              onOpenImage={openImages}
              onOpenDetail={openDetail}
              onRemove={setRemoving}
            />
          ))}
          {done ? null : <li ref={sentinelRef} className="col-span-full h-px" aria-hidden />}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={t('history.card.removeTitle')}
        description={t('history.card.removeDescription', {
          name: removing === null ? '' : historySessionTitle(removing),
        })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={onConfirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
