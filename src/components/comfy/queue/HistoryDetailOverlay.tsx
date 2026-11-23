import { useCallback } from 'react';

import type { HistoryDetailPanelProps } from '@/components/comfy/queue/HistoryDetailPanel';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { useHistoryCards } from '@/hooks/run/use-history-cards';
import { useOpenRunWorkflow } from '@/hooks/run/use-open-run-workflow';
import { t } from '@/i18n';
import { historyTasks, type HistoryCard } from '@/queue/run-history-view';
import { buildSlides, firstSlideOf } from '@/queue/viewer-slides';
import { useHistoryDetailStore } from '@/store/use-history-detail-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore } from '@/store/use-viewer-store';

const HistoryDetailPanel = lazyPart<HistoryDetailPanelProps>(
  'history.detail.title',
  () => import('@/components/comfy/queue/HistoryDetailPanel').then((m) => m.HistoryDetailPanel),
  () => <PartLoading label={t('history.detail.title')} />,
);

export function HistoryDetailOverlay(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const openedKey = useHistoryDetailStore((state) => state.key);
  const open = useHistoryDetailStore((state) => state.open);
  const close = useHistoryDetailStore((state) => state.close);
  const openViewer = useViewerStore((state) => state.openOverlay);

  const { cards } = useHistoryCards();
  const index = cards.findIndex((card) => card.key === openedKey);
  const { open: openAsWorkflow, opening, error: openError, clearError } = useOpenRunWorkflow();

  const moveCard = useCallback(
    (direction: number): void => {
      const next = cards[index + direction];
      if (next === undefined) return;
      clearError();
      open(next.key);
    },
    [cards, index, open, clearError],
  );

  const openImages = (card: HistoryCard, run: number): void => {
    close();
    const tasks = historyTasks(card);
    openViewer(firstSlideOf(buildSlides(tasks), tasks[run]?.promptId ?? null), tasks);
  };

  const card = cards[index];
  if (card === undefined) return null;

  return (
    <DialogWindow
      id="history-detail"
      label={t('history.detail.title')}
      defaultMode="embedded"
      onClose={close}
    >
      <HistoryDetailPanel
        key={card.key}
        card={card}
        baseUrl={baseUrl}
        onMove={moveCard}
        hasNewer={index > 0}
        hasOlder={index < cards.length - 1}
        onOpenViewer={openImages}
        onOpenWorkflow={(run) => void openAsWorkflow(run)}
        opening={opening}
        openError={openError}
        onClose={close}
      />
    </DialogWindow>
  );
}
