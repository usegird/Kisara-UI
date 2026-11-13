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

// ─────────────────────────────
// 履歴の詳細をノードと変数の列に重ねて出す。置く場所は呼び出し側が決め、ここは中身の材料を集めるだけ。
// ─────────────────────────────

/**
 * 詳細の中身は開いたときに読む。枠（重ねる画面）だけ先に出す
 */
const HistoryDetailPanel = lazyPart<HistoryDetailPanelProps>(
  'history.detail.title',
  () => import('@/components/comfy/queue/HistoryDetailPanel').then((m) => m.HistoryDetailPanel),
  () => <PartLoading label={t('history.detail.title')} />,
);

/** 開いている履歴のカードの詳細を、ダイアログの枠に入れて出す。カードが無ければ何も出さない */
export function HistoryDetailOverlay(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const openedKey = useHistoryDetailStore((state) => state.key);
  const open = useHistoryDetailStore((state) => state.open);
  const close = useHistoryDetailStore((state) => state.close);
  const openViewer = useViewerStore((state) => state.openOverlay);

  // 履歴のタブと同じ並び（隣のカードへの送りを揃える）
  const { cards } = useHistoryCards();
  const index = cards.findIndex((card) => card.key === openedKey);
  const { open: openAsWorkflow, opening, error: openError, clearError } = useOpenRunWorkflow();

  // 詳細のキーの受け口（effect）の依存になる。作り直すと付け直すので、compiler に任せず手で固定する
  const moveCard = useCallback(
    (direction: number): void => {
      const next = cards[index + direction];
      if (next === undefined) return;
      clearError();
      open(next.key);
    },
    [cards, index, open, clearError],
  );

  /** 選んでいる実行の画像から、同じ場所にビューワーを重ねる。**詳細は閉じる** */
  const openImages = (card: HistoryCard, run: number): void => {
    close();
    const tasks = historyTasks(card);
    openViewer(firstSlideOf(buildSlides(tasks), tasks[run]?.promptId ?? null), tasks);
  };

  const card = cards[index];
  // 記録を読み直して消えたカードは閉じる
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
