import { useEffect, useRef } from 'react';

import { ViewerButton, type DetailImage } from '@/components/comfy/queue/DetailImageColumn';
import { OutputImage } from '@/components/comfy/queue/OutputImage';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const PAGE_REACH = 1;

export interface DetailRunPage {
  readonly key: string;
  readonly images: readonly DetailImage[];
}

export interface DetailRunPagerProps {
  readonly pages: readonly DetailRunPage[];
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly baseUrl: string;
  readonly onOpenViewer: () => void;
  readonly className?: string | undefined;
}

export function DetailRunPager({
  pages,
  selected,
  onSelect,
  baseUrl,
  onOpenViewer,
  className,
}: DetailRunPagerProps): React.ReactElement {
  const pager = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = pager.current;
    if (element === null) return;
    const align = (): void => {
      if (element.clientWidth === 0 || pageIndexOf(element) === selected) return;
      element.scrollLeft = selected * element.clientWidth;
    };
    align();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(align);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected]);

  const onScroll = (): void => {
    const element = pager.current;
    if (element === null || element.clientWidth === 0) return;
    const index = pageIndexOf(element);
    if (index !== selected && index >= 0 && index < pages.length) onSelect(index);
  };

  return (
    <div data-image-strip className={cn('bg-muted/30 relative min-h-0 border-b', className)}>
      <ViewerButton onOpenViewer={onOpenViewer} />
      <div
        ref={pager}
        className="flex max-h-[50cqh] w-full snap-x snap-mandatory overflow-x-auto
          [scrollbar-width:none]"
        onScroll={onScroll}
      >
        {pages.map((page, index) => (
          <RunPage
            key={page.key}
            page={page}
            baseUrl={baseUrl}
            near={Math.abs(index - selected) <= PAGE_REACH}
            current={index === selected}
          />
        ))}
      </div>
    </div>
  );
}

function RunPage({
  page,
  baseUrl,
  near,
  current,
}: {
  readonly page: DetailRunPage;
  readonly baseUrl: string;
  readonly near: boolean;
  readonly current: boolean;
}): React.ReactElement {
  return (
    <div
      data-run-page={current ? 'current' : undefined}
      className="w-full shrink-0 snap-start snap-always snap-y snap-mandatory overflow-y-auto
        [scrollbar-gutter:stable]"
    >
      {near ? <RunImages images={page.images} baseUrl={baseUrl} /> : null}
    </div>
  );
}

function RunImages({
  images,
  baseUrl,
}: {
  readonly images: readonly DetailImage[];
  readonly baseUrl: string;
}): React.ReactNode {
  if (images.length === 0) {
    return <p className="text-muted-foreground p-4 text-xs">{t('queue.dialog.noImages')}</p>;
  }
  return images.map(({ key, file, until }) => (
    <div key={key} className="flex w-full snap-start items-center justify-center p-2">
      <OutputImage
        file={file}
        until={until}
        baseUrl={baseUrl}
        className="max-h-[calc(50cqh-1rem)] max-w-full rounded border object-contain"
      />
    </div>
  ));
}

function pageIndexOf(element: HTMLElement): number {
  return Math.round(element.scrollLeft / element.clientWidth);
}
