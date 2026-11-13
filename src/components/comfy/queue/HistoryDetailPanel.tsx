import { FolderOpen } from 'lucide-react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { DetailImageColumn } from '@/components/comfy/queue/DetailImageColumn';
import { DetailImageDivider } from '@/components/comfy/queue/DetailImageDivider';
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
import { imagesOf } from '@/queue/outputs';
import {
  formatHistorySession,
  runDetail,
  type HistoryCard,
  type HistoryRun,
} from '@/queue/run-history-view';
import { PLAIN_LABELER } from '@/queue/task-failure';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 履歴の詳細の中身。実行内容は通信せずに記録（残したモデル・プロンプト・シード）から出す。
// ─────────────────────────────

/**
 * 1 回に足す画像の数
 */
const IMAGE_STEP = 8;

/** 履歴の詳細の受け取り物 */
export interface HistoryDetailPanelProps {
  readonly card: HistoryCard;
  readonly baseUrl: string;
  /** 隣のカードへ移る。`-1` が新しい方 */
  readonly onMove: (direction: number) => void;
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  /** そのカードの画像から、同じ場所にビューワーを重ねる（詳細と入れ替わる） */
  readonly onOpenViewer: (card: HistoryCard, run: number) => void;
  /**
   * 選んでいる実行の画像に埋まったワークフローを開く
   */
  readonly onOpenWorkflow: (run: HistoryRun) => void;
  /** ワークフローを画像から読んでいる */
  readonly opening: boolean;
  /** ワークフローを開けなかった理由。無ければ null */
  readonly openError: string | null;
  readonly onClose: () => void;
}

/**
 * 履歴のカード 1 枚の詳細。左に選んでいる実行の内容と実行の一覧、右にその実行の画像を出す。
 * 開いているカードが変わったら選びを先頭（一番新しい実行）に戻すため、
 * 呼び出し側は `key={card.key}` で渡す
 */
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

  // 開いたとき（カードが変わると作り直す）は一番新しい実行の行にフォーカスを置く（すぐ ↑ ↓ で選び直せる）。
  // 埋め込みの枠は描いた直後はまだ隠れているので、見えてから置く
  const shown = useContext(DialogChromeContext)?.visible !== false;
  useEffect(() => {
    if (shown) runList.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [shown]);

  // どこにもフォーカスが無いときも ← → で隣のカードへ移る（詳細の中は下の onKeyDown が受ける）
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

  // この部品では compiler が `detail` と `images` を前回の物にしないので、手で書く
  const detail = useMemo(() => (run === undefined ? null : runDetail(run)), [run]);
  const label = detail?.label ?? PLAIN_LABELER;
  // 画像は選んでいる実行のものだけ。最後に出たものを上に置く
  const images = useMemo(
    () =>
      run === undefined
        ? []
        : imagesOf(run.outputs).map((file) => ({
            key: `${file.type}:${file.subfolder}/${file.filename}`,
            file,
            until: run.finishedAt ?? undefined,
          })),
    [run],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="region"
      aria-label={t('history.detail.title')}
      onKeyDown={(event) => {
        if (moveByKey(event.nativeEvent, onMove, onClose)) event.preventDefault();
      }}
    >
      <DialogHeader
        leading={<MoveButtons hasNewer={hasNewer} hasOlder={hasOlder} onMove={onMove} />}
        heading={
          <h2 className="truncate text-sm font-semibold">
            {card.workflowName ?? t('history.card.unnamed')}
          </h2>
        }
        subtitle={
          <span className="shrink-0 tabular-nums">
            {formatDateTimeSeconds(latestStartOf(card))} /{' '}
            {t('history.detail.runCount', { count: String(card.runs.length) })}
          </span>
        }
        actions={
          run === undefined ? null : (
            <button
              type="button"
              className={DIALOG_ICON_CLASS}
              aria-label={t('history.detail.openWorkflow')}
              title={t('history.detail.openWorkflowHint')}
              disabled={opening}
              onClick={() => onOpenWorkflow(run)}
            >
              <FolderOpen className="size-4" aria-hidden />
            </button>
          )
        }
        close={<DialogCloseButton onClose={onClose} title={t('queue.dialog.closeEsc')} />}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-xs">
          {openError === null ? null : (
            <p className="text-destructive" role="alert">
              {openError}
            </p>
          )}
          {detail === null ? (
            <p className="text-muted-foreground">{t('history.detail.notRestored')}</p>
          ) : null}
          <div className="flex min-w-0 flex-col">
            <RunSummary
              session={formatHistorySession(card)}
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

        <DetailImageDivider />

        <DetailImageColumn
          images={images}
          baseUrl={baseUrl}
          ratio={imageRatio}
          onOpenViewer={() => onOpenViewer(card, runIndex)}
          step={IMAGE_STEP}
          // 選ぶ実行が変わったら先頭から数え直す
          resetKey={`${card.key}:${String(runIndex)}`}
        />
      </div>
    </div>
  );
}

/** ← → で隣のカードへ、Esc で閉じる。文字を打っている最中は取らない。取ったら true */
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

/** 選んでいる実行と、その位置。選びが範囲の外なら一番新しい実行 */
function selectedRunOf(
  card: HistoryCard,
  selected: number,
): { readonly run: HistoryRun | undefined; readonly runIndex: number } {
  const run = card.runs[selected] ?? card.runs[0];
  return { run, runIndex: run === undefined ? 0 : card.runs.indexOf(run) };
}

/** 一番新しい実行の始まった時刻。実行が無ければ null */
function latestStartOf(card: HistoryCard): number | null {
  return card.runs[0]?.startedAt ?? null;
}
