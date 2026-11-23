import { Images } from 'lucide-react';

import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { PERCENT } from '@/components/ui/units';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t } from '@/i18n';
import type { OutputFileRef } from '@/port/files';

export interface DetailImage {
  readonly key: string;
  readonly file: OutputFileRef;
  readonly until?: number | undefined;
}

export interface DetailImageColumnProps {
  readonly images: readonly DetailImage[];
  readonly baseUrl: string;
  readonly ratio: number;
  readonly onOpenViewer: (() => void) | null;
  readonly step?: number | undefined;
  readonly resetKey?: string | undefined;
}

export function DetailImageColumn({
  images,
  baseUrl,
  ratio,
  onOpenViewer,
  step,
  resetKey = '',
}: DetailImageColumnProps): React.ReactElement {
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
          {onOpenViewer === null ? null : <ViewerButton onOpenViewer={onOpenViewer} />}
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

export function ViewerButton({
  onOpenViewer,
}: {
  readonly onOpenViewer: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="bg-background/80 hover:bg-background absolute top-2 right-2 z-10 rounded-md
        border p-1.5"
      aria-label={t('queue.detail.openViewer')}
      title={t('queue.detail.openViewerHint')}
      onClick={onOpenViewer}
    >
      <Images className="size-4" aria-hidden />
    </button>
  );
}
