import { cva } from 'class-variance-authority';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { ModelItem } from '@/graph/model-files';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { panReset, panTo } from '@/lib/pan';
import type { Point } from '@/lib/point';
import { isComposingKey } from '@/lib/text-entry';
import { comfyPort } from '@/store/ports/comfy-port';

const cardFrame = cva('group/card relative flex flex-col overflow-hidden rounded-md border', {
  variants: { selected: { true: 'ring-ring ring-2', false: '' } },
});
const cardImage = cva('size-full object-cover object-[var(--pan-x,50%)_var(--pan-y,50%)]', {
  variants: { ready: { true: '', false: 'opacity-0' } },
});

export interface ModelCardDrag {
  readonly onPointerDown: (item: ModelItem) => void;
  readonly onDragStart: (event: React.DragEvent<HTMLElement>, item: ModelItem) => void;
}

export interface ModelCardProps {
  readonly item: ModelItem;
  readonly folder: string;
  readonly baseUrl: string;
  readonly height: number;
  readonly current: boolean;
  readonly selected: boolean;
  readonly onSelect: (item: ModelItem, point: Point, box: DOMRect) => void;
  readonly onPlace: (item: ModelItem, origin: DOMRect) => void;
  readonly drag?: ModelCardDrag | undefined;
}

export function ModelCard({
  item,
  folder,
  baseUrl,
  height,
  current,
  selected,
  onSelect,
  onPlace,
  drag,
}: ModelCardProps): React.ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const src = comfyPort().models.previewSrc(baseUrl, folder, item.file);
  const slot = usePreviewSlot(src);

  return (
    <div
      className={cardFrame({ selected })}
      style={{ height }}
      draggable={drag !== undefined}
      onPointerDown={drag === undefined ? undefined : () => drag.onPointerDown(item)}
      onDragStart={drag === undefined ? undefined : (event) => drag.onDragStart(event, item)}
    >
      <button
        type="button"
        className="hover:bg-accent flex min-h-0 w-full flex-1 flex-col text-left"
        title={item.path}
        data-model-card=""
        aria-pressed={selected}
        onClick={(event) => {
          if (event.detail >= 2) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const point =
            event.detail === 0
              ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
              : { x: event.clientX, y: event.clientY };
          onSelect(item, point, rect);
        }}
        onDoubleClick={(event) => onPlace(item, event.currentTarget.getBoundingClientRect())}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !selected || isComposingKey(event)) return;
          event.preventDefault();
          onPlace(item, event.currentTarget.getBoundingClientRect());
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
                onMouseMove={(event) =>
                  panTo(event.currentTarget, event.nativeEvent.offsetX, event.nativeEvent.offsetY)
                }
                onMouseLeave={(event) => panReset(event.currentTarget)}
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
