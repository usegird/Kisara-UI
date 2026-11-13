import { Expand, ImageOff, RefreshCw } from 'lucide-react';
import { memo, useEffect } from 'react';

import { cardList, THUMBNAIL_FRAME } from '@/components/comfy/queue/card-list';
import { HistoryRangeSlider } from '@/components/comfy/queue/HistoryRangeSlider';
import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { useHistoryCards } from '@/hooks/run/use-history-cards';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { guardPress } from '@/lib/press-guard';
import { pickImage } from '@/queue/outputs';
import { historyCardTitle, historyTasks, type HistoryCard } from '@/queue/run-history-view';
import { buildSlides } from '@/queue/viewer-slides';
import { useConnectionStore } from '@/store/use-connection-store';
import { useHistoryDetailStore } from '@/store/use-history-detail-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useViewerStore } from '@/store/use-viewer-store';

// ─────────────────────────────
// 右の列の履歴タブ。実行の記録をまとめたカードを積む。記録を書くのはストアで、ここは読んで並べるだけ。
// ─────────────────────────────

const CARD_CLASS = `border-border/70 bg-muted/30 has-[[data-detail]:hover]:bg-accent relative flex
  w-full min-w-0 gap-2 rounded-md border p-1.5`;

/** 1 回に足すカードの数。足りなければ目印が見えている間続けて足す（画面に入る分まで） */
const CARD_STEP = 8;
/**
 * 先読みの余白。画面に入る分を少し超えるだけにする
 */
const CARD_MARGIN = '120px';

/**
 * 受け取り物が同じなら描き直さない（記録を書き足しても、変わったカードだけ描き直す）。
 * 並びが変わると compiler は全部のカードの要素を作り直すので、手で memo する
 */
const HistoryItem = memo(function HistoryItem({
  card,
  baseUrl,
  onOpenImage,
  onOpenDetail,
}: {
  readonly card: HistoryCard;
  readonly baseUrl: string;
  readonly onOpenImage: (card: HistoryCard) => void;
  readonly onOpenDetail: (card: HistoryCard) => void;
}): React.ReactElement {
  const latest = card.runs[0];
  const file = latest === undefined ? null : pickImage(latest.outputs);
  const name = card.workflowName ?? t('history.card.unnamed');
  const title = historyCardTitle(card);
  const when = t('history.card.dateRuns', {
    date: formatDateTime(latest?.startedAt ?? null),
    runs: String(card.runs.length),
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
        <span className="text-muted-foreground min-w-0 truncate" title={title}>
          {title}
        </span>
      </button>
    </li>
  );
});

/** 並べるものが無いときの文。つながっていない・読んでいる・本当に無いを分ける */
function emptyMessage(connected: boolean, loading: boolean): string {
  if (!connected) return t('history.panel.connectToShow');
  return loading ? t('history.panel.loading') : t('history.panel.empty');
}

/** 履歴タブの受け取り物 */
export interface HistoryPanelProps {
  /** 折り返して並べるか（右の列を下に置いたとき）。既定は縦に積む */
  readonly wrap?: boolean | undefined;
}

/** 履歴のさかのぼる範囲・更新・記録を入れるリンクと、実行の記録のカードの並び */
export function HistoryPanel({ wrap = false }: HistoryPanelProps): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const recording = useSettingsStore((state) => state.recordRunHistory);
  const setRecording = useSettingsStore((state) => state.setRecordRunHistory);
  const connected = useConnectionStore((state) => state.status === 'connected');

  const status = useRunHistoryStore((state) => state.status);
  const error = useRunHistoryStore((state) => state.error);
  const load = useRunHistoryStore((state) => state.load);
  const setUpTo = useRunHistoryStore((state) => state.setUpTo);

  // 別窓の出し先は画面に 1 つ（ViewerWindowHost）。ここは開く・閉じるだけ
  const viewerMode = useViewerStore((state) => state.mode);
  const openOverlay = useViewerStore((state) => state.openOverlay);
  const closeViewer = useViewerStore((state) => state.close);
  const openHistoryDetail = useHistoryDetailStore((state) => state.open);
  const closeHistoryDetail = useHistoryDetailStore((state) => state.close);
  const closeTaskDetail = useTaskDetailStore((state) => state.close);

  // 読み直すのは接続したとき（右の列が持つ）と、更新を押したときだけ
  const { cards, names, labels, range, rangeNames } = useHistoryCards();
  const fetchFiles = useRunHistoryStore((state) => state.fetchFiles);
  // 一覧を読み直すと中身を捨てるので、出す名前が同じでも読み直す（一覧は読み直したときだけ変わる）
  const entries = useRunHistoryStore((state) => state.entries);
  // 画面に入る分だけ描き、送ると続きを足す。範囲を変えたら先頭から数え直す。
  // 数えるのはファイルの一覧（中身を読む前に並びが決まる）
  const { count, done, sentinelRef } = useIncrementalList(
    rangeNames.length,
    CARD_STEP,
    range ?? '',
    CARD_MARGIN,
  );
  // 出す分のファイルだけ中身を読む（読んだもの・読んでいるものは重ねない）
  // 鍵は名前の並びの文字列（並びを作り直しても、中身が同じなら読み直さない）
  const shownKey = rangeNames.slice(0, count).join('\n');
  useEffect(() => {
    if (shownKey.length > 0) void fetchFiles(baseUrl, shownKey.split('\n'));
  }, [baseUrl, shownKey, fetchFiles, entries]);

  const openImages = (card: HistoryCard): void => {
    if (viewerMode === 'overlay') {
      closeViewer();
      return;
    }
    // 重ねるものは 1 つだけ
    closeHistoryDetail();
    const tasks = historyTasks(card);
    openOverlay(buildSlides(tasks)[0]?.key ?? null, tasks);
  };
  // 詳細を開く。重ねるものは 1 つだけなので、タスクの詳細とビューワーは閉じる
  const openDetail = (card: HistoryCard): void => {
    closeTaskDetail();
    closeViewer();
    openHistoryDetail(card.key);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* 最上部の帯。横のスライドバー（記録が 2 つ以上のときだけ）と、右端に更新。
          つまみのポップアウトを下のカードより手前に出すため、帯ごと重なりの上に置く */}
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
            />
          ))}
          {/* 末尾の目印。見えたら続きを足す（折り返して並べるときも 1 段を占める） */}
          {done ? null : <li ref={sentinelRef} className="col-span-full h-px" aria-hidden />}
        </ul>
      )}
    </div>
  );
}
