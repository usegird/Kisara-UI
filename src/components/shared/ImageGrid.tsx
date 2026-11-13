import { Loader2 } from 'lucide-react';

import { ImageCard } from '@/components/shared/ImageCard';
import { arrowSelect } from '@/components/ui/arrow-select';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import type { ImageItem } from '@/graph/image-options';
import { t } from '@/i18n';
import { cardMinWidth } from '@/store/settings-fields/card-size';

// ─────────────────────────────
// 画像のカードの格子
// ─────────────────────────────

interface ImageGridProps {
  /** カードの画像の URL。作れなければ null */
  readonly srcOf: (value: string) => string | null;
  readonly visible: readonly ImageItem[];
  /** 描いている枚数（少しずつ増やす） */
  readonly count: number;
  readonly done: boolean;
  /** 目印。見えたら次のまとまりを足す */
  readonly attachSentinel: (element: HTMLElement | null) => void;
  readonly height: number;
  readonly value: string;
  readonly selected: string | null;
  /** 送って見せるカード（アップロードしたもの） */
  readonly reveal: string | null;
  readonly onSelect: (item: ImageItem) => void;
  /** カードの外（隙間・空の所）を押した */
  readonly onClear: () => void;
  readonly onPlace: (item: ImageItem) => void;
}

/** 画像のカードを格子に並べ、少しずつ描く */
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
