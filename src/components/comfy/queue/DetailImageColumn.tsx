import { Images } from 'lucide-react';

import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { PERCENT } from '@/components/ui/units';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t } from '@/i18n';
import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// 詳細の右の画像の列。タスクの詳細と履歴の詳細で共通に使う。
// ─────────────────────────────

/** 画像の列に並べる 1 枚 */
interface DetailImage {
  readonly key: string;
  readonly file: OutputFileRef;
  /** その実行が終わった時刻（接続先の時計）。これより後に書かれたファイルは出さない */
  readonly until?: number | undefined;
}

/** 画像の列の受け取り物 */
export interface DetailImageColumnProps {
  readonly images: readonly DetailImage[];
  readonly baseUrl: string;
  /** 画像の列の幅（詳細全体に対する割合） */
  readonly ratio: number;
  /** ビューワーを開く。null なら右上のアイコンを出さない */
  readonly onOpenViewer: (() => void) | null;
  /** 一度に描く枚数。省略すると全部描く */
  readonly step?: number | undefined;
  /** 描く枚数を先頭から数え直す鍵（`step` を渡すときに使う） */
  readonly resetKey?: string | undefined;
}

/** 詳細の画像を縦に並べる。`step` を渡すと、末尾の目印が見えるたびに次のまとまりを足す */
export function DetailImageColumn({
  images,
  baseUrl,
  ratio,
  onOpenViewer,
  step,
  resetKey = '',
}: DetailImageColumnProps): React.ReactElement {
  // 刻まないときは全部を 1 まとまりにする（目印は出ない）
  const { count, done, sentinelRef } = useIncrementalList(
    images.length,
    step ?? Number.POSITIVE_INFINITY,
    resetKey,
  );

  return (
    <div
      className="bg-muted/30 relative flex min-w-0 shrink-0 flex-col gap-2 overflow-y-auto p-4"
      style={{ width: `${String(ratio * PERCENT)}%` }}
    >
      {images.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('queue.dialog.noImages')}</p>
      ) : (
        <>
          {onOpenViewer === null ? null : (
            <button
              type="button"
              className="bg-background/80 hover:bg-background absolute top-2 right-2 z-10
                rounded-md border p-1.5"
              aria-label={t('queue.detail.openViewer')}
              title={t('queue.detail.openViewerHint')}
              onClick={onOpenViewer}
            >
              <Images className="size-4" aria-hidden />
            </button>
          )}
          {images.slice(0, count).map(({ key, file, until }) => (
            <OutputImage
              key={key}
              file={file}
              until={until}
              baseUrl={baseUrl}
              className="w-full rounded border"
            />
          ))}
          {done ? null : <div ref={sentinelRef} className="h-px shrink-0" aria-hidden />}
        </>
      )}
    </div>
  );
}
