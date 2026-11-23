import { Loader2 } from 'lucide-react';

import { ImageCard } from '@/components/shared/ImageCard';
import { arrowSelect } from '@/components/ui/arrow-select';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import type { ImageItem } from '@/graph/image-options';
import { t } from '@/i18n';
import { cardMinWidth } from '@/store/settings-fields/card-size';

interface ImageGridProps {
  readonly srcOf: (value: string) => string | null;
  readonly visible: readonly ImageItem[];
  readonly count: number;
  readonly done: boolean;
  readonly attachSentinel: (element: HTMLElement | null) => void;
  readonly height: number;
  readonly value: string;
  readonly selected: string | null;
  readonly reveal: string | null;
  readonly onSelect: (item: ImageItem) => void;
  readonly onClear: () => void;
  readonly onPlace: (item: ImageItem) => void;
  readonly cardActions?: ((item: ImageItem) => React.ReactNode) | undefined;
  readonly cardLeadingActions?: ((item: ImageItem) => React.ReactNode) | undefined;
  readonly cardNameActions?: ((item: ImageItem) => React.ReactNode) | undefined;
  readonly onRename?: ((item: ImageItem, name: string) => boolean) | undefined;
  readonly canRename?: ((item: ImageItem) => boolean) | undefined;
  readonly renameOptions?: ((item: ImageItem) => readonly string[]) | undefined;
}

export function ImageGrid({
  srcOf,
  visible,
  count,
  done,
  attachSentinel,
  height,
  value,
  selected,
  reveal,
  onSelect,
  onClear,
  onPlace,
  cardActions,
  cardLeadingActions,
  cardNameActions,
  onRename,
  canRename,
  renameOptions,
}: ImageGridProps): React.ReactElement {
  const columns = `repeat(auto-fill, minmax(${String(cardMinWidth(height))}px, 1fr))`;
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto p-3"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button') === null) onClear();
      }}
    >
      {visible.length === 0 ? (
        <p className={EMPTY_NOTICE_CLASS}>{t('imagePicker.empty')}</p>
      ) : (
        <>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: columns }}
            onKeyDown={(event) => arrowSelect(event, 'grid')}
          >
            {visible.slice(0, count).map((item) => (
              <ImageCard
                key={item.value}
                item={item}
                src={srcOf(item.value)}
                height={height}
                current={item.value === value}
                selected={item.value === selected}
                reveal={item.value === reveal}
                onSelect={onSelect}
                onPlace={onPlace}
                actions={cardActions?.(item)}
                leadingActions={cardLeadingActions?.(item)}
                nameActions={cardNameActions?.(item)}
                onRename={canRename?.(item) === false ? undefined : onRename}
                renameOptions={renameOptions?.(item)}
              />
            ))}
          </div>
          {done ? null : (
            <p
              ref={attachSentinel}
              className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-xs"
              role="status"
            >
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              {t('modelPicker.grid.loadingMore', {
                shown: String(count),
                total: String(visible.length),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
