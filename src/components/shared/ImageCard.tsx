import { cva } from 'class-variance-authority';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ImageItem } from '@/graph/image-options';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';

const cardFrame = cva('relative flex flex-col overflow-hidden rounded-md border', {
  variants: { selected: { true: 'ring-ring ring-2', false: '' } },
});
const cardImage = cva('size-full object-contain', {
  variants: { ready: { true: '', false: 'opacity-0' } },
});

export interface ImageCardProps {
  readonly item: ImageItem;
  readonly src: string | null;
  readonly height: number;
  readonly current: boolean;
  readonly selected: boolean;
  readonly reveal: boolean;
  readonly onSelect: (item: ImageItem) => void;
  readonly onPlace: (item: ImageItem) => void;
}

export function ImageCard({
  item,
  src,
  height,
  current,
  selected,
  reveal,
  onSelect,
  onPlace,
}: ImageCardProps): React.ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const slot = usePreviewSlot(src);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reveal) box.current?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);

  return (
    <div ref={box} className={cardFrame({ selected })} style={{ height }}>
      <button
        type="button"
        className="hover:bg-accent flex min-h-0 w-full flex-1 flex-col text-left"
        title={item.path}
        aria-pressed={selected}
        onClick={(event) => {
          if (event.detail < 2) onSelect(item);
        }}
        onDoubleClick={() => onPlace(item)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !selected || isComposingKey(event)) return;
          event.preventDefault();
          onPlace(item);
        }}
      >
        <span className="bg-muted relative flex min-h-0 w-full flex-1 items-center justify-center">
          {src === null || state === 'failed' ? (
            <span className="text-muted-foreground px-2 text-center text-3xs break-all">
              {item.label}
            </span>
          ) : !slot.granted ? (
            <Loader2
              className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
              aria-hidden
            />
          ) : (
            <>
              <img
                src={src}
                alt=""
                decoding="async"
                draggable={false}
                className={cardImage({ ready: state === 'ready' })}
                onLoad={() => {
                  slot.release();
                  setState('ready');
                }}
                onError={() => {
                  slot.release();
                  setState('failed');
                }}
              />
              {state === 'ready' ? null : (
                <Loader2
                  className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
                  aria-hidden
                />
              )}
            </>
          )}
          {current ? (
            <>
              <Check className="text-foreground absolute top-1 left-1 size-4" aria-hidden />
              <span className="sr-only">{t('modelPicker.card.current')}</span>
            </>
          ) : null}
        </span>
        <span className="w-full truncate px-1.5 py-1 text-2xs">{item.label}</span>
      </button>
    </div>
  );
}
